import { useState } from 'react';
import type { Program } from '../types';

export const SyncedVideoPlayer = ({ program, currentTime }: { program: Program, currentTime: Date }) => {
    const [initialOffset] = useState(() => {
        const [startH, startM] = program.startTime.split(':').map(Number);
        const startD = new Date(currentTime);
        startD.setHours(startH, startM, 0, 0);

        // Handle overnight programs (e.g., start 23:00, now 01:00)
        if (startH > currentTime.getHours() && (startH - currentTime.getHours()) > 12) {
            startD.setDate(startD.getDate() - 1);
        }

        return Math.max(0, Math.floor((currentTime.getTime() - startD.getTime()) / 1000));
    });

    const getYouTubeEmbedUrl = (url?: string, startSeconds: number = 0) => {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11)
            ? `https://www.youtube.com/embed/${match[2]}?autoplay=1&mute=1&controls=0&start=${startSeconds}`
            : null;
    };

    const embedUrl = getYouTubeEmbedUrl(program.url, initialOffset);

    if (embedUrl) {
        return (
            <iframe
                src={embedUrl}
                allow="autoplay; encrypted-media"
                className="absolute inset-0 w-full h-full pointer-events-none border-none"
                title={program.title}
                style={{ pointerEvents: 'none' }}
            />
        );
    }

    if (program.url) {
        return (
            <video
                src={program.url}
                autoPlay
                muted
                loop
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                onLoadedMetadata={(e) => {
                    e.currentTarget.currentTime = initialOffset;
                }}
            />
        );
    }

    return null;
};
