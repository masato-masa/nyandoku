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
  /**
   * どの段階で作られたか。1 が通常。2 以降は条件を緩めて作ったもので、
   * 重みを変えたあとの監査（scripts/audit-levels.mjs）で偏りを見るのに使う。
   */
  readonly stage: 1 | 2 | 3 | 4;
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

/**
 * 探索の打ち切り点。ここを超えたら「一意ではない」とみなして捨てる。
 *
 * 壁と数字が少ない盤面では、この探索が組合せ爆発して 1 回で数秒かかることがある。
 * 試行回数で総枠を切っても、1 回あたりのコストが桁違いに動くので時間は抑えられない
 * （実測: 総枠 20000 回でも Lv31 が 11 秒）。時間ではなく探索した節点の数で切る
 * ことで、遅いマシンでも同じ盤面が出る性質を保ったまま最悪時間を抑えられる。
 *
 * コストは採用された盤面ではなく捨てられた候補側にある。最終盤面の判定は
 * 0.1ms しかかからないのに、上限まで探索して捨てる候補が積み重なって秒単位になる。
 */
const SOLVER_NODE_BUDGET = 4000;

/** ルールを満たす配置が何通りあるか。limit か節点の上限に達したら打ち切る。 */
export function countSolutions(n: number, wall: Uint8Array, numbers: Int8Array, limit = 2): number {
  const walls: number[] = [];
  for (let i = 0; i < n * n; i++) if (wall[i] && numbers[i] >= 0) walls.push(i);

  // 周りの空きマスが少ない壁から決めると、枝が早く枯れる
  const around = walls.map((w) => neighbours8(n, w).filter((c) => !wall[c]));
  const order = walls.map((_, i) => i).sort((a, b) => around[a].length - around[b].length);

  const state = new Map<number, boolean>();
  let found = 0;
  let nodes = 0;
  let exhausted = false;

  const finish = () => {
    const cats: number[] = [];
    for (const [cell, on] of state) if (on) cats.push(cell);
    if (allCovered(n, wall, coverageOf(n, wall, cats))) found++;
  };

  const rec = (k: number): void => {
    if (found >= limit || exhausted) return;
    if (++nodes > SOLVER_NODE_BUDGET) {
      exhausted = true;
      return;
    }
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
  // 打ち切った場合は一意だと言い切れないので、捨てさせる
  return exhausted ? limit : found;
}

// ---- 難易度の測定 ----

/** 背理法 1 回ぶんの中身。 */
export interface ContradictionStep {
  /**
   * 手をつけた分岐の幅。その数字のまわりに未確定マスが何個残っていたか。
   * 2 なら二択で、片方を試せば済む。多いほど「どこから考えるか」自体が難しい。
   */
  branchWidth: number;
  /** 仮定してから矛盾が出るまでに適用した推論の段数。人が読む手数。 */
  depth: number;
  /** そのうち被覆推論だった段数。数字推論より探すのが重い。 */
  coverSteps: number;
}

export interface Analysis {
  /** 基本推論だけで最後まで解けたか。 */
  solvedBasic: boolean;
  /** 基本推論に背理法を足せば解けたか。これを満たさない問題は出さない。 */
  solved: boolean;
  /** 確定の依存関係の深さ。芋づるが何段続いたか。走査順に依存しない。 */
  chainDepth: number;
  /** 数字から確定したマスの数。作業量であって難しさではないので重みには入れていない。 */
  byNumber: number;
  /** 被覆推論で確定したマスの数。被覆は 1 回につき 1 マスなので回数と同じ。 */
  byCover: number;
  /** 集合の推論を使った回数。数字や被覆より一段上の技法。 */
  bySubset: number;
  /** 背理法 1 回ごとの内訳。 */
  contradictions: ContradictionStep[];
  /** 背理法の最大段数。理不尽さの上限を測るための値。 */
  maxContradictionDepth: number;
  /** 猫を置ける候補マスの数。探索の広さ。 */
  candidates: number;
}

const UNKNOWN = 0;
const IS_CAT = 1;
const IS_EMPTY = 2;

interface Ctx {
  n: number;
  size: number;
  wall: Uint8Array;
  numbers: Int8Array;
  masks: Map<number, Uint8Array>;
  numberedWalls: number[];
  wallNbrs: Map<number, number[]>;
  /** そのマスを取り囲んでいる数字付きの壁。分岐の幅を測るのに使う。 */
  wallsOfCell: Map<number, number[]>;
}

/**
 * そのマスから背理法を始めるときの分岐の幅。
 * そのマスが属する数字のうち、まだ未確定のマスが最も少ないものの個数。
 * 2 なら二択。人は選択肢の少ないところから手をつけるので、この値が
 * そのまま「取りかかりやすさ」になる。
 */
function branchWidth(ctx: Ctx, state: Uint8Array, cell: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const w of ctx.wallsOfCell.get(cell) ?? []) {
    let unknown = 0;
    for (const c of ctx.wallNbrs.get(w)!) if (state[c] === UNKNOWN) unknown++;
    if (unknown >= 2 && unknown < best) best = unknown;
  }
  return Number.isFinite(best) ? best : 2;
}

