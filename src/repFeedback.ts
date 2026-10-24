let audioCtx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function onRepRegistered(videoWrap: HTMLElement): void {
  try {
    const ac = ctx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.start();
    osc.stop(ac.currentTime + 0.08);
  } catch {
    /* audio optional */
  }

  if (navigator.vibrate) navigator.vibrate(30);

  videoWrap.classList.remove("rep-flash");
  void videoWrap.offsetWidth;
  videoWrap.classList.add("rep-flash");
}
