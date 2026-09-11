import { motion } from 'motion/react';
import { Cat } from './Cat';

interface HomeProps {
  /** 到達している最新レベル。「つづきから」の行き先。 */
  maxLevel: number;
  onResume: () => void;
  onOpenLevels: () => void;
  onOpenHelp: () => void;
  onClearProgress: () => void;
}

export function Home({
  maxLevel,
  onResume,
  onOpenLevels,
  onOpenHelp,
  onClearProgress,
}: HomeProps) {
  const started = maxLevel > 1;

  return (
    <div className="home">
      <motion.div
        className="home-art"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Cat mood="idle" className="home-cat-img" />
      </motion.div>

      <h1 className="home-title">にゃんどく</h1>
      <p className="home-sub">ねこの しやで ぜんぶ みわたそう</p>

      <div className="home-buttons">
        <button className="home-btn primary" type="button" onClick={onResume}>
          {started ? (
            <>
              つづきから
              <span className="home-btn-level">レベル {maxLevel}</span>
            </>
          ) : (
            'はじめる'
          )}
        </button>
        <button className="home-btn" type="button" onClick={onOpenLevels}>
          ステージをえらぶ
        </button>
        <button className="home-btn" type="button" onClick={onOpenHelp}>
          あそびかた
        </button>
      </div>

      {started && (
        <button className="home-clear" type="button" onClick={onClearProgress}>
          きろくをけす
        </button>
      )}
    </div>
  );
}
