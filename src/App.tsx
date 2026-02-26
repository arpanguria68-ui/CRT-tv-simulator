import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, Square,
  Plus, Trash2, Calendar, Tv, Radio,
  AlertTriangle, CheckCircle, XCircle,
  Database, Film, Monitor, Volume2, VolumeX,
  FastForward, Rewind, Save, Upload, Download, Edit2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

import CrtApp from './components/CrtApp';
import type { Channel, Program } from './types';
import { SyncedVideoPlayer } from './components/SyncedVideoPlayer';

interface SystemStatus {
  isLive: boolean;
  currentProgram: Program | null;
  nextProgram: Program | null;
  signalStrength: number;
  audioLevel: number;
  temperature: number;
}

// Utility functions
const generateId = () => Math.random().toString(36).substr(2, 9).toUpperCase();

const formatTime = (date: Date) => {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

const getNextProgramTime = (startTime: string, durationMin: number) => {
  const [hours, mins] = startTime.split(':').map(Number);
  const totalMins = hours * 60 + mins + durationMin;
  const nextH = Math.floor(totalMins / 60) % 24;
  const nextM = totalMins % 60;
  return `${nextH.toString().padStart(2, '0')}:${nextM.toString().padStart(2, '0')}`;
};

const getDurationWidth = (duration: number) => {
  if (duration <= 5) return 'w-[100px] min-w-[100px]';
  if (duration <= 15) return 'w-[150px] min-w-[150px]';
  if (duration <= 30) return 'w-[250px] min-w-[250px]';
  if (duration <= 45) return 'w-[350px] min-w-[350px]';
  return 'w-[450px] min-w-[450px]';
};


// Using seeded data from backend
// Removed samplePrograms definition here

// SyncedVideoPlayer imported from components
// Main Component
function App() {
  const [isCrtMode, setIsCrtMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [channels, setChannels] = useState<Channel[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    isLive: true,
    currentProgram: null,
    nextProgram: null,
    signalStrength: 87,
    audioLevel: 65,
    temperature: 42
  });

  const [newProgramTitle, setNewProgramTitle] = useState('');
  const [newProgramUrl, setNewProgramUrl] = useState('');
  const [newProgramDuration, setNewProgramDuration] = useState('30');
  const [newProgramType, setNewProgramType] = useState<Program['type']>('content');
  const [newProgramTime, setNewProgramTime] = useState('12:00');
  const [isPlaying, setIsPlaying] = useState(true);
  const [volume, setVolume] = useState(75);
  const [logs, setLogs] = useState<string[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('epg');
  const scrollRef = useRef<HTMLDivElement>(null);

  const [newProgramChannel, setNewProgramChannel] = useState('');
  const [newProgramShift, setNewProgramShift] = useState(false);

  // Channel Management State
  const [showChannelDialog, setShowChannelDialog] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [newChannelName, setNewChannelName] = useState('');

  // Monitor Tab State
  const [monitoredChannelId, setMonitoredChannelId] = useState<string>('');

  // Helper to check if a program is actively playing right now
  const isProgramPlaying = useCallback((p: Program, date: Date) => {
    const [startH, startM] = p.startTime.split(':').map(Number);
    const startD = new Date(date);
    startD.setHours(startH, startM, 0, 0);

    // Handle overnight wraps
    if (startH > date.getHours() && (startH - date.getHours()) > 12) {
      startD.setDate(startD.getDate() - 1);
    }

    const endD = new Date(startD.getTime() + p.duration * 60000);
    return date >= startD && date < endD;
  }, []);

  const currentMonitoredProgram = React.useMemo(() => {
    if (!monitoredChannelId) return null;
    return programs.find(p => p.channelId === monitoredChannelId && isProgramPlaying(p, currentTime)) || null;
  }, [programs, monitoredChannelId, currentTime, isProgramPlaying]);

  const nextMonitoredProgram = React.useMemo(() => {
    if (!monitoredChannelId) return null;
    const channelProgs = programs.filter(p => p.channelId === monitoredChannelId);

    // Sort chronologically relative to current time rather than pure lexical
    channelProgs.sort((a, b) => {
      const getRelativeMs = (tStr: string) => {
        const [h, m] = tStr.split(':').map(Number);
        const d = new Date(currentTime);
        d.setHours(h, m, 0, 0);
        if (h < currentTime.getHours() && (currentTime.getHours() - h) > 12) {
          d.setDate(d.getDate() + 1);
        }
        return d.getTime();
      };
      return getRelativeMs(a.startTime) - getRelativeMs(b.startTime);
    });

    if (!channelProgs.length) return null;

    if (currentMonitoredProgram) {
      const idx = channelProgs.findIndex(p => p.id === currentMonitoredProgram.id);
      return idx >= 0 && idx < channelProgs.length - 1 ? channelProgs[idx + 1] : null;
    } else {
      // Look for the next upcoming program if nothing is playing right now
      return channelProgs.find(p => {
        const [startH, startM] = p.startTime.split(':').map(Number);
        const startD = new Date(currentTime);
        startD.setHours(startH, startM, 0, 0);
        if (startH < currentTime.getHours() && (currentTime.getHours() - startH) > 12) {
          startD.setDate(startD.getDate() + 1);
        }
        return startD > currentTime;
      }) || null;
    }
  }, [programs, monitoredChannelId, currentTime, currentMonitoredProgram]);

  // Fetch initial channels and programs from database
  useEffect(() => {
    Promise.all([
      fetch('http://localhost:3001/api/channels').then(res => res.json()),
      fetch('http://localhost:3001/api/programs').then(res => res.json())
    ]).then(([channelsData, programsData]) => {
      setChannels(channelsData);
      setPrograms(programsData);
      if (channelsData.length > 0) {
        setNewProgramChannel(channelsData[0].id);
        setMonitoredChannelId(channelsData[0].id);
      }
    }).catch(err => console.error('Failed to fetch data:', err));
  }, [setNewProgramChannel, setMonitoredChannelId]);

  // Clock update
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // System status simulation
  useEffect(() => {
    const timer = setInterval(() => {
      setSystemStatus(prev => ({
        ...prev,
        signalStrength: Math.min(100, Math.max(70, prev.signalStrength + (Math.random() - 0.5) * 4)),
        audioLevel: Math.min(100, Math.max(40, prev.audioLevel + (Math.random() - 0.5) * 10)),
        temperature: Math.min(60, Math.max(35, prev.temperature + (Math.random() - 0.5) * 2))
      }));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll EPG to current time on mount or tab change
  useEffect(() => {
    if (scrollRef.current && activeTab === 'epg') {
      // Radix ScrollArea root ref doesn't scroll; we need the viewport
      const viewport = scrollRef.current.querySelector('[data-slot="scroll-area-viewport"]')
        || scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');

      if (viewport) {
        const currentHour = currentTime.getHours();
        const currentMin = currentTime.getMinutes();
        const pixelsPerHour = 1100 / 24;
        // 100px for channel col + time elapsed * pixels per hour - 300px to center on screen
        const scrollPosition = 100 + (currentHour + currentMin / 60) * pixelsPerHour - 300;
        viewport.scrollLeft = Math.max(0, scrollPosition);
      }
    }
    // Only run when tab changes so user can manually scroll without it snapping back every second
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const addLog = useCallback((message: string) => {
    const timestamp = formatTime(new Date());
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 50));
  }, []);

  const handleEditClick = (prog: Program) => {
    setEditingProgramId(prog.id);
    setNewProgramTitle(prog.title);
    setNewProgramType(prog.type);
    setNewProgramTime(prog.startTime);
    setNewProgramDuration(prog.duration.toString());
    setNewProgramUrl(prog.url || '');
    setNewProgramChannel(prog.channelId);
    setShowAddDialog(true);
  };

  const fetchVideoDuration = async (): Promise<number> => {
    const userDuration = parseInt(newProgramDuration.toString()) || 30;
    if (!newProgramUrl || (!newProgramUrl.includes('youtube.com') && !newProgramUrl.includes('youtu.be'))) {
      return userDuration;
    }

    try {
      const res = await fetch('http://localhost:3001/api/video-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newProgramUrl })
      });
      const data = await res.json();

      if (data.lengthSeconds) {
        return Math.ceil(data.lengthSeconds / 60);
      }
    } catch (e) {
      console.error(e);
    }

    return userDuration;
  };

  const handleAddProgram = async () => {
    if (!newProgramTitle) {
      toast.error('PROGRAM TITLE REQUIRED');
      return;
    }

    const duration = await fetchVideoDuration();

    const newProgram = {
      id: generateId(),
      channelId: newProgramChannel,
      title: newProgramTitle.toUpperCase(),
      type: newProgramType,
      startTime: newProgramTime,
      duration: duration,
      url: newProgramUrl || undefined,
      status: 'scheduled',
      shiftSchedule: newProgramShift
    };

    try {
      const res = await fetch('http://localhost:3001/api/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProgram)
      });
      if (res.ok) {
        const savedProgram = await res.json();
        setPrograms(prev => {
          const updated = [...prev, savedProgram].sort((a, b) =>
            a.startTime.localeCompare(b.startTime)
          );
          return updated;
        });
        addLog(`SCHEDULED: ${savedProgram.title} AT ${newProgramTime}`);
        toast.success(`PROGRAM SCHEDULED: ${savedProgram.title}`);

        if (newProgramShift) {
          // If we shifted the schedule, we need to refresh all programs from the backend
          // so the frontend grid updates its layout.
          fetch('http://localhost:3001/api/programs')
            .then(r => r.json())
            .then(progs => setPrograms(progs));
        }

        setNewProgramTitle('');
        setNewProgramUrl('');
        setNewProgramDuration('30');
        setShowAddDialog(false);
      } else {
        toast.error('FAILED TO SCHEDULE PROGRAM TO DB');
      }
    } catch (err) {
      console.error(err);
      toast.error('NETWORK ERROR');
    }
  };

  const handleUpdateProgram = async () => {
    if (!newProgramTitle || !editingProgramId) return;

    const existing = programs.find(p => p.id === editingProgramId);
    const duration = await fetchVideoDuration();

    const updatedData = {
      channelId: newProgramChannel,
      title: newProgramTitle.toUpperCase(),
      type: newProgramType,
      startTime: newProgramTime,
      duration: duration,
      url: newProgramUrl || undefined,
      status: existing?.status || 'scheduled',
      shiftSchedule: newProgramShift
    };

    try {
      const res = await fetch(`http://localhost:3001/api/programs/${editingProgramId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });
      if (res.ok) {
        const savedProgram = await res.json();
        setPrograms(prev => {
          const updated = prev.map(p => p.id === editingProgramId ? savedProgram : p).sort((a, b) =>
            a.startTime.localeCompare(b.startTime)
          );
          return updated;
        });
        addLog(`UPDATED: ${savedProgram.title}`);
        toast.success(`PROGRAM UPDATED: ${savedProgram.title}`);

        if (durationInfo.shiftSchedule) {
          fetch('http://localhost:3001/api/programs')
            .then(r => r.json())
            .then(progs => setPrograms(progs));
        }

        setShowAddDialog(false);
        setEditingProgramId(null);
        setNewProgramTitle('');
        setNewProgramUrl('');
        setNewProgramDuration('30');
      } else {
        toast.error('FAILED TO UPDATE DB');
      }
    } catch (err) {
      console.error(err);
      toast.error('NETWORK ERROR');
    }
  };

  const handleSave = () => {
    if (editingProgramId) {
      handleUpdateProgram();
    } else {
      handleAddProgram();
    }
  };

  const handleDeleteProgram = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:3001/api/programs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPrograms(prev => prev.filter(p => p.id !== id));
        addLog(`DELETED PROGRAM ID: ${id}`);
        toast.info('PROGRAM REMOVED FROM SCHEDULE');
      } else {
        toast.error('FAILED TO DELETE FROM DB');
      }
    } catch (err) {
      console.error(err);
      toast.error('NETWORK ERROR');
    }
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
    addLog(isPlaying ? 'TRANSMISSION PAUSED' : 'TRANSMISSION RESUMED');
  };

  const handleEmergencyStop = () => {
    setIsPlaying(false);
    setSystemStatus(prev => ({ ...prev, isLive: false }));
    addLog('!!! EMERGENCY STOP ACTIVATED !!!');
    toast.error('EMERGENCY STOP - SIGNAL CUT');
  };

  const handleGoLive = () => {
    setIsPlaying(true);
    setSystemStatus(prev => ({ ...prev, isLive: true }));
    addLog('>>> GOING LIVE <<<');
    toast.success('NOW BROADCASTING LIVE');
  };

  const handleSaveChannel = async () => {
    if (!newChannelName) {
      toast.error('CHANNEL NAME REQUIRED');
      return;
    }

    if (editingChannelId) {
      try {
        const res = await fetch(`http://localhost:3001/api/channels/${editingChannelId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newChannelName.toUpperCase() })
        });
        if (res.ok) {
          const updatedChannel = await res.json();
          setChannels(prev => prev.map(c => c.id === editingChannelId ? updatedChannel : c));
          toast.success(`CHANNEL UPDATED: ${updatedChannel.name}`);
          setShowChannelDialog(false);
          setEditingChannelId(null);
          setNewChannelName('');
        } else {
          toast.error('FAILED TO UPDATE CHANNEL');
        }
      } catch (err) {
        toast.error('NETWORK ERROR');
      }
    } else {
      try {
        const res = await fetch('http://localhost:3001/api/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newChannelName.toUpperCase() })
        });
        if (res.ok) {
          const newChannel = await res.json();
          setChannels(prev => [...prev, newChannel]);
          toast.success(`CHANNEL ADDED: ${newChannel.name}`);
          setShowChannelDialog(false);
          setNewChannelName('');
        } else {
          toast.error('FAILED TO ADD CHANNEL');
        }
      } catch (err) {
        toast.error('NETWORK ERROR');
      }
    }
  };

  const handleDeleteChannel = async (id: string) => {
    if (channels.length <= 1) {
      toast.error('CANNOT DELETE LAST CHANNEL');
      return;
    }
    try {
      const res = await fetch(`http://localhost:3001/api/channels/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setChannels(prev => prev.filter(c => c.id !== id));
        fetch('http://localhost:3001/api/programs')
          .then(r => r.json())
          .then(progs => setPrograms(progs));
        toast.info('CHANNEL REMOVED');
      } else {
        toast.error('FAILED TO DELETE CHANNEL');
      }
    } catch (err) {
      toast.error('NETWORK ERROR');
    }
  };

  const getStatusColor = (status: Program['status']) => {
    switch (status) {
      case 'playing': return 'text-green-400';
      case 'completed': return 'text-gray-500';
      case 'error': return 'text-red-400';
      default: return 'text-amber-400';
    }
  };

  const getTypeIcon = (type: Program['type']) => {
    switch (type) {
      case 'ad': return <span className="text-yellow-400">[ADS]</span>;
      case 'news': return <span className="text-cyan-400">[NEWS]</span>;
      case 'bumper': return <span className="text-purple-400">[BUMP]</span>;
      default: return <span className="text-green-400">[PROG]</span>;
    }
  };

  // Generate EPG hours
  const hours = Array.from({ length: 24 }, (_, i) => i);

  if (isCrtMode) {
    return (
      <CrtApp
        programs={programs}
        channels={channels}
        currentTime={currentTime}
        onClose={() => setIsCrtMode(false)}
      />
    );
  }

  return (
    <div className="crt-container crt-flicker min-h-screen text-green-400 font-mono text-sm">
      <div className="noise-overlay" />

      {/* Header */}
      <header className="border-b-2 border-green-500 p-4 bg-black/80">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Tv className="w-8 h-8 text-glow" />
            <div>
              <h1 className="text-2xl font-bold text-glow tracking-wider">
                BROADCAST CONTROL SYSTEM v2.4
              </h1>
              <p className="text-xs text-green-600">TV CHANNEL OPERATOR TERMINAL // STATION: WXYZ-TV</p>
            </div>
          </div>

          <div className="flex items-center gap-8">
            {/* Main Clock */}
            <div className="terminal-box px-6 py-2 text-center">
              <div className="text-xs text-green-600 mb-1">SYSTEM TIME</div>
              <div className="text-3xl font-bold text-glow tracking-widest">
                {currentTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
              <div className="text-xs text-green-600 mt-1">
                {currentTime.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit' }).toUpperCase()}
              </div>
            </div>

            {/* UTC Clock */}
            <div className="terminal-box-amber px-4 py-2 text-center">
              <div className="text-xs text-amber-600 mb-1">UTC TIME</div>
              <div className="text-xl font-bold text-amber-400 text-glow-amber">
                {currentTime.toISOString().substr(11, 8)}
              </div>
            </div>

            <Button
              onClick={() => setIsCrtMode(true)}
              variant="outline"
              className="border-green-500 text-green-400 hover:bg-green-900 bg-black h-full ml-4"
            >
              <Tv className="w-4 h-4 mr-2" />
              LAUNCH LIVING ROOM TV
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start bg-black border-b border-green-500 rounded-none mb-4">
            <TabsTrigger value="epg" className="data-[state=active]:bg-green-900 data-[state=active]:text-green-100">
              <Calendar className="w-4 h-4 mr-2" />
              EPG SCHEDULER
            </TabsTrigger>
            <TabsTrigger value="playlist" className="data-[state=active]:bg-green-900 data-[state=active]:text-green-100">
              <Film className="w-4 h-4 mr-2" />
              PLAYLIST
            </TabsTrigger>
            <TabsTrigger value="monitor" className="data-[state=active]:bg-green-900 data-[state=active]:text-green-100">
              <Monitor className="w-4 h-4 mr-2" />
              MONITOR
            </TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-green-900 data-[state=active]:text-green-100">
              <Database className="w-4 h-4 mr-2" />
              SYSTEM LOGS
            </TabsTrigger>
          </TabsList>

          {/* EPG Scheduler Tab */}
          <TabsContent value="epg" className="mt-0">
            <div className="grid grid-cols-12 gap-4">
              {/* Left Panel - Controls */}
              <div className="col-span-3 space-y-4">
                {/* Current Status */}
                <div className="terminal-box p-4">
                  <h3 className="text-lg font-bold mb-3 border-b border-green-500 pb-2">
                    <Radio className="w-5 h-5 inline mr-2" />
                    ON AIR STATUS
                  </h3>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span>SIGNAL:</span>
                      <Badge
                        variant={systemStatus.isLive ? "default" : "destructive"}
                        className={systemStatus.isLive ? 'bg-green-600' : 'bg-red-600'}
                      >
                        {systemStatus.isLive ? 'LIVE' : 'OFF AIR'}
                      </Badge>
                    </div>

                    <div className="flex justify-between items-center">
                      <span>STRENGTH:</span>
                      <span className={systemStatus.signalStrength > 80 ? 'text-green-400' : 'text-yellow-400'}>
                        {systemStatus.signalStrength.toFixed(1)}%
                      </span>
                    </div>

                    <div className="progress-bar">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${systemStatus.signalStrength} % ` }}
                      />
                    </div>

                    <div className="flex justify-between items-center">
                      <span>AUDIO:</span>
                      <span>{systemStatus.audioLevel.toFixed(0)}%</span>
                    </div>

                    <div className="progress-bar">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${systemStatus.audioLevel} % ` }}
                      />
                    </div>

                    <div className="flex justify-between items-center">
                      <span>TEMP:</span>
                      <span className={systemStatus.temperature > 50 ? 'text-red-400' : 'text-green-400'}>
                        {systemStatus.temperature.toFixed(1)}°C
                      </span>
                    </div>
                  </div>
                </div>

                {/* Transport Controls */}
                <div className="terminal-box p-4">
                  <h3 className="text-lg font-bold mb-3 border-b border-green-500 pb-2">
                    TRANSPORT CONTROL
                  </h3>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addLog('REWIND 10 SEC')}
                      className="border-green-500 hover:bg-green-900"
                    >
                      <Rewind className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePlayPause}
                      className={`border - green - 500 ${isPlaying ? 'bg-green-900' : ''}`}
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addLog('FAST FORWARD 10 SEC')}
                      className="border-green-500 hover:bg-green-900"
                    >
                      <FastForward className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={handleGoLive}
                      className="bg-green-600 hover:bg-green-700 text-black font-bold"
                    >
                      <Play className="w-4 h-4 mr-1" />
                      GO LIVE
                    </Button>
                    <Button
                      onClick={handleEmergencyStop}
                      variant="destructive"
                      className="bg-red-600 hover:bg-red-700 text-white font-bold"
                    >
                      <Square className="w-4 h-4 mr-1" />
                      E-STOP
                    </Button>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => setVolume(v => Math.max(0, v - 10))}
                      className="p-1 border border-green-500 hover:bg-green-900"
                    >
                      <VolumeX className="w-4 h-4" />
                    </button>
                    <div className="flex-1 progress-bar h-4">
                      <div
                        className="progress-bar-fill h-full"
                        style={{ width: `${volume} % ` }}
                      />
                    </div>
                    <button
                      onClick={() => setVolume(v => Math.min(100, v + 10))}
                      className="p-1 border border-green-500 hover:bg-green-900"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-center text-xs mt-1">MASTER VOLUME: {volume}%</div>
                </div>

                {/* Quick Actions */}
                <div className="terminal-box p-4">
                  <h3 className="text-lg font-bold mb-3 border-b border-green-500 pb-2">
                    QUICK ACTIONS
                  </h3>
                  <div className="space-y-2">
                    <Button
                      onClick={() => {
                        setEditingProgramId(null);
                        setNewProgramTitle('');
                        setNewProgramUrl('');
                        setNewProgramDuration('30');
                        setShowAddDialog(true);
                      }}
                      className="w-full bg-green-600 hover:bg-green-700 text-black"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      ADD PROGRAM
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingChannelId(null);
                        setNewChannelName('');
                        setShowChannelDialog(true);
                      }}
                      className="w-full border-green-500 hover:bg-green-900"
                    >
                      <Tv className="w-4 h-4 mr-2" />
                      MANAGE CHANNELS
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => addLog('SCHEDULE EXPORTED TO TAPE')}
                      className="w-full border-green-500 hover:bg-green-900"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      EXPORT SCHEDULE
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => addLog('SCHEDULE IMPORTED FROM TAPE')}
                      className="w-full border-green-500 hover:bg-green-900"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      IMPORT SCHEDULE
                    </Button>
                  </div>
                </div>
              </div>

              {/* Right Panel - EPG Grid */}
              <div className="col-span-9">
                <div className="terminal-box p-4 h-full">
                  <div className="flex justify-between items-center mb-4 border-b border-green-500 pb-2">
                    <h3 className="text-lg font-bold">
                      <Calendar className="w-5 h-5 inline mr-2" />
                      ELECTRONIC PROGRAM GUIDE
                    </h3>
                    <div className="flex gap-4 text-xs">
                      <span className="text-green-400">[PROG] CONTENT</span>
                      <span className="text-yellow-400">[ADS] ADVERTISEMENT</span>
                      <span className="text-cyan-400">[NEWS] NEWS</span>
                      <span className="text-purple-400">[BUMP] BUMPER</span>
                    </div>
                  </div>

                  <ScrollArea className="h-[600px]" ref={scrollRef}>
                    <div className="min-w-[1200px] relative">
                      {/* Time Header */}
                      <div className="grid grid-cols-[100px_repeat(24,1fr)] gap-px bg-green-900/30 mb-2">
                        <div className="bg-black p-2 text-center font-bold">CHANNEL</div>
                        {hours.map(h => (
                          <div
                            key={h}
                            className={`bg - black p - 2 text - center text - xs ${h === currentTime.getHours() ? 'bg-green-900 text-glow' : ''
                              }`}
                          >
                            {h.toString().padStart(2, '0')}:00
                          </div>
                        ))}
                      </div>

                      {/* Channel Rows */}
                      <div className="space-y-px">
                        {channels.map(channel => (
                          <div key={channel.id} className="grid grid-cols-[100px_repeat(24,1fr)] gap-px bg-green-900/30">
                            <div className="bg-black/80 p-3 flex flex-col justify-center items-center font-bold border-r border-green-500 overflow-hidden break-all text-center">
                              <div className="flex items-center justify-center mb-1">
                                <Tv className="w-4 h-4 mr-1 shrink-0" />
                                <span className="text-xs">{channel.name}</span>
                              </div>
                            </div>
                            {hours.map(h => {
                              const hourPrograms = programs.filter(p => {
                                const progHour = parseInt(p.startTime.split(':')[0]);
                                return progHour === h && p.channelId === channel.id;
                              });

                              return (
                                <div
                                  key={`${channel.id}-${h}`}
                                  className={`bg-black/60 p-1 min-h-[80px] border-r border-green-900/30 hover:bg-green-900/20 cursor-pointer transition-colors ${h === currentTime.getHours() ? 'bg-green-900/20 border-green-500' : ''
                                    }`}
                                  onClick={() => {
                                    setNewProgramTime(`${h.toString().padStart(2, '0')}:00`);
                                    setShowAddDialog(true);
                                  }}
                                >
                                  {hourPrograms.map(prog => (
                                    <div
                                      key={prog.id}
                                      className={`text-xs p-1 mb-1 border-l-2 ${prog.status === 'playing'
                                        ? 'bg-green-900/50 border-green-400 animate-pulse'
                                        : prog.type === 'ad'
                                          ? 'bg-yellow-900/30 border-yellow-400'
                                          : prog.type === 'news'
                                            ? 'bg-cyan-900/30 border-cyan-400'
                                            : 'bg-green-900/20 border-green-400'
                                        }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                      }}
                                    >
                                      <div className="flex justify-between items-start mb-2">
                                        <div>
                                          <div className="font-bold truncate">{prog.title}</div>
                                          <div className="text-[10px] opacity-70">
                                            {prog.startTime} ({prog.duration}m)
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <Badge variant="outline" className={`
          text-[10px] px-1 py-0 h-4 
                                            ${prog.type === 'ad' ? 'border-yellow-600 text-yellow-500' : ''}
                                            ${prog.type === 'news' ? 'border-blue-600 text-blue-500' : ''}
                                            ${prog.type === 'bumper' ? 'border-purple-600 text-purple-500' : ''}
                                            ${prog.type === 'content' ? 'border-green-600 text-green-500' : ''}
          `}>
                                            {prog.type.toUpperCase()}
                                          </Badge>
                                        </div>
                                      </div>
                                      {prog.status === 'playing' && (
                                        <div className="text-[10px] text-green-400 font-bold">▶ ON AIR</div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>

                      {/* Current Time Indicator */}
                      <div
                        className="absolute top-0 bottom-0 w-px bg-red-500 z-10 pointer-events-none"
                        style={{
                          left: `${100 + (currentTime.getHours() + currentTime.getMinutes() / 60) * (1100 / 24)}px`
                        }}
                      >
                        <div className="absolute -top-2 -left-2 w-4 h-4 bg-red-500 rounded-full animate-pulse" />
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Playlist Tab */}
          <TabsContent value="playlist" className="mt-0">
            <div className="terminal-box p-4">
              <h3 className="text-lg font-bold mb-4 border-b border-green-500 pb-2">
                <Film className="w-5 h-5 inline mr-2" />
                CHANNEL PLAYLISTS
              </h3>
              <div className="relative pt-2">
                {/* Channels Y-Axis Guide */}
                <div className="absolute left-0 top-2 w-32 bottom-0 bg-transparent z-10 hidden md:block border-r border-green-800" />

                {channels.map(channel => {
                  const channelPrograms = programs.filter(p => p.channelId === channel.id);
                  return (
                    <div key={channel.id} className="relative flex min-w-max mb-2">
                      {/* Channel Label Header */}
                      <div className="sticky left-0 w-32 shrink-0 bg-[#0a0f0a] border-r border-green-800 flex items-center justify-center p-2 z-20">
                        <span className="font-bold text-center text-sm shadow-black drop-shadow-md">
                          {channel.name}
                        </span>
                      </div>

                      <div className="flex flex-1">
                        {channelPrograms.map((prog) => {
                          const isPast = prog.startTime < formatTime(currentTime);
                          const isCurrent = prog.startTime <= formatTime(currentTime) &&
                            getNextProgramTime(prog.startTime, prog.duration) > formatTime(currentTime);
                          const widthClass = getDurationWidth(prog.duration);

                          return (
                            <div
                              key={prog.id}
                              className={`
                                ${widthClass} border - r border - b border - green - 900 / 50 p - 2
                                ${isCurrent ? 'bg-green-900/40 border-green-500 shadow-[inset_0_0_10px_rgba(34,197,94,0.3)]' : ''}
                                ${isPast && !isCurrent ? 'opacity-50' : 'hover:bg-green-900/20'}
      transition - colors cursor - pointer group flex flex - col justify - between h - 24
        `}
                              onClick={() => {
                                if (!isPast || isCurrent) {
                                  setSystemStatus(prev => ({ ...prev, currentProgram: prog }));
                                }
                              }}
                            >
                              <div>
                                <div className="flex items-center gap-1 mb-1">
                                  <span className="text-xs text-green-500/80 font-mono">
                                    {prog.startTime}
                                  </span>
                                  {isCurrent && (
                                    <span className="text-[10px] bg-red-500/20 text-red-400 px-1 rounded animate-pulse">
                                      LIVE
                                    </span>
                                  )}
                                </div>
                                <div className="font-bold text-sm truncate group-hover:text-glow">
                                  {prog.title}
                                </div>
                              </div>
                              <div className="flex justify-between items-center mt-2">
                                <Badge variant="outline" className={`
      text - [10px] px - 1 py - 0 h - 4 
                                    ${prog.type === 'ad' ? 'border-yellow-600 text-yellow-500' : ''}
                                    ${prog.type === 'news' ? 'border-blue-600 text-blue-500' : ''}
                                    ${prog.type === 'bumper' ? 'border-purple-600 text-purple-500' : ''}
                                    ${prog.type === 'content' ? 'border-green-600 text-green-500' : ''}
      `}>
                                  {prog.type.toUpperCase()}
                                </Badge>
                                <span className="text-[10px] text-green-500/50">
                                  {prog.duration}M
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="terminal-box p-4 mt-4 relative">
              <h3 className="text-lg font-bold mb-4 border-b border-green-500 pb-2 flex items-center justify-between">
                <div>
                  <Tv className="w-5 h-5 inline mr-2" />
                  PROGRAM DETAILS
                </div>
              </h3>

              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {programs.map((prog, idx) => (
                    <div
                      key={prog.id}
                      className={`p - 3 border ${prog.status === 'playing'
                        ? 'border-green-400 bg-green-900/30'
                        : 'border-green-800 bg-black/50'
                        } `}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs">{idx + 1}.</span>
                            {getTypeIcon(prog.type)}
                            <span className={`font - bold ${getStatusColor(prog.status)} `}>
                              {prog.title}
                            </span>
                          </div>
                          <div className="text-xs text-green-600 mt-1 ml-12">
                            START: {prog.startTime} | DURATION: {prog.duration}min | ID: {prog.id}
                          </div>
                          {prog.url && (
                            <div className="text-xs text-green-700 mt-1 ml-12 truncate">
                              SOURCE: {prog.url}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {prog.status === 'scheduled' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setPrograms(prev => prev.map(p =>
                                    p.id === prog.id ? { ...p, status: 'playing' } : p
                                  ));
                                  addLog(`MANUAL START: ${prog.title} `);
                                }}
                                className="border-green-500 hover:bg-green-900 h-8 px-2"
                              >
                                <Play className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditClick(prog)}
                                className="border-green-500 hover:bg-green-900 h-8 px-2"
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteProgram(prog.id)}
                                className="border-red-500 hover:bg-red-900 h-8 px-2"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                          {prog.status === 'playing' && (
                            <Badge className="bg-green-600">ON AIR</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-4">
              <div className="terminal-box p-4">
                <h3 className="text-lg font-bold mb-4 border-b border-green-500 pb-2">
                  <CheckCircle className="w-5 h-5 inline mr-2" />
                  PROGRAM STATISTICS
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black/50 p-3 border border-green-800">
                    <div className="text-xs text-green-600">TOTAL PROGRAMS</div>
                    <div className="text-2xl font-bold">{programs.length}</div>
                  </div>
                  <div className="bg-black/50 p-3 border border-green-800">
                    <div className="text-xs text-green-600">TOTAL AIR TIME</div>
                    <div className="text-2xl font-bold">
                      {Math.floor(programs.reduce((a, p) => a + p.duration, 0) / 60)}h {(programs.reduce((a, p) => a + p.duration, 0) % 60)}m
                    </div>
                  </div>
                  <div className="bg-black/50 p-3 border border-green-800">
                    <div className="text-xs text-green-600">ADVERTISEMENTS</div>
                    <div className="text-2xl font-bold text-yellow-400">
                      {programs.filter(p => p.type === 'ad').length}
                    </div>
                  </div>
                  <div className="bg-black/50 p-3 border border-green-800">
                    <div className="text-xs text-green-600">CONTENT BLOCKS</div>
                    <div className="text-2xl font-bold text-green-400">
                      {programs.filter(p => p.type === 'content').length}
                    </div>
                  </div>
                </div>
              </div>

              <div className="terminal-box p-4">
                <h3 className="text-lg font-bold mb-4 border-b border-green-500 pb-2">
                  <AlertTriangle className="w-5 h-5 inline mr-2" />
                  SYSTEM ALERTS
                </h3>

                <div className="space-y-2">
                  {systemStatus.temperature > 50 && (
                    <div className="flex items-center gap-2 text-red-400 border border-red-500 p-2 bg-red-900/20">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-xs">HIGH TEMPERATURE WARNING: {systemStatus.temperature.toFixed(1)}°C</span>
                    </div>
                  )}
                  {systemStatus.signalStrength < 80 && (
                    <div className="flex items-center gap-2 text-yellow-400 border border-yellow-500 p-2 bg-yellow-900/20">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-xs">LOW SIGNAL STRENGTH: {systemStatus.signalStrength.toFixed(1)}%</span>
                    </div>
                  )}
                  {!systemStatus.isLive && (
                    <div className="flex items-center gap-2 text-red-400 border border-red-500 p-2 bg-red-900/20">
                      <XCircle className="w-4 h-4" />
                      <span className="text-xs">BROADCAST OFFLINE - SIGNAL CUT</span>
                    </div>
                  )}
                  {systemStatus.isLive && systemStatus.signalStrength >= 80 && systemStatus.temperature <= 50 && (
                    <div className="flex items-center gap-2 text-green-400 border border-green-500 p-2 bg-green-900/20">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-xs">ALL SYSTEMS NOMINAL</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Monitor Tab */}
          <TabsContent value="monitor" className="mt-0 data-[state=inactive]:hidden" forceMount>
            <div className="terminal-box p-4">
              <div className="flex justify-between items-center mb-4 border-b border-green-500 pb-2">
                <div className="flex items-center gap-4">
                  <h3 className="text-lg font-bold">
                    <Monitor className="w-5 h-5 inline mr-2" />
                    PREVIEW MONITOR
                  </h3>
                  <select
                    value={monitoredChannelId}
                    onChange={(e) => setMonitoredChannelId(e.target.value)}
                    className="bg-black border border-green-500 text-green-400 p-1 text-xs outline-none"
                  >
                    <option value="" disabled>SELECT CHANNEL</option>
                    {channels.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Badge className={isPlaying ? 'bg-green-600' : 'bg-red-600'}>
                    {isPlaying ? 'PREVIEW ACTIVE' : 'PREVIEW PAUSED'}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Program Preview */}
                <div className="flex flex-col h-full">
                  <div className="text-xs text-green-600 mb-2">PROGRAM PREVIEW</div>
                  <div className="aspect-video bg-black border-2 border-green-500 relative overflow-hidden flex-1 group">
                    {currentMonitoredProgram ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        {currentMonitoredProgram.url && isPlaying ? (
                          <SyncedVideoPlayer key={currentMonitoredProgram.id} program={currentMonitoredProgram} currentTime={currentTime} />
                        ) : (
                          // Visual placeholder if no URL or paused
                          <>
                            <div className="text-4xl mb-4 text-glow">📺</div>
                            <div className="text-lg font-bold text-center px-4 z-10">
                              {currentMonitoredProgram.title}
                            </div>
                            <div className="text-sm text-green-600 mt-2 z-10">
                              {currentMonitoredProgram.type === 'ad' ? 'COMMERCIAL' : 'PROGRAM CONTENT'}
                            </div>
                            {isPlaying && (
                              <div className="mt-4 flex items-center gap-2 z-10">
                                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                                <span className="text-xs font-bold text-red-500">LIVE</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-green-800">
                        <div className="text-center">
                          <div className="text-4xl mb-4">📺</div>
                          <div className="text-lg pb-1 border-b border-green-800">NO SIGNAL</div>
                          <div className="text-xs mt-2">AWAITING BROADCAST</div>
                        </div>
                      </div>
                    )}

                    {/* Scanlines overlay */}
                    <div className="absolute inset-0 scanlines pointer-events-none opacity-50 mix-blend-overlay" />

                    {/* Timecode overlay */}
                    <div className="absolute bottom-2 right-2 text-xs bg-black/80 text-green-400 px-2 py-1 z-20 border border-green-900 shadow-md">
                      TC: {formatTime(currentTime)}
                    </div>
                  </div>
                </div>

                {/* Next Program Preview */}
                <div className="flex flex-col h-full">
                  <div className="text-xs text-green-600 mb-2">NEXT PROGRAM</div>
                  <div className="aspect-video bg-black border-2 border-amber-500 relative overflow-hidden">
                    {nextMonitoredProgram ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        {nextMonitoredProgram.url ? (
                          <>
                            {(() => {
                              const match = nextMonitoredProgram.url.match(/[?&]v=([^&]+)/) || nextMonitoredProgram.url.match(/youtu\.be\/([^?]+)/);
                              const thumbUrl = match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
                              return thumbUrl ? (
                                <img
                                  src={thumbUrl}
                                  className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen saturate-50 sepia"
                                  alt="Next Program Thumbnail"
                                />
                              ) : null;
                            })()}
                            <div className="z-10 flex flex-col items-center justify-center opacity-90 p-4 bg-black/70 border border-amber-500/50 rounded shadow-lg backdrop-blur-sm">
                              <div className="text-4xl mb-2">⏭️</div>
                              <div className="text-lg font-bold text-center text-amber-400">
                                {nextMonitoredProgram.title}
                              </div>
                              <div className="text-sm text-amber-600 mt-1">
                                STARTS AT: {nextMonitoredProgram.startTime}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="opacity-60 flex flex-col items-center justify-center">
                            <div className="text-4xl mb-4">⏭️</div>
                            <div className="text-lg font-bold text-center px-4 text-amber-400">
                              {nextMonitoredProgram.title}
                            </div>
                            <div className="text-sm text-amber-600 mt-2">
                              STARTS AT: {nextMonitoredProgram.startTime}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center opacity-40">
                        <div className="text-center">
                          <div className="text-4xl mb-4">⏹️</div>
                          <div className="text-lg">END OF SCHEDULE</div>
                        </div>
                      </div>
                    )}

                    <div className="absolute inset-0 scanlines pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Waveform Monitor */}
              <div className="mt-4">
                <div className="text-xs text-green-600 mb-2">AUDIO WAVEFORM MONITOR</div>
                <div className="h-24 bg-black border border-green-500 relative overflow-hidden">
                  <svg className="absolute inset-0 w-full h-full">
                    <path
                      d={`M 0 50 ${Array.from({ length: 100 }, (_, i) => {
                        const x = (i / 100) * 1000;
                        const y = 50 + Math.sin(i * 0.5 + currentTime.getTime() / 100) * 30 * (systemStatus.audioLevel / 100);
                        return `L ${x} ${y}`;
                      }).join(' ')
                        } `}
                      fill="none"
                      stroke="#33ff33"
                      strokeWidth="2"
                    />
                  </svg>

                  {/* Grid lines */}
                  <div className="absolute inset-0" style={{
                    backgroundImage: 'linear-gradient(to right, #1a1a1a 1px, transparent 1px), linear-gradient(to bottom, #1a1a1a 1px, transparent 1px)',
                    backgroundSize: '50px 25px'
                  }} />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs" className="mt-0">
            <div className="terminal-box p-4">
              <h3 className="text-lg font-bold mb-4 border-b border-green-500 pb-2">
                <Database className="w-5 h-5 inline mr-2" />
                SYSTEM LOGS
              </h3>

              <ScrollArea className="h-[500px]">
                <div className="space-y-1 font-mono text-xs">
                  {logs.length === 0 ? (
                    <div className="text-green-600 italic">NO LOGS AVAILABLE...</div>
                  ) : (
                    logs.map((log, idx) => (
                      <div key={idx} className="border-b border-green-900/30 py-1">
                        <span className="text-green-600">{log}</span>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setLogs([])}
                  className="border-green-500 hover:bg-green-900"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  CLEAR LOGS
                </Button>
                <Button
                  variant="outline"
                  onClick={() => addLog('LOGS EXPORTED TO PRINTER')}
                  className="border-green-500 hover:bg-green-900"
                >
                  <Download className="w-4 h-4 mr-2" />
                  EXPORT LOGS
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main >

      {/* Footer Status Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-black border-t-2 border-green-500 p-2">
        <div className="flex justify-between items-center text-xs">
          <div className="flex gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              SYSTEM ONLINE
            </span>
            <span>|</span>
            <span>STATION: WXYZ-TV</span>
            <span>|</span>
            <span>CHANNEL: 7.1 HD</span>
          </div>

          <div className="flex gap-4">
            <span>MEM: 64KB OK</span>
            <span>|</span>
            <span>DISK: 360KB FREE</span>
            <span>|</span>
            <span>VER: 2.4.1</span>
          </div>
        </div>
      </footer>

      {/* Add Program Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-black border-2 border-green-500 text-green-400 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-green-400 text-glow flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {editingProgramId ? 'EDIT PROGRAM' : 'ADD NEW PROGRAM'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editingProgramId ? 'Edit the details of the selected program.' : 'Add a new program to the schedule.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs text-green-600 mb-1 block">CHANNEL</label>
              <select
                value={newProgramChannel}
                onChange={(e) => setNewProgramChannel(e.target.value)}
                className="w-full p-2 bg-black border-2 border-green-500 text-green-400 mb-4 outline-none"
              >
                {channels.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-green-600 mb-1 block">PROGRAM TITLE</label>
              <Input
                value={newProgramTitle}
                onChange={(e) => setNewProgramTitle(e.target.value)}
                placeholder="ENTER PROGRAM TITLE..."
                className="uppercase"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-green-600 mb-1 block">PROGRAM TYPE</label>
                <select
                  value={newProgramType}
                  onChange={(e) => setNewProgramType(e.target.value as Program['type'])}
                  className="w-full p-2 bg-black border-2 border-green-500 text-green-400"
                >
                  <option value="content">CONTENT</option>
                  <option value="ad">ADVERTISEMENT</option>
                  <option value="news">NEWS</option>
                  <option value="bumper">BUMPER</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-green-600 mb-1 block">START TIME</label>
                <Input
                  type="time"
                  value={newProgramTime}
                  onChange={(e) => setNewProgramTime(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-green-600 mb-1 block">DURATION (MINUTES)</label>
                <Input
                  type="number"
                  value={newProgramDuration}
                  onChange={(e) => setNewProgramDuration(e.target.value)}
                  min="1"
                  max="300"
                />
              </div>

              <div>
                <label className="text-xs text-green-600 mb-1 block">MEDIA URL (OPTIONAL)</label>
                <Input
                  value={newProgramUrl}
                  onChange={(e) => setNewProgramUrl(e.target.value)}
                  placeholder="YOUTUBE URL..."
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 mt-2 bg-black/50 p-2 border border-green-900">
              <input
                type="checkbox"
                id="shiftSchedule"
                checked={newProgramShift}
                onChange={(e) => setNewProgramShift(e.target.checked)}
                className="w-4 h-4 accent-green-600 bg-black border-green-500"
              />
              <label htmlFor="shiftSchedule" className="text-xs text-green-400 font-bold cursor-pointer select-none">
                SHIFT SUBSEQUENT SCHEDULE (PLAYLIST MODE)
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              className="flex-1 bg-green-600 hover:bg-green-700 text-black font-bold"
            >
              <Save className="w-4 h-4 mr-2" />
              {editingProgramId ? 'SAVE CHANGES' : 'SCHEDULE PROGRAM'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              className="border-red-500 hover:bg-red-900 text-red-400"
            >
              <XCircle className="w-4 h-4 mr-2" />
              CANCEL
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Channel Management Dialog */}
      <Dialog open={showChannelDialog} onOpenChange={setShowChannelDialog}>
        <DialogContent className="terminal-box bg-black border-2 border-green-500 max-w-md">
          <DialogHeader className="border-b border-green-500 pb-4 mb-4">
            <DialogTitle className="text-xl font-bold flex items-center">
              <Tv className="w-5 h-5 mr-2" />
              {editingChannelId ? 'EDIT CHANNEL' : 'ADD NEW CHANNEL'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editingChannelId ? 'Edit the name of the selected channel.' : 'Create a new channel for the Electronic Program Guide.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mb-6">
            <div>
              <label className="text-xs text-green-600 mb-1 block">CHANNEL NAME</label>
              <Input
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="E.G. WXYZ-TV (CH 7)"
                className="uppercase"
              />
            </div>

            {/* List existing channels to edit/delete */}
            <div className="mt-4 border border-green-900/50 p-2 max-h-[150px] overflow-y-auto">
              <label className="text-xs text-green-600 mb-2 block font-bold">EXISTING CHANNELS</label>
              <div className="space-y-1">
                {channels.map(c => (
                  <div key={c.id} className="flex justify-between items-center text-sm p-1 hover:bg-green-900/20">
                    <span>{c.name}</span>
                    <div className="flex gap-2">
                      <button onClick={() => {
                        setEditingChannelId(c.id);
                        setNewChannelName(c.name);
                      }} className="hover:text-yellow-400">
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDeleteChannel(c.id)} className="hover:text-red-400">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSaveChannel}
              className="flex-1 bg-green-600 hover:bg-green-700 text-black font-bold"
            >
              <Save className="w-4 h-4 mr-2" />
              {editingChannelId ? 'SAVE CHANNEL' : 'ADD CHANNEL'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowChannelDialog(false);
                setEditingChannelId(null);
                setNewChannelName('');
              }}
              className="border-red-500 hover:bg-red-900 text-red-400"
            >
              <XCircle className="w-4 h-4 mr-2" />
              CANCEL
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Padding for footer */}
      <div className="h-10" />
    </div>
  );
}

export default App;
