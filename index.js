// ============================================================
//  WA VoIP Bot - Free Script
//  Made by DNUZI  |  https://github.com/dnuzi/wa-voip-bot
// ============================================================

import * as B from '@dnuzi/baileys';
import Voip from '@dnuzi/baileys/voip';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import express from 'express';
import QRCode from 'qrcode';
import qrTerminal from 'qrcode-terminal';
import { spawn } from 'child_process';
import config from './config.js';

// ================= SETTINGS =================
const { prefix, texts } = config;
const clean = (n) => String(n).replace(/[^0-9]/g, '');
const NUMBER = clean(config.number);
const OWNERS = [NUMBER, ...config.owners.map(clean)];
const MONGODB_URI = config.mongodbUri;
const SESSION_ID = config.sessionId;
const AUDIO_URL = config.audioUrl;
const VIDEO_URL = config.videoUrl;
const USE_PAIR = config.connectMode !== 'qr';

if (!MONGODB_URI) {
    console.log('❌ MONGODB_URI is missing. Set it as an environment variable or in config.js');
    process.exit(1);
}
if (USE_PAIR && (!NUMBER || NUMBER.includes('X'))) {
    console.log('❌ Set your number in config.js (number) for pairing code login');
    process.exit(1);
}

// ================= BAILEYS EXPORTS =================
const pick = (name) => B[name] ?? B.default?.[name] ?? B.default?.default?.[name];

const makeWASocket =
    typeof B.default === 'function' ? B.default :
    typeof B.default?.default === 'function' ? B.default.default :
    pick('makeWASocket');

const useMultiFileAuthState = pick('useMultiFileAuthState');
const DisconnectReason = pick('DisconnectReason');
const fetchLatestBaileysVersion = pick('fetchLatestBaileysVersion');
const makeCacheableSignalKeyStore = pick('makeCacheableSignalKeyStore');

if (typeof useMultiFileAuthState !== 'function') {
    console.log('❌ Baileys exports:', Object.keys(B), Object.keys(B.default || {}));
    process.exit(1);
}

let FFPROBE = 'ffprobe';
try {
    const m = await import('ffprobe-static');
    FFPROBE = m.default?.path || m.path || 'ffprobe';
} catch {}

let FFMPEG = 'ffmpeg';
try {
    const m = await import('ffmpeg-static');
    FFMPEG = m.default || FFMPEG;
} catch {}

// make bundled ffmpeg/ffprobe visible to the voip library (it searches PATH)
for (const bin of [FFMPEG, FFPROBE]) {
    if (bin && bin.includes(path.sep)) {
        process.env.PATH = path.dirname(path.resolve(bin)) + path.delimiter + process.env.PATH;
    }
}

// ================= MESSAGE STYLES =================
const statusIcon = () => (CALL_ON ? '🟢 *ON*' : '🔴 *OFF*');

const MENU_TEXT = () =>
`📞 *${config.botName}*
_Free script • by ${config.ownerName}_

*Auto Call:* ${statusIcon()}

*Commands*
▫️ \`${prefix}call on\` — enable auto call
▫️ \`${prefix}call off\` — disable auto call
▫️ \`${prefix}call\` — check status
▫️ \`${prefix}call-menu\` — show this menu
▫️ \`${prefix}c-ping\` — check speed

*How it works*
Audio call → voice file
Video call → video file

👤 *Owner:* ${config.ownerName}
🔗 ${config.repoUrl}

${texts.freeNote}
${texts.footer}`;

const STATUS_TEXT = () =>
`📞 *Auto Call:* ${statusIcon()}

${CALL_ON
    ? 'Incoming calls, group calls and answered outgoing calls will play your media automatically.'
    : 'The bot will ignore all calls until you turn it on.'}

Use \`${prefix}call-menu\` for all commands.

${texts.footer}`;

// ================= SETTINGS (ON/OFF) =================
const Setting = mongoose.model('Setting', new mongoose.Schema({
    key: { type: String, unique: true },
    value: mongoose.Schema.Types.Mixed,
}));

let CALL_ON = config.autoCallDefault;

async function loadSettings() {
    const s = await Setting.findOne({ key: 'autoCall' });
    if (s) CALL_ON = !!s.value;
    console.log('📞 Auto call:', CALL_ON ? 'ON' : 'OFF');
}

async function setCallOn(v) {
    CALL_ON = v;
    await Setting.findOneAndUpdate({ key: 'autoCall' }, { value: v }, { upsert: true });
}

