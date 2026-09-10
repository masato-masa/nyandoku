// 猫の視野パズルの生成器・ソルバ・難易度の測定器。
//
// ルール:
//   - 盤面の一部が壁。壁の一部には数字が書いてある
//   - 数字は、その壁の隣接 8 マスにいる猫の数（ちょうど）
//   - 猫は、数字付きの壁の隣接 8 マスにのみ置ける
//   - 猫の視野 = 自分のマス + 隣接 8 マス + 上下左右の直線（壁で停止）
//   - 壁以外の全マスが誰かの視野に入ったらクリア
//
// 遊び方の説明では「猫も視野を遮る」としているが、見えるマスの集合は遮っても
// 変わらない。遮った猫が必ず同じ方向へ視野を出し直すので、和集合が一致する。
// よって計算では猫による遮蔽を無視でき、各マスの視野を盤面ごとに 1 度だけ
// 求めて使い回せる。ここを毎回数え直すと生成が桁違いに遅くなる。

export interface Puzzle {
  readonly n: number;
  readonly level: number;
  /** 1 = 壁 */
  readonly wall: Uint8Array;
  /** -1 = 数字なし、0 以上 = 隣接 8 マスの猫の数 */
  readonly numbers: Int8Array;
  /** 1 = 猫を置けるマス（数字付きの壁の隣） */
  readonly candidate: Uint8Array;
  /** 正解の猫の位置 */
  readonly solution: number[];
  /** 生成に使ったつまみ。調整のとき何が効いたか追えるように残す。 */
  readonly knobs: Knobs;
  /** 難易度の点数。目安であって絶対的な尺度ではない。 */
  readonly difficulty: number;
  readonly analysis: Analysis;
}

/** 盤面を作るときのつまみ。難易度の軸はここに集約している。 */
export interface Knobs {
  /** 盤面の一辺。見る範囲の広さ。 */
  n: number;
  /** 壁になるマスの割合。下げると視線が伸び、被覆の推論が増える。 */
  wallDensity: number;
  /** 壁のうち数字を書く割合。下げると手がかりが減る。 */
  numberRatio: number;
}

const N8: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

const N4: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inside = (n: number, r: number, c: number) => r >= 0 && r < n && c >= 0 && c < n;

export function neighbours8(n: number, cell: number): number[] {
  const r = Math.floor(cell / n);
  const c = cell % n;
  const out: number[] = [];
  for (const [dr, dc] of N8) {
    if (inside(n, r + dr, c + dc)) out.push((r + dr) * n + (c + dc));
  }
  return out;
}

/** そのマスに猫を置いたとき見えるマス。壁は含めない。 */
export function visionOf(n: number, wall: Uint8Array, cell: number): Uint8Array {
  const seen = new Uint8Array(n * n);
  const r = Math.floor(cell / n);
  const c = cell % n;
  seen[cell] = 1;

  for (const [dr, dc] of N8) {
    const rr = r + dr;
    const cc = c + dc;
    if (inside(n, rr, cc) && !wall[rr * n + cc]) seen[rr * n + cc] = 1;
  }

  for (const [dr, dc] of N4) {
    let rr = r + dr;
    let cc = c + dc;
    while (inside(n, rr, cc) && !wall[rr * n + cc]) {
      seen[rr * n + cc] = 1;
      rr += dr;
      cc += dc;
    }
  }
  return seen;
}

/** 猫たちが見ているマス。 */
export function coverageOf(n: number, wall: Uint8Array, cats: Iterable<number>): Uint8Array {
  const seen = new Uint8Array(n * n);
  for (const cat of cats) {
    const v = visionOf(n, wall, cat);
    for (let i = 0; i < seen.length; i++) if (v[i]) seen[i] = 1;
  }
  return seen;
}

export function allCovered(n: number, wall: Uint8Array, seen: Uint8Array): boolean {
  for (let i = 0; i < n * n; i++) if (!wall[i] && !seen[i]) return false;
  return true;
}

/** 壁に隣接する非壁マス。猫が置ける可能性のある場所。 */
function wallAdjacentCells(n: number, wall: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < n * n; i++) {
    if (wall[i]) continue;
    if (neighbours8(n, i).some((j) => wall[j])) out.push(i);
  }
  return out;
}

