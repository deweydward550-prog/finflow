import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { 
  makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import localtunnel from 'localtunnel';
import { parseWhatsAppMessage } from './nlpParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 5051;
const TUNNEL_SUBDOMAIN = process.env.TUNNEL_SUBDOMAIN || 'finflow-dewey-bot';
const DATA_DIR = path.join(__dirname, 'data');
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');
const PENDING_FILE = path.join(DATA_DIR, 'pending_transactions.json');
const TELEGRAM_CONFIG_FILE = path.join(DATA_DIR, 'telegram_config.json');
const ACCOUNTS_CONFIG_FILE = path.join(DATA_DIR, 'accounts_config.json');
const LOG_FILE = path.join(DATA_DIR, 'bot.log');

// Ensure process never crashes from transient network drops
process.on('uncaughtException', (err) => {
  console.error('[Process Error] Uncaught Exception:', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Process Error] Unhandled Rejection:', reason?.message || reason);
});

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

// Auto append logs to file for background status check
function appendLog(message) {
  try {
    const timestamp = new Date().toLocaleString('id-ID');
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`, 'utf8');
  } catch {}
}

const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => {
  originalLog(...args);
  const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  appendLog(text);
};
console.error = (...args) => {
  originalError(...args);
  const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  appendLog('[ERROR] ' + text);
};

// Safe Auth State Cleaning
function clearAuthFolder() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      const files = fs.readdirSync(AUTH_DIR);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(AUTH_DIR, file));
        } catch {}
      }
      console.log('🧹 [Auth] Folder sesi WhatsApp (auth_info_baileys) telah dibersihkan.');
    }
  } catch (err) {
    console.error('Gagal membersihkan folder auth:', err);
  }
}

function ensureCleanAuthState() {
  const credsPath = path.join(AUTH_DIR, 'creds.json');
  if (fs.existsSync(credsPath)) {
    try {
      const content = fs.readFileSync(credsPath, 'utf8').trim();
      if (!content) throw new Error('File creds.json kosong');
      const json = JSON.parse(content);
      if (!json || typeof json !== 'object' || !json.noiseKey) {
        throw new Error('Struktur creds.json tidak valid / rusak');
      }
    } catch (err) {
      console.warn('⚠️ [Auth] Sesi WhatsApp sebelumnya rusak (' + err.message + '). Membersihkan folder untuk scan baru...');
      clearAuthFolder();
    }
  }
}

// Get Local Network IP (for zero-latency direct Wi-Fi sync)
function getLocalNetworkIp() {
  const ifaces = os.networkInterfaces();
  for (const dev in ifaces) {
    for (const details of ifaces[dev]) {
      if (details.family === 'IPv4' && !details.internal) {
        return details.address;
      }
    }
  }
  return 'localhost';
}

// Read / Write pending transactions
function getPendingTransactions() {
  try {
    if (fs.existsSync(PENDING_FILE)) {
      const data = fs.readFileSync(PENDING_FILE, 'utf8');
      return JSON.parse(data) || [];
    }
  } catch (err) {
    console.error('Error reading pending file:', err);
  }
  return [];
}

function savePendingTransactions(list) {
  try {
    fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving pending file:', err);
  }
}

// Read / Write Telegram Bot config for direct cloud sync
function getTelegramConfig() {
  try {
    if (fs.existsSync(TELEGRAM_CONFIG_FILE)) {
      const data = fs.readFileSync(TELEGRAM_CONFIG_FILE, 'utf8');
      return JSON.parse(data) || {};
    }
  } catch (err) {
    console.error('Error reading telegram config:', err);
  }
  return {
    botToken: '8732879033:AAFtR0soqSR0LYXfsMaxpm5JbQVH9xbc714',
    chatId: '372613511',
    autoSync: true
  };
}

function saveTelegramConfig(config) {
  try {
    const current = getTelegramConfig();
    const updated = { ...current, ...config };
    fs.writeFileSync(TELEGRAM_CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  } catch (err) {
    console.error('Error saving telegram config:', err);
  }
}

// Read / Write Registered Accounts and Primary Account
function getAccountsConfig() {
  try {
    if (fs.existsSync(ACCOUNTS_CONFIG_FILE)) {
      const data = fs.readFileSync(ACCOUNTS_CONFIG_FILE, 'utf8');
      return JSON.parse(data) || { primaryAccount: 'BSI', accounts: [] };
    }
  } catch (err) {
    console.error('Error reading accounts config:', err);
  }
  return { primaryAccount: 'BSI', accounts: [] };
}

function saveAccountsConfig(config) {
  try {
    const current = getAccountsConfig();
    const updated = { ...current, ...config };
    fs.writeFileSync(ACCOUNTS_CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  } catch (err) {
    console.error('Error saving accounts config:', err);
  }
}

// Server State
let botStatus = 'starting'; // 'qr' | 'connecting' | 'connected' | 'disconnected'
let currentQR = null;
let currentQRDataUrl = null;
let botNumber = null;
let sock = null;
let isReconnecting = false;
const sseClients = new Set();

// Format Rupiah helper
function formatRupiahSimple(num) {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

// Category Emoji mapping for WhatsApp receipt
const CATEGORY_EMOJI = {
  'Makanan & Minuman': '🍛',
  'Transportasi & Bensin': '⛽',
  'Belanja Kebutuhan': '🛒',
  'Tagihan & Utilitas': '⚡',
  'Kost / Rumah': '🏠',
  'Hiburan & Langganan': '🍿',
  'Kesehatan & Medis': '💊',
  'Pengeluaran Lainnya': '✨',
  'Gaji Utama': '💰',
  'Freelance & Side Job': '💻',
  'Bonus / THR': '🎁',
  'Dividen & Investasi': '📈',
  'Pemasukan Lainnya': '💵'
};

// Express App
const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Bypass-Tunnel-Reminder', 'bypass-tunnel-reminder']
}));
app.use(express.json());

// Broadcast events to connected clients via SSE
function broadcastSSE(type, payload) {
  const data = JSON.stringify({ type, payload });
  sseClients.forEach(client => {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {}
  });
}

function broadcastNewTransactions(transactions) {
  if (!transactions || transactions.length === 0) return;
  broadcastSSE('NEW_TRANSACTIONS', transactions);
}

// Push directly to Telegram Bot Cloud DB and update snapshot
async function pushToTelegramDirectly(transactions) {
  try {
    const tg = getTelegramConfig();
    if (!tg.botToken || !tg.chatId) return false;

    const nowStr = new Date().toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    let totalExpense = 0;
    let totalIncome = 0;
    const lines = transactions.map((t, idx) => {
      const emoji = CATEGORY_EMOJI[t.category] || '💸';
      const accLabel = t.paymentMethod ? ` (${t.paymentMethod})` : '';
      if (t.type === 'income') {
        totalIncome += t.amount;
        return `${idx + 1}. ${emoji} *${t.title}* — +${formatRupiahSimple(t.amount)}${accLabel}`;
      } else {
        totalExpense += t.amount;
        return `${idx + 1}. ${emoji} *${t.title}* — ${formatRupiahSimple(t.amount)}${accLabel}`;
      }
    });

    const summaryText = `💬 *FinFlow: Transaksi Baru dari WhatsApp*\n` +
      `🕒 *Waktu*: ${nowStr}\n\n` +
      lines.join('\n') +
      `\n\n💰 *Total Pengeluaran*: ${formatRupiahSimple(totalExpense)}` +
      `\n\n⚡ _Tersinkronisasi otomatis dari WhatsApp Bot Server_`;

    const url = `https://api.telegram.org/bot${tg.botToken}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tg.chatId,
        text: summaryText,
        parse_mode: 'Markdown'
      })
    });
    console.log('☁️ [Telegram] Berhasil mengirim notifikasi ke Telegram!');

    // Also update pinned snapshot in Telegram
    await updateTelegramSnapshotWithNewTransactions(transactions, tg);
    return true;
  } catch (err) {
    console.error('Failed to push directly to Telegram:', err);
    return false;
  }
}

