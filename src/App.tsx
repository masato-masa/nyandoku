import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
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
import { Cat, CAT_NORMAL_SRC } from './ui/Cat';
import { HelpIcon, HintIcon, ResetIcon, SettingsIcon, UndoIcon } from './ui/icons';

const RULES = [
  '1 cat in each color region',
  '1 cat in every row and column',
  'Cats can’t touch, even diagonally',
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

  const doHint = useCallback(() => apply(hint(state)), [apply, state]);
  const nextLevel = useCallback(() => setState((s) => createGame(s.level + 1)), []);
  const retry = useCallback(() => setState((s) => reset(s)), []);

  const toggleSound = useCallback(() => {
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
          <img className="progress-cat" src={CAT_NORMAL_SRC} alt="" draggable={false} />
          <span className="progress-count">
            <span className="progress-now">{placed}</span>
            <span className="progress-slash">/</span>
            <span className="progress-total">{size}</span>
          </span>
        </span>

        <h1 className="title">Level {state.level}</h1>

        <div className="header-actions">
          <button className="icon-btn" type="button" aria-label="How to play">
            <HelpIcon />
          </button>
          <button
            className="icon-btn"
            type="button"
            data-off={muted}
            onClick={toggleSound}
            aria-label={muted ? 'Sound off' : 'Sound on'}
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      <section className="rules">
        <div className="rules-grid">
          {RULES.map((r) => (
            <p className="rule" key={r}>
              {r}
            </p>
          ))}
        </div>
      </section>

      <Board state={state} onTap={handleTap} onPaint={handlePaint} onPaintEnd={handlePaintEnd} />

      <footer className="footer">
        <button
          className="tool"
          type="button"
          onClick={doUndo}
          disabled={state.history.length === 0 || state.status !== 'playing'}
          aria-label="Undo"
        >
          <UndoIcon />
        </button>
        <button className="tool" type="button" onClick={doReset} aria-label="Reset">
          <ResetIcon />
        </button>
        <button
          className="tool"
          type="button"
          onClick={doHint}
          disabled={state.status !== 'playing'}
          aria-label="Hint"
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
              initial={{ scale: 0.85, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            >
              <motion.div
                className="banner-cat"
                animate={
                  state.status === 'won'
                    ? { y: [0, -10, 0] }
                    : { rotate: [0, -8, 8, -5, 0] }
                }
                transition={
                  state.status === 'won'
                    ? { duration: 0.9, repeat: Infinity, repeatDelay: 0.4 }
                    : { duration: 0.7 }
                }
              >
                <Cat mood={state.status === 'won' ? 'happy' : 'sad'} className="banner-cat-img" />
              </motion.div>

              {state.status === 'won' ? (
                <>
                  <h2>Purrfect!</h2>
                  <p>Level {state.level} cleared</p>
                  <button className="banner-btn" type="button" onClick={nextLevel}>
                    Next level
                  </button>
                </>
              ) : (
                <>
                  <h2>Out of tries</h2>
                  <p>Give this one another go</p>
                  <button className="banner-btn" type="button" onClick={retry}>
                    Try again
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
