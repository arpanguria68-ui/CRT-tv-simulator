import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3001;
const dbPath = join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());

const generateId = () => Math.random().toString(36).substr(2, 9).toUpperCase();

const initialChannels = [
    { id: 'CH1', name: 'WXYZ-TV (CH 7)' },
    { id: 'CH2', name: 'KROQ (CH 13)' },
    { id: 'CH3', name: 'RETRO-TV (CH 3)' }
];

const samplePrograms = [
    { id: generateId(), channelId: 'CH1', title: 'MORNING NEWS BROADCAST', type: 'news', startTime: '06:00', duration: 60, status: 'completed' },
    { id: generateId(), channelId: 'CH1', title: 'CARTOON BLOCK - TOM & JERRY', type: 'content', startTime: '07:00', duration: 30, url: 'https://youtube.com/watch?v=sample1', status: 'completed' },
    { id: generateId(), channelId: 'CH1', title: 'COMMERCIAL BREAK - COCA COLA', type: 'ad', startTime: '07:30', duration: 2, status: 'completed' },
    { id: generateId(), channelId: 'CH1', title: 'SITCOM - FRIENDS S01E01', type: 'content', startTime: '07:32', duration: 28, url: 'https://youtube.com/watch?v=sample2', status: 'playing' },

    { id: generateId(), channelId: 'CH2', title: 'MUSIC VIDEOS 80s', type: 'content', startTime: '06:00', duration: 120, url: 'https://youtube.com/watch?v=music1', status: 'playing' },

    { id: generateId(), channelId: 'CH3', title: 'INFOMERCIAL', type: 'ad', startTime: '06:00', duration: 180, url: 'https://youtube.com/watch?v=info1', status: 'playing' },
];

async function initDB() {
    try {
        await fs.access(dbPath);
        // Migration: If existing DB doesn't have channels, add them
        const data = JSON.parse(await fs.readFile(dbPath, 'utf8'));
        if (Array.isArray(data)) {
            console.log('Migrating old database to new schema with channels...');
            const migratedPrograms = data.map(p => ({ ...p, channelId: p.channelId || 'CH1' }));
            await fs.writeFile(dbPath, JSON.stringify({ channels: initialChannels, programs: migratedPrograms }, null, 2));
        }
    } catch {
        console.log('Creating initial db.json with multiple channels...');
        await fs.writeFile(dbPath, JSON.stringify({ channels: initialChannels, programs: samplePrograms }, null, 2));
    }
}

async function getDb() {
    const data = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(data);
}

async function saveDb(data) {
    await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
}

const addMinutes = (timeStr, minutes) => {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    d.setMinutes(d.getMinutes() + Math.round(minutes));
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const shiftChannelSchedule = (db, channelId, startingProgramId) => {
    const channelProgs = db.programs.filter(p => p.channelId === channelId);
    channelProgs.sort((a, b) => a.startTime.localeCompare(b.startTime));

    const startIndex = channelProgs.findIndex(p => p.id === startingProgramId);
    if (startIndex === -1) return;

    for (let i = startIndex + 1; i < channelProgs.length; i++) {
        const prevProg = channelProgs[i - 1];
        channelProgs[i].startTime = addMinutes(prevProg.startTime, prevProg.duration);
    }
};

initDB().then(() => {
    // --- CHANNELS API ---
    app.get('/api/channels', async (req, res) => {
        try {
            const db = await getDb();
            res.json(db.channels);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/channels', async (req, res) => {
        try {
            const db = await getDb();
            const newChannel = { id: `CH${Date.now()}`, name: req.body.name };
            db.channels.push(newChannel);
            await saveDb(db);
            res.status(201).json(newChannel);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.put('/api/channels/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const db = await getDb();
            const index = db.channels.findIndex(c => c.id === id);
            if (index === -1) return res.status(404).json({ error: 'Not found' });

            db.channels[index] = { ...db.channels[index], ...req.body, id };
            await saveDb(db);
            res.json(db.channels[index]);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.delete('/api/channels/:id', async (req, res) => {
        try {
            const { id } = req.params;
            let db = await getDb();

            // Cannot delete if it's the only channel
            if (db.channels.length <= 1) {
                return res.status(400).json({ error: 'Cannot delete the last channel' });
            }

            const initialLength = db.channels.length;
            db.channels = db.channels.filter(c => c.id !== id);

            if (db.channels.length === initialLength) return res.status(404).json({ error: 'Not found' });

            // Automatically reassign programs to the first available channel if their channel is deleted
            const firstAvailableChannelId = db.channels[0].id;
            db.programs = db.programs.map(p =>
                p.channelId === id ? { ...p, channelId: firstAvailableChannelId } : p
            );

            await saveDb(db);
            res.status(204).send();
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // --- PROGRAMS API ---
    app.get('/api/programs', async (req, res) => {
        try {
            const db = await getDb();
            db.programs.sort((a, b) => a.startTime.localeCompare(b.startTime));
            res.json(db.programs);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/programs', async (req, res) => {
        try {
            const db = await getDb();
            const newProg = {
                id: req.body.id,
                channelId: req.body.channelId || 'CH1',
                title: req.body.title,
                type: req.body.type,
                startTime: req.body.startTime,
                duration: req.body.duration,
                url: req.body.url,
                status: req.body.status || 'scheduled'
            };
            db.programs.push(newProg);

            if (req.body.shiftSchedule) {
                shiftChannelSchedule(db, newProg.channelId, newProg.id);
            }

            await saveDb(db);
            res.status(201).json(newProg);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.put('/api/programs/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const db = await getDb();
            const index = db.programs.findIndex(p => p.id === id);
            if (index === -1) return res.status(404).json({ error: 'Not found' });

            db.programs[index] = {
                ...db.programs[index],
                channelId: req.body.channelId,
                title: req.body.title,
                type: req.body.type,
                startTime: req.body.startTime,
                duration: req.body.duration,
                url: req.body.url,
                id
            };

            if (req.body.shiftSchedule) {
                shiftChannelSchedule(db, db.programs[index].channelId, id);
            }

            await saveDb(db);
            res.json(db.programs[index]);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.delete('/api/programs/:id', async (req, res) => {
        try {
            const { id } = req.params;
            let db = await getDb();
            const initialLength = db.programs.length;

            // To shift schedule on delete, we need the program's channel before removing it
            const deletedProg = db.programs.find(p => p.id === id);
            if (!deletedProg) return res.status(404).json({ error: 'Not found' });

            // If we delete a program, the next program should pull back. 
            // We can do this by setting its duration to 0 and shifting, then removing it.
            if (req.query.shiftSchedule === 'true') {
                deletedProg.duration = 0;
                shiftChannelSchedule(db, deletedProg.channelId, deletedProg.id);
            }

            db.programs = db.programs.filter(p => p.id !== id);

            await saveDb(db);
            res.status(204).send();
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // --- UTILS API ---
    app.post('/api/video-info', (req, res) => {
        const { url } = req.body;
        if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
            return res.json({ lengthSeconds: null });
        }

        https.get(url, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                const match = data.match(/"lengthSeconds":"(\d+)"/);
                if (match && match[1]) {
                    return res.json({ lengthSeconds: parseInt(match[1]) });
                }
                res.json({ lengthSeconds: null });
            });
        }).on('error', () => {
            res.json({ lengthSeconds: null });
        });
    });

    app.listen(port, () => console.log(`TV Simulator Backend running on http://localhost:${port}`));
});
