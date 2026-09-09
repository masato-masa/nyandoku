import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  MAX_HEARTS,
  catsPlaced,
  createGame,
  hint,
  mergeLastMoves,
  paint,
  reset,
  sizeForLevel,
  tap,
  undo,
  type GameState,
  type TapResult,
} from './core/game';
import { sfx } from './core/sfx';
import { Board, type PaintMode } from './ui/Board';
import {
  CatFace,
  HelpIcon,
  Heart,
  HintIcon,
  PawIcon,
  ResetIcon,
  SoundIcon,
  UndoIcon,
} from './ui/icons';

const RULES = [
  '各カラー領域に猫は 1 匹',
  '各行・各列に猫は 1 匹',
  '猫どうしは斜めも隣接できない',
];

/** ?level=12 のように指定すると、その面から始められる。動作確認用。 */
function initialLevel(): number {
  const raw = new URLSearchParams(window.location.search).get('level');
  const n = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export default function App() {
  const [state, setState] = useState<GameState>(() => createGame(initialLevel()));
  const [muted, setMuted] = useState(false);
  const crossStep = useRef(0);

  /** 状態の更新と、その手に応じた音・触覚をまとめて扱う唯一の入り口。 */
  const apply = useCallback((result: TapResult) => {
    setState(result.state);

    switch (result.effect) {
      case 'cat':
        sfx.cat(catsPlaced(result.state.marks) - 1);
        break;
      case 'cross':
        sfx.cross(crossStep.current++);
        break;
      case 'erase':
        sfx.erase();
        break;
      case 'conflict':
        sfx.conflict();
        break;
      case 'win':
        sfx.cat(result.state.puzzle.n - 1);
        window.setTimeout(() => sfx.win(), 180);
        break;
      case 'lose':
        sfx.lose();
        break;
      default:
        break;
    }
  }, []);

  const handleTap = useCallback(
    (idx: number) => {
      sfx.unlock();
      crossStep.current = 0;
      apply(tap(state, idx));
    },
    [apply, state],
  );

  // ドラッグ中は 1 フレームに複数マス塗られるので、React の再レンダを待たずに
  // 最新の状態を自分で持ち回す。ここを state 経由にすると塗り残しが出る。
  const live = useRef(state);
  live.current = state;

  const handlePaint = useCallback(
    (idx: number, mode: PaintMode): boolean => {
      sfx.unlock();
      const before = live.current;
      const result = paint(before, idx, mode);
      if (result.state === before) return false;
      live.current = result.state;
      apply(result);
      return true;
    },
    [apply],
  );

  const handlePaintEnd = useCallback((moves: number) => {
    setState((s) => mergeLastMoves(s, moves));
  }, []);

  const doUndo = useCallback(() => {
    setState((s) => {
      if (s.history.length === 0) return s;
      sfx.undo();
      return undo(s);
    });
  }, []);

  const doReset = useCallback(() => {
    sfx.erase();
    setState((s) => reset(s));
  }, []);

  const doHint = useCallback(() => {
    apply(hint(state));
  }, [apply, state]);

  const nextLevel = useCallback(() => {
    setState((s) => createGame(s.level + 1));
  }, []);

  const retry = useCallback(() => {
    setState((s) => reset(s));
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      sfx.setMuted(!m);
      if (m) sfx.cross(0);
      return !m;
    });
  }, []);

  const placed = catsPlaced(state.marks);
  const size = sizeForLevel(state.level);

  return (
    <div className="app">
      <header className="header">
        <span className="progress">
          <PawIcon />
          {placed} / {size}
        </span>
        <h1 className="title">レベル {state.level}</h1>
        <div className="header-actions">
          <button className="icon-btn" onClick={toggleMute} data-off={muted} aria-label="音の切り替え">
            <SoundIcon muted={muted} />
          </button>
          <button className="icon-btn" aria-label="遊び方">
            <HelpIcon />
          </button>
        </div>
      </header>

      <div className="hearts" aria-label={`残りのミス ${state.hearts}`}>
        {Array.from({ length: MAX_HEARTS }, (_, i) => (
          <motion.span
            key={i}
            animate={i < state.hearts ? { scale: 1 } : { scale: [1, 1.35, 0.9, 1] }}
            transition={{ duration: 0.4 }}
          >
            <Heart filled={i < state.hearts} />
          </motion.span>
        ))}
      </div>

      <div className="rules">
        {RULES.map((r) => (
          <p className="rule" key={r}>
            {r}
          </p>
        ))}
      </div>

      <Board
        state={state}
        onTap={handleTap}
        onPaint={handlePaint}
        onPaintEnd={handlePaintEnd}
      />

      <footer className="footer">
        <button
          className="tool"
          onClick={doUndo}
          disabled={state.history.length === 0 || state.status !== 'playing'}
          aria-label="ひとつ戻す"
        >
          <UndoIcon />
        </button>
        <button className="tool" onClick={doReset} aria-label="やり直す">
          <ResetIcon />
        </button>
        <button
          className="tool"
          onClick={doHint}
          disabled={state.status !== 'playing'}
          aria-label="ヒント"
        >
          <HintIcon />
        </button>
      </footer>

      <AnimatePresence>
        {state.status !== 'playing' && (
          <motion.div
            className="banner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <motion.div
              className="banner-card"
              initial={{ scale: 0.85, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            >
              {state.status === 'won' ? (
                <>
                  <ResultCat />
                  <h2>クリア！</h2>
                  <p>
                    レベル {state.level} を {state.hearts} ハート残しで突破
                  </p>
                  <button className="banner-btn" onClick={nextLevel}>
                    次のレベルへ
                  </button>
                </>
              ) : (
                <>
                  <ResultCat sad />
                  <h2>ミスが 3 回</h2>
                  <p>同じ問題をもう一度</p>
                  <button className="banner-btn" onClick={retry}>
                    やり直す
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ResultCat({ sad = false }: { sad?: boolean }) {
  return (
    <motion.div
      className="result-cat"
      animate={sad ? { rotate: [0, -7, 7, -4, 0] } : { y: [0, -9, 0] }}
      transition={
        sad ? { duration: 0.6 } : { duration: 0.9, repeat: Infinity, repeatDelay: 0.5 }
      }
    >
      <CatFace />
    </motion.div>
  );
}