// ================= MEDIA =================
const pcmCache = new Map();
const fileCache = new Map();
const endedCalls = new Set();
const waiters = new Map();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function downloadFile(url, file) {
    // also try the direct raw.githubusercontent.com link (skips one redirect)
    const direct = url.startsWith('https://github.com/')
        ? url.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/raw/refs/heads/', '/refs/heads/')
        : url;

    let lastErr;
    for (const u of new Set([url, direct])) {
        for (let i = 1; i <= 3; i++) {
            try {
                const res = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': UA, Accept: '*/*' } });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
                return;
            } catch (e) {
                lastErr = e;
                console.log(`⚠️ download try ${i} failed (${u.slice(0, 60)}...): ${e.message}`);
                await sleep(1500 * i);
            }
        }
    }
    throw new Error('download failed: ' + lastErr.message);
}

async function getPcm(url) {
    if (pcmCache.has(url)) return pcmCache.get(url);
    fs.mkdirSync('./tmp', { recursive: true });

    let file;
    if (/^https?:\/\//i.test(url)) {
        file = './tmp/media_' + Buffer.from(url).toString('hex').slice(-16) + (path.extname(new URL(url).pathname) || '.bin');
        if (!fs.existsSync(file) || fs.statSync(file).size === 0) await downloadFile(url, file);
        console.log('⬇️ ready', fs.statSync(file).size, 'bytes');
    } else {
        file = url; // local file, e.g. './media/voice.opus'
        if (!fs.existsSync(file)) throw new Error('local file not found: ' + file);
        console.log('📁 using local file', file);
    }

    const buf = await new Promise((resolve, reject) => {
        const ff = spawn(FFMPEG, ['-v', 'error', '-i', file, '-f', 'f32le', '-ar', '16000', '-ac', '1', 'pipe:1']);
        const chunks = [];
        ff.stdout.on('data', d => chunks.push(d));
        ff.stderr.on('data', d => console.log('ffmpeg:', String(d).slice(0, 300)));
        ff.on('error', reject);
        ff.on('close', (code) => { console.log('ffmpeg exit code:', code); resolve(Buffer.concat(chunks)); });
    });

    const pcm = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    console.log('🎧 decoded samples:', pcm.length, `(~${(pcm.length / 16000).toFixed(1)}s)`);
    fileCache.set(url, path.resolve(file));
    if (pcm.length > 0) pcmCache.set(url, pcm);
    return pcm;
}

async function playAudioOnCall(voip, callId, url) {
    const co = voip.coordinator;
    const all = await getPcm(url);
    if (!all.length) return false;
    const file = fileCache.get(url);
    const secs = all.length / 16000;

    let done;
    const finished = new Promise(r => { done = r; });
    waiters.set(callId, done);

    // method 1: loadAudio
    try {
        await co.loadAudio(callId, file);
        console.log('▶️ loadAudio OK, playing ~' + secs.toFixed(0) + 's');
        await Promise.race([finished, sleep((secs + 3) * 1000)]);
        waiters.delete(callId);
        console.log('🎵 audio finished (loadAudio)');
        return true;
    } catch (e) {
        console.log('loadAudio error:', e.message);
    }

    // method 2: feedLiveAudio
    try { co.setExternalAudioMode?.(callId, true); console.log('externalAudioMode ON'); }
    catch (e) { console.log('setExternalAudioMode error:', e.message); }

    const FRAME = 320;
    let pos = 0, logged = false, failed = false;
    while (pos < all.length && !endedCalls.has(callId) && !failed) {
        const frame = all.slice(pos, pos + FRAME);
        pos += FRAME;
        try {
            await co.feedLiveAudio(callId, frame);
            if (!logged) { logged = true; console.log('✅ first audio frame fed'); }
        } catch (e) {
            console.log('feedLiveAudio error:', e.message);
            failed = true;
        }
        await sleep(20);
    }
    waiters.delete(callId);
    console.log('🎵 audio feed finished', failed ? '(error)' : '');
    return logged;
}

// Convert the video to a small, call-friendly version (480px, baseline H.264, low bitrate)
async function makeCallVideo(src) {
    const out = src.replace(/\.[^.]+$/, '') + '_call.mp4';
    if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;
    await new Promise((resolve, reject) => {
        const ff = spawn(FFMPEG, [
            '-y', '-v', 'error', '-i', src,
            '-vf', 'scale=480:-2,fps=24',
            '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-pix_fmt', 'yuv420p',
            '-b:v', '500k', '-maxrate', '600k', '-bufsize', '1200k', '-g', '48',
            '-c:a', 'aac', '-b:a', '64k', '-ar', '48000', '-ac', '1',
            '-movflags', '+faststart', out,
        ]);
        ff.stderr.on('data', d => console.log('ffmpeg:', String(d).slice(0, 300)));
        ff.on('error', reject);
        ff.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code)));
    });
    return out;
}

async function playVideoOnCall(voip, callId, url) {
    const co = voip.coordinator;
    const pcm = await getPcm(url);
    let file = fileCache.get(url);
    if (!file) return false;
    try { file = await makeCallVideo(file); console.log('🎬 call video ready:', file); }
    catch (e) { console.log('video convert error:', e.message); }
    const secs = pcm.length ? pcm.length / 16000 : 30;

    let done;
    const finished = new Promise(r => { done = r; });
    waiters.set(callId, done);

    let ok = false;
    try {
        await co.loadVideo(callId, file);
        console.log('🎥 loadVideo OK');
        ok = true;
    } catch (e) {
        console.log('loadVideo error:', e.message);
    }
    if (ok && pcm.length) {
        try {
            await co.loadAudio(callId, file);
            console.log('🔊 loadAudio (video sound) OK');
        } catch (e) {
            console.log('loadAudio(video) error:', e.message);
        }
    }
    if (ok) {
        await Promise.race([finished, sleep((secs + 3) * 1000)]);
        console.log('🎞️ video finished');
    }
    waiters.delete(callId);
    return ok;
}

// ================= SESSION =================
const SESSION_DIR = './session';
const Session = mongoose.model('Session', new mongoose.Schema({
    sessionId: { type: String, unique: true },
    data: { type: Object, default: {} },
}, { minimize: false }));

async function restoreSession() {
    const s = await Session.findOne({ sessionId: SESSION_ID });
    if (!s) return false;
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    for (const f in s.data) fs.writeFileSync(path.join(SESSION_DIR, f), s.data[f]);
    console.log('✅ Session restored from MongoDB');
    return true;
}

async function saveSession() {
    try {
        if (!fs.existsSync(SESSION_DIR)) return;
        const data = {};
        for (const f of fs.readdirSync(SESSION_DIR)) {
            data[f] = fs.readFileSync(path.join(SESSION_DIR, f), 'utf-8');
        }
        await Session.findOneAndUpdate({ sessionId: SESSION_ID }, { data }, { upsert: true });
        console.log('💾 Session saved');
    } catch (e) {
        console.log('Save error:', e.message);
    }
}

let saveTimer;
const debouncedSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSession, 5000);
};

// ================= VOIP =================
const handled = new Set();      // calls already played / playing (prevents duplicates)
const pendingOut = new Map();   // outgoing calls waiting for the other side to answer

async function runPlayback(voip, sock, callId, isVideo, replyJid) {
    if (handled.has(callId)) return;
    handled.add(callId);
    try {
        let played = false;
        if (isVideo) {
            played = await playVideoOnCall(voip, callId, VIDEO_URL).catch(e => {
                console.log('video play error:', e.message);
                return false;
            });
        }
        if (isVideo && !played) console.log('⚠️ video failed → falling back to audio');
        if (!played) {
            played = await playAudioOnCall(voip, callId, AUDIO_URL).catch(e => {
                console.log('play error:', e.message);
                return false;
            });
        }
        if (!played) {
            // fallback: use the sound of the video file if the audio file failed
            played = await playAudioOnCall(voip, callId, VIDEO_URL).catch(() => false);
        }
        if (!played) {
            try { await sock.sendMessage(replyJid, { text: `${texts.fail}\n\n${texts.footer}` }); } catch {}
        }
        await sleep(1500);
        await voip.hangup(callId).catch(() => {});
    } finally {
        setTimeout(() => handled.delete(callId), 60000);
    }
}

const ANSWERED_RE = /connected|active|answered|in_call|incall|established|accepted/i;

async function setupVoip(sock) {
    fs.mkdirSync('./tmp', { recursive: true });
    const voip = new Voip(sock, {
        ffprobePath: FFPROBE,
        voipLogLevel: config.voip.logLevel,
        tmpDir: './tmp',
        maxConcurrentCalls: config.voip.maxConcurrentCalls,
    });

    try { await getPcm(AUDIO_URL); } catch (e) { console.log('❌ preload audio error:', e.message); }
    try { await getPcm(VIDEO_URL); await makeCallVideo(fileCache.get(VIDEO_URL)); }
    catch (e) { console.log('❌ preload video error:', e.message); }

    await voip.listen();
    console.log('📡 Voip listening');

    // call_incoming covers:
    // 1) a normal audio/video call
    // 2) the bot being added to a group call
    // 3) your own outgoing call (waits until the other side answers)
    voip.on('call_incoming', async (call) => {
        const callId = call.callId;
        const from = call.peerJid;
        const groupJid = call.groupJid || (String(from).endsWith('@g.us') ? from : null);
        const replyJid = groupJid || from;
        const isVideo = call.video === true || call.isVideo === true ||
            /video/i.test(String(call.mediaType ?? call.media ?? call.type ?? ''));
        const outgoing = String(call.direction || '').toLowerCase().includes('out');

        if (!CALL_ON) {
            console.log('⏸️ auto call OFF → ignore:', from);
            return;
        }

        console.log(`📞 ${outgoing ? 'OUTGOING' : 'INCOMING'} ${groupJid ? 'GROUP ' : ''}${isVideo ? 'video' : 'audio'} call | ${from}`);
        console.log('mediaType:', call.mediaType, '| keys:', Object.keys(call).join(','));

        if (outgoing) {
            pendingOut.set(callId, { isVideo, replyJid });
            return;
        }

        try {
            await voip.acceptCall(callId);
            console.log('✅ Call accepted:', callId);
            await runPlayback(voip, sock, callId, isVideo, replyJid);
        } catch (e) {
            console.log('❌ Accept error:', e.message);
            try { await voip.rejectCall(callId); } catch {}
            try { await sock.sendMessage(replyJid, { text: `${texts.fail}\n\n${texts.footer}` }); } catch {}
        }
    });

    const onAnswered = (c, raw) => {
        const id = c?.callId ?? c?.call?.callId;
        const info = pendingOut.get(id);
        if (!CALL_ON || !info) return;
        console.log('📲 Answered by peer:', id, raw ? '(' + raw.slice(0, 80) + ')' : '');
        pendingOut.delete(id);
        runPlayback(voip, sock, id, info.isVideo, info.replyJid);
    };

    voip.on('call_state', (c) => {
        const s = JSON.stringify(c?.state ?? c?.stateData ?? c) || '';
        if (ANSWERED_RE.test(s)) onAnswered(c, s);
    });
    voip.on('call_answered', (c) => onAnswered(c, 'call_answered'));
    voip.on('call_connected', (c) => onAnswered(c, 'call_connected'));
    voip.on('call_accepted', (c) => onAnswered(c, 'call_accepted'));

    voip.on('call_ended', (c) => {
        console.log('📴 Call ended', c?.callId, '| reason:', c?.endReason ?? c?.reason ?? '');
        endedCalls.add(c?.callId);
        pendingOut.delete(c?.callId);
        waiters.get(c?.callId)?.();
    });
    voip.on('call_outbound_audio_finished', (c) => {
        waiters.get(c?.callId ?? c?.call?.callId)?.();
    });
    voip.on('call_error', (e) => console.log('Call error:', e?.message ?? e));

    return voip;
}

// ================= COMMANDS =================
async function handleCommand(sock, m) {
    const body =
        m.message.conversation ||
        m.message.extendedTextMessage?.text ||
        m.message.imageMessage?.caption || '';
    const text = body.trim().toLowerCase();
    if (!text.startsWith(prefix)) return;

    const [name, arg, extra] = text.slice(prefix.length).split(/\s+/);
    const jid = m.key.remoteJid;

    const isCall = name === 'call' && !extra && (arg === undefined || arg === 'on' || arg === 'off');
    const isMenu = name === 'call-menu' && arg === undefined;
    const isPing = name === 'c-ping' && arg === undefined;
    if (!isCall && !isMenu && !isPing) return;

    const sender = (m.key.participant || jid).split('@')[0].split(':')[0];
    const isOwner = m.key.fromMe || OWNERS.includes(sender);
    if (!isOwner) {
        await sock.sendMessage(jid, { text: `${texts.ownerOnly}\n\n${texts.footer}` }, { quoted: m });
        return;
    }

    if (isMenu) {
        await sock.sendMessage(jid, { text: MENU_TEXT() }, { quoted: m });
        return;
    }

    if (isCall) {
        if (arg === 'on') await setCallOn(true);
        if (arg === 'off') {
            await setCallOn(false);
            pendingOut.clear();
        }
        await sock.sendMessage(jid, { text: STATUS_TEXT() }, { quoted: m });
        return;
    }

    if (isPing) {
        const t = Date.now();
        const sent = await sock.sendMessage(jid, { text: '🏓 Pinging...' }, { quoted: m });
        const ms = Date.now() - t;
        const result = `🏓 *Pong!*\n⚡ Speed: *${ms} ms*\n\n${texts.footer}`;
        try {
            await sock.sendMessage(jid, { text: result, edit: sent.key });
        } catch {
            await sock.sendMessage(jid, { text: result });
        }
    }
}

// ================= LOGIN + WEB SERVER =================
let latestQR = null;
let latestPairCode = null;
let isConnected = false;
let pairRequested = false;

function startServer() {
    const app = express();
    const page = (body, refresh) => `<!doctype html>${refresh ? `<meta http-equiv="refresh" content="${refresh}">` : ''}
<meta name="viewport" content="width=device-width, initial-scale=1">
<body style="display:grid;place-items:center;height:100vh;margin:0;font-family:sans-serif;background:#0d1117;color:#fff">
<div style="text-align:center"><h2>📞 ${config.botName}</h2>${body}
<p style="opacity:.6">Free script • by ${config.ownerName}</p></div></body>`;

    app.get('/', (req, res) => res.send(`${config.botName} is running ✅`));

    app.get('/qr', async (req, res) => {
        if (isConnected) return res.send(page('<h3>✅ Bot is already connected</h3>'));

        if (USE_PAIR) {
            if (!latestPairCode) return res.send(page('<h3>⏳ Waiting for pairing code...</h3>', 3));
            return res.send(page(
                `<h1 style="letter-spacing:6px">${latestPairCode}</h1>
                 <p>WhatsApp → Linked Devices → Link with phone number instead</p>`, 10));
        }

        if (!latestQR) return res.send(page('<h3>⏳ Waiting for QR...</h3>', 3));
        const img = await QRCode.toDataURL(latestQR, { margin: 2, width: 320 });
        res.send(page(`<img src="${img}" style="border-radius:12px">
                       <p>WhatsApp → Linked Devices → Link a Device</p>`, 20));
    });

    app.listen(config.port, () => console.log(`🌐 Server: http://localhost:${config.port}/qr`));
}

// ================= START =================
async function start() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();
    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
    });

    // Pairing code login
    if (USE_PAIR && !sock.authState.creds.registered && !pairRequested) {
        pairRequested = true;
        await sleep(3000);
        try {
            const code = await sock.requestPairingCode(NUMBER);
            latestPairCode = code?.match(/.{1,4}/g)?.join('-') || code;
            console.log('\n🔑 PAIRING CODE: ' + latestPairCode);
            console.log('→ WhatsApp → Linked Devices → Link with phone number instead\n');
        } catch (e) {
            pairRequested = false;
            console.log('Pairing code error:', e.message);
        }
    }

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        debouncedSave();
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m?.message || m.key.remoteJid === 'status@broadcast') return;
        try {
            await handleCommand(sock, m);
        } catch (e) {
            console.log('cmd error:', e.message);
        }
    });

    let voipReady = false;
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        // QR login
        if (qr && !USE_PAIR) {
            latestQR = qr;
            console.log('📷 Scan this QR (or open /qr in your browser):');
            qrTerminal.generate(qr, { small: true });
        }

        if (connection === 'open') {
            isConnected = true;
            latestQR = null;
            latestPairCode = null;
            pairRequested = false;
            console.log('✅ Connected: ' + sock.user?.id);
            await saveSession();
            if (!voipReady) {
                voipReady = true;
                try { await setupVoip(sock); }
                catch (e) { console.log('Voip setup error:', e.message); }
            }
        }

        if (connection === 'close') {
            isConnected = false;
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code === DisconnectReason.loggedOut) {
                console.log('❌ Logged out. Deleting session...');
                pairRequested = false;
                await Session.deleteOne({ sessionId: SESSION_ID });
                fs.rmSync(SESSION_DIR, { recursive: true, force: true });
                process.exit(1);
            }
            console.log('🔄 Reconnecting...');
            setTimeout(start, 3000);
        }
    });
}

process.on('uncaughtException', (e) => console.log('Uncaught exception:', e?.message ?? e));
process.on('unhandledRejection', (e) => console.log('Unhandled rejection:', e?.message ?? e));

console.log(`🚀 ${config.botName} v${config.version} | login: ${USE_PAIR ? 'PAIR' : 'QR'} | Free script by ${config.ownerName}`);
await mongoose.connect(MONGODB_URI);
console.log('✅ MongoDB connected');
await restoreSession();
await loadSettings();
startServer();
start();
