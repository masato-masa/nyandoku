import { generatePuzzle, type Puzzle } from './puzzle';

export const EMPTY = 0;
export const CROSS = 1;
export const CAT = 2;
export type Mark = typeof EMPTY | typeof CROSS | typeof CAT;

export const MAX_HEARTS = 3;

/** 1 手ぶんの変更。猫を置くと自動 X も同じ手にまとまるので配列で持つ。 */
export interface Change {
  idx: number;
  from: Mark;
  to: Mark;
}

export interface GameState {
  level: number;
  puzzle: Puzzle;
  marks: Uint8Array;
  hearts: number;
  status: 'playing' | 'won' | 'lost';
  history: Change[][];
  /** 直近に衝突したセル。シェイク演出に使う。 */
  conflicts: number[];
  /** 同じセルで続けて衝突しても演出をやり直せるように毎回増やす。 */
  conflictToken: number;
  /** 直前に猫を置いたセル。ポップ演出の起点。 */
  lastPlaced: number | null;
  /** 猫を置いたとき、置けないマスへ自動で X を打つか。 */
  autoCross: boolean;
  hintsUsed: number;
}

/**
 * レベルが上がるほど盤面を大きくする。1〜3 は 4x4、以降 3 レベルごとに +1。
 * 上限を 8 にしているのは生成器の都合で、9x9 だと「1 マスだけの領域を作らない」
 * 制約と一意解が両立せず、生成に 100ms 以上かかるため。
 */
export function sizeForLevel(level: number): number {
  return Math.min(8, 4 + Math.floor((level - 1) / 3));
}

export function createGame(level: number, autoCross = true): GameState {
  const n = sizeForLevel(level);
  const puzzle = generatePuzzle(n, level * 7919 + n * 131);
  return {
    level,
    puzzle,
    marks: new Uint8Array(n * n),
    hearts: MAX_HEARTS,
    status: 'playing',
    history: [],
    conflicts: [],
    conflictToken: 0,
    lastPlaced: null,
    autoCross,
    hintsUsed: 0,
  };
}

export const rowOf = (p: Puzzle, idx: number) => Math.floor(idx / p.n);
export const colOf = (p: Puzzle, idx: number) => idx % p.n;

/** idx に猫を置いたとき、ルールに反する既存の猫の一覧。空なら置ける。 */
export function conflictsAt(p: Puzzle, marks: Uint8Array, idx: number): number[] {
  const r = rowOf(p, idx);
  const c = colOf(p, idx);
  const out: number[] = [];

  for (let i = 0; i < marks.length; i++) {
    if (i === idx || marks[i] !== CAT) continue;
    const rr = rowOf(p, i);
    const cc = colOf(p, i);
    const touching = Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1;
    if (rr === r || cc === c || p.regions[i] === p.regions[idx] || touching) out.push(i);
  }
  return out;
}

/** idx に猫がいるとき、その猫のせいで猫を置けなくなるマスの一覧。 */
function blockedBy(p: Puzzle, idx: number): number[] {
  const n = p.n;
  const r = rowOf(p, idx);
  const c = colOf(p, idx);
  const out: number[] = [];

  for (let i = 0; i < n * n; i++) {
    if (i === idx) continue;
    const rr = Math.floor(i / n);
    const cc = i % n;
    const touching = Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1;
    if (rr === r || cc === c || p.regions[i] === p.regions[idx] || touching) out.push(i);
  }
  return out;
}

function applyChanges(marks: Uint8Array, changes: Change[]): Uint8Array {
  const next = marks.slice();
  for (const ch of changes) next[ch.idx] = ch.to;
  return next;
}

function countCats(marks: Uint8Array): number {
  let n = 0;
  for (const m of marks) if (m === CAT) n++;
  return n;
}

/** 手を確定させ、勝敗判定まで済ませた新しい状態を返す。 */
function commit(state: GameState, changes: Change[]): GameState {
  if (changes.length === 0) return state;
  const marks = applyChanges(state.marks, changes);
  const placed = changes.find((ch) => ch.to === CAT);
  const won = countCats(marks) === state.puzzle.n;

  return {
    ...state,
    marks,
    history: [...state.history, changes],
    lastPlaced: placed ? placed.idx : state.lastPlaced,
    conflicts: [],
    status: won ? 'won' : state.status,
  };
}

export interface TapResult {
  state: GameState;
  /** 演出のきっかけ。UI はこれを見て音とアニメーションを出す。 */
  effect: 'cat' | 'cross' | 'erase' | 'conflict' | 'win' | 'lose' | 'none';
}

