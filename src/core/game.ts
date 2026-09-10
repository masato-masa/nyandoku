import {
  allCovered,
  coverageOf,
  generatePuzzle,
  numberStates,
  type NumberState,
  type Puzzle,
} from './puzzle';

export const EMPTY = 0;
export const CROSS = 1;
export const CAT = 2;
export type Mark = typeof EMPTY | typeof CROSS | typeof CAT;

/** 1 手ぶんの変更。ドラッグでまとめて塗った分も 1 手にまとまる。 */
export interface Change {
  idx: number;
  from: Mark;
  to: Mark;
}

export interface GameState {
  level: number;
  puzzle: Puzzle;
  marks: Uint8Array;
  status: 'playing' | 'won';
  history: Change[][];
  /** 直前に猫を置いたマス。 */
  lastPlaced: number | null;
  /** 置けない場所を押したときに揺らすマス。 */
  rejected: number[];
  /** 同じマスで続けて弾かれても演出をやり直せるように毎回増やす。 */
  rejectToken: number;
  hintsUsed: number;
}

/**
 * レベルが上がるほど盤面を大きくする。1〜3 は 6x6、以降 3 レベルごとに +1。
 * 上限が 8 なのは生成コストの都合で、9x9 は最良の設定でも最悪 588ms かかり、
 * 「次のレベルへ」を押した瞬間に固まって見えるため。
 */
export function sizeForLevel(level: number): number {
  return Math.min(8, 6 + Math.floor((level - 1) / 3));
}

export function createGame(level: number): GameState {
  const n = sizeForLevel(level);
  const puzzle = generatePuzzle(n, level * 7919 + n * 131);
  return {
    level,
    puzzle,
    marks: new Uint8Array(n * n),
    status: 'playing',
    history: [],
    lastPlaced: null,
    rejected: [],
    rejectToken: 0,
    hintsUsed: 0,
  };
}

export function catsOf(marks: Uint8Array): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < marks.length; i++) if (marks[i] === CAT) out.add(i);
  return out;
}

export const catCount = (marks: Uint8Array): number => catsOf(marks).size;

/** UI が必要とする派生情報。状態には持たず、その都度求める。 */
export interface Derived {
  cats: Set<number>;
  /** 1 = いずれかの猫の視野に入っている */
  seen: Uint8Array;
  numbers: Map<number, NumberState>;
  /** 見えていない非壁マスの数 */
  remaining: number;
  /** 壁以外を全部見ていて、かつ全ての数字がちょうど合っている */
  solved: boolean;
}

export function derive(state: GameState): Derived {
  const { puzzle } = state;
  const cats = catsOf(state.marks);
  const seen = coverageOf(puzzle.n, puzzle.wall, cats);
  const numbers = numberStates(puzzle, cats);

  let remaining = 0;
  for (let i = 0; i < puzzle.n * puzzle.n; i++) {
    if (!puzzle.wall[i] && !seen[i]) remaining++;
  }

  let numbersOk = true;
  for (const { want, got } of numbers.values()) {
    if (want !== got) {
      numbersOk = false;
      break;
    }
  }

  return {
    cats,
    seen,
    numbers,
    remaining,
    solved: numbersOk && allCovered(puzzle.n, puzzle.wall, seen),
  };
}

function commit(state: GameState, changes: Change[]): GameState {
  if (changes.length === 0) return state;

  const marks = state.marks.slice();
  for (const ch of changes) marks[ch.idx] = ch.to;

  const placed = changes.find((ch) => ch.to === CAT);
  const next: GameState = {
    ...state,
    marks,
    history: [...state.history, changes],
    lastPlaced: placed ? placed.idx : state.lastPlaced,
    rejected: [],
  };

  return derive(next).solved ? { ...next, status: 'won' } : next;
}

export interface TapResult {
  state: GameState;
  effect: 'cat' | 'cross' | 'erase' | 'reject' | 'win' | 'none';
}

/**
 * タップ 1 回のふるまい。
 * 猫を置けるマスは 空 → X → 猫 → 空、置けないマスは 空 → X → 空 と巡回する。
 * 壁は押しても何も起きない。
 */
export function tap(state: GameState, idx: number): TapResult {
  if (state.status !== 'playing') return { state, effect: 'none' };
  const { puzzle } = state;
  if (puzzle.wall[idx]) return { state, effect: 'none' };

  const current = state.marks[idx] as Mark;

  if (current === EMPTY) {
    return { state: commit(state, [{ idx, from: EMPTY, to: CROSS }]), effect: 'cross' };
  }

  if (current === CAT) {
    return { state: commit(state, [{ idx, from: CAT, to: EMPTY }]), effect: 'erase' };
  }

  // X から猫へ。数字付きの壁に接していないマスには置けない。
  if (!puzzle.candidate[idx]) {
    return {
      state: {
        ...state,
        rejected: [idx],
        rejectToken: state.rejectToken + 1,
      },
      effect: 'reject',
    };
  }

  const next = commit(state, [{ idx, from: CROSS, to: CAT }]);
  return { state: next, effect: next.status === 'won' ? 'win' : 'cat' };
}

/**
 * ドラッグでなぞったときのふるまい。なぞり始めたマスの状態で
 * 「X を塗る」か「X を消す」かを決め、指を離すまでその動作を貫く。
 * 猫のマスと壁は触れても壊さない。
 */
export function paint(state: GameState, idx: number, mode: 'draw' | 'erase'): TapResult {
  if (state.status !== 'playing') return { state, effect: 'none' };
  if (state.puzzle.wall[idx]) return { state, effect: 'none' };

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
  if (!last) return state;

  const marks = state.marks.slice();
  for (const ch of last) marks[ch.idx] = ch.from;

  return {
    ...state,
    marks,
    history: state.history.slice(0, -1),
    status: 'playing',
    lastPlaced: null,
    rejected: [],
  };
}

export function reset(state: GameState): GameState {
  return {
    ...state,
    marks: new Uint8Array(state.puzzle.n * state.puzzle.n),
    status: 'playing',
    history: [],
    lastPlaced: null,
    rejected: [],
    hintsUsed: 0,
  };
}

/** まだ置かれていない正解の猫を 1 匹置く。誤って置かれた猫は同時に取り除く。 */
export function hint(state: GameState): TapResult {
  if (state.status !== 'playing') return { state, effect: 'none' };
  const { puzzle } = state;
  const correct = new Set(puzzle.solution);

  const target = puzzle.solution.find((i) => state.marks[i] !== CAT);
  if (target === undefined) return { state, effect: 'none' };

  const changes: Change[] = [{ idx: target, from: state.marks[target] as Mark, to: CAT }];
  for (let i = 0; i < state.marks.length; i++) {
    if (state.marks[i] === CAT && !correct.has(i)) {
      changes.push({ idx: i, from: CAT, to: EMPTY });
    }
  }

  const next = commit({ ...state, hintsUsed: state.hintsUsed + 1 }, changes);
  return { state: next, effect: next.status === 'won' ? 'win' : 'cat' };
}
