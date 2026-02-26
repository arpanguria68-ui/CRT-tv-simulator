export interface Channel {
    id: string;
    name: string;
    order: number;
}

export interface Program {
    id: string;
    channelId: string;
    title: string;
    startTime: string; // HH:mm format
    duration: number; // minutes
    type: 'content' | 'ad' | 'news' | 'bumper';
    status: 'scheduled' | 'playing' | 'completed' | 'error';
    url?: string; // Media URL for actual playback
}
