/** One shared Web Audio context for the Morse ident and the alerts. Created on first use. */
let ctx: AudioContext | null = null;

/** The shared AudioContext; throws where audio is unavailable (callers catch and stay silent). */
export function audioContext(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}