/**
 * 全マスを覆う猫の集合を探す。視野は事前計算したものを使い回す。
 *
 * 猫の選び方が、そのまま壁の数字の分布になる。
 * 「最も多く新しく照らす猫」を選び続けると視野の重複を避けようとして猫が
 * 散らばり、同じ壁の周りに 2 匹以上が並ばなくなる。その結果、数字が 0 と 1
 * ばかりになって手がかりが単調になる。実測（8x8・50 盤面の数字の分布）:
 *
 *   最大利得を選ぶ  0:231  1:471  2:155  3:12  4:0   （猫 7.8 匹）
 *   候補から無作為  0:159  1:436  2:300  3:78  4:6   （猫 10.6 匹）
 */
function findCover(
  n: number,
  wall: Uint8Array,
  cells: number[],
  masks: Map<number, Uint8Array>,
  rng: () => number,
): number[] | null {
  const cats: number[] = [];
  const seen = new Uint8Array(n * n);
  const used = new Set<number>();

  for (let step = 0; step < cells.length; step++) {
    if (allCovered(n, wall, seen)) return cats;

    const usable: number[] = [];
    for (const cand of cells) {
      if (used.has(cand)) continue;
      const m = masks.get(cand)!;
      for (let i = 0; i < m.length; i++) {
        if (m[i] && !seen[i] && !wall[i]) {
          usable.push(cand);
          break;
        }
      }
    }
    if (usable.length === 0) return null;

    const pick = usable[Math.floor(rng() * usable.length)];
    cats.push(pick);
    used.add(pick);
    const m = masks.get(pick)!;
    for (let i = 0; i < seen.length; i++) if (m[i]) seen[i] = 1;
  }

  return allCovered(n, wall, seen) ? cats : null;
}

/** ルールを満たす配置が何通りあるか。limit に達したら打ち切る。 */
export function countSolutions(n: number, wall: Uint8Array, numbers: Int8Array, limit = 2): number {
  const walls: number[] = [];
  for (let i = 0; i < n * n; i++) if (wall[i] && numbers[i] >= 0) walls.push(i);

  // 周りの空きマスが少ない壁から決めると、枝が早く枯れる
  const around = walls.map((w) => neighbours8(n, w).filter((c) => !wall[c]));
  const order = walls.map((_, i) => i).sort((a, b) => around[a].length - around[b].length);

  const state = new Map<number, boolean>();
  let found = 0;

  const finish = () => {
    const cats: number[] = [];
    for (const [cell, on] of state) if (on) cats.push(cell);
    if (allCovered(n, wall, coverageOf(n, wall, cats))) found++;
  };

  const rec = (k: number): void => {
    if (found >= limit) return;
    if (k === order.length) {
      finish();
      return;
    }

    const w = order[k];
    const want = numbers[walls[w]];
    const cells = around[w];
    const fixed = cells.filter((c) => state.get(c) === true).length;
    const open = cells.filter((c) => state.get(c) === undefined);
    const need = want - fixed;
    if (need < 0 || need > open.length) return;

    const choose = (start: number, picked: number[]): void => {
      if (found >= limit) return;
      if (picked.length === need) {
        for (const c of open) state.set(c, picked.includes(c));
        rec(k + 1);
        for (const c of open) state.delete(c);
        return;
      }
      for (let i = start; i < open.length; i++) {
        if (open.length - i < need - picked.length) break;
        choose(i + 1, [...picked, open[i]]);
        if (found >= limit) return;
      }
    };
    choose(0, []);
  };

  rec(0);
  return found;
}

// ---- 難易度の測定 ----

export interface Analysis {
  /** 推測なしで最後まで解けたか。これを満たさない問題は出さない。 */
  solved: boolean;
  /** 推論の往復回数。確定の連鎖がどれだけ続くか。 */
  rounds: number;
  /** 数字から確定したマスの数。 */
  byNumber: number;
  /** 視野の被覆から確定したマスの数。人にとってはこちらのほうが重い。 */
  byCover: number;
  /** 猫を置ける候補マスの数。探索の広さ。 */
  candidates: number;
}

const UNKNOWN = 0;
const IS_CAT = 1;
const IS_EMPTY = 2;

