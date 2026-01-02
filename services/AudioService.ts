
class AudioService {
  private ctx: AudioContext | null = null;
  private enabled = true;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  toggle(state: boolean) {
    this.enabled = state;
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number) {
    if (!this.ctx || !this.enabled) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1, this.ctx.currentTime + duration);

    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playShoot() {
    this.playTone(440, 'triangle', 0.2, 0.1);
  }

  playExplosion() {
    this.playTone(150, 'sawtooth', 0.4, 0.15);
  }

  playDamage() {
    this.playTone(100, 'square', 0.3, 0.2);
  }

  playNextLevel() {
    if (!this.ctx || !this.enabled) return;
    this.playTone(523, 'sine', 0.2, 0.1);
    setTimeout(() => this.playTone(659, 'sine', 0.2, 0.1), 100);
    setTimeout(() => this.playTone(783, 'sine', 0.4, 0.1), 200);
  }
}

export const audioService = new AudioService();