// Update Telegram Pinned Database Snapshot
async function updateTelegramSnapshotWithNewTransactions(newItems, tgConfig) {
  try {
    const tg = tgConfig || getTelegramConfig();
    if (!tg.botToken || !tg.chatId) return;

    let currentDb = null;
    try {
      const chatRes = await fetch(`https://api.telegram.org/bot${tg.botToken}/getChat?chat_id=${tg.chatId}`).then(r => r.json());
      if (chatRes.ok && chatRes.result?.pinned_message?.text) {
        const text = chatRes.result.pinned_message.text;
        const match = text.match(/#FINFLOW_DATA_START#([\s\S]*?)#FINFLOW_DATA_END#/);
        if (match && match[1]) {
          currentDb = JSON.parse(match[1].trim());
        }
      }
    } catch (e) {}

    if (!currentDb || !currentDb.data) {
      currentDb = {
        version: 1,
        exportDate: new Date().toISOString(),
        appName: 'FinFlow',
        data: {
          transactions: [],
          recurringExpenses: [],
          recurringPayments: [],
          budgets: [],
          settings: []
        }
      };
    }

    if (!Array.isArray(currentDb.data.transactions)) {
      currentDb.data.transactions = [];
    }

    for (const item of newItems) {
      const exists = currentDb.data.transactions.some(t => t.id === item.id || (t.title === item.title && t.amount === item.amount && t.date === item.date && t.time === item.time));
      if (!exists) {
        currentDb.data.transactions.unshift({
          ...item,
          createdAt: item.createdAt || new Date().toISOString()
        });
      }
    }
    currentDb.exportDate = new Date().toISOString();

    const compactJson = JSON.stringify(currentDb);
    const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    const messageText = 
      `📦 *FinFlow Database Snapshot (WhatsApp Auto-Sync)*\n` +
      `🕒 *Tersimpan*: ${nowStr}\n` +
      `📝 *Transaksi*: ${currentDb.data.transactions.length} | 🔄 *Tagihan*: ${currentDb.data.recurringExpenses?.length || 0}\n\n` +
      `#FINFLOW_DATA_START#\n${compactJson}\n#FINFLOW_DATA_END#`;

    const sendRes = await fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tg.chatId,
        text: messageText
      })
    }).then(r => r.json());

    if (sendRes.ok && sendRes.result?.message_id) {
      await fetch(`https://api.telegram.org/bot${tg.botToken}/pinChatMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tg.chatId,
          message_id: sendRes.result.message_id,
          disable_notification: true
        })
      });
      console.log('📌 [Telegram Cloud] Database snapshot terbaru berhasil di-pin di Telegram!');
    }
  } catch (err) {
    console.error('Error updating Telegram snapshot:', err);
  }
}

// HTML QR SCANNER DASHBOARD
function renderDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FinFlow WhatsApp Bot & Server Scanner</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(22, 30, 49, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #10b981;
      --primary-hover: #059669;
      --primary-light: rgba(16, 185, 129, 0.15);
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --danger: #ef4444;
      --warning: #f59e0b;
      --info: #38bdf8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: radial-gradient(circle at top center, #1e293b 0%, #0b0f19 100%);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .container {
      width: 100%;
      max-width: 520px;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 1.75rem;
      backdrop-filter: blur(16px);
      box-shadow: 0 20px 40px -15px rgba(0,0,0,0.5);
    }
    .header {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: linear-gradient(135deg, #10b981, #065f46);
      color: #fff;
      padding: 0.4rem 1rem;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 0.9rem;
      line-height: 1.4;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.45rem 1rem;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-top: 0.5rem;
      transition: all 0.3s;
    }
    .status-pill.qr { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .status-pill.connected { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .status-pill.disconnected { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .status-pill.connecting { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
    
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 10px currentColor;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    .qr-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
      background: #ffffff;
      border-radius: 16px;
      margin: 1rem 0;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
      position: relative;
      min-height: 280px;
    }
    .qr-img {
      width: 100%;
      max-width: 250px;
      height: auto;
      display: block;
      border-radius: 8px;
      image-rendering: pixelated;
    }
    .qr-spinner {
      color: #334155;
      font-size: 0.95rem;
      font-weight: 600;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid rgba(16, 185, 129, 0.2);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .instructions {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 1rem;
      font-size: 0.85rem;
      line-height: 1.5;
      color: var(--text-muted);
    }
    .instructions ol {
      padding-left: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .instructions strong { color: var(--text); }

    .connected-card {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 1.5rem 0;
    }
    .success-icon {
      width: 64px;
      height: 64px;
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .btn-group {
      display: flex;
      gap: 0.75rem;
      width: 100%;
    }
    .btn {
      flex: 1;
      padding: 0.75rem 1rem;
      border-radius: 12px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      border: none;
      transition: all 0.2s;
      text-decoration: none;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
    }
    .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      border: 1px solid var(--card-border);
    }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.12); }
    .btn-danger {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .btn-danger:hover { background: rgba(239, 68, 68, 0.25); }

    .test-box {
      margin-top: 0.5rem;
      display: flex;
      gap: 0.5rem;
    }
    .input-code {
      flex: 1;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 0.65rem 0.85rem;
      color: #fff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
    }
    .input-code:focus { outline: none; border-color: var(--primary); }
    .footer-note {
      text-align: center;
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo-badge">💬 FinFlow WA Bot</div>
        <h1>WhatsApp Bot Scanner</h1>
        <p class="subtitle">Hubungkan WhatsApp Anda untuk mencatat pengeluaran & pemasukan secara otomatis via chat.</p>
        
        <div id="statusPill" class="status-pill qr">
          <div class="pulse-dot"></div>
          <span id="statusText">Memeriksa Status...</span>
        </div>
      </div>

      <!-- QR View -->
      <div id="qrSection" style="display: none;">
        <div class="qr-container">
          <img id="qrImage" class="qr-img" style="display: none;" alt="QR Code WhatsApp" />
          <div id="qrLoading" class="qr-spinner">
            <div class="spinner"></div>
            <span>Membuat QR Code WhatsApp...</span>
          </div>
        </div>

        <div class="instructions">
          <ol>
            <li>Buka aplikasi <strong>WhatsApp</strong> di HP Anda.</li>
            <li>Klik menu <strong>Titik Tiga (⋮)</strong> atau <strong>Pengaturan</strong>.</li>
            <li>Pilih <strong>Perangkat Tertaut</strong> (Linked Devices).</li>
            <li>Klik <strong>Tautkan Perangkat</strong> lalu scan QR code di atas.</li>
          </ol>
        </div>
      </div>

      <!-- Connected View -->
      <div id="connectedSection" class="connected-card" style="display: none;">
        <div class="success-icon">✓</div>
        <div>
          <h3 style="font-size: 1.2rem; font-weight: 700; color: #34d399;">WhatsApp Bot FinFlow Aktif!</h3>
          <p id="botNumberText" style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.25rem;">Nomor: +628xxx</p>
        </div>
        <p style="font-size: 0.85rem; color: #cbd5e1; line-height: 1.4;">
          Kirim pesan chat seperti <code>naspad 13000 / bensin 25k</code> ke nomor WhatsApp Anda atau bot, dan transaksi langsung tercatat di FinFlow & Telegram Cloud!
        </p>

        <div class="btn-group" style="margin-top: 0.5rem;">
          <a href="https://finflow-sigma-three.vercel.app" target="_blank" class="btn btn-primary">🌐 Buka Web FinFlow</a>
          <button onclick="resetSession()" class="btn btn-danger">Tautkan Ulang</button>
        </div>
      </div>

      <!-- Simulator Test Card -->
      <div style="margin-top: 1.25rem; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 1.25rem;">
        <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.5rem;">
          ⚡ Simulator Chat WhatsApp (Uji Coba Langsung):
        </div>
        <form onsubmit="handleSendTest(event)" class="test-box">
          <input type="text" id="testMsgInput" class="input-code" value="naspad 13000 sea / bensin 30k bsi" placeholder="naspad 13000 / bensin 20k">
          <button type="submit" id="btnTestSend" class="btn btn-primary" style="flex: initial; padding: 0.65rem 1rem; font-size: 0.8rem;">Kirim</button>
        </form>
        <div id="testResult" style="font-size: 0.75rem; margin-top: 0.4rem; color: #34d399; display: none;"></div>
      </div>

      <!-- Action Footer -->
      <div class="btn-group" style="margin-top: 1rem;">
        <button onclick="fetchStatus()" class="btn btn-secondary" style="font-size: 0.8rem; padding: 0.5rem;">🔄 Refresh</button>
        <button onclick="resetSession()" class="btn btn-secondary" style="font-size: 0.8rem; padding: 0.5rem; color: #f87171;">🗑️ Reset Sesi</button>
      </div>
    </div>

    <div class="footer-note">
      FinFlow Bot Server • Port 5051 • Auto-sync Real-time ke Web & Telegram
    </div>
  </div>

  <script>
    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusText');
    const qrSection = document.getElementById('qrSection');
    const qrImage = document.getElementById('qrImage');
    const qrLoading = document.getElementById('qrLoading');
    const connectedSection = document.getElementById('connectedSection');
    const botNumberText = document.getElementById('botNumberText');

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status', {
          headers: { 'Bypass-Tunnel-Reminder': 'true' }
        });
        if (res.ok) {
          const data = await res.json();
          updateUI(data);
        }
      } catch (err) {
        statusPill.className = 'status-pill disconnected';
        statusText.textContent = 'Server Offline';
      }
    }

    function updateUI(data) {
      if (data.status === 'connected') {
        statusPill.className = 'status-pill connected';
        statusText.textContent = 'Terhubung (' + (data.botNumber || 'Aktif') + ')';
        qrSection.style.display = 'none';
        connectedSection.style.display = 'flex';
        botNumberText.textContent = 'Nomor WhatsApp Terhubung: ' + (data.botNumber || 'Aktif');
      } else if (data.status === 'qr' || data.hasQR) {
        statusPill.className = 'status-pill qr';
        statusText.textContent = 'Menunggu Scan QR...';
        connectedSection.style.display = 'none';
        qrSection.style.display = 'block';

        if (data.qrDataUrl) {
          qrImage.src = data.qrDataUrl;
          qrImage.style.display = 'block';
          qrLoading.style.display = 'none';
        } else {
          qrImage.style.display = 'none';
          qrLoading.style.display = 'flex';
        }
      } else if (data.status === 'connecting') {
        statusPill.className = 'status-pill connecting';
        statusText.textContent = 'Menghubungkan ke WhatsApp...';
        connectedSection.style.display = 'none';
        qrSection.style.display = 'block';
        qrImage.style.display = 'none';
        qrLoading.style.display = 'flex';
      } else {
        statusPill.className = 'status-pill disconnected';
        statusText.textContent = 'Status: ' + data.status;
      }
    }

    async function resetSession() {
      if (!confirm('Yakin ingin mereset sesi WhatsApp? Anda perlu scan QR ulang.')) return;
      try {
        statusText.textContent = 'Mereset sesi...';
        await fetch('/api/auth/reset', { method: 'POST' });
        setTimeout(fetchStatus, 1500);
      } catch (e) {
        alert('Gagal mereset sesi: ' + e.message);
      }
    }

    async function handleSendTest(e) {
      e.preventDefault();
      const input = document.getElementById('testMsgInput');
      const resEl = document.getElementById('testResult');
      const btn = document.getElementById('btnTestSend');
      if (!input.value.trim()) return;

      btn.disabled = true;
      btn.textContent = 'Mengirim...';
      resEl.style.display = 'none';

      try {
        const res = await fetch('/api/manual-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: input.value.trim() })
        });
        const result = await res.json();
        if (result.ok) {
          resEl.style.display = 'block';
          resEl.textContent = '✅ ' + result.count + ' transaksi berhasil dicatat & masuk ke Telegram!';
        }
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Kirim';
      }
    }

    // Connect SSE for instantaneous realtime UI update
    function connectSSE() {
      try {
        const evt = new EventSource('/api/stream');
        evt.onmessage = (e) => {
          try {
            const parsed = JSON.parse(e.data);
            if (parsed.type === 'QR_UPDATE' || parsed.type === 'CONNECTED' || parsed.type === 'STATUS_UPDATE') {
              fetchStatus();
            }
          } catch {}
        };
      } catch {}
    }

    fetchStatus();
    connectSSE();
    setInterval(fetchStatus, 2500);
  </script>
</body>
</html>`;
}

// REST API Endpoints
app.get('/', (req, res) => {
  res.send(renderDashboardHtml());
});

app.get('/qr', (req, res) => {
  res.send(renderDashboardHtml());
});

app.get('/api/status', (req, res) => {
  const pending = getPendingTransactions();
  const tg = getTelegramConfig();
  const acc = getAccountsConfig();
  const localIp = getLocalNetworkIp();

  res.json({
    ok: true,
    status: botStatus,
    botNumber,
    hasQR: !!currentQR,
    qr: currentQR,
    qrDataUrl: currentQRDataUrl,
    pendingCount: pending.length,
    telegramConfigured: !!(tg.botToken && tg.chatId),
    primaryAccount: acc.primaryAccount || 'BSI',
    localIp,
    localUrl: `http://${localIp}:${PORT}`,
    tunnelUrl: currentTunnel ? currentTunnel.url : `https://${TUNNEL_SUBDOMAIN}.loca.lt`,
    tunnelStatus: currentTunnel ? 'active' : (isTunnelConnecting ? 'connecting' : 'offline'),
    uptime: Math.floor(process.uptime()),
    pid: process.pid
  });
});

// Fast Ping Endpoint for Healthcheck
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// Reset Auth Session Endpoint
app.post('/api/auth/reset', async (req, res) => {
  console.log('🔄 [Auth] Permintaan Reset Sesi WhatsApp diterima.');
  try {
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end();
      } catch {}
      sock = null;
    }
    clearAuthFolder();
    botStatus = 'starting';
    currentQR = null;
    currentQRDataUrl = null;
    botNumber = null;
    isReconnecting = false;
    setTimeout(startWhatsAppBot, 1000);
    res.json({ ok: true, message: 'Session reset successfully, generating new QR...' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get recent log lines
app.get('/api/logs', (req, res) => {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      const recent = lines.slice(-100);
      return res.json({ ok: true, logs: recent });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
  res.json({ ok: true, logs: [] });
});

// Configure Telegram Bot credentials for direct cloud bridge
app.post('/api/telegram-config', (req, res) => {
  const { botToken, chatId, autoSync } = req.body;
  if (botToken && chatId) {
    saveTelegramConfig({ botToken, chatId, autoSync });
    console.log('✅ [Server] Telegram Cloud DB credentials tersimpan di server lokal.');
  }
  res.json({ ok: true, message: 'Telegram config updated' });
});

// Configure Accounts and Primary Account
app.get('/api/accounts-config', (req, res) => {
  res.json({ ok: true, data: getAccountsConfig() });
});

app.post('/api/accounts-config', (req, res) => {
  const { primaryAccount, accounts } = req.body;
  const updated = saveAccountsConfig({
    primaryAccount: primaryAccount || 'BSI',
    accounts: Array.isArray(accounts) ? accounts : []
  });
  console.log(`✅ [Server] Rekening Utama diatur ke: "${updated.primaryAccount}", Total ${updated.accounts.length} rekening terdaftar.`);
  res.json({ ok: true, data: updated });
});

// SSE Live Stream for Realtime Frontend Sync
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);

  // Send initial connected ping
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', status: botStatus })}\n\n`);

  // Heartbeat ping every 15s to keep connection alive
  const pingInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(pingInterval);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    sseClients.delete(res);
  });
});