interface PropResult {
  contradiction: boolean;
  /** 確定したマス数。 */
  numberCells: number;
  coverCells: number;
  /** 推論を適用した回数。 */
  numberSteps: number;
  coverSteps: number;
  subsetSteps: number;
  /**
   * 確定の連鎖が何段続いたか。
   *
   * 「今わかっていることだけから導けるものを全部集めて、まとめて確定させる」を
   * 1 段として数える。1 段の中では互いの結果を参照しないので、壁を見る順番を
   * 変えても値が変わらない。
   *
   * 当初は「盤面を何周スキャンしたか」で代用し、次に「確定した順に深さを振る」
   * 方式を試したが、どちらも走査順で値が変わった（壁を見る順を逆にしただけで
   * 25 面中 14〜17 面で数字が動いた）。パズルの性質ではなく実装の都合を
   * 測ってしまっていたことになる。
   */
  levels: number;
}

function seenFrom(ctx: Ctx, state: Uint8Array): Uint8Array {
  const s = new Uint8Array(ctx.size);
  for (let i = 0; i < ctx.size; i++) {
    if (state[i] !== IS_CAT) continue;
    const m = ctx.masks.get(i)!;
    for (let j = 0; j < ctx.size; j++) if (m[j]) s[j] = 1;
  }
  return s;
}

/**
 * 基本推論だけを行き詰まるまで回す。state は書き換わる。
 *
 *   A 数字  ある壁の数字が k のとき、まわりの猫が k 匹揃えば残りは空。
 *           空きマスを全部使わないと k に届かないなら残りは全部猫。
 *           壁 1 つとその周囲 3x3 を見るだけで済む局所的な推論で、
 *           数字付きの壁を順に当たれば必ず見つかる。
 *   B 被覆  まだ誰にも見えていないマスを見られる候補が 1 つしかないなら、そこは猫。
 *           そのマスから 4 方向へ壁まで辿る必要があり、しかも「どの空きマスが
 *           危ないか」を自分で見つけないと始まらない。探索の起点が無いぶん重い。
 *
 * 1 段ぶんの推論を全部集めてからまとめて適用する。段の途中で状態を書き換えると
 * 「先に見た壁の結果を後の壁が使う」ことになり、走査順で結果が変わってしまう。
 */
