import React, { useEffect, useRef } from 'react';
import { AudioEngine } from '../services/audioEngine';
import type { Program, Channel } from '../types';
import { SyncedVideoPlayer } from './SyncedVideoPlayer';

interface ScreenProps {
    isOn: boolean;
    isWarmingUp: boolean;
    channel: number;
    vcrState: 'IDLE' | 'PLAY' | 'REW' | 'FF' | 'STOP' | 'LOADING' | 'PAUSE' | 'SLOW';
    isVcrOn: boolean;
    vcrOsdText: string;
    tvOsdText: string;
    tracking: number; // 0-100
    sharpness: number; // 0-100
    isCollapsing: boolean;
    audioEngine: AudioEngine | null;
    programs: Program[];
    channels: Channel[];
    currentTime: Date;
}

export const Screen: React.FC<ScreenProps> = ({
    isOn, isWarmingUp, channel,
    vcrState, isVcrOn, vcrOsdText, tvOsdText, tracking, sharpness, isCollapsing,
    audioEngine, programs, channels, currentTime
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>(0);

    const isProgramPlaying = (program: Program, time: Date) => {
        const [startH, startM] = program.startTime.split(':').map(Number);
        const startD = new Date(time);
        startD.setHours(startH, startM, 0, 0);

        if (startH > time.getHours() && (startH - time.getHours()) > 12) {
            startD.setDate(startD.getDate() - 1);
        }

        const endD = new Date(startD.getTime() + program.duration * 60000);
        return time >= startD && time < endD;
    };

    const activeChannel = channels[channel - 1];
    const currentProgram = React.useMemo(() => {
        if (!activeChannel) return null;
        return programs.find(p => p.channelId === activeChannel.id && isProgramPlaying(p, currentTime)) || null;
    }, [programs, activeChannel, currentTime]);

    const timeRef = useRef(0);
    const verticalHoldRef = useRef(0);
    const dataArrayRef = useRef<Uint8Array | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
        if (!ctx) return;

        let w = canvas.width;
        let h = canvas.height;

        // Init audio buffer
        if (audioEngine && !dataArrayRef.current) {
            dataArrayRef.current = new Uint8Array(audioEngine.analyser.frequencyBinCount);
        }

        const resize = () => {
            // Low resolution for authentic pixelation and performance
            canvas.width = 320;
            canvas.height = 240;
            w = canvas.width;
            h = canvas.height;
            ctx.imageSmoothingEnabled = false;
        };
        resize();

        // -- Drawing Helpers --

        const drawStatic = (intensity = 1.0) => {
            const idata = ctx.createImageData(w, h);
            const buffer32 = new Uint32Array(idata.data.buffer);
            const len = buffer32.length;
            for (let i = 0; i < len; i++) {
                if (Math.random() < 0.1 * intensity) {
                    buffer32[i] = 0xff000000;
                } else {
                    const shade = Math.random() * 100 * intensity + (150 * intensity);
                    buffer32[i] = (255 << 24) | (shade << 16) | (shade << 8) | shade;
                }
            }
            ctx.putImageData(idata, 0, 0);
        };

        const drawVisualizer = () => {
            if (!audioEngine || !dataArrayRef.current) {
                drawStatic(0.5);
                return;
            }

            // Clear background
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, w, h);

            // Get Data
            audioEngine.getWaveformData(dataArrayRef.current);
            const bufferLength = dataArrayRef.current.length;

            // Draw Oscilloscope
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#00ff00';
            ctx.beginPath();

            const sliceWidth = w * 1.0 / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArrayRef.current[i] / 128.0;
                const y = (v * h) / 2;

                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);

                x += sliceWidth;
            }
            ctx.lineTo(w, h / 2);
            ctx.stroke();

            // Draw Spectrum Overlay (faint)
            audioEngine.getFrequencyData(dataArrayRef.current);
            const barWidth = (w / bufferLength) * 2.5;
            let barX = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = dataArrayRef.current[i] / 2;
                ctx.fillStyle = `rgba(0, 255, 0, 0.2)`;
                ctx.fillRect(barX, h - barHeight, barWidth, barHeight);
                barX += barWidth + 1;
                if (barX > w) break;
            }

            // Add "AUX INPUT" text
            ctx.fillStyle = '#00ff00';
            ctx.font = '16px monospace';
            ctx.fillText('AUX INPUT: AUDIO VISUALIZER', 10, 20);
        };

        const drawBlueScreen = () => {
            ctx.fillStyle = '#000088';
            ctx.fillRect(0, 0, w, h);
        };

        const drawVcrOSD = () => {
            if (!vcrOsdText) return;

            ctx.save();
            // OSD jitter
            const jitX = (Math.random() - 0.5) * 1;
            const jitY = (Math.random() - 0.5) * 1;

            ctx.font = '24px monospace';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#000'; // Shadow
            ctx.fillText(vcrOsdText, 22 + jitX, 22 + jitY);
            ctx.fillStyle = '#fff';
            ctx.fillText(vcrOsdText, 20 + jitX, 20 + jitY);
            ctx.restore();
        };

        const drawTvOSD = () => {
            if (!tvOsdText) return;

            ctx.save();
            ctx.font = '20px monospace';
            ctx.textBaseline = 'top';
            ctx.textAlign = 'right';
            ctx.fillStyle = '#000'; // Shadow
            ctx.fillText(tvOsdText, w - 18, 18);
            ctx.fillStyle = '#00ff00'; // Classic TV Green
            ctx.fillText(tvOsdText, w - 20, 20);
            ctx.restore();
        };

        const drawVCRGame = (t: number) => {
            ctx.fillStyle = '#87CEEB';
            ctx.fillRect(0, 0, w, h);
            const hz = h / 2;
            ctx.fillStyle = '#333';
            ctx.fillRect(0, hz, w, h / 2);

            ctx.fillStyle = '#555';
            const speed = (t * 10) % 40;
            ctx.beginPath();
            ctx.moveTo(w / 2, hz);
            ctx.lineTo(0, h + speed);
            ctx.lineTo(w, h + speed);
            ctx.fill();

            ctx.fillStyle = '#e60000';
            ctx.fillRect(w / 2 - 20 + Math.sin(t * 0.05) * 60, h - 40, 40, 20);
        };

        // Main Render Loop
        const render = () => {
            timeRef.current++;

            if (!isOn || isWarmingUp) {
                ctx.fillStyle = '#050505';
                ctx.fillRect(0, 0, w, h);
            } else {
                // --- Channel Logic ---
                const isVcrChannel = channel === channels.length + 1;
                const isVisChannel = channel === channels.length + 2;

                if (activeChannel) {
                    if (currentProgram) {
                        ctx.clearRect(0, 0, w, h);
                        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
                        ctx.fillRect(0, 0, w, h);
                    } else {
                        drawStatic(0.5);
                    }
                } else if (isVcrChannel) {
                    // Check VCR Power
                    if (!isVcrOn) {
                        drawStatic(0.8);
                    } else {
                        // --- VCR Logic ---
                        const isSearching = vcrState === 'REW' || vcrState === 'FF';
                        const isPaused = vcrState === 'PAUSE';
                        const isSlow = vcrState === 'SLOW';
                        const isBlue = vcrState === 'IDLE' || vcrState === 'STOP' || vcrState === 'LOADING';

                        if (isBlue) {
                            drawBlueScreen();
                        } else {
                            // Determine Vertical Hold / Rolling based on Tracking
                            const trackErr = Math.abs(tracking - 50);
                            const isRolling = trackErr > 30;

                            let rollOffset = 0;
                            if (isRolling || isSearching) {
                                verticalHoldRef.current += isSearching ? 20 : (trackErr / 5);
                                if (verticalHoldRef.current > h) verticalHoldRef.current = 0;
                                rollOffset = verticalHoldRef.current;
                            } else {
                                verticalHoldRef.current = 0;
                                rollOffset = (Math.random() - 0.5) * 2;
                            }

                            // Draw Game Frame (With Roll)
                            ctx.save();
                            ctx.translate(0, rollOffset);
                            drawVCRGame(timeRef.current);
                            ctx.translate(0, -h);
                            drawVCRGame(timeRef.current);
                            ctx.restore();

                            // --- TRACKING ARTIFACTS (Tearing & Color Bleed) ---
                            if (trackErr > 2 || isSearching) {
                                const idata = ctx.getImageData(0, 0, w, h);
                                const data = idata.data;

                                // Parameters based on error magnitude
                                // trackErr is 0-50.
                                const distortionLevel = isSearching ? 40 : trackErr;

                                const shiftMax = Math.floor(distortionLevel * 0.8); // Max horizontal tear
                                const bleedAmount = Math.floor(distortionLevel / 6) * 4; // Color shift
                                const tearProb = distortionLevel / 100; // Probability of line tear

                                const rowBuffer = new Uint8ClampedArray(w * 4);

                                for (let y = 0; y < h; y++) {
                                    const rowStart = y * w * 4;

                                    // Horizontal Tearing / Jitter
                                    if (Math.random() < tearProb) {
                                        const shift = Math.floor((Math.random() - 0.5) * shiftMax);
                                        if (shift !== 0) {
                                            // Copy row to buffer
                                            for (let i = 0; i < w * 4; i++) rowBuffer[i] = data[rowStart + i];

                                            // Write back with shift
                                            for (let x = 0; x < w; x++) {
                                                let srcX = x - shift;
                                                // Wrap around for glitchy feel
                                                if (srcX < 0) srcX += w;
                                                if (srcX >= w) srcX -= w;

                                                const targetIdx = rowStart + x * 4;
                                                const srcIdx = srcX * 4;

                                                data[targetIdx] = rowBuffer[srcIdx];
                                                data[targetIdx + 1] = rowBuffer[srcIdx + 1];
                                                data[targetIdx + 2] = rowBuffer[srcIdx + 2];
                                            }
                                        }
                                    }

                                    // Color Bleed (RGB Split)
                                    // Shift Red Channel to the right
                                    if (bleedAmount > 0) {
                                        // Iterate row backwards to avoid overwriting needed source pixels
                                        // (Simulating simple analog smear)
                                        for (let x = w - 1; x >= 0; x--) {
                                            const idx = rowStart + x * 4;
                                            const srcX = x - (bleedAmount / 4); // Convert byte offset to pixel offset

                                            if (srcX >= 0) {
                                                const srcIdx = rowStart + Math.floor(srcX) * 4;
                                                data[idx] = data[srcIdx]; // Pull Red from left (shift right)
                                            } else {
                                                data[idx] = 0; // Edge
                                            }
                                        }
                                    }
                                }
                                ctx.putImageData(idata, 0, 0);
                            }

                            // Tracking Noise Band (The "Head Switching" Noise)
                            if (trackErr > 10 || isSearching) {
                                const bandY = (tracking / 100) * h;
                                const bandH = isSearching ? 100 : trackErr * 1.5;
                                const noiseImg = ctx.createImageData(w, Math.floor(bandH));
                                for (let i = 0; i < noiseImg.data.length; i += 4) {
                                    const v = Math.random() * 255;
                                    noiseImg.data[i] = v;
                                    noiseImg.data[i + 1] = v;
                                    noiseImg.data[i + 2] = v;
                                    noiseImg.data[i + 3] = 200; // Alpha
                                }
                                // Draw band with some horizontal jitter
                                const bandJitter = (Math.random() - 0.5) * (trackErr / 2);
                                ctx.putImageData(noiseImg, bandJitter, bandY - (bandH / 2));
                            }

                            // PAUSE Artifact
                            if (isPaused) {
                                const bandY = h * 0.85;
                                const bandH = 20;
                                const noiseImg = ctx.createImageData(w, bandH);
                                for (let i = 0; i < noiseImg.data.length; i += 4) {
                                    const v = Math.random() * 255;
                                    noiseImg.data[i] = v;
                                    noiseImg.data[i + 1] = v;
                                    noiseImg.data[i + 2] = v;
                                    noiseImg.data[i + 3] = 150;
                                }
                                ctx.putImageData(noiseImg, (Math.random() - 0.5) * 5, bandY);
                            }

                            // SLOW Artifact
                            if (isSlow) {
                                const bandY = (timeRef.current * 0.5) % h;
                                const bandH = 30;
                                const noiseImg = ctx.createImageData(w, bandH);
                                for (let i = 0; i < noiseImg.data.length; i += 4) {
                                    const v = Math.random() * 255;
                                    noiseImg.data[i] = v;
                                    noiseImg.data[i + 1] = v;
                                    noiseImg.data[i + 2] = v;
                                    noiseImg.data[i + 3] = 100;
                                }
                                ctx.putImageData(noiseImg, (Math.random() - 0.5) * 10, bandY);
                            }

                            // Sharpness Effect
                            if (sharpness > 60) {
                                const grainIntensity = (sharpness - 50) / 200;
                                ctx.fillStyle = `rgba(0,0,0,${grainIntensity})`;
                                drawStatic(grainIntensity);
                            } else if (sharpness < 40) {
                                ctx.fillStyle = `rgba(0,0,0,${(50 - sharpness) / 100})`;
                                ctx.fillRect(0, 0, w, h);
                            }
                        }
                        drawVcrOSD();
                    }
                } else if (isVisChannel) {
                    drawVisualizer();
                }
                // TV OSD is rendered ON TOP of everything (it comes from the TV, not the signal)
                drawTvOSD();
            }
            animationRef.current = requestAnimationFrame(render);
        };

        render();
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [isOn, isWarmingUp, channel, vcrState, isVcrOn, vcrOsdText, tvOsdText, tracking, sharpness, audioEngine]);

    const blurVal = sharpness < 50 ? `${(50 - sharpness) / 20}px` : '0px';

    return (
        <div className="relative w-full h-full bg-[#050505] overflow-hidden mix-blend-screen">
            <div
                className={`relative w-full h-full transition-opacity duration-100 ${isOn ? 'opacity-100' : 'opacity-0'}`}
                style={{
                    transform: isCollapsing ? 'scaleY(0.005) scaleX(1.2)' : 'scale(1)',
                    transition: isCollapsing ? 'transform 0.15s ease-in' : 'transform 0s',
                    filter: isCollapsing ? 'brightness(50)' : `blur(${blurVal})`,
                    background: isCollapsing ? '#fff' : 'transparent'
                }}
            >
                <div className="absolute inset-0 bg-[#050505]" />

                {activeChannel && currentProgram && isOn && (
                    <div className="absolute inset-0 z-[5]">
                        <SyncedVideoPlayer key={currentProgram.id} program={currentProgram} currentTime={currentTime} />
                    </div>
                )}

                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-90 crt-flicker block z-10" />
                {isOn && isWarmingUp && (
                    <div className="absolute inset-0 w-full h-full bg-white turn-on-anim pointer-events-none mix-blend-hard-light z-20" />
                )}
                <div className="absolute inset-0 pointer-events-none z-[25] opacity-30"
                    style={{
                        background: `linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))`,
                        backgroundSize: "100% 4px, 6px 100%"
                    }}
                />
                <div className="absolute inset-0 pointer-events-none z-30 shadow-[inset_0_0_50px_rgba(0,0,0,0.8)]" />
            </div>
        </div>
    );
};