/**
 * 人が使う推論だけを機械的に回して、どこまで確定できるかを測る。
 *
 * 使う推論は 2 種類だけ:
 *   A 数字  ある壁の数字が k のとき、まわりの猫が k 匹揃えば残りは空。
 *           空きマスを全部使わないと k に届かないなら残りは全部猫。
 *   B 被覆  まだ誰にも見えていないマスを見られる候補が 1 つしかないなら、そこは猫。
 *
 * 「解が一意か」の検査とは別物。一意でも、この推論だけでは詰まる（＝推測が要る）
 * 問題は普通に出てくる。実測では旧設定の 25〜42% がそうだった。
 */
export function analyse(
  n: number,
  wall: Uint8Array,
  numbers: Int8Array,
  candidate: Uint8Array,
): Analysis {
  const size = n * n;

  const masks = new Map<number, Uint8Array>();
  for (let i = 0; i < size; i++) if (candidate[i]) masks.set(i, visionOf(n, wall, i));

  const state = new Uint8Array(size);
  // 猫を置けないマスは最初から空で確定している
  for (let i = 0; i < size; i++) if (!wall[i] && !candidate[i]) state[i] = IS_EMPTY;

  const numberedWalls: number[] = [];
  for (let i = 0; i < size; i++) if (wall[i] && numbers[i] >= 0) numberedWalls.push(i);
  const wallNbrs = new Map<number, number[]>();
  for (const w of numberedWalls) wallNbrs.set(w, neighbours8(n, w).filter((c) => !wall[c]));

  const currentlySeen = (): Uint8Array => {
    const s = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      if (state[i] !== IS_CAT) continue;
      const m = masks.get(i)!;
      for (let j = 0; j < size; j++) if (m[j]) s[j] = 1;
    }
    return s;
  };

  let rounds = 0;
  let byNumber = 0;
  let byCover = 0;
  let contradiction = false;

  for (;;) {
    let changed = false;
    rounds++;

    // A 数字の推論
    for (const w of numberedWalls) {
      const want = numbers[w];
      const cells = wallNbrs.get(w)!;
      let cats = 0;
      const unknown: number[] = [];
      for (const c of cells) {
        if (state[c] === IS_CAT) cats++;
        else if (state[c] === UNKNOWN) unknown.push(c);
      }
      if (cats > want) {
        contradiction = true;
        break;
      }
      if (unknown.length === 0) continue;
      if (cats === want) {
        for (const c of unknown) state[c] = IS_EMPTY;
        byNumber += unknown.length;
        changed = true;
      } else if (cats + unknown.length === want) {
        for (const c of unknown) state[c] = IS_CAT;
        byNumber += unknown.length;
        changed = true;
      }
    }
    if (contradiction) break;

    // B 被覆の推論
    const seen = currentlySeen();
    for (let c = 0; c < size; c++) {
      if (wall[c] || seen[c]) continue;
      let only = -1;
      let count = 0;
      for (const [x, m] of masks) {
        if (state[x] === IS_EMPTY || !m[c]) continue;
        count++;
        only = x;
        if (count > 1) break;
      }
      if (count === 0) {
        contradiction = true;
        break;
      }
      if (count === 1 && state[only] === UNKNOWN) {
        state[only] = IS_CAT;
        byCover++;
        changed = true;
      }
    }
    if (contradiction) break;

    if (!changed) break;
    // 念のための安全弁。通常ここには達しない。
    if (rounds > 200) break;
  }

  const seen = currentlySeen();
  const numbersOk = numberedWalls.every(
    (w) => wallNbrs.get(w)!.filter((c) => state[c] === IS_CAT).length === numbers[w],
  );

  return {
    solved: !contradiction && numbersOk && allCovered(n, wall, seen),
    rounds,
    byNumber,
    byCover,
    candidates: masks.size,
  };
}

/**
 * 難易度の重み。調整はここだけ触ればよい。
 *
 * 実測での各指標の幅（論理で解ける問題のみ）:
 *   candidates  9 〜 33    盤面サイズと壁密度で動く。探索の広さ
 *   byCover     0 〜 5     壁密度を下げると増える。視野で考える場面の多さ
 *   rounds      2 〜 6     確定の連鎖の長さ
 *
 * candidates を重くするとサイズがそのまま難易度になり、高いレベルに大きい盤しか
 * 出なくなる。推論の深さ（byCover と rounds）を重くすることで、小さい盤でも
 * 難しくなりうる形にしている。
 */