function propagate(ctx: Ctx, state: Uint8Array): PropResult {
  let numberCells = 0;
  let coverCells = 0;
  let numberSteps = 0;
  let coverSteps = 0;
  let subsetSteps = 0;
  let levels = 0;

  const result = (contradiction: boolean): PropResult => ({
    contradiction,
    numberCells,
    coverCells,
    numberSteps,
    coverSteps,
    subsetSteps,
    levels,
  });

  for (;;) {
    // この段で導ける結論を、状態を書き換えずに全部集める
    const pending = new Map<number, number>();
    let conflict = false;
    let nSteps = 0;
    let cSteps = 0;
    let sSteps = 0;

    const propose = (cell: number, value: number): void => {
      const prev = pending.get(cell);
      // 同じ段で正反対の結論が出たら、その仮定は破綻している
      if (prev !== undefined && prev !== value) conflict = true;
      else pending.set(cell, value);
    };

    for (const w of ctx.numberedWalls) {
      const want = ctx.numbers[w];
      const cells = ctx.wallNbrs.get(w)!;
      let cats = 0;
      const unknown: number[] = [];
      for (const c of cells) {
        if (state[c] === UNKNOWN) unknown.push(c);
        else if (state[c] === IS_CAT) cats++;
      }
      if (cats > want) return result(true);
      if (cats + unknown.length < want) return result(true);
      if (unknown.length === 0) continue;

      if (cats === want) {
        for (const c of unknown) propose(c, IS_EMPTY);
        nSteps++;
      } else if (cats + unknown.length === want) {
        for (const c of unknown) propose(c, IS_CAT);
        nSteps++;
      }
    }
    if (conflict) return result(true);

    // C 集合の推論。
    //
    // 「どのマスかは分からないが、この 2 マスのどちらかに猫がいる」という情報は、
    // 別の数字に流用できる。2 つの数字の未確定集合が重なっているとき、重なりに
    // 入る猫の数の上下限が決まり、そこから差分の猫の数が絞れる。
    //
    // 包含（片方がもう片方にすっぽり入る）はこの特殊ケース。
    // 数独のポインティングペア、マインスイーパの 1-2 パターンと同じ族で、
    // 個別のマスではなく集合について考えるぶん A や B より一段上の技法になる。
    const sets: Array<{ min: number; max: number; cells: number[] }> = [];

    for (const w of ctx.numberedWalls) {
      const cells = ctx.wallNbrs.get(w)!;
      let cats = 0;
      const unknown: number[] = [];
      for (const c of cells) {
        if (state[c] === UNKNOWN) unknown.push(c);
        else if (state[c] === IS_CAT) cats++;
      }
      const need = ctx.numbers[w] - cats;
      // 全部猫・全部空は A で処理済みなので、中途半端なものだけ集める
      if (unknown.length >= 2 && need >= 1 && need < unknown.length) {
        sets.push({ min: need, max: need, cells: unknown });
      }
    }

    // B2 被覆から来る集合。「このマスを見られる候補はこれだけ」なので、
    // その中に最低 1 匹はいる。数字と違って上限は決まらない。
    const litNow = seenFrom(ctx, state);
    for (let c = 0; c < ctx.size; c++) {
      if (ctx.wall[c] || litNow[c]) continue;
      const sources: number[] = [];
      for (const [x, m] of ctx.masks) {
        if (state[x] === IS_EMPTY || !m[c]) continue;
        if (state[x] === UNKNOWN) sources.push(x);
      }
      if (sources.length >= 2 && sources.length <= 6) {
        sets.push({ min: 1, max: sources.length, cells: sources });
      }
    }

    for (const a of sets) {
      for (const b of sets) {
        if (a === b) continue;
        // b の中で、a と重なる部分と重ならない部分に分ける
        const rest: number[] = [];
        let overlap = 0;
        for (const c of b.cells) {
          if (a.cells.includes(c)) overlap++;
          else rest.push(c);
        }
        if (overlap === 0 || rest.length === 0) continue;

        // 重なりに入る猫の数の範囲。a の側から絞れる。
        const outsideA = a.cells.length - overlap;
        const overlapMin = Math.max(0, a.min - outsideA);
        const overlapMax = Math.min(a.max, overlap);

        // b は全体で b.min〜b.max 匹。差分に入るのはその残り。
        const restMax = b.max - overlapMin;
        const restMin = b.min - overlapMax;
        if (restMax < 0 || restMin > rest.length) return result(true);

        if (restMax === 0) {
          for (const c of rest) propose(c, IS_EMPTY);
          sSteps++;
        } else if (restMin === rest.length) {
          for (const c of rest) propose(c, IS_CAT);
          sSteps++;
        }
      }
    }
    if (conflict) return result(true);

    const seen = seenFrom(ctx, state);
    for (let c = 0; c < ctx.size; c++) {
      if (ctx.wall[c] || seen[c]) continue;
      let only = -1;
      let count = 0;
      for (const [x, m] of ctx.masks) {
        if (state[x] === IS_EMPTY || !m[c]) continue;
        count++;
        only = x;
        if (count > 1) break;
      }
      if (count === 0) return result(true);
      if (count === 1 && state[only] === UNKNOWN) {
        propose(only, IS_CAT);
        cSteps++;
      }
    }
    if (conflict) return result(true);

    // 実際に変わるものだけ残す
    let applied = 0;
    for (const [cell, value] of pending) {
      if (state[cell] !== UNKNOWN) continue;
      state[cell] = value;
      applied++;
    }
    if (applied === 0) return result(false);

    // 内訳は段ごとの推論回数の比で按分する。厳密な帰属は取れないが、
    // 数字と被覆のどちらが主役だったかを見るには足りる。
    if (nSteps + cSteps > 0) {
      const share = cSteps / (nSteps + cSteps);
      coverCells += Math.round(applied * share);
      numberCells += applied - Math.round(applied * share);
    }
    numberSteps += nSteps;
    coverSteps += cSteps;
    subsetSteps += sSteps;
    levels++;

    // 念のための安全弁。通常ここには達しない。
    if (levels > 200) return result(false);
  }
}

