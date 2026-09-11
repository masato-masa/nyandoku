import { useEffect, useRef, useState } from 'react';
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
      className="overlay"
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

/** シートの中身。どのシートも同じバネで出入りする。 */
function Sheet({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <motion.div
      className={className ? `sheet ${className}` : 'sheet'}
      initial={{ scale: 0.9, y: 18 }}
      animate={{ scale: 1, y: 0 }}
      exit={{ scale: 0.94, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
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
      <Sheet>
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

        <button className="sheet-btn" type="button" onClick={onClose}>
          とじる
        </button>
      </Sheet>
    </Overlay>
  );
}

interface SettingsSheetProps {
  muted: boolean;
  onToggleMute: () => void;
  onClose: () => void;
}

/** 設定。今は音の入切だけ。増やすときもここに行を足す。 */
export function SettingsSheet({ muted, onToggleMute, onClose }: SettingsSheetProps) {
  return (
    <Overlay key="settings" onClose={onClose}>
      <Sheet>
        <h2 className="sheet-title">設定</h2>

        <div className="sheet-row static">
          <span>音</span>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={!muted}
            aria-label={muted ? '音を出す' : '音を消す'}
            onClick={onToggleMute}
          />
        </div>

        <button className="sheet-btn" type="button" onClick={onClose}>
          とじる
        </button>
      </Sheet>
    </Overlay>
  );
}

interface DevSheetProps {
  maxLevel: number;
  onJump: (level: number) => void;
  onClearProgress: () => void;
  onClose: () => void;
}

/**
 * 開発者用。本番の操作導線には出さず、ホーム右下の小さなピルからだけ開く。
 * 「すきなレベルへ飛ぶ」は到達していないレベルにも飛べる（動作確認用なので
 * わざと制限しない）。
 */
export function DevSheet({ maxLevel, onJump, onClearProgress, onClose }: DevSheetProps) {
  const [value, setValue] = useState(String(maxLevel));

  const level = Number.parseInt(value, 10);
  const ok = Number.isFinite(level) && level >= 1;

  return (
    <Overlay key="dev" onClose={onClose}>
      <Sheet>
        <h2 className="sheet-title">テストツール</h2>
        <p className="dev-note">本番では使わない、動作確認用のボタンです。</p>

        <div className="sheet-row static">
          <span>すきなレベルへ</span>
          <input
            className="dev-input"
            type="number"
            min={1}
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="レベル番号"
          />
        </div>

        <button
          className="sheet-btn"
          type="button"
          disabled={!ok}
          onClick={() => ok && onJump(level)}
        >
          そのレベルで始める
        </button>

        <button className="sheet-row danger" type="button" onClick={onClearProgress}>
          きろくを ぜんぶ けす
        </button>

        <button className="sheet-link" type="button" onClick={onClose}>
          とじる
        </button>
      </Sheet>
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
      <Sheet className="sheet-levels">
        <h2 className="sheet-title">レベル</h2>

        <div className="sheet-list" ref={listRef}>
          {levels.map((lv) => (
            <button
              key={lv}
              type="button"
              className="sheet-row level-row"
              data-current={lv === current}
              data-cleared={lv < max}
              onClick={() => onPick(lv)}
            >
              <span className="level-no">{lv}</span>
              {lv < max && <img className="level-cat" src={CAT_NORMAL_SRC} alt="" />}
            </button>
          ))}
        </div>

        <button className="sheet-btn" type="button" onClick={onClose}>
          とじる
        </button>
      </Sheet>
    </Overlay>
  );
}
