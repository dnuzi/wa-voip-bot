<div align="center">

# 📞 WA VoIP Bot

### Smart WhatsApp Auto Call Bot

Answer WhatsApp **audio & video calls** automatically and play your own **voice or video** — 24/7.

[![Version](https://img.shields.io/badge/version-0.0.1-blue?style=for-the-badge)](https://github.com/dnuzi/wa-voip-bot)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/database-MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)](#-license)
[![Free](https://img.shields.io/badge/script-FREE-success?style=for-the-badge)](https://github.com/dnuzi/wa-voip-bot)

[![Stars](https://img.shields.io/github/stars/dnuzi/wa-voip-bot?style=social)](https://github.com/dnuzi/wa-voip-bot/stargazers)
[![Forks](https://img.shields.io/github/forks/dnuzi/wa-voip-bot?style=social)](https://github.com/dnuzi/wa-voip-bot/network/members)

</div>

---

## ✨ Features

| | Feature | Description |
|---|---|---|
| 📞 | **Auto answer** | Picks up incoming audio and video calls automatically |
| 🎙️ | **Voice playback** | Audio call → plays your voice file |
| 🎥 | **Video playback** | Video call → plays your video file (falls back to audio) |
| 👥 | **Group calls** | Works when the bot is added to a group call |
| 📲 | **Outgoing calls** | Call someone yourself — the bot plays media once they answer |
| 🔛 | **ON / OFF switch** | Toggle the system with one command, saved in MongoDB |
| 🔐 | **Owner only** | Only the owner can control the bot |
| 🔑 | **Pairing code login** | Link with your phone number — no QR needed |
| 📷 | **QR login** | Scan the QR in the terminal or in your browser |
| 🌐 | **Web page** | Built-in `/qr` page shows the pairing code or QR on any host |
| 💾 | **Session in MongoDB** | Redeploy anywhere without logging in again |
| ⚙️ | **Simple `config.js`** | Change number, media, texts, prefix and login mode easily |

---

## 📂 Project Structure

```
wa-voip-bot/
├── index.js        # Main bot logic
├── config.js       # All settings (edit this)
├── package.json
└── README.md
```

---

## 📋 Requirements

- **Node.js 18+**
- A **MongoDB** database (free [MongoDB Atlas](https://www.mongodb.com/atlas) works great)
- A WhatsApp number for the bot
- ffmpeg is bundled automatically (`ffmpeg-static`) — nothing extra to install

---

## 🚀 Installation

```bash
# 1. Clone the repository
git clone https://github.com/dnuzi/wa-voip-bot.git
cd wa-voip-bot

# 2. Install dependencies
npm install

# 3. Edit your settings
nano config.js

# 4. Set your MongoDB URL and start
export MONGODB_URI="mongodb+srv://USER:PASSWORD@cluster.mongodb.net/dbname"
npm start
```

---

## 🔑 Login Methods

Choose the mode in `config.js` (`connectMode`) or with the `CONNECT_MODE` environment variable.

| Mode | Value | How to log in |
|---|---|---|
| **Pairing code** (default) | `pair` | A code appears in the console and on `/qr`. WhatsApp → **Linked Devices** → **Link with phone number instead** → enter the code |
| **QR code** | `qr` | Scan the QR in the terminal, or open `http://localhost:8000/qr`. WhatsApp → **Linked Devices** → **Link a Device** |

> 💡 On Railway, Koyeb, Render or a panel, open your public URL + `/qr` to see the code or QR without reading the console.

After a successful login the session is saved to MongoDB, so you only log in **once**.

---

## ⚙️ Configuration

Everything is in **`config.js`**:

| Option | Description | Default |
|---|---|---|
| `botName` | Name shown in menus and logs | `WA VoIP Bot` |
| `ownerName` | Your name shown in menus and footer | `DNUZI` |
| `number` | Bot number (country code, no `+`) — also the main owner | — |
| `owners` | Extra owner numbers | `[]` |
| `connectMode` | Login type: `pair` or `qr` (env `CONNECT_MODE`) | `pair` |
| `port` | Web server port for the `/qr` page (env `PORT`) | `8000` |
| `prefix` | Command prefix | `.` |
| `mongodbUri` | MongoDB connection string (use env `MONGODB_URI`) | — |
| `sessionId` | Session name stored in MongoDB | `main` |
| `audioUrl` | Direct link to the voice file (`.opus` `.mp3` `.ogg`) | sample |
| `videoUrl` | Direct link to the video file (`.mp4`) | sample |
| `texts` | Fail / owner-only / footer messages | — |
| `voip.maxConcurrentCalls` | Calls handled at the same time | `3` |
| `autoCallDefault` | Auto call state on the very first start | `true` |

### 🌍 Environment variables

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string **(required)** |
| `BOT_NUMBER` | Overrides `number` in `config.js` |
| `SESSION_ID` | Overrides `sessionId` in `config.js` |
| `CONNECT_MODE` | `pair` or `qr` |
| `PORT` | Web server port |

> 🔒 **Never commit your MongoDB password to GitHub.** Use `MONGODB_URI` as an environment variable.

---

## 🧾 Commands

> All commands are **owner only**.

| Command | Description |
|---|---|
| `.call on` | Turn the auto call system **ON** |
| `.call off` | Turn the auto call system **OFF** |
| `.call` | Check current status (ON / OFF) |
| `.call-menu` | Show the command menu |
| `.c-ping` | Ping / response speed check |

### How to use

1. Log in with a pairing code or QR (see above).
2. Send `.call on` to the bot (from your owner number or the bot's own chat).
3. Ask anyone to **call the bot number**.
4. The bot answers and plays your voice (audio call) or video (video call), then hangs up.
5. Send `.call off` any time to disable it.

---

## 🔄 How it works

```
 Incoming call ──► Auto call ON? ──► Accept call
                        │                 │
                        no                ▼
                        │          Video call? ──yes──► play video ──┐
                     ignore               │                          │
                                          no                  (failed?)
                                          │                          │
                                          ▼                          ▼
                                     play audio ◄────────────────────┘
                                          │
                                          ▼
                                       hang up
```

---

## ☁️ Deployment

Works on any Node.js host:

- 🖥️ **VPS** — run with `pm2 start index.js --name wa-voip-bot`
- 🚂 **Railway / Koyeb / Render** — set `MONGODB_URI` in the variables tab, start command `npm start`
- 🎮 **Pterodactyl panel** — Node.js egg, startup file `index.js`
- 🐳 **Codespaces** — good for quick testing

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---|---|
| `MONGODB_URI is missing` | Set the env variable or `mongodbUri` in `config.js` |
| No pairing code | Check `number` in `config.js` and that you have internet |
| `/qr` says "Waiting..." | Wait a few seconds — the page refreshes by itself |
| Bot does not answer calls | Send `.call on` and make sure the bot is connected |
| No sound on call | Use a direct media link and check the console for `ffmpeg` errors |
| Logged out | The session is deleted automatically — restart and log in again |

---

## ⚠️ Disclaimer

This project is **not affiliated with WhatsApp or Meta**. It is provided for educational purposes. Use it responsibly — you are responsible for how you use it, and automated accounts may be restricted by WhatsApp.

---

## 📜 License

Released under the **MIT License**. This is a **free script** — please do not sell it.

---

<div align="center">

### 💖 Support

If you like this project, give it a ⭐ on [GitHub](https://github.com/dnuzi/wa-voip-bot)!

Made with ❤️ by **[DNUZI](https://github.com/dnuzi)**

</div>