function isSolved(ctx: Ctx, state: Uint8Array): boolean {
  const numbersOk = ctx.numberedWalls.every(
    (w) => ctx.wallNbrs.get(w)!.filter((c) => state[c] === IS_CAT).length === ctx.numbers[w],
  );
  return numbersOk && allCovered(ctx.n, ctx.wall, seenFrom(ctx, state));
}

/**
 * 人が使う推論を機械的に回して、どこまで確定できるかを測る。
 *
 * まず基本推論だけで回し、詰まったら背理法に降りる。背理法は 1 マスだけ仮定して
 * 基本推論を回す形で、入れ子にはしない。二重の背理法を要求する問題は
 * 「解けない」と判定されて捨てられる。
 *
 * 背理法の深さは「仮定してから矛盾が出るまでに適用した推論の段数」で測る。
 * 当初は確定したマス数で測っていたが、それは波及の広さであって読む手数ではない。
 * 数字推論は 1 回で 3 マス確定させることもあるので、マス数で測ると
 * 「2 段しか読んでいないのに深さ 5」といった誤判定が起きていた。
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

  const numberedWalls: number[] = [];
  for (let i = 0; i < size; i++) if (wall[i] && numbers[i] >= 0) numberedWalls.push(i);
  const wallNbrs = new Map<number, number[]>();
  for (const w of numberedWalls) wallNbrs.set(w, neighbours8(n, w).filter((c) => !wall[c]));

  const wallsOfCell = new Map<number, number[]>();
  for (const w of numberedWalls) {
    for (const c of wallNbrs.get(w)!) {
      const list = wallsOfCell.get(c);
      if (list) list.push(w);
      else wallsOfCell.set(c, [w]);
    }
  }

  const ctx: Ctx = { n, size, wall, numbers, masks, numberedWalls, wallNbrs, wallsOfCell };

  const state = new Uint8Array(size);
  // 猫を置けないマスは最初から空で確定している
  for (let i = 0; i < size; i++) if (!wall[i] && !candidate[i]) state[i] = IS_EMPTY;

  let chainDepth = 0;
  let byNumber = 0;
  let byCover = 0;
  let bySubset = 0;
  const contradictions: ContradictionStep[] = [];
  let solvedBasic = false;
  let broken = false;
  let first = true;

  for (;;) {
    const r = propagate(ctx, state);
    if (r.levels > chainDepth) chainDepth = r.levels;
    byNumber += r.numberCells;
    byCover += r.coverCells;
    bySubset += r.subsetSteps;
    if (r.contradiction) {
      broken = true;
      break;
    }

    const done = isSolved(ctx, state);
    if (first) {
      solvedBasic = done;
      first = false;
    }
    if (done) break;

    // 基本推論で詰まった。1 マスだけ仮定して矛盾を探す。
    //
    // 人は「まだ 2 マスしか残っていない数字」のような、選択肢の少ないところから
    // 手をつける。盤面中を全部試して最も浅い矛盾を探すわけではない。
    // そこで、まず最も狭い分岐に絞り、その中で最も浅い矛盾を採る。
    //
    // 全体から最浅を採る作りだと、実測ではどの局面でも 1 段が見つかってしまい
    // （壁が密なので、どこに仮定しても 1 波で近くの壁が破綻する）、
    // 深さが難易度の軸として機能しなくなっていた。
    let narrowest = Number.POSITIVE_INFINITY;
    const widths = new Map<number, number>();
    for (const [x] of masks) {
      if (state[x] !== UNKNOWN) continue;
      const w = branchWidth(ctx, state, x);
      widths.set(x, w);
      if (w < narrowest) narrowest = w;
    }

    let best: {
      cell: number;
      assume: number;
      depth: number;
      coverSteps: number;
      width: number;
    } | null = null;

    for (const [x, w] of widths) {
      if (w !== narrowest) continue;
      for (const guess of [IS_CAT, IS_EMPTY]) {
        const trial = state.slice();
        trial[x] = guess;
        const probe = propagate(ctx, trial);
        if (!probe.contradiction) continue;
        if (!best || probe.levels < best.depth) {
          best = {
            cell: x,
            assume: guess,
            depth: probe.levels,
            coverSteps: probe.coverSteps,
            width: w,
          };
        }
      }
    }

    if (!best) break; // 背理法でも進まない。ここで詰み。

    state[best.cell] = best.assume === IS_CAT ? IS_EMPTY : IS_CAT;
    contradictions.push({
      branchWidth: best.width,
      depth: best.depth,
      coverSteps: best.coverSteps,
    });
  }

  const solved = !broken && isSolved(ctx, state);

  return {
    solvedBasic: solvedBasic && solved,
    solved,
    chainDepth,
    byNumber,
    byCover,
    bySubset,
    contradictions,
    maxContradictionDepth: contradictions.length
      ? Math.max(...contradictions.map((c) => c.depth))
      : 0,
    candidates: masks.size,
  };
}

/**
 * 難易度の重み。調整はここだけ触ればよい。
 *
 * 重要なのは「解法に気づくまで」が難易度で、「同じ解法の繰り返し」は作業だという点。
 * 回数に比例させると、盤面を大きくして手数を増やすだけで難易度が上がってしまい、
 * 体感と合わない。そこで技法ごとに **初出コスト** と **反復コスト** を分け、
 * 反復を大幅に安くしている。
 *
 * 1 回しか使わない面と 10 回使う面が同じ点数なのも体感と違うので、反復も
 * ゼロにはしない。
 */
