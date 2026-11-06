// あそびの記録。端末の localStorage にだけ残し、外へは送らない。
//
// 目的は「面白さ」を数字で見ること。観点は Vault の Knowledge/game-fun.md。
//   - 面ごとの手数・戻す・やり直し・ヒント・弾かれた回数・かかった時間（活動時間）
//   - 解けずに離れた面（離脱の山を見つける）
//   - クリア後の 3 問の感想（熟達・続けたい気持ち・難しさ）。PXI の
//     Mastery / Curiosity / Challenge を 3 問に縮めたもの
//
// 記録はあふれたら古い順に捨てる。壊れていたら黙って捨てる（遊びを止めない）。

const KEY = 'nyandoku.playlog.v1';
const MAX_ATTEMPTS = 500;
const MAX_SURVEYS = 200;
/** 無操作がこれより長いぶんは「考えていた」とは数えない（放置と区別できないため）。 */
const IDLE_CAP_MS = 120_000;

export type EventKind = 'move' | 'undo' | 'reset' | 'hint' | 'reject';

export interface Attempt {
  level: number;
  difficulty: number;
  /** 開始時刻（ミリ秒、エポック） */
  at: number;
  outcome: 'won' | 'left';
  moves: number;
  undos: number;
  resets: number;
  hints: number;
  rejects: number;
  /** 活動時間（無操作の長い空白は切り詰め） */
  activeMs: number;
  /** 最初の 1 手までの時間（迷いの長さ） */
  firstMoveMs: number | null;
}

export interface Survey {
  level: number;
  difficulty: number;
  at: number;
  /** 1〜5。5 ほど「じぶんの力でとけた感じ」 */
  mastery: number | null;
  /** 1〜5。5 ほど「つぎも やりたい」 */
  curiosity: number | null;
  /** 1〜5。3 がちょうどよい、1 かんたんすぎ、5 むずかしすぎ */
  challenge: number | null;
}

interface Store {
  attempts: Attempt[];
  surveys: Survey[];
  /** クリアの通算。感想を聞くタイミングに使う。 */
  clears: number;
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { attempts: [], surveys: [], clears: 0 };
    const v = JSON.parse(raw) as Partial<Store>;
    return {
      attempts: Array.isArray(v.attempts) ? v.attempts : [],
      surveys: Array.isArray(v.surveys) ? v.surveys : [],
      clears: typeof v.clears === 'number' ? v.clears : 0,
    };
  } catch {
    return { attempts: [], surveys: [], clears: 0 };
  }
}

function save(s: Store): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        attempts: s.attempts.slice(-MAX_ATTEMPTS),
        surveys: s.surveys.slice(-MAX_SURVEYS),
        clears: s.clears,
      }),
    );
  } catch {
    /* 容量や設定で書けなくても遊びは続ける */
  }
}

// ---- いま遊んでいる 1 回ぶん（メモリだけ。閉じたら outcome=left で残す） ----

interface Live {
  level: number;
  difficulty: number;
  at: number;
  last: number;
  moves: number;
  undos: number;
  resets: number;
  hints: number;
  rejects: number;
  activeMs: number;
  firstMoveMs: number | null;
}

let live: Live | null = null;

export function startAttempt(level: number, difficulty: number): void {
  // 前の面が終わっていなければ「離れた」として残す
  endAttempt('left');
  const now = Date.now();
  live = {
    level,
    difficulty,
    at: now,
    last: now,
    moves: 0,
    undos: 0,
    resets: 0,
    hints: 0,
    rejects: 0,
    activeMs: 0,
    firstMoveMs: null,
  };
}

export function recordEvent(kind: EventKind): void {
  if (!live) return;
  const now = Date.now();
  live.activeMs += Math.min(now - live.last, IDLE_CAP_MS);
  live.last = now;
  switch (kind) {
    case 'move':
      live.moves++;
      if (live.firstMoveMs === null) live.firstMoveMs = Math.min(now - live.at, IDLE_CAP_MS);
      break;
    case 'undo':
      live.undos++;
      break;
    case 'reset':
      live.resets++;
      break;
    case 'hint':
      live.hints++;
      break;
    case 'reject':
      live.rejects++;
      break;
  }
}

/** 面が終わった（クリア or 離れた）。手が 1 つも無いまま離れた面は記録しない。 */
export function endAttempt(outcome: 'won' | 'left'): void {
  if (!live) return;
  const l = live;
  live = null;
  const now = Date.now();
  const activeMs = l.activeMs + Math.min(now - l.last, outcome === 'won' ? 0 : IDLE_CAP_MS);
  if (outcome === 'left' && l.moves === 0) return;
  const s = load();
  s.attempts.push({
    level: l.level,
    difficulty: Math.round(l.difficulty),
    at: l.at,
    outcome,
    moves: l.moves,
    undos: l.undos,
    resets: l.resets,
    hints: l.hints,
    rejects: l.rejects,
    activeMs,
    firstMoveMs: l.firstMoveMs,
  });
  if (outcome === 'won') s.clears++;
  save(s);
}

