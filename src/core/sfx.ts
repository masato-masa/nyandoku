// 効果音と BGM。
//
// 効果音は録音（ElevenLabs で生成した音。src/assets/sfx/<名前>.wav）を鳴らし、
// 読み込めていない音だけ WebAudio の合成音で代わりに鳴らす。
// 参考にした癒し系パズルの気持ちよさは「音が短く、柔らかく、連鎖すると
// 音程が上がる」ことで出ている。録音も再生速度で音程を上げて、猫が増えるほど高くする。
//
// BGM は Suno で作った曲（src/assets/bgm/main.mp3）を <audio> でループする。

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bgmBus: GainNode | null = null;

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

// ?mute を付けて開いたときは、効果音も BGM も鳴らさない（確認用）。
const forceMute = typeof location !== 'undefined' && new URLSearchParams(location.search).has('mute');
let muted = forceMute || loadMuted();

const BGM_KEY = 'nyandoku.bgm';
let bgmOn = (() => {
  if (forceMute) return false;
  try {
    return localStorage.getItem(BGM_KEY) !== '0';
  } catch {
    return true;
  }
})();

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
    bgmBus = ctx.createGain();
    bgmBus.gain.value = BGM_GAIN;
    bgmBus.connect(ctx.destination);
    loadSamples(ctx);
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

// ---- 録音 ----

