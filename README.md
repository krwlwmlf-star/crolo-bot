# 🤖 Crolo Bot

A Facebook Messenger Bot powered by **Djamel-FCA** with admin-only mode, human behavior simulation, SQLite database, MQTT support, and a web admin panel.

---

## ✨ Features

- **Admin-Only Mode** — Bot only responds to registered admins, silently ignores everyone else
- **Djamel-FCA** — Full Facebook Client Abstractions with cookie parsing, human typing simulation, session validation
- **SQLite Database** — Persistent admin list, cookie history, and bot state
- **MQTT** — Real-time Facebook messaging via MQTT protocol
- **Human Behavior** — Typing indicators, read receipts, reaction delays, presence simulation
- **Protection Layers** — Rate limiting, duplicate guard, stealth mode, anti-detection
- **Admin Panel** — Web UI on port 8080 with live logs, admin management, cookie updates
- **Auto-Restart Watchdog** — Exponential backoff restart on crash

---

## 📋 Commands

| Command | Aliases | Role | Description |
|---------|---------|------|-------------|
| `/uptime` | `up`, `ping`, `status` | Admin | Show bot uptime and system stats |
| `/adminadd <userID>` | `addadmin`, `admin+` | Superadmin | Add a user as bot admin |
| `/adminremove <userID>` | `removeadmin`, `deladmin` | Superadmin | Remove a user from admins |

---

## 🚀 Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure `config.json`
```json
{
  "ownerID": "YOUR_FACEBOOK_USER_ID",
  "prefix": "/",
  "panel": {
    "port": 8080,
    "password": "your-panel-password"
  }
}
```

### 3. Add your Facebook cookies to `account.txt`

Supported formats:
- **JSON Array** (c3c format): `[{"name":"c_user","value":"..."}]`
- **Cookie Header**: `c_user=123; xs=abc; ...`
- **Netscape format**

### 4. Start the bot
```bash
# With watchdog (recommended — auto-restarts on crash)
npm start

# Without watchdog (direct)
npm run dev
```

---

## 🖥️ Admin Panel

The admin panel runs on **port 8080** separately from the bot.

Access: `http://localhost:8080`

**Features:**
- 📊 Live dashboard with bot stats and uptime
- 👑 Add / remove admins by Facebook user ID
- 🍪 Update bot cookies without restarting server
- ⚙️ Edit config settings in real-time
- 📝 Live console log viewer (via WebSocket)
- 🔄 Remote bot restart

---

## 🔒 Admin Roles

| Role | Level | Description |
|------|-------|-------------|
| Superadmin | 3 | Full access — can add/remove admins |
| Admin | 2 | Can use all bot commands |
| Everyone else | 0 | **Silently ignored** |

---

## 📁 Project Structure

```
crolo-bot/
├── index.js              # Watchdog (auto-restart)
├── Bot.js                # Main bot engine
├── account.txt           # Facebook cookies
├── config.json           # Bot configuration
├── Djamel-fca/           # Facebook Client Abstractions
│   └── index.js
├── src/
│   ├── commands/
│   │   ├── uptime.js
│   │   ├── adminadd.js
│   │   └── adminremove.js
│   ├── engine/
│   │   ├── core.js
│   │   ├── handlerEvents.js
│   │   ├── loader.js
│   │   └── logger.js
│   ├── protection/
│   │   ├── humanTyping.js
│   │   ├── humanReadReceipt.js
│   │   ├── mqttHealthCheck.js
│   │   ├── keepAlive.js
│   │   ├── rateLimit.js
│   │   ├── stealth.js
│   │   └── ... (10+ protection modules)
│   └── panel/
│       ├── server.js     # Admin panel server (port 8080)
│       └── public/
│           └── index.html
└── database/
    ├── db.js             # SQLite connection & helpers
    └── data/             # SQLite data files
```

---

## ⚡ Technologies

- **Runtime**: Node.js 18+
- **FCA**: `@dongdev/fca-unofficial` (Djamel-FCA wrapper)
- **Database**: SQLite via `better-sqlite3`
- **Panel**: Express + Socket.io
- **MQTT**: Built into FCA library

---

## 📝 License

UNLICENSED — Private use only.
