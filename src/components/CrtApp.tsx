import React, { useState, useEffect, useRef } from 'react';
import { Screen } from './CrtScreen';
import { AudioEngine } from '../services/audioEngine';
import type { Program, Channel } from '../types';

interface CrtAppProps {
    programs: Program[];
    channels: Channel[];
    currentTime: Date;
    onClose: () => void;
}

export default function App({ programs, channels, currentTime, onClose }: CrtAppProps) {
    const [isOn, setIsOn] = useState(false);
    const [isWarmingUp, setIsWarmingUp] = useState(false);
    const [channel, setChannel] = useState(1);
    const [volume, setVolume] = useState(0.8);
    const [tvOsdText, setTvOsdText] = useState('');

    // --- VCR STATE ---
    const [isVcrOn, setIsVcrOn] = useState(false); // Default off
    const [isTapeLoaded, setIsTapeLoaded] = useState(false);
    const [vcrMode, setVcrMode] = useState<'IDLE' | 'PLAY' | 'REW' | 'FF' | 'STOP' | 'LOADING' | 'PAUSE' | 'SLOW'>('IDLE');
    const [counter, setCounter] = useState(0);
    const [tracking, setTracking] = useState(50); // 50 is ideal
    const [sharpness, setSharpness] = useState(50); // 0 = Soft, 100 = Sharp
    const [osdText, setOsdText] = useState(''); // VCR OSD

    // New VCR Features
    const [tapeSpeed, setTapeSpeed] = useState<'SP' | 'LP' | 'EP'>('SP');
    const [childLock, setChildLock] = useState(false);

    const [isCollapsing, setIsCollapsing] = useState(false);

    // --- CALIBRATION UI STATE ---
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedHitbox, setSelectedHitbox] = useState<string | null>(null);

    // Initial default map
    const INITIAL_MAP = {
        screen: { top: 13, left: 21.1, width: 58.5, height: 48, label: 'Screen', borderRadius: 0 },
        tvPower: { top: 76.5, left: 22.8, width: 3.5, height: 3.5, label: 'TV Power' },
        tvChUp: { top: 76.2, left: 54, width: 2.5, height: 2, label: 'CH +' },
        tvChDown: { top: 79.5, left: 54, width: 2.5, height: 2, label: 'CH -' },
        tvVolUp: { top: 76.2, left: 58, width: 2.5, height: 2, label: 'Vol +' },
        tvVolDown: { top: 79.5, left: 58, width: 2.5, height: 2, label: 'Vol -' },
        vcrPowerBtn: { top: 89.5, left: 16.5, width: 3, height: 2.5, label: 'VCR Power' },
        vcrSlot: { top: 88.5, left: 21.5, width: 25.5, height: 5, label: 'Tape Slot' },
        vcrEject: { top: 90.5, left: 49.5, width: 1.5, height: 2, label: 'Eject' },
        vcrDisplay: { top: 88.5, left: 52, width: 16, height: 6, label: 'VCR Display' },
        vcrLock: { top: 88.5, left: 69, width: 2, height: 1.5, label: 'Child Lock' },
        vcrRew: { top: 94.5, left: 23.5, width: 3, height: 2.5, label: 'REW' },
        vcrPlay: { top: 94.5, left: 28, width: 6, height: 2.5, label: 'PLAY' },
        vcrStop: { top: 97.5, left: 28, width: 6, height: 1.5, label: 'STOP' },
        vcrFf: { top: 94.5, left: 35, width: 3, height: 2.5, label: 'FF' },
        vcrPause: { top: 94.5, left: 40, width: 3, height: 2, label: 'PAUSE' },
        vcrSlow: { top: 97.5, left: 40, width: 3, height: 1.5, label: 'SLOW' },
        vcrTracking: { top: 96, left: 45.5, width: 3.5, height: 3.5, label: 'Tracking' },
        vcrSharpness: { top: 96, left: 51, width: 3.5, height: 3.5, label: 'Sharpness' },
        vcrSpeed: { top: 96, left: 57, width: 3.5, height: 3.5, label: 'Tape Speed' },

        // Extra User-Mappable Buttons
        custom1: { top: 5, left: 5, width: 2, height: 2, label: 'Custom 1' },
        custom2: { top: 5, left: 8, width: 2, height: 2, label: 'Custom 2' },
        custom3: { top: 5, left: 11, width: 2, height: 2, label: 'Custom 3' },
        custom4: { top: 5, left: 14, width: 2, height: 2, label: 'Custom 4' },
        custom5: { top: 5, left: 17, width: 2, height: 2, label: 'Custom 5' },
        custom6: { top: 5, left: 20, width: 2, height: 2, label: 'Custom 6' },
        custom7: { top: 5, left: 23, width: 2, height: 2, label: 'Custom 7' },
        custom8: { top: 5, left: 26, width: 2, height: 2, label: 'Custom 8' },
        custom9: { top: 5, left: 29, width: 2, height: 2, label: 'Custom 9' },
        custom10: { top: 5, left: 32, width: 2, height: 2, label: 'Custom 10' }
    };

    type MapKeys = keyof typeof INITIAL_MAP;

    const [mapData, setMapData] = useState<typeof INITIAL_MAP>(() => {
        const saved = localStorage.getItem('crtMapData');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) { }
        }
        return INITIAL_MAP;
    });

    const [bgImage, setBgImage] = useState<string>(() => {
        return localStorage.getItem('crtBgImage') || '/bg.png';
    });

    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef({ startX: 0, startY: 0, initTop: 0, initLeft: 0 });

    useEffect(() => {
        localStorage.setItem('crtMapData', JSON.stringify(mapData));
    }, [mapData]);

    useEffect(() => {
        localStorage.setItem('crtBgImage', bgImage);
    }, [bgImage]);

    // --- AUDIO ENGINE ---
    const engineRef = useRef<AudioEngine | null>(null);
    const [audioEngine, setAudioEngine] = useState<AudioEngine | null>(null);
    const counterInterval = useRef<number | null>(null);
    const osdTimeout = useRef<number | null>(null);
    const tvOsdTimeout = useRef<number | null>(null);

    useEffect(() => {
        const engine = new AudioEngine();
        engineRef.current = engine;
        setAudioEngine(engine);
        return () => {
            engine.dispose();
        };
    }, []);

    // -- Audio Sync --
    useEffect(() => {
        if (!isOn || isWarmingUp || !engineRef.current) return;

        // Default static fallback
        let mode: 'STATIC' | 'BROADCAST' | 'VCR_SILENCE' | 'VCR_PLAY' | 'VCR_SEARCH' | 'VCR_PAUSE' | 'VCR_SLOW' = 'STATIC';

        if (isCollapsing) {
            mode = 'STATIC';
        } else if (channel <= channels.length) {
            mode = 'BROADCAST'; // We will assume it has signal for now, or could check programs
        } else if (channel === channels.length + 1) {
            // If VCR is Off, we effectively have static on the AV channel
            if (!isVcrOn) {
                mode = 'STATIC';
            } else {
                if (vcrMode === 'PLAY') mode = 'VCR_PLAY';
                else if (vcrMode === 'REW' || vcrMode === 'FF') mode = 'VCR_SEARCH';
                else if (vcrMode === 'PAUSE') mode = 'VCR_PAUSE';
                else if (vcrMode === 'SLOW') mode = 'VCR_SLOW';
                else mode = 'VCR_SILENCE';
            }
        } else {
            mode = 'STATIC'; // Visualizer doesn't have its own TV sound usually
        }

        engineRef.current.setAudioMode(mode);

    }, [channel, isOn, isWarmingUp, isCollapsing, vcrMode, isVcrOn]);


    // -- Logic Handlers --

    const handlePowerToggle = async () => {
        if (!engineRef.current) return;
        if (!isOn) {
            try {
                await engineRef.current.resume();
                engineRef.current.playMechanicalClick(true);
                engineRef.current.playDegauss();
                engineRef.current.startFlyback();
                setIsOn(true);
                setIsWarmingUp(true);

                // Init volume
                engineRef.current.setMasterVolume(volume);

                setTimeout(() => engineRef.current?.playStaticBloom(), 1500);
                setTimeout(() => { setIsWarmingUp(false); engineRef.current?.playAudioPopAndSwell(); }, 2500);

                // Show initial Channel OSD
                setTimeout(() => showTvOSD(`CH ${channel.toString().padStart(2, '0')}`), 3000);

            } catch (e) { console.error(e); }
        } else {
            engineRef.current.playMechanicalClick(false);
            engineRef.current.stopFlyback();
            engineRef.current.stopAudio();
            setIsOn(false);
            setIsWarmingUp(false);
        }
    };

    const handleVcrPowerToggle = () => {
        if (childLock) return;
        engineRef.current?.playVcrPowerSwitch();
        setIsVcrOn(prev => {
            const newState = !prev;
            if (!newState) {
                // Reset modes if turning off
                if (vcrMode === 'PLAY' || vcrMode === 'REW' || vcrMode === 'FF' || vcrMode === 'PAUSE' || vcrMode === 'SLOW') {
                    setVcrMode('STOP');
                    engineRef.current?.stopMotor();
                    if (counterInterval.current) clearInterval(counterInterval.current);
                }
            }
            return newState;
        });
    };

    const handleVolumeChange = (delta: number) => {
        if (!isOn || isWarmingUp) return;
        setVolume(prev => {
            const newVol = Math.max(0, Math.min(1, prev + delta));
            engineRef.current?.setMasterVolume(newVol);

            // Generate Volume Bar OSD: "VOL ||||||......"
            const totalBars = 16;
            const filledBars = Math.round(newVol * totalBars);
            const barStr = '|'.repeat(filledBars).padEnd(totalBars, '.');
            showTvOSD(`VOL ${barStr}`);

            return newVol;
        });
    };

    const handleChannelChange = (direction: 'UP' | 'DOWN') => {
        if (!isOn || isWarmingUp) return;
        setIsCollapsing(true);
        engineRef.current?.playChannelSwitchStatic();

        const maxChannel = channels.length > 0 ? channels.length + 2 : 4;
        let newChannel = channel;
        if (direction === 'UP') newChannel = channel >= maxChannel ? 1 : channel + 1;
        else newChannel = channel <= 1 ? maxChannel : channel - 1;

        setChannel(newChannel);
        setTimeout(() => {
            setIsCollapsing(false);
            showTvOSD(`CH ${newChannel.toString().padStart(2, '0')}`);
        }, 150);
    };

    const showTvOSD = (text: string) => {
        setTvOsdText(text);
        if (tvOsdTimeout.current) clearTimeout(tvOsdTimeout.current);
        tvOsdTimeout.current = window.setTimeout(() => setTvOsdText(''), 3000);
    }

    // VCR ACTIONS

    const showOSD = (text: string) => {
        setOsdText(text);
        if (osdTimeout.current) clearTimeout(osdTimeout.current);
        osdTimeout.current = window.setTimeout(() => setOsdText(''), 4000);
    };

    const onInsertTape = () => {
        if (!isVcrOn || childLock) return; // Can't eat tape if off or locked
        if (isTapeLoaded) return;
        setVcrMode('LOADING');
        engineRef.current?.playTapeInsert();

        // Swallow Delay - 4000ms
        setTimeout(() => {
            setIsTapeLoaded(true);
            setVcrMode('STOP');
            engineRef.current?.playVCRMechanic('STOP');
        }, 4000);
    };

    const onEjectTape = () => {
        if (!isVcrOn || childLock) return;
        setVcrMode('IDLE');
        setIsTapeLoaded(false);
        engineRef.current?.playVCRMechanic('EJECT');
        if (counterInterval.current) {
            clearInterval(counterInterval.current);
            counterInterval.current = null;
        }
        setCounter(0);
    };

    const onTransport = (mode: 'PLAY' | 'REW' | 'FF' | 'STOP' | 'PAUSE' | 'SLOW') => {
        if (!isVcrOn || childLock) return;
        if (!isTapeLoaded || vcrMode === 'LOADING') return;
        if (vcrMode === mode) return;

        // Stop previous sounds
        engineRef.current?.stopMotor();
        if (counterInterval.current) clearInterval(counterInterval.current);

        setVcrMode(mode);

        if (mode === 'STOP') {
            engineRef.current?.playVCRMechanic('STOP');
            showOSD('STOP');
            // Momentum: drift counter slightly
            setCounter(c => c + 1);
        }
        else if (mode === 'PAUSE') {
            showOSD('PAUSE ||');
        }
        else if (mode === 'SLOW') {
            showOSD('SLOW |>');
            counterInterval.current = window.setInterval(() => {
                setCounter(c => c + 1);
            }, 3000); // 1/3 speed
        }
        else if (mode === 'PLAY') {
            showOSD('PLAY >');

            let speedMs = 1000;
            if (tapeSpeed === 'LP') speedMs = 2000;
            if (tapeSpeed === 'EP') speedMs = 3000;

            counterInterval.current = window.setInterval(() => {
                setCounter(c => c + 1);
            }, speedMs);
        }
        else if (mode === 'REW') {
            engineRef.current?.startRewindWhine();
            showOSD('REW <<');
            counterInterval.current = window.setInterval(() => {
                setCounter(c => Math.max(0, c - 5));
            }, 100);
        }
        else if (mode === 'FF') {
            engineRef.current?.startFFWhine();
            showOSD('FF >>');
            counterInterval.current = window.setInterval(() => {
                setCounter(c => c + 5);
            }, 100);
        }
    };

    // removed unused onTrackingChange and onSharpnessChange

    const onTapeSpeedChange = () => {
        if (childLock) return;
        setTapeSpeed(prev => {
            const next = prev === 'SP' ? 'LP' : prev === 'LP' ? 'EP' : 'SP';
            showOSD(`SPEED ${next}`);
            return next;
        });
    };

    const handleChildLockToggle = () => {
        setChildLock(prev => {
            const next = !prev;
            if (next) showOSD('CHILD LOCK ON');
            else showOSD('CHILD LOCK OFF');
            return next;
        });
    };

    const handleTrackingClick = () => {
        if (childLock) return;
        setTracking(prev => {
            const next = (prev + 20) % 120; // Cycles 0, 20, 40, 60, 80, 100
            showOSD(`TRACKING ${next}`);
            return next;
        });
    };

    const handleSharpnessClick = () => {
        if (childLock) return;
        setSharpness(prev => {
            const next = (prev + 33) % 132; // Cycles roughly 0, 33, 66, 99
            showOSD(`SHARPNESS ${next > 100 ? 100 : next}`);
            return next > 100 ? 100 : next;
        });
    };

    // --- OVERLAY MAPPINGS ---
    // Update a rect value for calibration UI
    const handleMapChange = (key: MapKeys, prop: 'top' | 'left' | 'width' | 'height' | 'borderRadius' | 'borderRadius', value: number) => {
        // Clamp basic limits to prevent disappearing entirely
        const clampedVal = prop === 'borderRadius' ? Math.max(0, Math.min(50, value)) : Math.max(0, Math.min(100, value));
        setMapData(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                [prop]: clampedVal
            }
        }));
    };

    const handleMapStringChange = (key: MapKeys, value: string) => {
        setMapData(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                label: value
            }
        }));
    };

    const copyMapToClipboard = () => {
        const json = JSON.stringify(mapData, null, 4);
        navigator.clipboard.writeText(json).then(() => {
            alert('Map JSON copied to clipboard!');
        });
    };

    const Hitbox = ({ rectKey, onClick, title, isActive = false, className = "" }: { rectKey: MapKeys, onClick?: () => void, title: string, isActive?: boolean, className?: string }) => {
        const rect = mapData[rectKey];
        const isSelected = isEditMode && selectedHitbox === rectKey;
        const displayLabel = rect.label || title;

        const handleMouseDown = (e: React.MouseEvent) => {
            if (!isEditMode) return;
            e.preventDefault();
            e.stopPropagation();
            setSelectedHitbox(rectKey);
            setIsDragging(true);
            dragRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                initTop: rect.top,
                initLeft: rect.left
            };
        };

        return (
            <div
                onMouseDown={handleMouseDown}
                onClick={(e) => {
                    if (isEditMode) {
                        e.preventDefault();
                    } else if (onClick) {
                        onClick();
                    }
                }}
                title={isEditMode ? `Edit ${displayLabel}` : title}
                className={`absolute ${isEditMode ? 'cursor-move' : 'cursor-pointer'} flex items-center justify-center z-[55] transition-transform duration-75 
                    ${isEditMode ? 'border border-blue-400/50 bg-blue-500/10 hover:bg-blue-500/30' : 'hover:bg-white/10 active:scale-95'} 
                    ${isSelected ? 'border-2 !border-yellow-400 !bg-yellow-400/30 shadow-[0_0_15px_rgba(250,204,21,0.5)] z-[60]' : ''} 
                    ${import.meta.env.DEV && !isEditMode ? 'border border-red-500/50 mix-blend-difference' : ''} 
                    ${isActive && !isEditMode ? 'bg-white/20 shadow-[0_0_10px_rgba(255,255,255,0.5)]' : ''} 
                    ${className}`}
                style={{
                    top: `${rect.top}%`,
                    left: `${rect.left}%`,
                    width: `${rect.width}%`,
                    height: `${rect.height}%`,
                    borderRadius: '4px'
                }}
            >
                {isEditMode && (
                    <span className="text-[9px] font-bold text-white/90 drop-shadow-[0_1px_1px_rgba(0,0,0,1)] pointer-events-none px-1 text-center leading-tight truncate w-full flex items-center justify-center">
                        {displayLabel}
                    </span>
                )}
            </div>
        );
    };

    const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isEditMode || !isDragging || !selectedHitbox) return;

        const container = e.currentTarget.getBoundingClientRect();
        const deltaX = e.clientX - dragRef.current.startX;
        const deltaY = e.clientY - dragRef.current.startY;

        const deltaXPct = (deltaX / container.width) * 100;
        const deltaYPct = (deltaY / container.height) * 100;

        const newLeft = dragRef.current.initLeft + deltaXPct;
        const newTop = dragRef.current.initTop + deltaYPct;

        // Apply clamping and round to 2 decimals to keep JSON clean but still smooth during fast drags
        handleMapChange(selectedHitbox as MapKeys, 'left', Math.round(newLeft * 100) / 100);
        handleMapChange(selectedHitbox as MapKeys, 'top', Math.round(newTop * 100) / 100);
    };

    const handleContainerMouseUp = () => {
        if (isDragging) setIsDragging(false);
    };

    const resetDefaults = () => {
        if (confirm("Are you sure you want to revert to the default hardware map and image? Custom buttons will be reset.")) {
            setMapData(INITIAL_MAP);
            setBgImage('/bg.png');
            localStorage.removeItem('crtMapData');
            localStorage.removeItem('crtBgImage');
        }
    }

    return (
        <div className="relative min-h-screen w-full bg-[#111] flex items-center justify-center overflow-hidden">
            {/* Container maintains the aspect ratio of the photo */}
            <div
                className="relative w-full max-w-[1400px] aspect-square md:aspect-[4/3] lg:aspect-[1/1]"
                onMouseMove={handleContainerMouseMove}
                onMouseUp={handleContainerMouseUp}
                onMouseLeave={handleContainerMouseUp}
            >
                <img src={bgImage} alt="Setup" className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none" />

                {/* 1. TV Screen */}
                <div
                    className={`absolute z-10 overflow-hidden ${isEditMode && selectedHitbox === 'screen' ? 'ring-2 ring-yellow-400' : 'cursor-pointer'}`}
                    style={{
                        top: `${mapData.screen.top}%`, left: `${mapData.screen.left}%`, width: `${mapData.screen.width}%`, height: `${mapData.screen.height}%`, borderRadius: `${(mapData.screen as any).borderRadius ?? 0}%`
                    }}
                    onClick={() => isEditMode && setSelectedHitbox('screen')}
                >
                    <Screen
                        isOn={isOn}
                        isWarmingUp={isWarmingUp}
                        channel={channel}
                        vcrState={vcrMode}
                        isVcrOn={isVcrOn}
                        vcrOsdText={channel === channels.length + 1 && isVcrOn ? osdText : ''}
                        tvOsdText={tvOsdText}
                        tracking={tracking}
                        sharpness={sharpness}
                        isCollapsing={isCollapsing}
                        audioEngine={audioEngine}
                        programs={programs}
                        channels={channels}
                        currentTime={currentTime}
                    />
                </div>

                {/* 2. TV Hitboxes */}
                <Hitbox rectKey="tvPower" onClick={handlePowerToggle} title="TV Power" />
                <Hitbox rectKey="tvVolUp" onClick={() => handleVolumeChange(0.05)} title="Vol +" />
                <Hitbox rectKey="tvVolDown" onClick={() => handleVolumeChange(-0.05)} title="Vol -" />
                <Hitbox rectKey="tvChUp" onClick={() => handleChannelChange('UP')} title="CH +" />
                <Hitbox rectKey="tvChDown" onClick={() => handleChannelChange('DOWN')} title="CH -" />

                {/* 3. VCR LCD Display Overlay */}
                <div
                    className={`absolute z-20 flex items-center justify-center pointer-events-none ${isEditMode && selectedHitbox === 'vcrDisplay' ? 'ring-2 ring-yellow-400 bg-yellow-400/20' : ''}`}
                    style={{ top: `${mapData.vcrDisplay.top}%`, left: `${mapData.vcrDisplay.left}%`, width: `${mapData.vcrDisplay.width}%`, height: `${mapData.vcrDisplay.height}%`, pointerEvents: isEditMode ? 'auto' : 'none' }}
                    onClick={() => isEditMode && setSelectedHitbox('vcrDisplay')}
                >
                    <div className={`w-full h-full flex items-center justify-between font-mono text-[8px] md:text-sm lg:text-xl text-green-500 transition-opacity duration-300 ${!isVcrOn && !isEditMode ? 'opacity-0' : 'opacity-90'}`} style={{ textShadow: '0 0 5px #00ff00' }}>
                        <span className="bg-black/80 px-1 rounded">{vcrMode === 'IDLE' ? '12:00' : `${Math.floor(counter / 60).toString().padStart(2, '0')}:${(counter % 60).toString().padStart(2, '0')}`}</span>
                        <span className="text-[6px] md:text-[8px] lg:text-sm flex gap-1 items-center bg-black/80 px-1 rounded ml-auto">
                            <span className="opacity-50 mx-2">{vcrMode !== 'IDLE' ? vcrMode : ''}</span>
                            <div className={`w-2 h-2 rounded-full border border-green-500 flex items-center justify-center ${(vcrMode === 'PLAY' || vcrMode === 'FF' || vcrMode === 'SLOW') ? 'animate-spin' : ''}`}>-</div>
                        </span>
                    </div>
                </div>

                {/* 4. VCR Hitboxes */}
                <Hitbox rectKey="vcrPowerBtn" onClick={handleVcrPowerToggle} title="VCR Power" />

                {/* Tape Slot */}
                <Hitbox
                    rectKey="vcrSlot"
                    onClick={!isTapeLoaded ? onInsertTape : undefined}
                    title={isTapeLoaded ? "Tape Loaded" : "Click to Insert Tape"}
                    className={isTapeLoaded && !isEditMode ? '' : 'hover:bg-blue-500/20'}
                />
                {(vcrMode === 'LOADING' || (isEditMode && selectedHitbox === 'vcrSlot')) && (
                    <div className={`absolute z-30 pointer-events-none ${vcrMode === 'LOADING' ? 'bg-black border border-white/20 animate-pulse' : ''}`} style={{ top: `${mapData.vcrSlot.top}%`, left: `${mapData.vcrSlot.left + 2}%`, width: `${mapData.vcrSlot.width - 4}%`, height: `${mapData.vcrSlot.height}%` }} />
                )}

                {/* Tape transport */}
                <Hitbox rectKey="vcrPlay" onClick={() => onTransport('PLAY')} title="Play" isActive={vcrMode === 'PLAY'} />
                <Hitbox rectKey="vcrStop" onClick={() => onTransport('STOP')} title="Stop" isActive={vcrMode === 'STOP'} />
                <Hitbox rectKey="vcrRew" onClick={() => onTransport('REW')} title="Rewind" isActive={vcrMode === 'REW'} />
                <Hitbox rectKey="vcrFf" onClick={() => onTransport('FF')} title="Fast Forward" isActive={vcrMode === 'FF'} />
                <Hitbox rectKey="vcrPause" onClick={() => onTransport('PAUSE')} title="Pause" isActive={vcrMode === 'PAUSE'} />
                <Hitbox rectKey="vcrSlow" onClick={() => onTransport('SLOW')} title="Slow Motion" isActive={vcrMode === 'SLOW'} />
                <Hitbox rectKey="vcrEject" onClick={() => { onEjectTape(); setVcrMode('IDLE'); }} title="Eject" />

                {/* Adv VCR */}
                <Hitbox rectKey="vcrTracking" onClick={handleTrackingClick} title="Tracking" />
                <Hitbox rectKey="vcrSharpness" onClick={handleSharpnessClick} title="Sharpness" />
                <Hitbox rectKey="vcrSpeed" onClick={onTapeSpeedChange} title="Tape Speed" />
                <Hitbox rectKey="vcrLock" onClick={handleChildLockToggle} title="Child Lock" isActive={childLock} />

                {/* Custom User Mappable Hitboxes */}
                {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((num) => (
                    <Hitbox
                        key={`custom${num}`}
                        rectKey={`custom${num}` as MapKeys}
                        title={`Custom Button ${num}`}
                        onClick={() => console.log(`Custom Button ${num} was clicked!`)}
                        className={isEditMode ? "bg-purple-500/20 shadow-[0_0_5px_rgba(168,85,247,0.5)] border border-purple-500/50" : ""}
                    />
                ))}

                {/* LED Overlays */}
                {(isVcrOn && childLock) || isEditMode ? <div className={`absolute z-40 w-1.5 h-1.5 rounded-full ${isEditMode ? 'bg-red-500/30' : 'bg-red-500'} shadow-[0_0_8px_rgba(255,0,0,0.8)] pointer-events-none`} style={{ top: `${mapData.vcrLock.top}%`, left: `${mapData.vcrLock.left + 5}%` }} /> : null}
                {isOn || isEditMode ? <div className={`absolute z-40 w-1.5 h-1.5 rounded-full ${isEditMode ? 'bg-green-500/30' : 'bg-green-500'} shadow-[0_0_8px_rgba(0,255,0,0.8)] pointer-events-none`} style={{ top: `${mapData.tvPower.top - 1}%`, left: `${mapData.tvPower.left + mapData.tvPower.width / 2}%` }} /> : null}

                <div className="absolute bottom-4 left-4 text-white/30 text-xs font-mono pointer-events-none">
                    Hover over elements to target buttons.<br />
                    {isEditMode ? <span className="text-blue-400 font-bold">CALIBRATION MODE ACTIVE</span> : import.meta.env.DEV && <span className="text-red-400">DEV MODE: Red borders visible.</span>}
                </div>
            </div>

            <button
                onClick={onClose}
                className="fixed top-4 left-4 z-[999] p-2 bg-red-600/80 hover:bg-red-500 text-white rounded-lg shadow-lg backdrop-blur-sm font-bold border border-red-400"
                title="Return to Studio Setup"
            >
                EXIT LIVING ROOM TV
            </button>

            {/* --- CALIBRATION UI PANEL --- */}
            <button
                onClick={() => {
                    setIsEditMode(!isEditMode);
                    if (isEditMode) setSelectedHitbox(null);
                }}
                className={`fixed top-4 right-4 z-[999] p-2 rounded-full shadow-lg ${isEditMode ? 'bg-blue-600 text-white animate-pulse' : 'bg-white/10 text-white/50 hover:bg-white/20 hover:text-white backdrop-blur-sm'}`}
                title="Toggle Calibration Mode"
            >
                ⚙️
            </button>

            {isEditMode && (
                <div className="fixed top-16 right-4 z-[999] w-80 bg-gray-900/95 backdrop-blur-md rounded-xl border border-white/20 p-4 shadow-2xl text-white font-sans text-sm flex flex-col gap-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <h2 className="font-bold tracking-wider text-blue-400">LAYOUT EDITOR</h2>
                        <button onClick={copyMapToClipboard} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 transition-colors rounded text-xs font-bold text-white">Copy JSON</button>
                    </div>

                    {/* Global Settings */}
                    <div className="flex flex-col gap-2 p-3 bg-black/40 rounded border border-white/5">
                        <span className="font-mono text-xs text-white/50 uppercase">Background Image URL</span>
                        <input
                            type="text"
                            value={bgImage}
                            onChange={(e) => setBgImage(e.target.value)}
                            className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-blue-500 text-white"
                            placeholder="https://... or /bg.png"
                        />
                        <button onClick={resetDefaults} className="mt-2 w-full py-1 text-xs text-red-400 border border-red-500/30 hover:bg-red-500/20 rounded transition-colors">
                            Reset to Defaults
                        </button>
                    </div>

                    {!selectedHitbox ? (
                        <div className="text-center text-white/50 py-8 italic border-t border-white/5 mt-2">
                            Select and drag any hitbox to edit its position.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-2 bg-black/40 p-2 rounded border border-white/5">
                                <div className="flex items-center justify-between">
                                    <span className="font-mono text-xs text-blue-300">{selectedHitbox}</span>
                                    <button onClick={() => setSelectedHitbox(null)} className="text-white/40 hover:text-white text-xs">&times; Deselect</button>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <div className="text-[10px] text-white/50 uppercase">Label / Name</div>
                                    <input
                                        type="text"
                                        value={mapData[selectedHitbox as MapKeys].label || ''}
                                        onChange={(e) => handleMapStringChange(selectedHitbox as MapKeys, e.target.value)}
                                        className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-blue-500 text-white"
                                        onKeyDown={(e) => e.stopPropagation()}
                                        placeholder="E.g. TV Power"
                                    />
                                </div>
                            </div>

                            {(['top', 'left', 'width', 'height', ...(selectedHitbox === 'screen' ? ['borderRadius'] : [])] as const).map(prop => (
                                <div key={prop} className="flex flex-col gap-1">
                                    <div className="flex justify-between items-center text-xs text-white/70">
                                        <span className="uppercase">{prop === 'borderRadius' ? 'CURVATURE' : prop}</span>
                                        <div className="flex items-center gap-1 bg-black/40 px-1 py-0.5 rounded border border-white/10 hover:border-white/30 focus-within:border-blue-500">
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={Number(((mapData[selectedHitbox as MapKeys] as any)[prop] || 0).toFixed(2))}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    if (!isNaN(val)) handleMapChange(selectedHitbox as MapKeys, prop as any, val);
                                                }}
                                                className="w-14 bg-transparent text-right outline-none font-mono text-white hide-arrows"
                                                onKeyDown={(e) => e.stopPropagation()}
                                            />
                                            <span className="text-white/40 select-none">%</span>
                                        </div>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max={prop === 'borderRadius' ? "50" : "100"}
                                        step="0.1"
                                        value={(mapData[selectedHitbox as MapKeys] as any)[prop] || 0}
                                        onChange={(e) => handleMapChange(selectedHitbox as MapKeys, prop as any, parseFloat(e.target.value))}
                                        className="w-full cursor-pointer accent-blue-500"
                                    />
                                    <div className="flex justify-between mt-1">
                                        <button className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 rounded text-[10px]" onClick={() => handleMapChange(selectedHitbox as MapKeys, prop as any, ((mapData[selectedHitbox as MapKeys] as any)[prop] || 0) - 0.1)}>-0.1</button>
                                        <button className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 rounded text-[10px]" onClick={() => handleMapChange(selectedHitbox as MapKeys, prop as any, ((mapData[selectedHitbox as MapKeys] as any)[prop] || 0) + 0.1)}>+0.1</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