export const TECHNIQUE_COST = {
  /**
   * 被覆の推論。「このマスを見られるのはここだけ」。
   * 数字と違って探索の起点が無く、自分で危ないマスを見つける必要がある。
   */
  cover: { first: 12, repeat: 1.5 },
  /**
   * 集合の推論。「どのマスかは分からないがこの中に猫がいる」を別の数字に流用する。
   * 個別のマスではなく集合について考えるので、一段上の技法。
   */
  subset: { first: 22, repeat: 2 },
} as const;

/**
 * 盤面の広さ。平方根にしているのは、広いほど難しいのは確かでも比例ではないため。
 * ここを線形にすると「大きい盤にすれば難しい」になってしまう。
 */
const BREADTH_WEIGHT = 2.5;

/** 確定の連鎖が何段続くか。長いほど手数は増えるが、難しさは頭打ちになる。 */
const CHAIN_WEIGHT = 2;

/**
 * 背理法は 1 回ごとに幅と段数から重みが決まるが、そのまま足し合わせない。
 * 2 回目以降は「同じことをもう一度やる」だけなので割り引く。
 */
const CONTRADICTION_REPEAT_DISCOUNT = 0.35;

const DEPTH_COST: Record<number, number> = { 1: 40, 2: 85, 3: 145, 4: 225 };
/**
 * 幅は加算ではなく倍率にしている。
 * 「幅が広い」と「段数が多い」は独立した負担ではなく、掛け合わさって効く。
 */
const WIDTH_MULTIPLIER: Record<number, number> = { 2: 1.0, 3: 1.5, 4: 2.1, 5: 2.8 };
const WIDE_BRANCH_MULTIPLIER = 3.6;
const COVER_IN_CONTRADICTION = 5;

/**
 * 出してよい背理法の段数の上限。これを超える問題は生成しない。
 * 暗算で追える限界という判断。
 */
export const MAX_CONTRADICTION_DEPTH = 4;

/** 技法 1 種類ぶんの点数。初出は高く、繰り返しは安く。 */
function techniqueCost(count: number, cost: { first: number; repeat: number }): number {
  if (count <= 0) return 0;
  return cost.first + cost.repeat * (count - 1);
}

