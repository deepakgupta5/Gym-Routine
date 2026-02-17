let audioCtx: AudioContext | null = null;

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const maybe = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext || maybe.webkitAudioContext || null;
}

function scheduleBeep(ctx: AudioContext, at: number, frequency: number, duration: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, at);

  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(0.18, at + 0.015);
  gain.gain.linearRampToValueAtTime(0.0001, at + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(at);
  osc.stop(at + duration + 0.02);
}

export async function initAudio() {
  const AudioCtor = getAudioContextConstructor();
  if (!AudioCtor) return;

  if (!audioCtx) {
    audioCtx = new AudioCtor();
  }

  if (audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
    } catch {
      // No-op on blocked autoplay contexts.
    }
  }
}

export function playTimerComplete() {
  if (!audioCtx) return;

  try {
    if (audioCtx.state === "suspended") {
      return;
    }

    const now = audioCtx.currentTime;
    scheduleBeep(audioCtx, now, 880, 0.11);
    scheduleBeep(audioCtx, now + 0.22, 1046, 0.13);
  } catch {
    // Keep timer completion non-blocking.
  }
}
