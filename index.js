import * as B from '@dnuzi/baileys';
import Voip from '@dnuzi/baileys/voip';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { spawn } from 'child_process';

// ================= SETTINGS =================
const NUMBER = '94757734999'; 
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://mohevov436_db_user:JdtPD7e2U03l0SHK@cluster0.mdw067m.mongodb.net/tinwggeg';
const SESSION_ID = 'main';

const AUDIO_URL = 'https://github.com/Lakshanteach/voicee/raw/refs/heads/main/shadow-movie-x-siri-voice.opus';
const VIDEO_URL = 'https://github.com/Lakshanteach/voicee/raw/refs/heads/main/lv_0_20261015174042.mp4';

const FAIL_TEXT = '> 👨‍💻 SHADOW MOVIE X SYSTEM ON PLEASE TRY AGIN 💋🇱🇰';
const OWNER_ONLY_TEXT = '👨‍💻 ꜱʜᴀᴅᴏᴡ ᴍᴏᴠɪᴇ x ᴏᴡɴᴇʀ ᴏɴʏ ᴄᴍᴅ';
// ============================================

const OWNER_NUM = NUMBER.replace(/[^0-9]/g, '');

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

// ffprobe path
let FFPROBE = 'ffprobe';
try {
    const m = await import('ffprobe-static');
    FFPROBE = m.default?.path || m.path || 'ffprobe';
} catch {}

// ffmpeg path
let FFMPEG = 'ffmpeg';
try {
    const m = await import('ffmpeg-static');
    FFMPEG = m.default || FFMPEG;
} catch {}

// ================= SETTINGS (ON/OFF) =================
const Setting = mongoose.model('Setting', new mongoose.Schema({
    key: { type: String, unique: true },
    value: mongoose.Schema.Types.Mixed,
}));

let CALL_ON = true; // default ON

async function loadSettings() {
    const s = await Setting.findOne({ key: 'shadowCall' });
    if (s) CALL_ON = !!s.value;
    console.log('📞 Shadow-call:', CALL_ON ? 'ON' : 'OFF');
}

async function setCallOn(v) {
    CALL_ON = v;
    await Setting.findOneAndUpdate({ key: 'shadowCall' }, { value: v }, { upsert: true });
}

const statusText = () => (CALL_ON ? '✅ ON' : '❌ OFF');

const MENU_TEXT = () => `╭━━━〔 👨‍💻 *SHADOW CALL MENU* 〕━━━╮

📞 *ꜱʜᴀᴅᴏᴡ ᴀᴜᴛᴏ ᴄᴀʟʟ ❯❯* ${statusText()}

┃ ▸ *.shadow-call on*
┃    ᴀᴜᴛᴏ ᴄᴀʟʟ ꜱʏꜱᴛᴇᴍ ᴏɴ 👨‍💻
┃    (audio call → voice, video call → video) 👨‍💻
┃
┃ ▸ *.shadow-call off*
┃    ꜱʜᴀᴅᴏᴡ ᴄᴀʟʟ ꜱʏꜱᴛᴇᴍ ᴏꜰꜰ 👨‍💻
┃
┃ ▸ *.shadow-call*
┃    ꜱʜᴀᴅᴏᴡ ᴄᴀʟʟ ꜱʏꜱᴛᴇᴍ ᴏɴ ᴏʀ ᴏꜰꜰ ᴄʜᴇᴄᴋ 👨‍💻
┃
┃ ▸ *.shadow-call-menu*
┃    ꜱʜᴀᴅᴏᴡ ᴄᴀʟʟ ᴍᴇɴᴜ 👨‍💻
┃
┃ ▸ *.c-ping*
┃    ꜱʜᴀᴅᴏᴡ ᴄᴀʟʟ ꜱʏꜱᴛᴇᴍ ᴘɪɴɢ ᴄʜᴇᴄᴋ 👨‍💻
╰━━☠️̶͟͞⃞ 🅃̥ᴇᴄͭ͟͠ʜͤɴͣ͢͞ɪᴄͫᴀ͡ʟ•°Ｃ⃝͠y֯ʙֱ֘ᴇ⃖⃖ʀ־ֱꜱ̀˗ᴵ̛ᴺʾᶜ 🇱🇰⃞̶͞⚔̶͟͞━━━╯

> ⏤͟͟͞͞🫯ᴛᴇᴄʜＳʜᴀᴅᴏᴡ Ｍᴏᴠɪᴇ {ｘ} ᴵᴺᶜ ✓`;