/**
 * クリアの直後に感想を聞くか。
 * 2026-11-07: ユーザーの意向（小手先の追加要素は要らない）で、プレイヤー向けの感想は出さない。
 * 記録とレポート（開発者メニュー）だけを残し、感想の画面は必要になったら true を返すよう戻す。
 */
export function shouldAskSurvey(): boolean {
  return false;
}

export function addSurvey(v: Survey): void {
  const s = load();
  s.surveys.push(v);
  save(s);
}

export function clearPlayLog(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 無視 */
  }
}

// ---- 集計 ----

const median = (a: number[]): number | null => {
  if (a.length === 0) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a: number[]): number | null =>
  a.length === 0 ? null : a.reduce((x, y) => x + y, 0) / a.length;

export interface Report {
  attempts: number;
  wins: number;
  lefts: number;
  /** 解けずに離れた割合 */
  leaveRate: number | null;
  medianActiveSec: number | null;
  medianFirstMoveSec: number | null;
  /** 1 面あたりの中央値 */
  medianUndos: number | null;
  medianRejects: number | null;
  hintRate: number | null;
  resetRate: number | null;
  /** 難易度帯（1〜5）ごとの成績。「帯と離脱・時間・ヒント」の関係を見る */
  byBand: Array<{
    band: number;
    n: number;
    leaveRate: number;
    medianSec: number | null;
    hintRate: number;
  }>;
  /** 離脱が多かった面（2 回以上遊んで離れた率が高い順） */
  worstLevels: Array<{ level: number; tries: number; lefts: number }>;
  surveys: number;
  avgMastery: number | null;
  avgCuriosity: number | null;
  avgChallenge: number | null;
  /** 感想の「難しさ」のうちちょうどよい（3）の割合 */
  challengeFit: number | null;
}

function band(score: number): number {
  if (score < 50) return 1;
  if (score < 75) return 2;
  if (score < 100) return 3;
  if (score < 120) return 4;
  return 5;
}

export function buildReport(): Report {
  const { attempts, surveys } = load();
  const wins = attempts.filter((a) => a.outcome === 'won');
  const lefts = attempts.filter((a) => a.outcome === 'left');
  const n = attempts.length;

  const byBand: Report['byBand'] = [];
  for (let b = 1; b <= 5; b++) {
    const xs = attempts.filter((a) => band(a.difficulty) === b);
    if (xs.length === 0) continue;
    byBand.push({
      band: b,
      n: xs.length,
      leaveRate: xs.filter((a) => a.outcome === 'left').length / xs.length,
      medianSec: (() => {
        const m = median(xs.map((a) => a.activeMs));
        return m === null ? null : Math.round(m / 1000);
      })(),
      hintRate: xs.filter((a) => a.hints > 0).length / xs.length,
    });
  }

  const perLevel = new Map<number, { tries: number; lefts: number }>();
  for (const a of attempts) {
    const e = perLevel.get(a.level) ?? { tries: 0, lefts: 0 };
    e.tries++;
    if (a.outcome === 'left') e.lefts++;
    perLevel.set(a.level, e);
  }
  const worstLevels = [...perLevel.entries()]
    .filter(([, v]) => v.lefts > 0)
    .map(([level, v]) => ({ level, tries: v.tries, lefts: v.lefts }))
    .sort((x, y) => y.lefts / y.tries - x.lefts / x.tries || y.lefts - x.lefts)
    .slice(0, 5);

  const sec = (v: number | null) => (v === null ? null : Math.round(v / 100) / 10);
  const pick = (f: (s: Survey) => number | null) =>
    surveys.map(f).filter((v): v is number => v !== null);
  const ch = pick((s) => s.challenge);

  return {
    attempts: n,
    wins: wins.length,
    lefts: lefts.length,
    leaveRate: n === 0 ? null : lefts.length / n,
    medianActiveSec: sec(median(wins.map((a) => a.activeMs))),
    medianFirstMoveSec: sec(
      median(attempts.map((a) => a.firstMoveMs).filter((v): v is number => v !== null)),
    ),
    medianUndos: median(attempts.map((a) => a.undos)),
    medianRejects: median(attempts.map((a) => a.rejects)),
    hintRate: n === 0 ? null : attempts.filter((a) => a.hints > 0).length / n,
    resetRate: n === 0 ? null : attempts.filter((a) => a.resets > 0).length / n,
    byBand,
    worstLevels,
    surveys: surveys.length,
    avgMastery: mean(pick((s) => s.mastery)),
    avgCuriosity: mean(pick((s) => s.curiosity)),
    avgChallenge: mean(ch),
    challengeFit: ch.length === 0 ? null : ch.filter((v) => v === 3).length / ch.length,
  };
}

/** 書き出し用（開発者メニューから複製できる）。 */
export function exportPlayLog(): string {
  const s = load();
  return JSON.stringify({ version: 1, ...s, report: buildReport() }, null, 2);
}
