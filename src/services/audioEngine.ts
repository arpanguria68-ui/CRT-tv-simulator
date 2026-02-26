/**
 * CRT Audio Engine
 * Pure Web Audio API implementation to generate the "Sonic Narrative" of a CRT TV.
 * No external samples used.
 */

export class AudioEngine {
  private ctx: AudioContext;
  private flybackOsc: OscillatorNode | null = null;
  private flybackGain: GainNode | null = null;
  private staticNode: AudioBufferSourceNode | null = null;
  private staticGain: GainNode | null = null;
  private tapeHissNode: AudioBufferSourceNode | null = null;
  private tapeHissGain: GainNode | null = null;
  
  // VCR Specifics
  private motorOsc: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  
  private masterGain: GainNode;
  public analyser: AnalyserNode;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8; // Master volume
    
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  public getWaveformData(dataArray: Uint8Array) {
      this.analyser.getByteTimeDomainData(dataArray);
  }

  public getFrequencyData(dataArray: Uint8Array) {
      this.analyser.getByteFrequencyData(dataArray);
  }

  public async resume() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  public dispose() {
    this.stopFlyback();
    this.stopAudio();
    this.stopMotor();
    this.ctx.close();
  }

  public stopAudio() {
    this.stopAudioLoop(this.staticNode, this.staticGain);
    this.staticNode = null;
    this.staticGain = null;

    this.stopAudioLoop(this.tapeHissNode, this.tapeHissGain);
    this.tapeHissNode = null;
    this.tapeHissGain = null;
  }
  
  public setMasterVolume(val: number) {
      // Clamp between 0 and 1
      const v = Math.max(0, Math.min(1, val));
      // Smooth transition to avoid clicking
      this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  // --- TV Sounds (Existing) ---

  public playMechanicalClick(isTurningOn: boolean) {
    const t = this.ctx.currentTime;
    
    // Switch Click
    const noiseBuffer = this.createNoiseBuffer(0.05);
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 3000;
    const noiseGain = this.ctx.createGain();
    
    noiseGain.gain.setValueAtTime(0.8, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
    
    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noiseSrc.start(t);

    // Spring resonance
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(isTurningOn ? 800 : 600, t);
    osc.frequency.exponentialRampToValueAtTime(isTurningOn ? 200 : 100, t + 0.05);
    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.3, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
    
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  public playDegauss() {
    const t = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, t); 
    osc.frequency.exponentialRampToValueAtTime(10, t + 0.8);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1.0, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.makeDistortionCurve(400);

    osc.connect(gain);
    gain.connect(shaper);
    shaper.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 2.0);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(0.5);
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 150;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(t);
  }

  public startFlyback() {
    const t = this.ctx.currentTime;
    
    if (this.flybackOsc) {
      this.flybackOsc.stop();
      this.flybackOsc.disconnect();
    }

    this.flybackOsc = this.ctx.createOscillator();
    this.flybackOsc.type = 'sawtooth';
    this.flybackOsc.frequency.setValueAtTime(15734, t); 

    this.flybackGain = this.ctx.createGain();
    this.flybackGain.gain.setValueAtTime(0, t);
    this.flybackGain.gain.linearRampToValueAtTime(0.05, t + 0.1); 
    this.flybackGain.gain.linearRampToValueAtTime(0.02, t + 3.0); 

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 15734;
    filter.Q.value = 10;

    this.flybackOsc.connect(filter);
    filter.connect(this.flybackGain);
    this.flybackGain.connect(this.masterGain);
    
    this.flybackOsc.start(t);
  }

  public stopFlyback() {
    if (this.flybackGain) {
      const t = this.ctx.currentTime;
      this.flybackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5); 
    }
    if (this.flybackOsc) {
      this.flybackOsc.stop(this.ctx.currentTime + 0.5);
      this.flybackOsc = null;
    }
  }

  public playStaticBloom() {
    this.playStaticBurst(1.0, 0.5);
  }

  public playAudioPopAndSwell() {
    const t = this.ctx.currentTime;
    this.playSignalPop(t);
    this.startStaticNoise(0.15, 0.5);
  }

  public playSignalPop(timeOffset = 0) {
    const t = this.ctx.currentTime + timeOffset;
    const popOsc = this.ctx.createOscillator();
    popOsc.frequency.setValueAtTime(50, t);
    const popGain = this.ctx.createGain();
    popGain.gain.setValueAtTime(0.5, t);
    popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    
    popOsc.connect(popGain);
    popGain.connect(this.masterGain);
    popOsc.start(t);
    popOsc.stop(t + 0.1);
  }

  public playChannelSwitchStatic() {
    this.playStaticBurst(0.2, 0.8);
  }

  // --- VCR Sounds ---