// ================= MEDIA =================
const pcmCache = new Map();
const fileCache = new Map();
const endedCalls = new Set();
const waiters = new Map();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getPcm(url) {
    if (pcmCache.has(url)) return pcmCache.get(url);
    fs.mkdirSync('./tmp', { recursive: true });

    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error('download failed: HTTP ' + res.status);
    const file = './tmp/media_' + Buffer.from(url).toString('hex').slice(-16) + (path.extname(new URL(url).pathname) || '.bin');
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log('⬇️ downloaded', fs.statSync(file).size, 'bytes');

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

async function playVideoOnCall(voip, callId, url) {
    const co = voip.coordinator;
    const pcm = await getPcm(url);
    const file = fileCache.get(url);
    if (!file) return false;
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
const handled = new Set();      // play කරපු/කරන calls (duplicate නවත්තන්න)
const pendingOut = new Map();   // මම කරපු calls (එයා answer කරනකම් බලාගෙන)

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
        if (!played) {
            played = await playAudioOnCall(voip, callId, AUDIO_URL).catch(e => {
                console.log('play error:', e.message);
                return false;
            });
        }
        if (!played) {
            try { await sock.sendMessage(replyJid, { text: FAIL_TEXT }); } catch {}
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
        voipLogLevel: 'warn',
        tmpDir: './tmp',
        maxConcurrentCalls: 3,
    });

    try { await getPcm(AUDIO_URL); } catch (e) { console.log('❌ preload audio error:', e.message); }
    try { await getPcm(VIDEO_URL); } catch (e) { console.log('❌ preload video error:', e.message); }

    await voip.listen();
    console.log('📡 Voip listening');

    // ---------- call_incoming ----------
    // 1) සාමාන්‍ය audio/video call එකක් ආවොත්
    // 2) group call එකකට / වෙන කෙනෙක්ගේ call එකකට bot ව add කලොත්
    // 3) මම call කලොත් (outgoing) -> එයා answer කරනකම් බලාගෙන ඉන්නවා
    voip.on('call_incoming', async (call) => {
        const callId = call.callId;
        const from = call.peerJid;
        const groupJid = call.groupJid || (String(from).endsWith('@g.us') ? from : null);
        const replyJid = groupJid || from;
        const isVideo = String(call.mediaType || '').toLowerCase().includes('video');
        const outgoing = String(call.direction || '').toLowerCase().includes('out');

        
        if (!CALL_ON) {
            console.log('⏸️ shadow-call OFF → ignore:', from);
            return;
        }

        console.log(`📞 ${outgoing ? 'OUTGOING' : 'INCOMING'} ${groupJid ? 'GROUP ' : ''}${isVideo ? 'video' : 'audio'} call | ${from}`);
        console.log('mediaType:', call.mediaType, '| group:', call.groupJid, '| direction:', call.direction);

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
            try { await sock.sendMessage(replyJid, { text: FAIL_TEXT }); } catch {}
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
        console.log('📶 state:', s.slice(0, 200));
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
        console.log('🎵 outbound audio finished event', c?.callId ?? '');
        waiters.get(c?.callId ?? c?.call?.callId)?.();
    });
    voip.on('call_error', (e) => console.log('Call error:', e?.message ?? e));

    return voip;
}


async function handleCommand(sock, m) {
    const body =
        m.message.conversation ||
        m.message.extendedTextMessage?.text ||
        m.message.imageMessage?.caption || '';
    const cmd = body.trim().toLowerCase();
    const jid = m.key.remoteJid;

    const callMatch = cmd.match(/^\.shadow-call(?:\s+(on|off))?$/);
    const isMenu = cmd === '.shadow-call-menu';
    const isPing = cmd === '.c-ping';
    if (!callMatch && !isMenu && !isPing) return;

    const sender = (m.key.participant || jid).split('@')[0].split(':')[0];
    const isOwner = m.key.fromMe || sender === OWNER_NUM;
    if (!isOwner) {
        await sock.sendMessage(jid, { text: OWNER_ONLY_TEXT }, { quoted: m });
        return;
    }

    if (isMenu) {
        await sock.sendMessage(jid, { text: MENU_TEXT() }, { quoted: m });
        return;
    }

    if (callMatch) {
        const arg = callMatch[1];
        if (arg === 'on') await setCallOn(true);
        if (arg === 'off') {
            await setCallOn(false);
            pendingOut.clear();
        }
        await sock.sendMessage(jid, {
            text: `📞 *SHADOW CALL:* ${statusText()}\n\n` +
                  (CALL_ON
                      ? '▸ call එකක් ආවොත් / group call එකකට add කලොත් / මම call කරලා එයා answer කලොත් bot auto play කරනවා'
                      : '▸ shadow-call සම්පූර්ණයෙන් OFF - bot මුකුත් කරන්නේ නෑ') +
                  `\n\n.shadow-call-menu\n\n${OWNER_ONLY_TEXT}`
        }, { quoted: m });
        return;
    }

    if (isPing) {
        const t = Date.now();
        await sock.sendMessage(jid, { text: '😒 Pong!' }, { quoted: m });
        await sock.sendMessage(jid, { text: `⚡ ${Date.now() - t} ms` });
    }
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

    if (!sock.authState.creds.registered) {
        const number = NUMBER.replace(/[^0-9]/g, '');
        if (!number || number.includes('X')) {
            console.log('❌ NUMBER එක දාන්න ponz!');
            process.exit(1);
        }
        await new Promise(r => setTimeout(r, 3000));
        try {
            const code = await sock.requestPairingCode(number);
            console.log('\n🫩 PAIRING CODE: ' + (code.match(/.{1,4}/g)?.join('-') || code) + '\n');
        } catch (e) {
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
    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'open') {
            console.log('✅ Connected: ' + sock.user?.id);
            await saveSession();
            if (!voipReady) {
                voipReady = true;
                try { await setupVoip(sock); }
                catch (e) { console.log('Voip setup error:', e.message); }
            }
        }
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code === DisconnectReason.loggedOut) {
                console.log('❌ Logged out. Session delete කරනවා...');
                await Session.deleteOne({ sessionId: SESSION_ID });
                fs.rmSync(SESSION_DIR, { recursive: true, force: true });
                process.exit(1);
            }
            console.log('🔄 Reconnecting...');
            setTimeout(start, 3000);
        }
    });
}

await mongoose.connect(MONGODB_URI);
console.log('✅ MongoDB connected');
await restoreSession();
await loadSettings();
start();