export function difficultyOf(a: Analysis): number {
  // 背理法は 1 回ごとに難しさが違うので、まず個別に点数を出す
  const contradictions = a.contradictions
    .map((c) => {
      const depth = DEPTH_COST[Math.min(c.depth, MAX_CONTRADICTION_DEPTH)] ?? 70;
      const width = WIDTH_MULTIPLIER[c.branchWidth] ?? WIDE_BRANCH_MULTIPLIER;
      return depth * width + c.coverSteps * COVER_IN_CONTRADICTION;
    })
    .sort((x, y) => y - x);

  // 一番難しい 1 回を主役にし、残りは割り引く
  const contradictionScore = contradictions.reduce(
    (sum, v, i) => sum + (i === 0 ? v : v * CONTRADICTION_REPEAT_DISCOUNT),
    0,
  );

  return (
    Math.sqrt(a.candidates) * BREADTH_WEIGHT +
    a.chainDepth * CHAIN_WEIGHT +
    techniqueCost(a.byCover, TECHNIQUE_COST.cover) +
    techniqueCost(a.bySubset, TECHNIQUE_COST.subset) +
    contradictionScore
  );
}

export function difficultyBand(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score < 36) return 1;
  if (score < 50) return 2;
  if (score < 62) return 3;
  if (score < 72) return 4;
  return 5;
}



/**
 * レベルに対する目標難易度。
 *
 * 205 に漸近する。立ち上がりを緩やかにしてあるのは、レベル 15 が 55 前後に
 * 収まるようにするため。実際に遊んで「レベル15 くらいがちょうどいい」という
 * 感触が得られた点を基準にしている。
 *
 *   Lv1:15  Lv15:55  Lv30:88  Lv60:131  Lv100:167  Lv200:198
 *
 * 揺らぎを持たせて「高いほど難しい傾向はあるが必ずそうとは限らない」形にしている。
 */
