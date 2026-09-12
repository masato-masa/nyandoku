import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  catCount,
  createGameFrom,
  derive,
  hint,
  mergeLastMoves,
  paint,
  reset,
  tap,
  undo,
  type GameState,
  type TapResult,
} from './core/game';
import { difficultyBand } from './core/puzzle';
import { peekLevel, prefetchLevel, requestLevel } from './core/puzzleClient';
import { sfx } from './core/sfx';
import { Board, type PaintMode } from './ui/Board';
import { Cat, CAT_NORMAL_SRC } from './ui/Cat';
import { Confetti } from './ui/Confetti';
import { Home } from './ui/Home';
import { DevSheet, HelpSheet, LevelSheet, Overlay, SettingsSheet } from './ui/Sheets';
import {
  BackIcon,
  GearIcon,
  HelpIcon,
  HintToolIcon,
  PawIcon,
  ResetToolIcon,
  UndoToolIcon,
} from './ui/icons';

const STORAGE_KEY = 'nyandoku.maxLevel';

/**
 * クリア済みの次のレベル。「つづきから」の行き先であり、
 * レベル一覧に「1 〜 ここまで」を並べる上限でもある。
 *
 * 上がるのはクリアしたときだけ。一覧から先の面へ飛んだだけでは上がらない
 * （遊んでいない面をクリア済みとして記録してしまうため）。
 */
function loadMaxLevel(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const v = raw ? Number.parseInt(raw, 10) : 1;
    return Number.isFinite(v) && v >= 1 ? v : 1;
  } catch {
    // プライベートモードなどで localStorage が使えないことがある。
    // 遊べなくなる話ではないので黙って既定値に戻す。
    return 1;
  }
}

function saveMaxLevel(v: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(v));
  } catch {
    /* 保存できなくても続行する */
  }
}

/** ?level=12 のように指定すると、ホームを飛ばしてその面から始まる。動作確認用。 */
function levelFromQuery(): number | null {
  const raw = new URLSearchParams(window.location.search).get('level');
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * クリアしてからポップアップを出すまでの時間。この間は盤面の演出を見せる。
 * Board.tsx と Confetti.tsx の遅れはこの時刻表に合わせてある。
 *
 *   0.00s  クリア音 / 猫が上から順に跳ねる
 *   0.20s  猫のマスを起点に光が広がる
 *   0.95s  猫がもう一周跳ねる
 *   1.00s  紙吹雪が降り始める
 *   1.40s  盤面全体が弾む
 *   2.40s  ここ（クリアポップアップ）
 */
const WIN_CELEBRATION_MS = 2400;

/** 動きを減らす設定なら演出を待たせない。見せるものがほとんど無いため。 */
function celebrationMs(): number {
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 400;
  } catch {
    /* 判定できなければ通常どおり */
  }
  return WIN_CELEBRATION_MS;
}

type Screen = 'home' | 'play';
type Sheet = 'none' | 'help' | 'levels' | 'settings' | 'dev';