// Fetch pending transactions & clear queue
app.get('/api/pending', (req, res) => {
  const list = getPendingTransactions();
  res.json({ ok: true, data: list });
});

app.post('/api/pending/ack', (req, res) => {
  savePendingTransactions([]);
  res.json({ ok: true, message: 'Pending queue cleared' });
});

// Manual test endpoint (e.g. from browser or simulator)
app.post('/api/manual-test', async (req, res) => {
  const { message, options } = req.body;
  if (!message) return res.status(400).json({ ok: false, error: 'Message is required' });

  const accConfig = options || getAccountsConfig();
  const parsed = parseWhatsAppMessage(message, accConfig);
  if (parsed.length > 0) {
    const existing = getPendingTransactions();
    const updated = [...existing, ...parsed];
    savePendingTransactions(updated);
    broadcastNewTransactions(parsed);
    await pushToTelegramDirectly(parsed);
  }

  res.json({ ok: true, parsed, count: parsed.length });
});

// Initialize Baileys WhatsApp Bot with high-reliability keepalive
async function startWhatsAppBot() {
  if (isReconnecting) return;
  isReconnecting = true;

  try {
    // Cleanly close previous socket if any
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end();
      } catch {}
      sock = null;
    }

    // Auto-heal corrupted auth credentials
    ensureCleanAuthState();

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['FinFlow Server', 'Chrome', '122.0.0'],
      keepAliveIntervalMs: 25000,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      emitOwnEvents: true,
      retryRequestDelayMs: 2000
    });

    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
      } catch (err) {
        console.error('Error saving creds:', err);
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQR = qr;
        botStatus = 'qr';

        try {
          currentQRDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
        } catch (e) {
          currentQRDataUrl = null;
        }

        broadcastSSE('QR_UPDATE', { qr, qrDataUrl: currentQRDataUrl });

        console.log('\n======================================================');
        console.log('📱 SCAN QR CODE BERIKUT DENGAN WHATSAPP:');
        console.log('👉 ATAU BUKA DI BROWSER: http://localhost:5051/qr');
        console.log('======================================================');

        qrcodeTerminal.generate(qr, { small: true }, (asciiQr) => {
          originalLog('\n' + asciiQr + '\n');
          try {
            const timestamp = new Date().toLocaleString('id-ID');
            fs.appendFileSync(LOG_FILE, `\n[${timestamp}] SCAN QR CODE (Buka http://localhost:5051/qr):\n${asciiQr}\n\n`, 'utf8');
          } catch {}
        });

        console.log('Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat\n');
      }

      if (connection === 'open') {
        currentQR = null;
        currentQRDataUrl = null;
        botStatus = 'connected';
        botNumber = sock.user?.id ? sock.user.id.split(':')[0] : 'Aktif';

        try {
          await saveCreds();
        } catch {}

        broadcastSSE('CONNECTED', { botNumber });

        console.log('\n======================================================');
        console.log(`🟢 WhatsApp Bot FINFLOW Berhasil Terhubung! (${botNumber})`);
        console.log('💬 Siap menerima pesan chat pengeluaran & pemasukan.');
        console.log('🌐 Web Dashboard: http://localhost:5051/qr');
        console.log('======================================================\n');
      }

      if (connection === 'close') {
        botStatus = 'disconnected';
        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        console.log(`⚠️ Koneksi WhatsApp terputus (Status: ${statusCode || 'unknown'}). Reconnect: ${!isLoggedOut}`);

        if (isLoggedOut) {
          console.log('🚪 Sesi WhatsApp telah logout. Menghapus session lama untuk scan QR baru...');
          clearAuthFolder();
          currentQR = null;
          currentQRDataUrl = null;
          botNumber = null;
        }

        isReconnecting = false;
        setTimeout(startWhatsAppBot, isLoggedOut ? 2000 : 4000);
      }
    });

    // Listen to incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      // Support both notify and append (for Note-to-self / messages sent from linked phone)
      if (type !== 'notify' && type !== 'append') return;

      for (const msg of messages) {
        // Ignore status broadcasts
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

        // Extract message text
        const text = msg.message.conversation || 
          msg.message.extendedTextMessage?.text || 
          msg.message.imageMessage?.caption || 
          '';

        if (!text || !text.trim()) continue;

        // Ignore bot's own responses to prevent infinite loop
        if (text.startsWith('✅ *') || text.includes('#FINFLOW_DATA_START#') || text.includes('FinFlow: Transaksi Baru')) continue;

        // Fetch registered accounts and primary account
        const accConfig = getAccountsConfig();

        // Parse items from chat (e.g. "naspad 13000 sea / bensin 30k bsi / lauk 20k")
        const parsedItems = parseWhatsAppMessage(text.trim(), accConfig);

        if (parsedItems.length > 0) {
          const senderLabel = msg.pushName || msg.key.remoteJid;
          console.log(`📥 [WhatsApp] Menerima ${parsedItems.length} transaksi dari: ${senderLabel}`);
          console.log(JSON.stringify(parsedItems, null, 2));

          // Save to pending queue
          const current = getPendingTransactions();
          const updated = [...current, ...parsedItems];
          savePendingTransactions(updated);

          // Broadcast in real-time to FinFlow web app
          broadcastNewTransactions(parsedItems);

          // Direct cloud sync to Telegram
          await pushToTelegramDirectly(parsedItems);

          // Build a neat WhatsApp response receipt
          let totalExpense = 0;
          let totalIncome = 0;

          const lines = parsedItems.map((item, idx) => {
            const emoji = CATEGORY_EMOJI[item.category] || '💸';
            const accLabel = item.paymentMethod ? ` _(${item.paymentMethod})_` : '';
            if (item.type === 'income') {
              totalIncome += item.amount;
              return `${idx + 1}. ${emoji} *${item.title}* — +${formatRupiahSimple(item.amount)}${accLabel}`;
            } else {
              totalExpense += item.amount;
              return `${idx + 1}. ${emoji} *${item.title}* — ${formatRupiahSimple(item.amount)}${accLabel}`;
            }
          });

          const nowStr = new Date().toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          });

          let summarySection = '';
          if (totalExpense > 0 && totalIncome > 0) {
            summarySection = `💸 *Total Pengeluaran:* ${formatRupiahSimple(totalExpense)}\n💵 *Total Pemasukan:* +${formatRupiahSimple(totalIncome)}`;
          } else if (totalIncome > 0) {
            summarySection = `💵 *Total Pemasukan:* +${formatRupiahSimple(totalIncome)}`;
          } else {
            summarySection = `💰 *Total Pengeluaran:* ${formatRupiahSimple(totalExpense)}`;
          }

          const replyText = `✅ *${parsedItems.length} Catatan Berhasil Diinput ke FinFlow!* 🎉\n\n` +
            lines.join('\n') +
            `\n\n───────────────────\n` +
            `${summarySection}\n` +
            `📅 *Tanggal:* ${nowStr}\n` +
            `⚡ *Status:* Otomatis tersinkron ke aplikasi & Telegram`;

          // Send confirmation back to WhatsApp
          try {
            const targetJid = msg.key.remoteJid;
            await sock.sendMessage(targetJid, { text: replyText });
            console.log(`📤 [WhatsApp] Balasan struk berhasil dikirim ke ${targetJid}`);
          } catch (sendErr) {
            console.error('Failed to reply on WhatsApp:', sendErr);
          }
        }
      }
    });

  } catch (err) {
    console.error('Fatal error in startWhatsAppBot:', err);
    setTimeout(startWhatsAppBot, 5000);
  } finally {
    isReconnecting = false;
  }
}