export function targetDifficulty(level: number, rng: () => number): number {
  const base = 15 + 190 * (1 - Math.exp(-(level - 1) / 60));
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
function sampleKnobs(level: number, rng: () => number, easeOff = 0): Knobs {
  // easeOff は 0〜1。大きいほど「作りやすい側」に寄せる。
  // 条件に合う盤面が見つからないときに、諦めながら探すために使う。
  const n = easeOff >= 1 ? 5 : sampleSize(level, rng);
  // レベルが上がるほど壁と数字を減らせるようにする。手がかりが減るほど
  // 分岐が広がり連鎖も伸びるが、生成コストは跳ね上がる。次のレベルを裏で
  // 先に作っているので、そのぶんの時間は払える。
  const relax = Math.min(1, (level - 1) / 30) * (1 - easeOff);
  const minDensity = (n >= 8 ? 0.4 : n === 7 ? 0.36 : 0.28) - 0.06 * relax + 0.08 * easeOff;
  const minRatio = (n >= 7 ? 0.72 : 0.6) - 0.12 * relax + 0.25 * easeOff;

  // レベルが上がるほど壁を減らす側に寄せる。
  // 壁が少ないほど視線が伸びて連鎖が長くなり、被覆推論が混ざりやすくなる。
  // 一様に引くと 0.45〜0.50 ばかり当たって浅い問題しか出なかった。
  const t = Math.min(1, (level - 1) / 20);
  const skew = Math.pow(rng(), 1 + 1.6 * t);

  return {
    n,
    wallDensity: minDensity + skew * (0.5 - minDensity),
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

/**
 * つまみ 1 組から盤面を 1 つ作る。作れなければ null。
 * 使った試行回数も返す。全体の予算を回すのに要る。
 */
function tryGenerate(
  knobs: Knobs,
  rng: () => number,
  attempts: number,
): { raw: RawPuzzle | null; used: number } {
  const { n, wallDensity, numberRatio } = knobs;
  let used = 0;

  for (let attempt = 0; attempt < attempts; attempt++) {
    used++;
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

    return { raw: { n, wall, numbers, candidate, solution: cats }, used };
  }
  return { raw: null, used };
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
const KNOB_ATTEMPTS = 44;
/** 1 組のつまみで盤面を作り直す上限。 */
const BOARD_ATTEMPTS = 2200;
/**
 * 1 レベルの生成で使える盤面試行の総数。最悪の生成時間を決める値。
 * 20000 でおよそ 2 秒。次のレベルは裏で先に作っているので、
 * 実際に待たされるのは初回とレベル一覧から飛んだときだけ。
 */
const TOTAL_BOARD_ATTEMPTS = 20000;

/**
 * レベルから盤面を作る。同じレベルなら必ず同じ盤面になる。
 *
 * サイズをレベルから直接決めるのはやめ、複数の軸で作った候補に難易度の点数を
 * つけて、そのレベルの目標に一番近いものを選ぶ。おかげで高いレベルでも
 * 小さい盤面が出るし、レベルと難しさは「傾向として」しか結び付かない。
 */
interface Candidate {
  raw: RawPuzzle;
  knobs: Knobs;
  analysis: Analysis;
  score: number;
}

/**
 * つまみを引き直しながら、目標難易度に近い盤面を探す。
 * @param tolerance これ以内なら即採用する相対誤差。Infinity なら最初に見つけたものを返す
 * @param easeOff   0〜1。大きいほど作りやすい側のつまみを引く
 */
/**
 * 直前の探索の内訳。なぜその盤面が選ばれたのかを追うための診断用。
 * 候補が 44 個そろっているか、総枠を使い切っていないかをここで確認できる。
 */
export const searchStats = {
  knobDraws: 0,
  produced: 0,
  scored: 0,
  withContradiction: 0,
  budgetLeft: 0,
};

function search(
  level: number,
  rng: () => number,
  target: number,
  tolerance: number,
  easeOff: number,
): Candidate | null {
  let best: Candidate | null = null;
  let budget = TOTAL_BOARD_ATTEMPTS;
  let knobDraws = 0;
  let produced = 0;
  let scored = 0;
  let withContradiction = 0;

  for (let i = 0; i < KNOB_ATTEMPTS && budget > 0; i++) {
    knobDraws++;
    const knobs = sampleKnobs(level, rng, easeOff);
    const { raw, used } = tryGenerate(knobs, rng, Math.min(BOARD_ATTEMPTS, budget));
    budget -= used;
    if (!raw) continue;
    produced++;

    const analysis = analyse(raw.n, raw.wall, raw.numbers, raw.candidate);
    // 推測が要る問題は出さない
    if (!analysis.solved) continue;
    // 深すぎる先読みを要求する問題も出さない。解けはするが暗算では追えない。
    if (analysis.maxContradictionDepth > MAX_CONTRADICTION_DEPTH) continue;

    scored++;
    if (analysis.contradictions.length > 0) withContradiction++;

    const candidate: Candidate = { raw, knobs, analysis, score: difficultyOf(analysis) };
    const gap = Math.abs(candidate.score - target);
    if (!best || gap < Math.abs(best.score - target)) best = candidate;
    if (gap <= target * tolerance) break;
  }

  searchStats.knobDraws = knobDraws;
  searchStats.produced = produced;
  searchStats.scored = scored;
  searchStats.withContradiction = withContradiction;
  searchStats.budgetLeft = budget;
  return best;
}

/**
 * レベルから盤面を作る。同じレベルなら必ず同じ盤面になる。
 *
 * サイズをレベルから直接決めるのはやめ、複数の軸で作った候補に難易度の点数を
 * つけて、そのレベルの目標に一番近いものを選ぶ。おかげで高いレベルでも
 * 小さい盤面が出るし、レベルと難しさは「傾向として」しか結び付かない。
 *
 * 条件に合う盤面が見つからないことがあるので、段階的に諦める。
 * 無限に探し続けて画面が出ないのが最悪の結果なので、必ずどこかで打ち切る。
 *
 * @param reused 段階 4 から再入したときに立てる。二重に逃げないための歯止め。
 */
export function generateForLevel(level: number, reused = false): Puzzle {
  const rng = mulberry32(level * 7919 + 104729);
  const target = targetDifficulty(level, rng);

  // 1. 通常の探索
  let best = search(level, rng, target, CLOSE_ENOUGH, 0);
  let stage: 1 | 2 | 3 | 4 = 1;

  // 2. 目標の許容幅を広げ、つまみも作りやすい側へ寄せて再試行
  if (!best) {
    best = search(level, rng, target, 0.4, 0.5);
    stage = 2;
  }

  // 3. 難易度は問わない。とにかく成立する盤面を 1 つ
  if (!best) {
    best = search(level, rng, target, Number.POSITIVE_INFINITY, 1);
    stage = 3;
  }

  if (!best) {
    // 4. 遠く離れたレベルの盤面を作り直して使う。
    //    直前の面を使い回すと「さっきと同じ」が露骨に分かるので、100 だけ戻る。
    if (reused) throw new Error(`レベル ${level} の盤面を生成できませんでした`);
    const donor = level > 100 ? level - 100 : 1;
    const borrowed = generateForLevel(donor, true);
    return { ...borrowed, level, stage: 4 };
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
    stage,
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