export default function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [screen, setScreen] = useState<Screen>(() => (levelFromQuery() ? 'play' : 'home'));
  const [loading, setLoading] = useState(false);
  const [maxLevel, setMaxLevel] = useState(() => Math.max(loadMaxLevel(), levelFromQuery() ?? 1));
  const [sheet, setSheet] = useState<Sheet>('none');
  const [muted, setMutedState] = useState(() => sfx.isMuted());
  /** クリア直後、盤面の演出を見せている間だけ true。この間はポップアップを出さない。 */
  const [celebrating, setCelebrating] = useState(false);
  const crossStep = useRef(0);
  const celebrateTimer = useRef(0);

  const derived = useMemo(() => (state ? derive(state) : null), [state]);

  const goToLevel = useCallback((level: number) => {
    setSheet('none');
    setScreen('play');
    // 一覧にいま遊んでいる面が並ぶよう画面上の上限は上げるが、保存はしない。
    // 記録が増えるのはクリアしたときだけ（下の useEffect）。
    setMaxLevel((m) => Math.max(m, level));

    const start = (game: GameState) => {
      setState(game);
      setLoading(false);
      // 次のレベルを裏で先に作っておく。1 面解くのに数分かかるので、
      // その間に作り終わっていれば「次のレベルへ」の待ちは消える。
      prefetchLevel(level + 1);
    };

    // すでに作ってあるなら待たせない
    const ready = peekLevel(level);
    if (ready) {
      start(createGameFrom(ready));
      return;
    }

    // 生成は別スレッドで走るので、待っている間も画面は動く
    setLoading(true);
    void requestLevel(level).then((puzzle) => start(createGameFrom(puzzle)));
  }, []);

  // ?level= が付いていれば、その面から直接始める。
  useEffect(() => {
    const q = levelFromQuery();
    if (q) goToLevel(q);
  }, [goToLevel]);

  // クリアしていない間は必ず閉じておく（やり直し・別レベルへ移動・ホームへ戻る）。
  useEffect(() => {
    if (state?.status !== 'won') {
      window.clearTimeout(celebrateTimer.current);
      setCelebrating(false);
    }
  }, [state?.status, state?.level]);

  // クリアした瞬間に記録する。ここを「次のレベルへ」を押したときにすると、
  // クリア画面のままブラウザを閉じたぶんが丸ごと消える。
  useEffect(() => {
    if (!state || state.status !== 'won') return;
    const next = state.level + 1;
    if (next <= maxLevel) return;
    saveMaxLevel(next);
    setMaxLevel(next);
  }, [state, maxLevel]);

  // ホームを見ている間に「つづきから」の面を作っておく。ここで先に作れていれば、
  // ボタンを押した瞬間に盤面が出る（起動直後のローディングが消える）。
  useEffect(() => {
    if (screen === 'home') prefetchLevel(maxLevel);
  }, [screen, maxLevel]);

  /** 状態の更新と、その手に応じた音・触覚をまとめて扱う唯一の入り口。 */
  const apply = useCallback((result: TapResult) => {
    setState(result.state);

    switch (result.effect) {
      case 'cat':
        sfx.cat(Math.max(0, catCount(result.state.marks) - 1));
        break;
      case 'cross':
        sfx.cross(crossStep.current++);
        break;
      case 'erase':
        sfx.erase();
        break;
      case 'reject':
        sfx.conflict();
        break;
      case 'win':
        window.setTimeout(() => sfx.win(), 140);
        // 盤面の演出を見せている間はポップアップを出さない。
        setCelebrating(true);
        window.clearTimeout(celebrateTimer.current);
        celebrateTimer.current = window.setTimeout(() => setCelebrating(false), celebrationMs());
        break;
      default:
        break;
    }
  }, []);

  const handleTap = useCallback(
    (idx: number) => {
      if (!state) return;
      sfx.unlock();
      crossStep.current = 0;
      apply(tap(state, idx));
    },
    [apply, state],
  );

  // ドラッグ中は 1 フレームに複数マス塗られるので、React の再レンダを待たずに
  // 最新の状態を自分で持ち回す。ここを state 経由にすると塗り残しが出る。
  const live = useRef<GameState | null>(state);
  live.current = state;

  const handlePaint = useCallback(
    (idx: number, mode: PaintMode): boolean => {
      sfx.unlock();
      const before = live.current;
      if (!before) return false;
      const result = paint(before, idx, mode);
      if (result.state === before) return false;
      live.current = result.state;
      apply(result);
      return true;
    },
    [apply],
  );

  const handlePaintEnd = useCallback((moves: number) => {
    setState((s) => (s ? mergeLastMoves(s, moves) : s));
  }, []);

  const doUndo = useCallback(() => {
    setState((s) => {
      if (!s || s.history.length === 0) return s;
      sfx.undo();
      return undo(s);
    });
  }, []);

  const doReset = useCallback(() => {
    sfx.erase();
    setState((s) => (s ? reset(s) : s));
  }, []);

  const doHint = useCallback(() => {
    if (state) apply(hint(state));
  }, [apply, state]);

  const goHome = useCallback(() => {
    setSheet('none');
    setScreen('home');
  }, []);

  const clearProgress = useCallback(() => {
    if (!window.confirm('きろくを ぜんぶ けしますか？')) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 消せなくても画面上は 1 に戻す */
    }
    setMaxLevel(1);
    setState(null);
    setSheet('none');
    setScreen('home');
  }, []);

  const toggleMute = useCallback(() => {
    setMutedState((m) => {
      const next = !m;
      sfx.setMuted(next);
      // 音を戻した合図として 1 音鳴らす。無音のまま戻ると効いたか分からない。
      if (!next) {
        sfx.unlock();
        sfx.cat(0);
      }
      return next;
    });
  }, []);

  /**
   * ホームとプレイのどちらからも同じ形で出すシート。
   *
   * AnimatePresence は子を React.Children で数えるので、ここを Fragment で
   * まとめて渡すと中身が見えず、シートが一切出なくなる。配列で返して
   * それぞれに key を持たせる。
   */
  const commonSheets = [
    sheet === 'help' && <HelpSheet key="help" onClose={() => setSheet('none')} />,
    sheet === 'settings' && (
      <SettingsSheet
        key="settings"
        muted={muted}
        onToggleMute={toggleMute}
        onClose={() => setSheet('none')}
      />
    ),
  ];

  if (screen === 'home') {
    return (
      <div className="app app-home">
        <Home
          maxLevel={maxLevel}
          onResume={() => goToLevel(maxLevel)}
          onOpenLevels={() => setSheet('levels')}
          onOpenSettings={() => setSheet('settings')}
          onOpenDev={() => setSheet('dev')}
        />

        <AnimatePresence>
          {commonSheets}
          {sheet === 'levels' && (
            <LevelSheet max={maxLevel} onPick={goToLevel} onClose={() => setSheet('none')} />
          )}
          {sheet === 'dev' && (
            <DevSheet
              maxLevel={maxLevel}
              onJump={goToLevel}
              onClearProgress={clearProgress}
              onClose={() => setSheet('none')}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (loading || !state || !derived) return <LoadingScreen />;

  // 進み具合は置いた猫の数。正解の匹数が見えるのでヒントにはなる。
  const placed = catCount(state.marks);
  const needed = state.puzzle.solution.length;
  const band = difficultyBand(state.puzzle.difficulty);

  return (
    <div className="app">
      {/* 行 1 はナビゲーションだけ。カウントと難易度は必ず行 2 に置く。 */}
      <header className="header">
        <div className="header-row">
          <div className="header-left">
            <button className="icon-btn" type="button" onClick={goHome} aria-label="ホームへ戻る">
              <BackIcon />
            </button>
          </div>

          <h1 className="title">レベル {state.level}</h1>

          {/* 並びは ? が左、設定が右。4 つのゲームで同じにしてある。 */}
          <div className="header-actions">
            <button
              className="icon-btn"
              type="button"
              onClick={() => setSheet('help')}
              aria-label="遊びかた"
            >
              <HelpIcon />
            </button>
            <button
              className="icon-btn"
              type="button"
              onClick={() => setSheet('settings')}
              aria-label="設定"
            >
              <GearIcon />
            </button>
          </div>
        </div>

        <div className="status-bar">
          <span className="stat">
            <img className="stat-cat" src={CAT_NORMAL_SRC} alt="" draggable={false} />
            <span className="stat-num stat-now">{placed}</span>
            <span className="stat-slash">/</span>
            <span className="stat-num stat-total">{needed}</span>
          </span>

          <span className="stat" aria-label={`難易度 ${band} / 5`}>
            <span className="stat-label">難易度</span>
            <span className="difficulty-paws">
              {[1, 2, 3, 4, 5].map((i) => (
                <PawIcon key={i} filled={i <= band} />
              ))}
            </span>
          </span>
        </div>
      </header>

      <main className="play">
        <Board
          state={state}
          derived={derived}
          onTap={handleTap}
          onPaint={handlePaint}
          onPaintEnd={handlePaintEnd}
        />

        <footer className="footer">
          <button
            className="tool"
            type="button"
            onClick={doUndo}
            disabled={state.history.length === 0 || state.status !== 'playing'}
            aria-label="ひとつ戻す"
          >
            <UndoToolIcon />
          </button>
          <button className="tool" type="button" onClick={doReset} aria-label="やり直す">
            <ResetToolIcon />
          </button>
          <button
            className="tool"
            type="button"
            onClick={doHint}
            disabled={state.status !== 'playing'}
            aria-label="ヒント"
          >
            <HintToolIcon />
          </button>
        </footer>
      </main>

      {state.status === 'won' && <Confetti />}

      <AnimatePresence>
        {commonSheets}
        {sheet === 'levels' && (
          <LevelSheet
            current={state.level}
            max={maxLevel}
            onPick={goToLevel}
            onClose={() => setSheet('none')}
          />
        )}

        {state.status === 'won' && !celebrating && sheet === 'none' && (
          <Overlay key="won">
            <motion.div
              className="banner-card"
              initial={{ scale: 0.85, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            >
              <motion.div
                className="banner-cat"
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.4 }}
              >
                <Cat mood="happy" className="banner-cat-img" />
              </motion.div>

              <h2>クリア！</h2>
              <p>
                レベル {state.level} 突破
                {state.hintsUsed > 0 ? ` · ヒント ${state.hintsUsed} 回` : ''}
              </p>
              <button
                className="sheet-btn"
                type="button"
                onClick={() => goToLevel(state.level + 1)}
              >
                次のレベルへ
              </button>
              <button className="sheet-link" type="button" onClick={goHome}>
                ホームへ
              </button>
            </motion.div>
          </Overlay>
        )}
      </AnimatePresence>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="app loading">
      <motion.div
        className="loading-cat"
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 0.85, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Cat mood="idle" className="loading-cat-img" />
      </motion.div>
      <p className="loading-text">準備中…</p>
    </div>
  );
}
