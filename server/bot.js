import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import { createClient } from '@supabase/supabase-js';
import { parseWhatsAppMessage } from './nlpParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 5051;
const DATA_DIR = path.join(__dirname, 'data');
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');
const SUPABASE_CONFIG_FILE = path.join(DATA_DIR, 'supabase_config.json');
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
  const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  appendLog(text);
};
console.error = (...args) => {
  originalError(...args);
  const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  appendLog('[ERROR] ' + text);
};

// =========================================================================
// SUPABASE CLIENT INITIALIZATION
// =========================================================================
function getSupabaseConfig() {
  try {
    if (fs.existsSync(SUPABASE_CONFIG_FILE)) {
      const data = fs.readFileSync(SUPABASE_CONFIG_FILE, 'utf8');
      return JSON.parse(data) || {};
    }
  } catch (err) {
    console.error('Error reading Supabase config:', err.message);
  }
  return { url: '', anonKey: '' };
}

function saveSupabaseConfig(cfg) {
  try {
    const current = getSupabaseConfig();
    const updated = { ...current, ...cfg };
    fs.writeFileSync(SUPABASE_CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');
    initSupabaseClient();
    return updated;
  } catch (err) {
    console.error('Error saving Supabase config:', err.message);
  }
}

let supabase = null;
function initSupabaseClient() {
  const cfg = getSupabaseConfig();
  if (cfg.url && cfg.anonKey) {
    try {
      supabase = createClient(cfg.url.trim(), cfg.anonKey.trim());
      console.log('⚡ [Supabase] Client berhasil diinisialisasi:', cfg.url);
    } catch (err) {
      console.error('⚠️ [Supabase] Gagal inisialisasi client:', err.message);
      supabase = null;
    }
  } else {
    supabase = null;
    console.log('ℹ️ [Supabase] Belum dikonfigurasi. Atur di http://localhost:5051');
  }
}
initSupabaseClient();

// =========================================================================
// WHATSAPP BOT STATE & SESSION
// =========================================================================
let botStatus = 'starting'; // 'qr' | 'connecting' | 'connected' | 'disconnected'
let currentQR = null;
let currentQRDataUrl = null;
let botNumber = null;
let sock = null;
let isReconnecting = false;

function clearAuthFolder() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      const files = fs.readdirSync(AUTH_DIR);
      for (const file of files) {
        try { fs.unlinkSync(path.join(AUTH_DIR, file)); } catch {}
      }
      console.log('🧹 [Auth] Folder sesi WhatsApp (auth_info_baileys) telah dibersihkan.');
    }
  } catch (err) {
    console.error('Gagal membersihkan folder auth:', err.message);
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

function formatRupiahSimple(num) {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

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

// =========================================================================
// BAILEYS WHATSAPP BOT CLIENT
// =========================================================================
async function startWhatsAppBot() {
  if (isReconnecting) return;
  isReconnecting = true;

  try {
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end();
      } catch {}
      sock = null;
    }

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
      try { await saveCreds(); } catch (err) { console.error('Error saving creds:', err.message); }
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

        console.log('\n======================================================');
        console.log('📱 SCAN QR CODE DENGAN WHATSAPP:');
        console.log('👉 ATAU BUKA DI BROWSER: http://localhost:5051/qr');
        console.log('======================================================');

        qrcodeTerminal.generate(qr, { small: true }, (asciiQr) => {
          originalLog('\n' + asciiQr + '\n');
        });
      }

      if (connection === 'open') {
        currentQR = null;
        currentQRDataUrl = null;
        botStatus = 'connected';
        botNumber = sock.user?.id ? sock.user.id.split(':')[0] : 'Aktif';

        try { await saveCreds(); } catch {}

        console.log('\n======================================================');
        console.log(`🟢 WhatsApp Bot FINFLOW Terhubung! (${botNumber})`);
        console.log('💬 Kirim pesan seperti "naspad 13000 sea / bensin 30k"');
        console.log('⚡ Otomatis tersinkronisasi instan ke Supabase Realtime');
        console.log('🌐 Dashboard: http://localhost:5051');
        console.log('======================================================\n');
      }

      if (connection === 'close') {
        botStatus = 'disconnected';
        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        console.log(`⚠️ Koneksi WhatsApp terputus (Status: ${statusCode || 'unknown'}). Reconnect: ${!isLoggedOut}`);

        if (isLoggedOut) {
          console.log('🚪 Sesi WhatsApp logout. Menghapus session lama untuk scan QR baru...');
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
      if (type !== 'notify' && type !== 'append') return;

      for (const msg of messages) {
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

        const text = msg.message.conversation || 
          msg.message.extendedTextMessage?.text || 
          msg.message.imageMessage?.caption || 
          '';

        if (!text || !text.trim()) continue;

        // Ignore bot's own responses
        if (text.startsWith('✅ *') || text.includes('FinFlow: Transaksi Baru')) continue;

        // Parse items from chat
        const parsedItems = parseWhatsAppMessage(text.trim());

        if (parsedItems.length > 0) {
          const senderLabel = msg.pushName || msg.key.remoteJid;
          console.log(`📥 [WhatsApp] Menerima ${parsedItems.length} transaksi dari: ${senderLabel}`);

          // 1. Direct Save to Supabase (Instant Realtime Broadcast to All Devices)
          let supabaseSuccess = false;
          let supabaseErrorMsg = '';

          if (supabase) {
            try {
              const rowsToInsert = parsedItems.map(item => ({
                id: item.id,
                title: item.title,
                amount: item.amount,
                type: item.type || 'expense',
                category: item.category,
                date: item.date,
                time: item.time || '',
                payment_method: item.paymentMethod || 'BSI',
                notes: item.notes || `Input otomatis via WhatsApp Bot (${item.paymentMethod || 'BSI'})`,
                source: 'whatsapp',
                created_at: item.createdAt || new Date().toISOString()
              }));

              const { error } = await supabase.from('transactions').insert(rowsToInsert);
              if (error) {
                console.error('❌ [Supabase] Error inserting rows:', error.message);
                supabaseErrorMsg = error.message;
              } else {
                console.log(`⚡ [Supabase] Berhasil menyimpan ${rowsToInsert.length} transaksi ke Cloud!`);
                supabaseSuccess = true;
              }
            } catch (err) {
              console.error('❌ [Supabase] Exception saat insert:', err.message);
              supabaseErrorMsg = err.message;
            }
          } else {
            console.warn('⚠️ [Supabase] Belum terhubung! Atur URL & Key di http://localhost:5051');
          }

          // 2. Build structured WhatsApp receipt reply
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

          const statusFooter = supabaseSuccess
            ? `⚡ *Status:* Tersimpan di Supabase & Realtime ke seluruh HP!`
            : `⚠️ *Status:* ${supabaseErrorMsg ? `Error Supabase: ${supabaseErrorMsg}` : 'Supabase belum diatur di server (buka http://localhost:5051)'}`;

          const replyText = `✅ *${parsedItems.length} Catatan Berhasil Diinput ke FinFlow!* 🎉\n\n` +
            lines.join('\n') +
            `\n\n───────────────────\n` +
            `${summarySection}\n` +
            `📅 *Tanggal:* ${nowStr}\n` +
            `${statusFooter}`;

          // Send confirmation back to WhatsApp
          try {
            await sock.sendMessage(msg.key.remoteJid, { text: replyText });
            console.log(`📤 [WhatsApp] Balasan struk berhasil dikirim ke ${msg.key.remoteJid}`);
          } catch (sendErr) {
            console.error('Failed to reply on WhatsApp:', sendErr.message);
          }
        }
      }
    });

  } catch (err) {
    console.error('Error starting WhatsApp bot:', err.message);
    isReconnecting = false;
    setTimeout(startWhatsAppBot, 5000);
  } finally {
    isReconnecting = false;
  }
}