  public playVcrPowerSwitch() {
    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(0.08);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800; 
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1.0, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
    
    noise.connect(filter).connect(gain).connect(this.masterGain);
    noise.start(t);

    const thud = this.ctx.createOscillator();
    thud.frequency.setValueAtTime(150, t);
    thud.frequency.exponentialRampToValueAtTime(50, t + 0.1);
    const thudGain = this.ctx.createGain();
    thudGain.gain.setValueAtTime(0.5, t);
    thudGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    thud.connect(thudGain).connect(this.masterGain);
    thud.start(t);
    thud.stop(t + 0.1);
  }

  public playTapeInsert() {
    const t = this.ctx.currentTime;
    
    // 1. Sliding friction (The Push)
    const slide = this.ctx.createBufferSource();
    slide.buffer = this.createNoiseBuffer(0.8);
    const slideFilter = this.ctx.createBiquadFilter();
    slideFilter.type = 'lowpass';
    slideFilter.frequency.value = 400;
    const slideGain = this.ctx.createGain();
    slideGain.gain.setValueAtTime(0.2, t);
    slideGain.gain.linearRampToValueAtTime(0, t + 0.8);
    slide.connect(slideFilter).connect(slideGain).connect(this.masterGain);
    slide.start(t);

    // 2. Mechanical Clunk (The Grab - Handshake)
    const clunk = this.ctx.createOscillator();
    clunk.frequency.setValueAtTime(80, t + 0.4);
    clunk.frequency.exponentialRampToValueAtTime(20, t + 0.5);
    const clunkGain = this.ctx.createGain();
    clunkGain.gain.setValueAtTime(0, t + 0.4);
    clunkGain.gain.linearRampToValueAtTime(1.0, t + 0.45);
    clunkGain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
    clunk.connect(clunkGain).connect(this.masterGain);
    clunk.start(t + 0.4);
    clunk.stop(t + 0.6);

    // 3. Servo Whirr + Elevator Lowering (The Swallow)
    // Primary motor whirr
    const servo = this.ctx.createOscillator();
    servo.type = 'square';
    servo.frequency.setValueAtTime(100, t + 0.6);
    servo.frequency.linearRampToValueAtTime(300, t + 1.5); // Spin up
    servo.frequency.linearRampToValueAtTime(300, t + 3.0); // Hold
    servo.frequency.linearRampToValueAtTime(50, t + 4.0); // Spin down
    const servoGain = this.ctx.createGain();
    servoGain.gain.setValueAtTime(0, t + 0.6);
    servoGain.gain.linearRampToValueAtTime(0.08, t + 0.8);
    servoGain.gain.linearRampToValueAtTime(0, t + 4.0);
    servo.connect(servoGain).connect(this.masterGain);
    servo.start(t + 0.6);
    servo.stop(t + 4.0);

    // Elevator Lowering (Descending tone)
    const elevator = this.ctx.createOscillator();
    elevator.type = 'sawtooth';
    elevator.frequency.setValueAtTime(200, t + 1.5);
    elevator.frequency.linearRampToValueAtTime(100, t + 3.5);
    const elevatorGain = this.ctx.createGain();
    elevatorGain.gain.setValueAtTime(0, t + 1.5);
    elevatorGain.gain.linearRampToValueAtTime(0.05, t + 2.0);
    elevatorGain.gain.linearRampToValueAtTime(0, t + 3.5);
    elevator.connect(elevatorGain).connect(this.masterGain);
    elevator.start(t + 1.5);
    elevator.stop(t + 3.5);

    // Final Locking Clunk
    const lock = this.ctx.createOscillator();
    lock.frequency.setValueAtTime(60, t + 3.8);
    lock.frequency.exponentialRampToValueAtTime(10, t + 3.9);
    const lockGain = this.ctx.createGain();
    lockGain.gain.setValueAtTime(0, t + 3.8);
    lockGain.gain.linearRampToValueAtTime(0.8, t + 3.85);
    lockGain.gain.exponentialRampToValueAtTime(0.01, t + 4.0);
    lock.connect(lockGain).connect(this.masterGain);
    lock.start(t + 3.8);
    lock.stop(t + 4.0);
  }

  public playVCRMechanic(type: 'STOP' | 'EJECT') {
    const t = this.ctx.currentTime;
    
    // Thud
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(10, t + 0.2);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    osc.connect(gain).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.2);