export const DIFFICULTY_WEIGHTS = {
  candidates: 0.6,
  byCover: 6,
  rounds: 4,
} as const;

export function difficultyOf(a: Analysis): number {
  return (
    a.candidates * DIFFICULTY_WEIGHTS.candidates +
    a.byCover * DIFFICULTY_WEIGHTS.byCover +
    a.rounds * DIFFICULTY_WEIGHTS.rounds
  );
}

/**
 * レベルに対する目標難易度。
 * 上がり続けるのではなく上限に漸近させ、さらに揺らぎを持たせている。
 * 「レベルが高いほど難しい傾向はあるが、必ずそうとは限らない」という形。
 */
export function targetDifficulty(level: number, rng: () => number): number {
  const base = 18 + 34 * (1 - Math.exp(-(level - 1) / 9));
  const jitter = 1 + (rng() * 2 - 1) * 0.2;
  return base * jitter;
}

/**
 * 盤面サイズの抽選。レベルが上がるほど大きい盤が出やすくなるが、
 * 小さい盤も出続ける。サイズは難易度の一要素でしかない。
 */
function sampleSize(level: number, rng: () => number): number {
  const t = Math.min(1, (level - 1) / 18);
  const weights: Array<[number, number]> = [
    [5, 0.4 - 0.3 * t],
    [6, 0.35 - 0.1 * t],
    [7, 0.18 + 0.15 * t],
    [8, 0.07 + 0.25 * t],
  ];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [n, w] of weights) {
    r -= w;
    if (r <= 0) return n;
  }
  return 6;
}

/**
 * つまみの抽選。
 * 壁を減らすほど視野の推論が増えて面白くなるが、生成コストが跳ね上がる。
 * 実測（n=7）: 密度 0.30 → 被覆推論 4.9 回だが 948ms/問、
 *              密度 0.48 → 被覆推論 1.4 回で 1ms/問。
 * 大きい盤ほど下限を上げて、現実的な時間に収めている。
 */
function sampleKnobs(level: number, rng: () => number): Knobs {
  const n = sampleSize(level, rng);
  const minDensity = n >= 8 ? 0.4 : n === 7 ? 0.36 : 0.28;
  const minRatio = n >= 7 ? 0.72 : 0.6;
  return {
    n,
    wallDensity: minDensity + rng() * (0.5 - minDensity),
    numberRatio: minRatio + rng() * (1 - minRatio),
  };
}

interface RawPuzzle {
  n: number;
  wall: Uint8Array;
  numbers: Int8Array;
  candidate: Uint8Array;
  solution: number[];
}

/** つまみ 1 組から盤面を 1 つ作る。作れなければ null。 */
function tryGenerate(knobs: Knobs, rng: () => number, attempts: number): RawPuzzle | null {
  const { n, wallDensity, numberRatio } = knobs;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const wall = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) if (rng() < wallDensity) wall[i] = 1;

    const cells = wallAdjacentCells(n, wall);
    if (cells.length === 0) continue;

    const masks = new Map<number, Uint8Array>();
    for (const cell of cells) masks.set(cell, visionOf(n, wall, cell));

    const cats = findCover(n, wall, cells, masks, rng);
    if (!cats || cats.length === 0) continue;

    // まず、どの猫も数字付きの壁の隣に来るように最低限の壁を選ぶ
    const numbers = new Int8Array(n * n).fill(-1);
    const catSet = new Set(cats);
    let placeable = true;

    for (const cat of cats) {
      const nearWalls = neighbours8(n, cat).filter((i) => wall[i]);
      if (nearWalls.length === 0) {
        placeable = false;
        break;
      }
      if (nearWalls.some((w) => numbers[w] >= 0)) continue;
      numbers[nearWalls[Math.floor(rng() * nearWalls.length)]] = 0;
    }
    if (!placeable) continue;

    // そのうえで、指定の割合になるまで数字付きの壁を足す
    const allWalls: number[] = [];
    for (let i = 0; i < n * n; i++) if (wall[i]) allWalls.push(i);
    const want = Math.round(allWalls.length * numberRatio);
    let numbered = allWalls.filter((w) => numbers[w] >= 0).length;
    for (const w of allWalls) {
      if (numbered >= want) break;
      if (numbers[w] >= 0) continue;
      numbers[w] = 0;
      numbered++;
    }

    // 数字の値は正解から決まる
    for (let i = 0; i < n * n; i++) {
      if (numbers[i] < 0) continue;
      numbers[i] = neighbours8(n, i).filter((c) => catSet.has(c)).length;
    }

    // 猫を置けるマス = 数字付きの壁の隣にある非壁マス
    const candidate = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) {
      if (wall[i]) continue;
      if (neighbours8(n, i).some((w) => wall[w] && numbers[w] >= 0)) candidate[i] = 1;
    }

    if (countSolutions(n, wall, numbers, 2) !== 1) continue;

    return { n, wall, numbers, candidate, solution: cats };
  }
  return null;
}

