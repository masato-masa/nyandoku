import { motion } from 'motion/react';
import { Cat } from './Cat';
import { GearIcon } from './icons';

interface HomeProps {
  /** 到達している最新レベル。「つづきから」の行き先。 */
  maxLevel: number;
  onResume: () => void;
  onOpenLevels: () => void;
  onOpenSettings: () => void;
  /** 右下の小さな「テスト用」ボタン。本番の導線には出さない。 */
  onOpenDev: () => void;
}

export function Home({
  maxLevel,
  onResume,
  onOpenLevels,
  onOpenSettings,
  onOpenDev,
}: HomeProps) {
  const started = maxLevel > 1;

  return (
    <>
      <div className="home-top">
        <button type="button" className="icon-btn" onClick={onOpenSettings} aria-label="設定">
          <GearIcon />
        </button>
      </div>

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
                <span className="home-btn-sub">レベル {maxLevel}</span>
              </>
            ) : (
              'はじめる'
            )}
          </button>
          <button className="home-btn" type="button" onClick={onOpenLevels}>
            ステージをえらぶ
          </button>
        </div>
      </div>

      <button type="button" className="dev-pill" onClick={onOpenDev}>
        テスト用
      </button>
    </>
  );
}