    if (type === 'EJECT') {
         // Eject Whirr (reverse of load)
        const servo = this.ctx.createOscillator();
        servo.type = 'sawtooth';
        servo.frequency.setValueAtTime(300, t + 0.2);
        servo.frequency.linearRampToValueAtTime(100, t + 1.5);
        const servoGain = this.ctx.createGain();
        servoGain.gain.setValueAtTime(0.1, t + 0.2);
        servoGain.gain.linearRampToValueAtTime(0, t + 1.5);
        servo.connect(servoGain).connect(this.masterGain);
        servo.start(t + 0.2);
        servo.stop(t + 1.5);
    }
  }

  public startRewindWhine() {
    this.startMotorSound(400, 1200);
  }

  public startFFWhine() {
    this.startMotorSound(400, 1000);
  }

  private startMotorSound(startFreq: number, endFreq: number) {
    const t = this.ctx.currentTime;
    this.stopMotor();

    this.motorOsc = this.ctx.createOscillator();
    this.motorOsc.type = 'triangle';
    this.motorOsc.frequency.setValueAtTime(startFreq, t);
    this.motorOsc.frequency.linearRampToValueAtTime(endFreq, t + 2.0); // Spin up

    this.motorGain = this.ctx.createGain();
    this.motorGain.gain.setValueAtTime(0, t);
    this.motorGain.gain.linearRampToValueAtTime(0.1, t + 0.5);

    // Lowpass to muffle inside casing
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;

    this.motorOsc.connect(filter).connect(this.motorGain).connect(this.masterGain);
    this.motorOsc.start(t);
  }

  public stopMotor() {
    if (this.motorOsc && this.motorGain) {
        const t = this.ctx.currentTime;
        // Spin down effect
        try {
            this.motorOsc.frequency.cancelScheduledValues(t);
            this.motorOsc.frequency.setValueAtTime(this.motorOsc.frequency.value, t);
            this.motorOsc.frequency.exponentialRampToValueAtTime(50, t + 0.5);
            
            this.motorGain.gain.cancelScheduledValues(t);
            this.motorGain.gain.setValueAtTime(this.motorGain.gain.value, t);
            this.motorGain.gain.linearRampToValueAtTime(0, t + 0.5);
            
            this.motorOsc.stop(t + 0.6);
        } catch(e) {}
        this.motorOsc = null;
        this.motorGain = null;
    }
  }

  public setAudioMode(mode: 'STATIC' | 'BROADCAST' | 'VCR_SILENCE' | 'VCR_PLAY' | 'VCR_SEARCH' | 'VCR_PAUSE' | 'VCR_SLOW') {
    const t = this.ctx.currentTime;
    this.stopAudioLoop(this.staticNode, this.staticGain);
    this.stopAudioLoop(this.tapeHissNode, this.tapeHissGain);

    if (mode === 'STATIC') {
       this.startStaticNoise(0.4, 0.1);
    } else if (mode === 'BROADCAST') {
       this.startStaticNoise(0.05, 0.5);
    } else if (mode === 'VCR_PLAY') {
       this.startTapeHiss();
    } else if (mode === 'VCR_SEARCH') {
       this.startTapeHiss(0.3); // Louder hiss
       this.playStaticBurst(0.1, 0.2); // Occasional pops handled by caller, but base noise is higher
    } else if (mode === 'VCR_PAUSE') {
       this.startTapeHiss(0.05); // Very quiet hiss, head drum spinning
    } else if (mode === 'VCR_SLOW') {
       this.startTapeHiss(0.1); // Slightly quiet
       this.startMotorSound(100, 100); // Low hum
    }
  }

  // --- Utilities ---

  public playStaticBurst(duration: number, volume: number) {
    const t = this.ctx.currentTime;
    const buffer = this.createNoiseBuffer(duration);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 5000;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(t);
  }

  private startStaticNoise(volume: number, fadeTime: number) {
    const t = this.ctx.currentTime;
    this.staticNode = this.ctx.createBufferSource();
    this.staticNode.buffer = this.createNoiseBuffer(5); 
    this.staticNode.loop = true;

    this.staticGain = this.ctx.createGain();
    this.staticGain.gain.setValueAtTime(0, t);
    this.staticGain.gain.linearRampToValueAtTime(volume, t + fadeTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 8000;

    this.staticNode.connect(filter);
    filter.connect(this.staticGain);
    this.staticGain.connect(this.masterGain);
    this.staticNode.start(t);
  }

  private startTapeHiss(vol = 0.15) {
    const t = this.ctx.currentTime;
    this.tapeHissNode = this.ctx.createBufferSource();
    this.tapeHissNode.buffer = this.createNoiseBuffer(5);
    this.tapeHissNode.loop = true;

    this.tapeHissGain = this.ctx.createGain();
    this.tapeHissGain.gain.setValueAtTime(0, t);
    this.tapeHissGain.gain.linearRampToValueAtTime(vol, t + 0.5);

    const lowCut = this.ctx.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.frequency.value = 400;
    const highCut = this.ctx.createBiquadFilter();
    highCut.type = 'lowpass';
    highCut.frequency.value = 3500;

    this.tapeHissNode.connect(lowCut);
    lowCut.connect(highCut);
    highCut.connect(this.tapeHissGain);
    this.tapeHissGain.connect(this.masterGain);
    this.tapeHissNode.start(t);
  }

  private stopAudioLoop(node: AudioBufferSourceNode | null, gain: GainNode | null) {
    if (gain) {
        try {
            gain.gain.cancelScheduledValues(this.ctx.currentTime);
            gain.gain.setValueAtTime(gain.gain.value, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
        } catch(e) {}
    }
    if (node) {
        try {
            node.stop(this.ctx.currentTime + 0.1);
        } catch(e) {}
    }
  }

  private createNoiseBuffer(duration: number): AudioBuffer {
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private makeDistortionCurve(amount: number) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }
}