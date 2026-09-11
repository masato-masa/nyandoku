// 効果音。音声ファイルを持たず WebAudio で合成する。
//
// 参考にした癒し系パズルの気持ちよさは「音が短く、柔らかく、連鎖すると
// 音程が上がる」ことで出ている。ここでは倍音の少ない波形を軽いローパスに
// 通し、減衰を指数カーブにして耳に刺さらないようにしている。

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** 音を消したかどうか。設定シートから切り替え、次に開いたときも残す。 */
const MUTE_KEY = 'nyandoku.muted';

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    // プライベートモードなどで読めないことがある。音が鳴るだけなので既定に戻す。
    return false;
  }
}

let muted = loadMuted();

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 4200;
    master.connect(soften).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface ToneOptions {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  /** 終端の周波数。指定するとその高さへ滑らかに動く。 */
  slideTo?: number;
}

function tone({ freq, duration, type = 'sine', gain = 0.06, delay = 0, slideTo }: ToneOptions): void {
  const ac = audio();
  if (!ac || !master || muted) return;

  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const env = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);

  // 立ち上がり 8ms。ここを 0 にするとプチッと鳴るので必ず傾斜をつける。
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function buzz(pattern: number | number[]): void {
  if (muted) return;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
}

// ペンタトニックを上がっていく。猫が増えるほど音が高くなり、達成感が出る。
const LADDER = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98];

export const sfx = {
  setMuted(value: boolean) {
    muted = value;
    try {
      localStorage.setItem(MUTE_KEY, value ? '1' : '0');
    } catch {
      /* 保存できなくても、その場の入切は効いている */
    }
  },
  isMuted() {
    return muted;
  },
  /** ユーザー操作の中で一度呼んでおくと、以降の再生が確実になる。 */
  unlock() {
    audio();
  },

  /** step はドラッグ中に塗った枚数。少しずつ音程を上げると連打が心地よくなる。 */
  cross(step = 0) {
    tone({ freq: 292 + (step % 6) * 17, duration: 0.05, type: 'triangle', gain: 0.03 });
    buzz(6);
  },

  erase() {
    tone({ freq: 260, duration: 0.06, type: 'sine', gain: 0.025, slideTo: 180 });
  },

  /** step は「今いる猫の数」。上に登るほど高くなる。 */
  cat(step: number) {
    const base = LADDER[Math.min(step, LADDER.length - 1)];
    tone({ freq: base, duration: 0.16, type: 'sine', gain: 0.07 });
    tone({ freq: base * 2, duration: 0.1, type: 'sine', gain: 0.02, delay: 0.01 });
    buzz(14);
  },

  conflict() {
    tone({ freq: 233, duration: 0.09, type: 'triangle', gain: 0.05 });
    tone({ freq: 196, duration: 0.13, type: 'triangle', gain: 0.05, delay: 0.08 });
    buzz([0, 22, 45, 22]);
  },

  win() {
    [0, 1, 2, 4].forEach((n, i) =>
      tone({ freq: LADDER[n], duration: 0.34, type: 'sine', gain: 0.07, delay: i * 0.085 }),
    );
    tone({ freq: LADDER[5], duration: 0.6, type: 'sine', gain: 0.05, delay: 0.34 });
    buzz([0, 18, 60, 18, 60, 30]);
  },

  lose() {
    [440, 392, 330, 262].forEach((f, i) =>
      tone({ freq: f, duration: 0.26, type: 'triangle', gain: 0.05, delay: i * 0.1 }),
    );
    buzz([0, 40, 60, 80]);
  },

  undo() {
    tone({ freq: 420, duration: 0.08, type: 'sine', gain: 0.03, slideTo: 300 });
  },
};
