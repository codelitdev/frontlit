const MUTE_KEY = "frontlit:inbox-muted";

let context: AudioContext | null = null;

export function isChimeMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setChimeMuted(muted: boolean) {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

/** A short two-note chime, synthesized so there is no audio file to load.
 * Browsers only allow it after the agent has interacted with the page. */
export function playChime() {
  if (isChimeMuted()) return;
  try {
    context ??= new AudioContext();
    const now = context.currentTime;
    [880, 1320].forEach((frequency, index) => {
      const start = now + index * 0.12;
      const osc = context!.createOscillator();
      const gain = context!.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain).connect(context!.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
  } catch {
    // No audio support.
  }
}
