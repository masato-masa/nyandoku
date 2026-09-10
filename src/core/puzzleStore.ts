// 作った盤面を localStorage に残しておく。
//
// 生成は決定的なので作り直せば同じ盤面が出るが、高レベルは 1 面に数秒かかる。
// アプリを開き直したときやレベル一覧から飛んだときにその数秒を待たせたくないので、
// 一度作ったものは残しておく。1 面あたり 100 バイト程度なので容量は問題にならない。

import { analyse, type Knobs, type Puzzle } from './puzzle';

const KEY = 'nyandoku.puzzles.v1';

/**
 * 残す面数の上限。低いレベルは数ミリ秒で作り直せるので、
 * あふれたら低い方から捨てる。時間がかかるのは高いレベルだけ。
 */
const CAPACITY = 600;

/** 盤面から復元に必要な最小限だけを取り出す。候補マスと推論結果は再計算できる。 */
function encode(p: Puzzle): string {
  const wall = Array.from(p.wall).join('');
  const numbers = Array.from(p.numbers)
    .map((v) => (v < 0 ? '.' : String(v)))
    .join('');
  const head = [
    p.n,
    Math.round(p.difficulty * 100) / 100,
    p.stage,
    p.knobs.wallDensity.toFixed(3),
    p.knobs.numberRatio.toFixed(3),
  ].join(',');
  return [head, wall, numbers, p.solution.join(',')].join('|');
}

function decode(level: number, text: string): Puzzle | null {
  const [head, wallText, numberText, solutionText] = text.split('|');
  if (!head || !wallText || !numberText) return null;

  const [nText, difficultyText, stageText, densityText, ratioText] = head.split(',');
  const n = Number(nText);
  const difficulty = Number(difficultyText);
  const stage = Number(stageText);
  if (!Number.isInteger(n) || n < 3 || !Number.isFinite(difficulty)) return null;
  if (wallText.length !== n * n || numberText.length !== n * n) return null;
  if (stage !== 1 && stage !== 2 && stage !== 3 && stage !== 4) return null;

  const wall = new Uint8Array(n * n);
  const numbers = new Int8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    wall[i] = wallText[i] === '1' ? 1 : 0;
    numbers[i] = numberText[i] === '.' ? -1 : Number(numberText[i]);
    if (Number.isNaN(numbers[i])) return null;
  }

  const solution = solutionText ? solutionText.split(',').map(Number) : [];
  if (solution.some((c) => !Number.isInteger(c) || c < 0 || c >= n * n)) return null;

  // 猫を置けるマスは壁と数字から決まるので、保存せずここで作り直す。
  const candidate = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    if (wall[i]) continue;
    const r = Math.floor(i / n);
    const c = i % n;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        const j = rr * n + cc;
        if (wall[j] && numbers[j] >= 0) candidate[i] = 1;
      }
    }
  }

  const knobs: Knobs = { n, wallDensity: Number(densityText), numberRatio: Number(ratioText) };

  return {
    n,
    level,
    wall,
    numbers,
    candidate,
    solution,
    knobs,
    difficulty,
    // 推論の内訳は探索と違って 1 盤面ぶんなので、読み込み時に測り直しても軽い。
    analysis: analyse(n, wall, numbers, candidate),
    stage,
  };
}

function readAll(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    // 壊れていても遊べなくなる理由はない。作り直せばよい。
    return {};
  }
}

/** 保存してある盤面を返す。無ければ null。 */
export function loadPuzzle(level: number): Puzzle | null {
  const text = readAll()[String(level)];
  if (typeof text !== 'string') return null;
  try {
    return decode(level, text);
  } catch {
    return null;
  }
}

/** 盤面を保存する。容量があふれたら低いレベルから捨てる。 */
export function savePuzzle(puzzle: Puzzle): void {
  try {
    const all = readAll();
    all[String(puzzle.level)] = encode(puzzle);

    const levels = Object.keys(all)
      .map(Number)
      .filter(Number.isInteger)
      .sort((a, b) => a - b);
    for (let i = 0; i < levels.length - CAPACITY; i++) delete all[String(levels[i])];

    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // 保存できなくても生成し直せば遊べる。
  }
}