// Automatic Persistent HTTPS Tunnel
let currentTunnel = null;
let isTunnelConnecting = false;

async function startPersistentTunnel() {
  if (isTunnelConnecting) return;
  isTunnelConnecting = true;

  try {
    if (currentTunnel) {
      try { currentTunnel.close(); } catch {}
      currentTunnel = null;
    }

    console.log(`🌐 Membuka HTTPS Tunnel (Subdomain: ${TUNNEL_SUBDOMAIN})...`);
    
    // Connect with strict 10-second timeout so it never hangs
    const tunnelPromise = localtunnel({
      port: PORT,
      subdomain: TUNNEL_SUBDOMAIN,
      local_host: '127.0.0.1'
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Localtunnel server timed out (10s)')), 10000)
    );

    currentTunnel = await Promise.race([tunnelPromise, timeoutPromise]);

    console.log('\n======================================================');
    console.log(`🔒 [HTTPS TUNNEL PERMANEN AKTIF]`);
    console.log(`🌐 URL Tetap: ${currentTunnel.url}`);
    console.log(`✨ URL ini siap digunakan saat mengakses dari luar rumah!`);
    console.log('======================================================\n');

    currentTunnel.on('close', () => {
      console.log('⚠️ Tunnel terputus. Menghubungkan ulang secara otomatis dalam 10 detik...');
      currentTunnel = null;
      isTunnelConnecting = false;
      setTimeout(startPersistentTunnel, 10000);
    });

    currentTunnel.on('error', (err) => {
      console.error('⚠️ Tunnel error:', err.message);
      currentTunnel = null;
      isTunnelConnecting = false;
      setTimeout(startPersistentTunnel, 10000);
    });
  } catch (err) {
    console.warn('⚠️ Gagal terhubung ke tunnel publik (Localtunnel sibuk):', err.message);
    console.log('💡 Tips: WhatsApp Bot & Telegram Cloud DB tetap AKTIF & sinkron 100% normal.');
    currentTunnel = null;
    isTunnelConnecting = false;
    setTimeout(startPersistentTunnel, 15000);
  } finally {
    isTunnelConnecting = false;
  }
}

// Start Express API Server
const server = app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalNetworkIp();
  console.log('\n======================================================');
  console.log(`🚀 FINFLOW BOT SERVER RUNNING ON PORT ${PORT}`);
  console.log(`📡 Localhost URL  : http://localhost:${PORT}`);
  console.log(`📱 Web Scanner QR : http://localhost:${PORT}/qr`);
  console.log(`📶 Wi-Fi LAN URL  : http://${localIp}:${PORT} (HP/Laptop)`);
  console.log(`🔄 Realtime Stream: http://localhost:${PORT}/api/stream`);
  console.log('======================================================\n');
  startWhatsAppBot();
  startPersistentTunnel();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} sudah digunakan oleh proses lain. Server bot ditutup untuk mencegah konflik duplikasi.`);
    process.exit(1);
  }
});