/**
 * タップ 1 回のふるまい。空 → X → 猫 → 空 と巡回する。
 * 猫が置けない位置なら、置かずにハートを 1 つ減らす。
 */
export function tap(state: GameState, idx: number): TapResult {
  if (state.status !== 'playing') return { state, effect: 'none' };

  const current = state.marks[idx] as Mark;

  if (current === EMPTY) {
    return { state: commit(state, [{ idx, from: EMPTY, to: CROSS }]), effect: 'cross' };
  }

  if (current === CAT) {
    return { state: commit(state, [{ idx, from: CAT, to: EMPTY }]), effect: 'erase' };
  }

  // X から猫へ。ここだけルール判定が要る。
  const bad = conflictsAt(state.puzzle, state.marks, idx);
  if (bad.length > 0) {
    const hearts = state.hearts - 1;
    const lost = hearts <= 0;
    return {
      state: {
        ...state,
        hearts,
        status: lost ? 'lost' : state.status,
        conflicts: [idx, ...bad],
        conflictToken: state.conflictToken + 1,
      },
      effect: lost ? 'lose' : 'conflict',
    };
  }

  const changes: Change[] = [{ idx, from: CROSS, to: CAT }];
  if (state.autoCross) {
    for (const i of blockedBy(state.puzzle, idx)) {
      if (state.marks[i] === EMPTY) changes.push({ idx: i, from: EMPTY, to: CROSS });
    }
  }

  const next = commit(state, changes);
  return { state: next, effect: next.status === 'won' ? 'win' : 'cat' };
}

/**
 * ドラッグでなぞったときのふるまい。なぞり始めたマスの状態で
 * 「X を塗る」か「X を消す」かを決め、指を離すまでその動作を貫く。
 * 途中で猫のマスに触れても壊さない。
 */
export function paint(state: GameState, idx: number, mode: 'draw' | 'erase'): TapResult {
  if (state.status !== 'playing') return { state, effect: 'none' };
  const current = state.marks[idx] as Mark;

  if (mode === 'draw' && current === EMPTY) {
    return { state: commit(state, [{ idx, from: EMPTY, to: CROSS }]), effect: 'cross' };
  }
  if (mode === 'erase' && current === CROSS) {
    return { state: commit(state, [{ idx, from: CROSS, to: EMPTY }]), effect: 'erase' };
  }
  return { state, effect: 'none' };
}

/** ドラッグ中の複数マスを 1 手にまとめ直す。undo が一気に戻せるようにする。 */
export function mergeLastMoves(state: GameState, count: number): GameState {
  if (count <= 1) return state;
  const head = state.history.slice(0, -count);
  const tail = state.history.slice(-count).flat();
  return { ...state, history: [...head, tail] };
}

export function undo(state: GameState): GameState {
  const last = state.history[state.history.length - 1];
  if (!last || state.status === 'lost') return state;

  const marks = state.marks.slice();
  for (const ch of last) marks[ch.idx] = ch.from;

  return {
    ...state,
    marks,
    history: state.history.slice(0, -1),
    status: 'playing',
    conflicts: [],
    lastPlaced: null,
  };
}

export function reset(state: GameState): GameState {
  return {
    ...state,
    marks: new Uint8Array(state.puzzle.n * state.puzzle.n),
    hearts: MAX_HEARTS,
    status: 'playing',
    history: [],
    conflicts: [],
    lastPlaced: null,
    hintsUsed: 0,
  };
}

/** まだ置かれていない正解のマスを 1 つ開ける。 */
export function hint(state: GameState): TapResult {
  if (state.status !== 'playing') return { state, effect: 'none' };
  const { puzzle } = state;

  for (let r = 0; r < puzzle.n; r++) {
    const idx = r * puzzle.n + puzzle.solution[r];
    if (state.marks[idx] === CAT) continue;

    const changes: Change[] = [{ idx, from: state.marks[idx] as Mark, to: CAT }];
    if (state.autoCross) {
      for (const i of blockedBy(puzzle, idx)) {
        if (state.marks[i] === EMPTY) changes.push({ idx: i, from: EMPTY, to: CROSS });
      }
    }
    // 誤って置かれていた猫はヒントで消える
    for (const bad of conflictsAt(puzzle, state.marks, idx)) {
      changes.push({ idx: bad, from: CAT, to: EMPTY });
    }

    const next = commit({ ...state, hintsUsed: state.hintsUsed + 1 }, changes);
    return { state: next, effect: next.status === 'won' ? 'win' : 'cat' };
  }
  return { state, effect: 'none' };
}

export const catsPlaced = countCats;
