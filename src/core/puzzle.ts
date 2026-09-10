// 猫の視野パズルの生成器とソルバ。
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
  readonly seed: number;
  /** 1 = 壁 */
  readonly wall: Uint8Array;
  /** -1 = 数字なし、0 以上 = 隣接 8 マスの猫の数 */
  readonly numbers: Int8Array;
  /** 1 = 猫を置けるマス（数字付きの壁の隣） */
  readonly candidate: Uint8Array;
  /** 正解の猫の位置 */
  readonly solution: number[];
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
 *
 * そこで「1 マス以上新しく照らす候補」から無作為に選ぶ。猫は増えるが、
 * 数字の種類が広がって推理の手がかりが増える。
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

/**
 * 壁になるマスの割合。盤面が大きいほど上げる。
 * 壁が少ないと候補マスが増えて一意解に届かず、生成が急激に遅くなる。
 */
function wallDensity(n: number): number {
  if (n <= 6) return 0.33;
  if (n === 7) return 0.4;
  return 0.43;
}

/**
 * 壁のうち数字を書く割合。
 *
 * 見た目のためには少ないほうがよいが、数字は制約でもあるので、減らすと
 * 一意解の探索が枝刈りされず生成が跳ね上がる。密度より遥かに効く。
 * 実測（8x8・猫は無作為選択）:
 *   数字 60% → 中央 66ms・最悪 1045ms
 *   数字 80% → 中央  2ms・最悪   25ms  （数字の分布はほぼ同じ）
 * 一意にならなければ数字を足していく修復方式も試したが、最悪 556ms で
 * この単純な設定に負けたため採用していない。
 */
const NUMBER_RATIO = 0.8;

/** 解が一意になるまで作り直す。同じ seed なら必ず同じ問題が出る。 */
export function generatePuzzle(n: number, seed: number): Puzzle {
  const rng = mulberry32(seed);

  const density = wallDensity(n);

  for (let attempt = 0; attempt < 8000; attempt++) {
    const wall = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) if (rng() < density) wall[i] = 1;

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
    const want = Math.round(allWalls.length * NUMBER_RATIO);
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

    return { n, seed, wall, numbers, candidate, solution: cats };
  }

  throw new Error(`一意な解を持つ ${n}x${n} の盤面を生成できませんでした (seed=${seed})`);
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
