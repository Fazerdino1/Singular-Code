// Synthesizer Web Audio API pour les retours sonores discrets et élégants

let sharedAudioCtx: AudioContext | null = null;
let interactionListenersAdded = false;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }

  // Bind global user gesture listeners once to safely resume AudioContext if suspended
  if (!interactionListenersAdded && typeof window !== 'undefined') {
    const resumeContext = () => {
      if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(() => {});
      }
    };
    window.addEventListener('click', resumeContext, { passive: true });
    window.addEventListener('keydown', resumeContext, { passive: true });
    window.addEventListener('touchstart', resumeContext, { passive: true });
    interactionListenersAdded = true;
  }

  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }

  return sharedAudioCtx;
}

export const soundManager = {
  playSuccess: () => {
    try {
      const ctx = getSharedAudioContext();
      if (!ctx) return;
      
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
      osc1.frequency.exponentialRampToValueAtTime(1046.50, now + 0.25); // C6

      osc2.frequency.setValueAtTime(261.63, now);
      osc2.frequency.exponentialRampToValueAtTime(523.25, now + 0.25);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.35);
      osc2.stop(now + 0.35);
    } catch {
      // Audio not supported or blocked by policy
    }
  },

  playError: () => {
    try {
      const ctx = getSharedAudioContext();
      if (!ctx) return;
      
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.2);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // Audio not supported
    }
  },

  playClick: () => {
    try {
      const ctx = getSharedAudioContext();
      if (!ctx) return;
      
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);

      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch {
      // Audio not supported
    }
  }
};