type SampleName = 'cat' | 'cross' | 'conflict' | 'win';
const sampleUrls = import.meta.glob('../assets/sfx/*.wav', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const buffers = new Map<SampleName, AudioBuffer>();
/** 録音はピーク 0.9 にそろえてあるので、役割に合わせて下げる。 */
const SAMPLE_GAIN: Record<SampleName, number> = { cat: 0.6, cross: 0.22, conflict: 0.4, win: 0.7 };

function loadSamples(ac: AudioContext): void {
  for (const [path, url] of Object.entries(sampleUrls)) {
    const m = /\/(\w+)\.wav$/.exec(path);
    if (!m) continue;
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((d) => ac.decodeAudioData(d))
      .then((buf) => buffers.set(m[1] as SampleName, buf))
      .catch(() => {
        /* 読めなければ合成音のまま */
      });
  }
}

/** 録音を鳴らす。rate は再生速度（音の高さ）。鳴らせたら true。 */
function sample(name: SampleName, rate = 1, gainScale = 1): boolean {
  const ac = audio();
  if (!ac || !master || muted) return muted;
  const buf = buffers.get(name);
  if (!buf) return false;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ac.createGain();
  g.gain.value = SAMPLE_GAIN[name] * gainScale;
  src.connect(g).connect(master);
  src.start();
  return true;
}

/** 半音 n 個ぶん高くする再生速度。 */
const semis = (n: number): number => Math.pow(2, n / 12);
/** ペンタトニックの段（LADDER と同じ並び）を半音に直したもの。 */
const LADDER_SEMIS = [0, 2, 4, 7, 9, 12, 14, 16, 19];

// ---- BGM ----

/** BGM の音量。効果音の下で、考えるのを邪魔しない小ささ（約 −20dB）。 */
const BGM_GAIN = 0.1;
const bgmUrl = Object.values(
  import.meta.glob('../assets/bgm/main.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>,
)[0];
let bgmEl: HTMLAudioElement | null = null;
let bgmNode: MediaElementAudioSourceNode | null = null;
let retryArmed = false;

function bgmElement(): HTMLAudioElement | null {
  if (!bgmUrl || typeof Audio === 'undefined') return null;
  if (!bgmEl) {
    bgmEl = new Audio(bgmUrl);
    bgmEl.preload = 'auto';
    bgmEl.loop = true;
  }
  return bgmEl;
}

function startBgm(): void {
  if (!bgmOn) return;
  const el = bgmElement();
  const ac = audio();
  if (!el || !ac || !bgmBus) return;
  if (!bgmNode) {
    bgmNode = ac.createMediaElementSource(el);
    bgmNode.connect(bgmBus);
  }
  bgmBus.gain.cancelScheduledValues(ac.currentTime);
  bgmBus.gain.setValueAtTime(0.0001, ac.currentTime);
  bgmBus.gain.exponentialRampToValueAtTime(BGM_GAIN, ac.currentTime + 1.2);
  if (el.paused) void el.play().catch(() => armRetry());
}

function armRetry(): void {
  if (retryArmed || typeof window === 'undefined') return;
  retryArmed = true;
  const events = ['pointerdown', 'keydown'];
  const go = (): void => {
    for (const ev of events) window.removeEventListener(ev, go, true);
    retryArmed = false;
    window.setTimeout(startBgm, 0);
  };
  for (const ev of events) window.addEventListener(ev, go, true);
}

if (typeof document !== 'undefined') {
  // ページを開いた時点から読み始め、最初の操作で流れ始める。
  if (bgmOn) {
    bgmElement();
    armRetry();
  }
  // 別のタブやアプリに移ったら止め、戻ったら続きから流す。
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) bgmEl?.pause();
    else if (bgmOn && bgmNode) void bgmEl?.play().catch(() => armRetry());
  });
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
  isBgmOn() {
    return bgmOn;
  },
  setBgmOn(value: boolean) {
    bgmOn = value;
    try {
      localStorage.setItem(BGM_KEY, value ? '1' : '0');
    } catch {
      /* 保存できなくても、その場の入切は効いている */
    }
    if (value) startBgm();
    else bgmEl?.pause();
  },
  /** ユーザー操作の中で一度呼んでおくと、以降の再生が確実になる。 */
  unlock() {
    audio();
  },

  /** step はドラッグ中に塗った枚数。少しずつ音程を上げると連打が心地よくなる。 */
  cross(step = 0) {
    if (!sample('cross', semis((step % 6) * 1.5))) tone({ freq: 292 + (step % 6) * 17, duration: 0.05, type: 'triangle', gain: 0.03 });
    buzz(6);
  },

  erase() {
    if (!sample('cross', semis(-3), 0.8)) tone({ freq: 260, duration: 0.06, type: 'sine', gain: 0.025, slideTo: 180 });
  },

  /** step は「今いる猫の数」。上に登るほど高くなる。 */
  cat(step: number) {
    const i = Math.min(step, LADDER.length - 1);
    const base = LADDER[i];
    buzz(14);
    if (sample('cat', semis(LADDER_SEMIS[i] - 2))) return;
    tone({ freq: base, duration: 0.16, type: 'sine', gain: 0.07 });
    tone({ freq: base * 2, duration: 0.1, type: 'sine', gain: 0.02, delay: 0.01 });
  },

  conflict() {
    buzz([0, 22, 45, 22]);
    if (sample('conflict')) return;
    tone({ freq: 233, duration: 0.09, type: 'triangle', gain: 0.05 });
    tone({ freq: 196, duration: 0.13, type: 'triangle', gain: 0.05, delay: 0.08 });
  },

  win() {
    buzz([0, 18, 60, 18, 60, 30]);
    if (sample('win')) return;
    [0, 1, 2, 4].forEach((n, i) =>
      tone({ freq: LADDER[n], duration: 0.34, type: 'sine', gain: 0.07, delay: i * 0.085 }),
    );
    tone({ freq: LADDER[5], duration: 0.6, type: 'sine', gain: 0.05, delay: 0.34 });
  },

  lose() {
    [440, 392, 330, 262].forEach((f, i) =>
      tone({ freq: f, duration: 0.26, type: 'triangle', gain: 0.05, delay: i * 0.1 }),
    );
    buzz([0, 40, 60, 80]);
  },

  undo() {
    if (!sample('cross', semis(-5), 0.9)) tone({ freq: 420, duration: 0.08, type: 'sine', gain: 0.03, slideTo: 300 });
  },
};
