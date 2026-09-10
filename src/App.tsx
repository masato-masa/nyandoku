import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  catCount,
  createGame,
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
import { peekLevel, prefetchLevel } from './core/puzzle';
import { sfx } from './core/sfx';
import { Board, type PaintMode } from './ui/Board';
import { Cat, CAT_NORMAL_SRC } from './ui/Cat';
import { HelpIcon, HintIcon, LevelsIcon, ResetIcon, SoundIcon, UndoIcon } from './ui/icons';

const STORAGE_KEY = 'nyandoku.maxLevel';

/** 到達したレベル。レベル一覧に「1 〜 最新」を並べるために必要。 */
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

/** ?level=12 のように指定すると、その面から始められる。動作確認用。 */
function initialLevel(): number {
  const raw = new URLSearchParams(window.location.search).get('level');
  const n = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

type Sheet = 'none' | 'help' | 'levels';

/**
 * 画面を 1 度描かせてから重い処理に入るための待ち。
 *
 * requestAnimationFrame だけに頼ると、タブが裏にあるときに発火せず
 * 「準備中…」から永久に進まなくなる。必ず動く setTimeout を保険に併走させる。
 */
function afterPaint(run: () => void): void {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    run();
  };
  requestAnimationFrame(() => requestAnimationFrame(once));
  setTimeout(once, 120);
}

export default function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [maxLevel, setMaxLevel] = useState(() => Math.max(loadMaxLevel(), initialLevel()));
  const [muted, setMuted] = useState(false);
  const [sheet, setSheet] = useState<Sheet>('none');
  const crossStep = useRef(0);

  const derived = useMemo(() => (state ? derive(state) : null), [state]);

  const goToLevel = useCallback((level: number) => {
    setSheet('none');
    setMaxLevel((m) => {
      const next = Math.max(m, level);
      if (next !== m) saveMaxLevel(next);
      return next;
    });

    const start = (game: GameState) => {
      setState(game);
      setLoading(false);
      // 次のレベルを裏で先に作っておく。「次のレベルへ」を押した瞬間の待ちが消える。
      prefetchLevel(level + 1);
    };

    // すでに作ってあるなら待たせない
    if (peekLevel(level)) {
      start(createGame(level));
      return;
    }

    // 生成は同期処理なので、先に 1 フレーム描かせないと
    // ローディングが一度も表示されないまま固まる。
    setLoading(true);
    afterPaint(() => start(createGame(level)));
  }, []);

  // 最初の 1 面。ここも生成に時間がかかるのでローディングを挟む。
  useEffect(() => {
    goToLevel(initialLevel());
  }, [goToLevel]);

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

  const toggleSound = useCallback(() => {
    setMuted((m) => {
      sfx.setMuted(!m);
      if (m) sfx.cross(0);
      return !m;
    });
  }, []);

  if (loading || !state || !derived) return <LoadingScreen />;

  // 進み具合は置いた猫の数。正解の匹数が見えるのでヒントにはなる。
  const placed = catCount(state.marks);
  const needed = state.puzzle.solution.length;

  return (
    <div className="app">
      <header className="header">
        <span className="progress">
          <img className="progress-cat" src={CAT_NORMAL_SRC} alt="" draggable={false} />
          <span className="progress-count">
            <span className="progress-now">{placed}</span>
            <span className="progress-slash">/</span>
            <span className="progress-total">{needed}</span>
          </span>
        </span>

        <h1 className="title">レベル {state.level}</h1>

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
            onClick={() => setSheet('levels')}
            aria-label="レベルを選ぶ"
          >
            <LevelsIcon />
          </button>
          <button
            className="icon-btn"
            type="button"
            data-off={muted}
            onClick={toggleSound}
            aria-label={muted ? '音を出す' : '音を消す'}
          >
            <SoundIcon muted={muted} />
          </button>
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
            <UndoIcon />
          </button>
          <button className="tool" type="button" onClick={doReset} aria-label="やり直す">
            <ResetIcon />
          </button>
          <button
            className="tool"
            type="button"
            onClick={doHint}
            disabled={state.status !== 'playing'}
            aria-label="ヒント"
          >
            <HintIcon />
          </button>
        </footer>
      </main>

      <AnimatePresence>
        {sheet === 'help' && <HelpSheet onClose={() => setSheet('none')} />}
        {sheet === 'levels' && (
          <LevelSheet
            current={state.level}
            max={maxLevel}
            onPick={goToLevel}
            onClose={() => setSheet('none')}
          />
        )}

        {state.status === 'won' && sheet === 'none' && (
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
                className="banner-btn"
                type="button"
                onClick={() => goToLevel(state.level + 1)}
              >
                次のレベルへ
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

function Overlay({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <motion.div
      className="banner"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, pointerEvents: 'auto' }}
      // 閉じるアニメーションの間もオーバーレイが残っているので、
      // ここで当たり判定を切らないと、その 0.2 秒に押したボタンが反応しない。
      exit={{ opacity: 0, pointerEvents: 'none' }}
      transition={{ duration: 0.2 }}
      onPointerDown={(e) => {
        if (onClose && e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </motion.div>
  );
}

const HELP_RULES = [
  '数字は、その壁のまわり 8 マスにいる猫の数です。',
  '猫は、数字が書かれた壁のとなりにだけ置けます。',
  '猫は、自分のまわり 8 マスと、上下左右をまっすぐ（壁にぶつかるまで）見わたせます。',
  '壁以外のマスをすべて猫の視界に入れるとクリアです。',
];

const HELP_CONTROLS = [
  'タップするたび ×（置かない印）→ 猫 → 空 と切りかわります。',
  'なぞると × をまとめて付けられます。× から始めると消しゴムになります。',
];

function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <Overlay key="help" onClose={onClose}>
      <motion.div
        className="sheet"
        initial={{ scale: 0.9, y: 18 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      >
        <h2 className="sheet-title">遊びかた</h2>

        <ul className="help-list">
          {HELP_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>

        <h3 className="sheet-subtitle">操作</h3>
        <ul className="help-list">
          {HELP_CONTROLS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>

        <button className="banner-btn" type="button" onClick={onClose}>
          とじる
        </button>
      </motion.div>
    </Overlay>
  );
}

interface LevelSheetProps {
  current: number;
  max: number;
  onPick: (level: number) => void;
  onClose: () => void;
}

function LevelSheet({ current, max, onPick, onClose }: LevelSheetProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // 今いるレベルが見える位置で開く。一覧が伸びてくると、開いた瞬間に
  // 自分がどこにいるか分からなくなるため。
  useEffect(() => {
    listRef.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: 'center' });
  }, []);

  // 下から上に 1 → 最新 と並べたいので、描画は大きい番号から。
  const levels = Array.from({ length: max }, (_, i) => max - i);

  return (
    <Overlay key="levels" onClose={onClose}>
      <motion.div
        className="sheet sheet-levels"
        initial={{ scale: 0.9, y: 18 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      >
        <h2 className="sheet-title">レベル</h2>

        <div className="level-list" ref={listRef}>
          {levels.map((lv) => (
            <button
              key={lv}
              type="button"
              className="level-row"
              data-current={lv === current}
              data-cleared={lv < max}
              onClick={() => onPick(lv)}
            >
              <span className="level-no">{lv}</span>
              {lv < max && <img className="level-cat" src={CAT_NORMAL_SRC} alt="" />}
            </button>
          ))}
        </div>

        <button className="banner-btn" type="button" onClick={onClose}>
          とじる
        </button>
      </motion.div>
    </Overlay>
  );
}
