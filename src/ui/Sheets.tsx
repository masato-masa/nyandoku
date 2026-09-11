import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { CAT_NORMAL_SRC } from './Cat';

/** 画面全体を覆う下地。ホームとプレイの両方から使う。 */
export function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
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

export function HelpSheet({ onClose }: { onClose: () => void }) {
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
  /** プレイ中に開いたときの現在地。ホームから開いたときは無し。 */
  current?: number;
  max: number;
  onPick: (level: number) => void;
  onClose: () => void;
}

export function LevelSheet({ current, max, onPick, onClose }: LevelSheetProps) {
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
