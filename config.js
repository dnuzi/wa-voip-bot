// ============================================================
//  WA VoIP Bot - config.js
//  FREE SCRIPT - Made by DNUZI
//  Edit this file to customize your bot.
// ============================================================

export default {
    // ---------- Bot identity ----------
    botName: 'WA VoIP Bot',
    version: '0.0.1',
    ownerName: 'DNUZI',                       // your name (shown in menu & messages)
    ownerUrl: 'https://github.com/dnuzi',     // your link
    repoUrl: 'https://github.com/dnuzi/wa-voip-bot',

    // ---------- Account ----------
    // Bot WhatsApp number (country code, no "+", no spaces).
    // Used for pairing AND is the main owner.
    number: process.env.BOT_NUMBER || '94757734999',

    // Extra owners (optional) - numbers with country code, no "+"
    owners: [],

    // ---------- Login ----------
    // 'pair' = pairing code  |  'qr' = scan QR
    connectMode: (process.env.CONNECT_MODE || 'pair').toLowerCase(),

    // Web server (health check + QR / pairing code page at /qr)
    port: process.env.PORT || 8000,

    // ---------- Commands ----------
    prefix: '.',

    // ---------- Database ----------
    // Set MONGODB_URI as an environment variable (recommended),
    // or paste your connection string below.
    mongodbUri: process.env.MONGODB_URI || '',
    sessionId: process.env.SESSION_ID || 'main',

    // ---------- Media played on calls ----------
    // Direct links (audio: .opus/.mp3/.ogg - video: .mp4)
    audioUrl: 'https://github.com/Lakshanteach/voicee/raw/refs/heads/main/shadow-movie-x-siri-voice.opus',
    videoUrl: 'https://github.com/Lakshanteach/voicee/raw/refs/heads/main/lv_0_20261015174042.mp4',

    // ---------- Texts ----------
    texts: {
        fail: '⚠️ Call system is busy, please try again.',
        ownerOnly: '🔒 This command is for the owner only.',
        freeNote: '🆓 This is a free script. Do not sell it.',
        footer: '> ✦ Made by DNUZI • Free Script',
    },

    // ---------- Voip options ----------
    voip: {
        logLevel: 'warn',
        maxConcurrentCalls: 3,
    },

    // Auto call state on the very first start
    // (after that the value saved in MongoDB is used)
    autoCallDefault: true,
};
