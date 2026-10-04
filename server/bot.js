import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
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

// REST API Endpoints
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
    pendingCount: pending.length,
    telegramConfigured: !!(tg.botToken && tg.chatId),
    primaryAccount: acc.primaryAccount || 'BCA',
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

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['FinFlow Server', 'Chrome', '120.0.0'],
      keepAliveIntervalMs: 25000,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      emitOwnEvents: true,
      retryRequestDelayMs: 2000
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
        isReconnecting = false;
        setTimeout(startWhatsAppBot, shouldReconnect ? 2000 : 5000);
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
app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalNetworkIp();
  console.log('\n======================================================');
  console.log(`🚀 FINFLOW BOT SERVER RUNNING ON PORT ${PORT}`);
  console.log(`📡 Localhost URL : http://localhost:${PORT}`);
  console.log(`📶 Wi-Fi LAN URL  : http://${localIp}:${PORT} (Sangat Cepat untuk HP/Laptop)`);
  console.log(`🔄 Realtime Stream: http://localhost:${PORT}/api/stream`);
  console.log('======================================================\n');
  startWhatsAppBot();
  startPersistentTunnel();
});