/**
 * 目標難易度にどれだけ近ければ十分とみなすか。
 * 厳しくすると狙いは正確になるが、条件に合う盤面を探し続けて生成が遅くなる。
 */
const CLOSE_ENOUGH = 0.13;
/**
 * つまみを引き直す回数。時間ではなく回数で区切っているのは、
 * 実行速度で結果が変わると「同じレベルは同じ盤面」が崩れるため。
 */
const KNOB_ATTEMPTS = 18;
/** 1 組のつまみで盤面を作り直す上限。 */
const BOARD_ATTEMPTS = 260;

/**
 * レベルから盤面を作る。同じレベルなら必ず同じ盤面になる。
 *
 * サイズをレベルから直接決めるのはやめ、複数の軸で作った候補に難易度の点数を
 * つけて、そのレベルの目標に一番近いものを選ぶ。おかげで高いレベルでも
 * 小さい盤面が出るし、レベルと難しさは「傾向として」しか結び付かない。
 */
export function generateForLevel(level: number): Puzzle {
  const rng = mulberry32(level * 7919 + 104729);
  const target = targetDifficulty(level, rng);

  let best: { raw: RawPuzzle; knobs: Knobs; analysis: Analysis; score: number } | null = null;

  for (let i = 0; i < KNOB_ATTEMPTS; i++) {
    const knobs = sampleKnobs(level, rng);
    const raw = tryGenerate(knobs, rng, BOARD_ATTEMPTS);
    if (!raw) continue;

    const analysis = analyse(raw.n, raw.wall, raw.numbers, raw.candidate);
    // 推測が要る問題は出さない
    if (!analysis.solved) continue;

    const score = difficultyOf(analysis);
    const gap = Math.abs(score - target);
    if (!best || gap < Math.abs(best.score - target)) best = { raw, knobs, analysis, score };
    if (gap <= target * CLOSE_ENOUGH) break;
  }

  if (!best) {
    // どれも条件を満たさなかった。作りやすい設定で妥協する。
    const knobs: Knobs = { n: 6, wallDensity: 0.45, numberRatio: 0.9 };
    const raw = tryGenerate(knobs, rng, 4000);
    if (!raw) throw new Error(`レベル ${level} の盤面を生成できませんでした`);
    const analysis = analyse(raw.n, raw.wall, raw.numbers, raw.candidate);
    best = { raw, knobs, analysis, score: difficultyOf(analysis) };
  }

  return {
    n: best.raw.n,
    level,
    wall: best.raw.wall,
    numbers: best.raw.numbers,
    candidate: best.raw.candidate,
    solution: best.raw.solution,
    knobs: best.knobs,
    difficulty: best.score,
    analysis: best.analysis,
  };
}

export interface NumberState {
  want: number;
  got: number;
}

/** 数字ごとの充足状況。UI が表示にそのまま使う。 */
export function numberStates(puzzle: Puzzle, cats: Set<number>): Map<number, NumberState> {
  const out = new Map<number, NumberState>();
  for (let i = 0; i < puzzle.n * puzzle.n; i++) {
    if (puzzle.numbers[i] < 0) continue;
    const got = neighbours8(puzzle.n, i).filter((c) => cats.has(c)).length;
    out.set(i, { want: puzzle.numbers[i], got });
  }
  return out;
}
