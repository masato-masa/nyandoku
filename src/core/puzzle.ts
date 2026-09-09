// Star Battle / Queens 系ロジックパズルの生成器とソルバ。
//
// ルール:
//   - 各行・各列・各カラー領域に、猫はちょうど 1 匹
//   - 猫どうしは斜めを含めて隣接してはいけない
//
// DOM に一切触れない純粋ロジック。ゲームの中身を差し替えるときは
// ここだけを置き換えれば、UI 層と操作感はそのまま再利用できる。

export interface Puzzle {
  readonly n: number;
  readonly seed: number;
  /** regions[row * n + col] = 領域 ID (0..n-1) */
  readonly regions: Int32Array;
  /** solution[row] = 猫が入る列 */
  readonly solution: number[];
}

/** 決定的な擬似乱数。同じ seed からは必ず同じ盤面が出る。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 解を 1 つランダムに作る。行ごとに列を選ぶので行の重複は起きない。
 * 列の重複と、隣り合う行での斜め隣接だけを弾けばよい。
 */
function randomSolution(n: number, rng: () => number): number[] | null {
  const place = new Array<number>(n).fill(-1);
  const colUsed = new Array<boolean>(n).fill(false);

  const rec = (row: number): boolean => {
    if (row === n) return true;
    for (const col of shuffled([...Array(n).keys()], rng)) {
      if (colUsed[col]) continue;
      if (row > 0 && Math.abs(place[row - 1] - col) <= 1) continue;
      place[row] = col;
      colUsed[col] = true;
      if (rec(row + 1)) return true;
      colUsed[col] = false;
      place[row] = -1;
    }
    return false;
  };

  return rec(0) ? place : null;
}

/**
 * 各猫を種にした多点フラッドフィルで領域を育てる。
 *
 * 肝は「1 つの領域を数マス続けて伸ばしてから別の領域へ移る」ところ。
 * 面積を揃えて丸く育てると領域が解を絞れず、一意解がほとんど出ない
 * （実測: 6x6 以上で 0%、生成器が延々と引き直して固まる）。
 * 細長く育てると制約が強くなり、9x9 でも数ミリ秒で一意解に届く。
 */
function growRegions(n: number, solution: number[], rng: () => number): Int32Array | null {
  const size = n * n;
  const owner = new Int32Array(size).fill(-1);
  const counts = new Array<number>(n).fill(0);
  const frontier: number[][] = Array.from({ length: n }, () => []);

  const pushNeighbours = (idx: number) => {
    const region = owner[idx];
    const r = Math.floor(idx / n);
    const c = idx % n;
    if (r > 0) frontier[region].push(idx - n);
    if (r < n - 1) frontier[region].push(idx + n);
    if (c > 0) frontier[region].push(idx - 1);
    if (c < n - 1) frontier[region].push(idx + 1);
  };

  for (let r = 0; r < n; r++) {
    const idx = r * n + solution[r];
    owner[idx] = r;
    counts[r] = 1;
    pushNeighbours(idx);
  }

  // 1 つの領域を続けて伸ばす長さ。盤が大きいほど長く伸ばさないと制約が足りず、
  // 一意解に届くまでの試行回数が跳ね上がる（9x9 で実測 257ms → 数 ms）。
  const minRun = 3;
  const maxRun = Math.max(8, n + 3);

  // 1 領域が広がりすぎると見た目が単調になり、そこだけ難易度も落ちる。
  // 面積を揃えにいくと逆に一意解がほぼ出なくなるので、上限だけ押さえる。
  // （8x8 で最大領域 28 マス → 20 マス）
  const maxSize = Math.ceil(n * 1.8);

  // 1 マスだけの領域は猫の位置がただで分かってしまうので必ず 2 マス以上にする。
  // 3 マス以上を強制すると一意解がほとんど出なくなる（8x8 で生成失敗が頻発）。
  // ここが「解が一意であること」と「見た目の均等さ」の折り合う限界だった。
  const minSize = 2;

  let assigned = n;
  let current = -1;
  let run = 0;

  while (assigned < size) {
    const live: number[] = [];
    for (let g = 0; g < n; g++) {
      frontier[g] = frontier[g].filter((i) => owner[i] === -1);
      if (frontier[g].length > 0) live.push(g);
    }
    if (live.length === 0) return null; // 届かないセルが出た。作り直し。

    // 最小サイズに届いていない領域があれば、囲まれて潰れる前にそこを伸ばす。
    const starving = live.filter((g) => counts[g] < minSize);
    let region: number;

    if (starving.length > 0) {
      region = starving[Math.floor(rng() * starving.length)];
      current = -1;
      run = 0;
    } else {
      // 上限に達していない領域を優先する。全部埋まっていたら仕方なく全体から選ぶ。
      const room = live.filter((g) => counts[g] < maxSize);
      const pool = room.length > 0 ? room : live;

      // 伸ばす回数を使い切ったか、伸ばしていた領域が行き止まりになったら乗り換える
      if (run <= 0 || !pool.includes(current)) {
        current = pool[Math.floor(rng() * pool.length)];
        run = minRun + Math.floor(rng() * (maxRun - minRun + 1));
      }
      run--;
      region = current;
    }

    const list = frontier[region];
    const pick = Math.floor(rng() * list.length);
    const idx = list[pick];
    list.splice(pick, 1);

    owner[idx] = region;
    counts[region]++;
    assigned++;
    pushNeighbours(idx);
  }

  return owner;
}

/**
 * 解の個数を数える。limit に達したら打ち切るので「一意かどうか」の判定が速い。
 * 行を上から順に埋めるため、隣接判定は 1 つ上の行とだけ比べればよい。
 */
export function countSolutions(n: number, regions: Int32Array, limit = 2): number {
  const colUsed = new Array<boolean>(n).fill(false);
  const regionUsed = new Array<boolean>(n).fill(false);
  const place = new Array<number>(n).fill(-1);
  let found = 0;

  const rec = (row: number): void => {
    if (found >= limit) return;
    if (row === n) {
      found++;
      return;
    }
    for (let col = 0; col < n; col++) {
      if (colUsed[col]) continue;
      const g = regions[row * n + col];
      if (regionUsed[g]) continue;
      if (row > 0 && Math.abs(place[row - 1] - col) <= 1) continue;

      colUsed[col] = true;
      regionUsed[g] = true;
      place[row] = col;
      rec(row + 1);
      colUsed[col] = false;
      regionUsed[g] = false;
      place[row] = -1;

      if (found >= limit) return;
    }
  };

  rec(0);
  return found;
}

/** 解が一意になるまで作り直す。同じ seed なら必ず同じ問題が出る。 */
export function generatePuzzle(n: number, seed: number): Puzzle {
  const rng = mulberry32(seed);

  for (let attempt = 0; attempt < 4000; attempt++) {
    const solution = randomSolution(n, rng);
    if (!solution) continue;

    // 同じ解に対して領域だけを何度か引き直す。解の生成より安いので先に試す。
    for (let retry = 0; retry < 12; retry++) {
      const regions = growRegions(n, solution, rng);
      if (!regions) continue;
      if (countSolutions(n, regions, 2) === 1) return { n, seed, regions, solution };
    }
  }

  throw new Error(`一意な解を持つ ${n}x${n} の盤面を生成できませんでした (seed=${seed})`);
}