// =========================================================================
// ULTRA-LEAN DASHBOARD & REST API
// =========================================================================
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send(renderDashboardHtml());
});

app.get('/qr', (req, res) => {
  res.send(renderDashboardHtml());
});

app.get('/api/status', (req, res) => {
  const cfg = getSupabaseConfig();
  res.json({
    ok: true,
    status: botStatus,
    botNumber,
    hasQR: !!currentQR,
    qr: currentQR,
    qrDataUrl: currentQRDataUrl,
    supabaseConfigured: Boolean(cfg.url && cfg.anonKey),
    supabaseUrl: cfg.url || '',
    uptime: Math.floor(process.uptime()),
    pid: process.pid
  });
});

app.post('/api/config', (req, res) => {
  const { url, anonKey } = req.body;
  if (!url || !anonKey) {
    return res.status(400).json({ ok: false, error: 'URL dan Anon Key diperlukan' });
  }
  const updated = saveSupabaseConfig({ url, anonKey });
  res.json({ ok: true, message: 'Konfigurasi Supabase berhasil disimpan', data: updated });
});

app.post('/api/auth/reset', (req, res) => {
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
    res.json({ ok: true, message: 'Sesi direset, QR code baru dibuat.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function renderDashboardHtml() {
  const cfg = getSupabaseConfig();
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FinFlow Bot & Supabase Cloud Hub</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(22, 30, 49, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #10b981;
      --primary-hover: #059669;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: radial-gradient(circle at top center, #1e293b 0%, #0b0f19 100%);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .container { width: 100%; max-width: 520px; display: flex; flex-direction: column; gap: 1.25rem; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 1.75rem;
      backdrop-filter: blur(16px);
      box-shadow: 0 20px 40px -15px rgba(0,0,0,0.5);
    }
    .header { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
    .logo-badge {
      display: inline-flex; align-items: center; gap: 0.5rem;
      background: linear-gradient(135deg, #10b981, #065f46);
      color: #fff; padding: 0.4rem 1rem; border-radius: 9999px;
      font-size: 0.85rem; font-weight: 700; text-transform: uppercase;
    }
    h1 { font-size: 1.4rem; font-weight: 800; }
    .status-badge {
      display: inline-flex; align-items: center; gap: 0.5rem;
      padding: 0.4rem 0.9rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 600;
      margin-top: 0.4rem;
    }
    .status-badge.connected { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .status-badge.qr { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .status-badge.offline { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .qr-box {
      margin: 1.25rem 0; padding: 1rem; background: #fff; border-radius: 16px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    }
    .qr-box img { width: 220px; height: 220px; display: block; image-rendering: pixelated; }
    .cfg-box { margin-top: 1rem; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 1rem; }
    .form-group { margin-bottom: 0.75rem; text-align: left; }
    .form-group label { display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem; font-weight: 600; }
    .input-ctrl {
      width: 100%; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px; padding: 0.6rem 0.8rem; color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;
    }
    .btn {
      width: 100%; padding: 0.7rem; border-radius: 10px; font-weight: 700; font-size: 0.85rem;
      cursor: pointer; border: none; transition: 0.2s;
    }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-secondary { background: rgba(255, 255, 255, 0.08); color: var(--text); border: 1px solid var(--card-border); margin-top: 0.5rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo-badge">⚡ FinFlow & Supabase</div>
        <h1>WhatsApp Bot Server Hub</h1>
        <div id="statusBadge" class="status-badge ${botStatus === 'connected' ? 'connected' : botStatus === 'qr' ? 'qr' : 'offline'}">
          ${botStatus === 'connected' ? `🟢 WhatsApp Terhubung (${botNumber || 'Aktif'})` : botStatus === 'qr' ? '🟡 Menunggu Scan QR WhatsApp' : '⚪ Menghubungkan...'}
        </div>
      </div>

      <div id="qrArea" style="${botStatus === 'connected' ? 'display: none;' : ''}">
        <div class="qr-box">
          <img id="qrImg" src="${currentQRDataUrl || ''}" style="${currentQRDataUrl ? '' : 'display: none;'}" alt="QR Code WhatsApp" />
          <p id="qrNotice" style="${currentQRDataUrl ? 'display: none;' : ''}; color: #333; font-size: 0.85rem;">Membuat QR code...</p>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted); text-align: center;">
          Buka WhatsApp di HP &gt; Perangkat Tertaut &gt; Tautkan Perangkat lalu scan QR di atas.
        </p>
      </div>

      <div id="connectedArea" style="${botStatus === 'connected' ? '' : 'display: none;'}; text-align: center; margin: 1.25rem 0;">
        <h3 style="color: #34d399; font-size: 1.1rem; margin-bottom: 0.35rem;">WhatsApp Bot Siap & Aktif!</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted);">
          Kirim chat pengeluaran di WhatsApp, transaksi akan otomatis tersimpan langsung ke <strong>Supabase</strong> dan muncul di semua perangkat secara instan!
        </p>
      </div>

      <div class="cfg-box">
        <h4 style="font-size: 0.85rem; font-weight: 700; margin-bottom: 0.5rem; color: #38bdf8;">
          ⚡ Konfigurasi Supabase Cloud (${cfg.url ? '🟢 Terhubung' : '⚪ Belum Diatur'})
        </h4>
        <form onsubmit="handleSaveConfig(event)">
          <div class="form-group">
            <label>Project URL</label>
            <input type="text" id="supabaseUrl" class="input-ctrl" value="${cfg.url || ''}" placeholder="https://xyzcompany.supabase.co" required />
          </div>
          <div class="form-group">
            <label>Anon Key</label>
            <input type="password" id="supabaseKey" class="input-ctrl" value="${cfg.anonKey || ''}" placeholder="eyJhbGciOi..." required />
          </div>
          <button type="submit" class="btn btn-primary" id="btnSave">Simpan Konfigurasi</button>
        </form>
        <button onclick="handleResetAuth()" class="btn btn-secondary" style="color: #f87171;">🗑️ Reset Sesi WhatsApp</button>
      </div>
    </div>
  </div>

  <script>
    async function handleSaveConfig(e) {
      e.preventDefault();
      const url = document.getElementById('supabaseUrl').value.trim();
      const anonKey = document.getElementById('supabaseKey').value.trim();
      const btn = document.getElementById('btnSave');
      btn.textContent = 'Menyimpan...';
      try {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, anonKey })
        });
        const data = await res.json();
        if (data.ok) {
          alert('✅ Konfigurasi Supabase berhasil disimpan! Bot kini tersambung ke Cloud.');
          location.reload();
        }
      } catch (err) {
        alert('Gagal: ' + err.message);
      } finally {
        btn.textContent = 'Simpan Konfigurasi';
      }
    }

    async function handleResetAuth() {
      if (!confirm('Yakin ingin mereset sesi WhatsApp?')) return;
      await fetch('/api/auth/reset', { method: 'POST' });
      location.reload();
    }

    // Auto poll status every 3s
    setInterval(async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.qrDataUrl && document.getElementById('qrImg')) {
          document.getElementById('qrImg').src = data.qrDataUrl;
          document.getElementById('qrImg').style.display = 'block';
          document.getElementById('qrNotice').style.display = 'none';
        }
        if (data.status === 'connected') {
          document.getElementById('qrArea').style.display = 'none';
          document.getElementById('connectedArea').style.display = 'block';
          document.getElementById('statusBadge').className = 'status-badge connected';
          document.getElementById('statusBadge').textContent = '🟢 WhatsApp Terhubung (' + (data.botNumber || 'Aktif') + ')';
        }
      } catch {}
    }, 3000);
  </script>
</body>
</html>`;
}

// Start HTTP server & WhatsApp bot
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [Server] FinFlow Hub berjalan di http://localhost:${PORT}`);
  startWhatsAppBot();
});
