import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
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
import { sfx } from './core/sfx';
import { Board, type PaintMode } from './ui/Board';
import { Cat, CAT_NORMAL_SRC } from './ui/Cat';
import { HelpIcon, HintIcon, ResetIcon, SettingsIcon, UndoIcon } from './ui/icons';

const RULES = [
  'Numbers count cats in the 8 cells around',
  'Cats sit only beside a numbered wall',
  'Every open cell must be seen',
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

  const derived = useMemo(() => derive(state), [state]);

  /** 状態の更新と、その手に応じた音・触覚をまとめて扱う唯一の入り口。 */
  const apply = useCallback((result: TapResult) => {
    setState(result.state);

    switch (result.effect) {
      case 'cat':
        sfx.cat(Math.max(0, result.state.history.length - 1));
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

  const toggleSound = useCallback(() => {
    setMuted((m) => {
      sfx.setMuted(!m);
      if (m) sfx.cross(0);
      return !m;
    });
  }, []);

  // 進み具合は「見えたマス / 開いているマス」。猫の数を出すと答えが漏れる。
  const floorCells = useMemo(() => {
    let total = 0;
    for (let i = 0; i < state.puzzle.wall.length; i++) if (!state.puzzle.wall[i]) total++;
    return total;
  }, [state.puzzle]);
  const seenCells = floorCells - derived.remaining;

  return (
    <div className="app">
      <header className="header">
        <span className="progress">
          <img className="progress-cat" src={CAT_NORMAL_SRC} alt="" draggable={false} />
          <span className="progress-count">
            <span className="progress-now">{seenCells}</span>
            <span className="progress-slash">/</span>
            <span className="progress-total">{floorCells}</span>
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
        {state.status === 'won' && (
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
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.4 }}
              >
                <Cat mood="happy" className="banner-cat-img" />
              </motion.div>

              <h2>Purrfect!</h2>
              <p>
                Level {state.level} cleared
                {state.hintsUsed > 0 ? ` · ${state.hintsUsed} hint${state.hintsUsed > 1 ? 's' : ''}` : ''}
              </p>
              <button className="banner-btn" type="button" onClick={nextLevel}>
                Next level
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
