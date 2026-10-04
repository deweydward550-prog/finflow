import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
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
  appendLog(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
};
console.error = (...args) => {
  originalError(...args);
  appendLog('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
};

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
  return {};
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
      return JSON.parse(data) || { primaryAccount: 'BCA', accounts: [] };
    }
  } catch (err) {
    console.error('Error reading accounts config:', err);
  }
  return { primaryAccount: 'BCA', accounts: [] };
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
let botNumber = null;
let sock = null;
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

// Broadcast new transactions to connected FinFlow web frontend via SSE
function broadcastNewTransactions(transactions) {
  if (!transactions || transactions.length === 0) return;
  const data = JSON.stringify({ type: 'NEW_TRANSACTIONS', payload: transactions });
  sseClients.forEach(client => {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (err) {
      console.error('Error sending SSE:', err);
    }
  });
}

// Push directly to Telegram Bot Cloud DB
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

    const text = `💬 *FinFlow: Transaksi Baru dari WhatsApp*\n` +
      `🕒 *Waktu*: ${nowStr}\n\n` +
      lines.join('\n') +
      `\n\n💰 *Total Pengeluaran*: ${formatRupiahSimple(totalExpense)}` +
      `\n\n⚡ _Tersinkronisasi otomatis dari WhatsApp Bot Lokal_`;

    const url = `https://api.telegram.org/bot${tg.botToken}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tg.chatId,
        text,
        parse_mode: 'Markdown'
      })
    });
    console.log('☁️ [Telegram] Berhasil mengirim notifikasi & data ke Telegram Cloud DB!');
    return true;
  } catch (err) {
    console.error('Failed to push directly to Telegram:', err);
    return false;
  }
}

// REST API Endpoints
app.get('/api/status', (req, res) => {
  const pending = getPendingTransactions();
  const tg = getTelegramConfig();
  const acc = getAccountsConfig();
  res.json({
    ok: true,
    status: botStatus,
    botNumber,
    hasQR: !!currentQR,
    qr: currentQR,
    pendingCount: pending.length,
    telegramConfigured: !!(tg.botToken && tg.chatId),
    primaryAccount: acc.primaryAccount || 'BCA',
    tunnelUrl: currentTunnel ? currentTunnel.url : `https://${TUNNEL_SUBDOMAIN}.loca.lt`,
    tunnelStatus: currentTunnel ? 'active' : (isTunnelConnecting ? 'connecting' : 'offline'),
    uptime: Math.floor(process.uptime()),
    pid: process.pid
  });
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
    primaryAccount: primaryAccount || 'BCA',
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

  req.on('close', () => {
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

// Initialize Baileys WhatsApp Bot
async function startWhatsAppBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['FinFlow Server', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQR = qr;
        botStatus = 'qr';
        console.log('\n======================================================');
        console.log('📱 SCAN QR CODE BERIKUT DENGAN WHATSAPP:');
        console.log('======================================================');
        qrcode.generate(qr, { small: true });
        console.log('Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat\n');
      }

      if (connection === 'open') {
        currentQR = null;
        botStatus = 'connected';
        botNumber = sock.user?.id ? sock.user.id.split(':')[0] : 'Aktif';
        console.log('\n======================================================');
        console.log(`🟢 WhatsApp Bot FINFLOW Berhasil Terhubung! (${botNumber})`);
        console.log('💬 Siap menerima pesan chat pengeluaran & pemasukan.');
        console.log('======================================================\n');
      }

      if (connection === 'close') {
        botStatus = 'disconnected';
        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('⚠️ Koneksi WhatsApp terputus. Menghubungkan kembali:', shouldReconnect);
        if (shouldReconnect) {
          setTimeout(startWhatsAppBot, 3000);
        } else {
          console.log('❌ Sesi telah keluar. Silakan scan QR code baru.');
          setTimeout(startWhatsAppBot, 3000);
        }
      }
    });

    // Listen to incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        // Ignore status broadcasts or empty messages
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

        // Extract message text
        const text = msg.message.conversation || 
          msg.message.extendedTextMessage?.text || 
          msg.message.imageMessage?.caption || 
          '';

        if (!text || !text.trim()) continue;

        // Fetch registered accounts and primary account
        const accConfig = getAccountsConfig();

        // Parse items from chat (e.g. "naspad 13000 sea / bensin 30k bsi / lauk 20k")
        const parsedItems = parseWhatsAppMessage(text.trim(), accConfig);

        if (parsedItems.length > 0) {
          console.log(`📥 [WhatsApp] Menerima ${parsedItems.length} transaksi dari: ${msg.pushName || msg.key.remoteJid}`);
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
            await sock.sendMessage(msg.key.remoteJid, { text: replyText }, { quoted: msg });
          } catch (sendErr) {
            console.error('Failed to reply on WhatsApp:', sendErr);
          }
        }
      }
    });

  } catch (err) {
    console.error('Fatal error in startWhatsAppBot:', err);
    setTimeout(startWhatsAppBot, 5000);
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

    console.log(`🌐 Membuka HTTPS Tunnel Permanen (Subdomain: ${TUNNEL_SUBDOMAIN})...`);
    currentTunnel = await localtunnel({
      port: PORT,
      subdomain: TUNNEL_SUBDOMAIN,
      local_host: '127.0.0.1'
    });

    console.log('\n======================================================');
    console.log(`🔒 [HTTPS TUNNEL PERMANEN AKTIF]`);
    console.log(`🌐 URL Tetap: ${currentTunnel.url}`);
    console.log(`✨ URL ini TIDAK PERNAH BERUBAH dan siap digunakan di Vercel!`);
    console.log('======================================================\n');

    currentTunnel.on('close', () => {
      console.log('⚠️ Tunnel terputus. Menghubungkan ulang secara otomatis dalam 5 detik...');
      currentTunnel = null;
      isTunnelConnecting = false;
      setTimeout(startPersistentTunnel, 5000);
    });

    currentTunnel.on('error', (err) => {
      console.error('⚠️ Tunnel error:', err.message);
      currentTunnel = null;
      isTunnelConnecting = false;
      setTimeout(startPersistentTunnel, 5000);
    });
  } catch (err) {
    console.error('⚠️ Gagal membuka tunnel otomatis:', err.message);
    currentTunnel = null;
    isTunnelConnecting = false;
    setTimeout(startPersistentTunnel, 8000);
  } finally {
    isTunnelConnecting = false;
  }
}

// Start Express API Server
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n======================================================');
  console.log(`🚀 FINFLOW BOT SERVER RUNNING ON http://localhost:${PORT}`);
  console.log(`📡 API Status: http://localhost:${PORT}/api/status`);
  console.log(`🔄 Realtime Stream: http://localhost:${PORT}/api/stream`);
  console.log('======================================================\n');
  startWhatsAppBot();
  startPersistentTunnel();
});
