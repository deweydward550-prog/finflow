/**
 * FinFlow Telegram Cloud Database Service
 * Uses Telegram Bot API as a 100% free, private, cloud-synced text/JSON database.
 */

import { exportDatabaseToJson, importDatabaseFromJson } from '../db/db';

const TELEGRAM_CONFIG_KEY = 'finflow_telegram_config';

// Get stored Telegram configuration
export function getTelegramConfig() {
  try {
    const raw = localStorage.getItem(TELEGRAM_CONFIG_KEY);
    if (!raw) {
      return {
        botToken: '',
        chatId: '',
        autoSync: true,
        lastSynced: null,
        isConnected: false
      };
    }
    return JSON.parse(raw);
  } catch (e) {
    return {
      botToken: '',
      chatId: '',
      autoSync: true,
      lastSynced: null,
      isConnected: false
    };
  }
}

// Save Telegram configuration
export function saveTelegramConfig(config) {
  const current = getTelegramConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(TELEGRAM_CONFIG_KEY, JSON.stringify(updated));
  return updated;
}

// Test Telegram Connection by sending a hello ping
export async function testTelegramConnection(botToken, chatId) {
  if (!botToken || !chatId) {
    throw new Error('Bot Token dan Chat ID tidak boleh kosong.');
  }

  const token = botToken.trim();
  const targetChat = chatId.trim();

  const nowStr = new Date().toLocaleString('id-ID', {
    dateStyle: 'full',
    timeStyle: 'medium'
  });

  const text = `🟢 *FinFlow Telegram Database Terhubung!*\n\n` +
    `📅 *Waktu*: ${nowStr}\n` +
    `🤖 *Status*: Cloud Database Aktif & Siap Digunakan\n` +
    `🔒 *Keamanan*: 100% Privat & Gratis Selamanya\n\n` +
    `Setiap transaksi baru dan perubahan catatan keuangan akan otomatis disimpan ke sini sebagai *text database*.`;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: targetChat,
      text: text,
      parse_mode: 'Markdown'
    })
  });

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.description || 'Gagal terhubung ke Telegram Bot API.');
  }

  saveTelegramConfig({
    botToken: token,
    chatId: targetChat,
    isConnected: true,
    lastSynced: new Date().toISOString()
  });

  return json.result;
}

// Push local database state to Telegram as text / JSON
export async function pushDatabaseToTelegram(overrideData = null) {
  const config = getTelegramConfig();
  if (!config.botToken || !config.chatId) {
    return { skipped: true, reason: 'Telegram not configured' };
  }

  const jsonString = overrideData || await exportDatabaseToJson();
  const parsed = JSON.parse(jsonString);

  const txCount = parsed.data?.transactions?.length || 0;
  const recurringCount = parsed.data?.recurringExpenses?.length || 0;
  
  // Calculate summary
  let totalIncome = 0;
  let totalExpense = 0;
  (parsed.data?.transactions || []).forEach(t => {
    if (t.type === 'income') totalIncome += t.amount;
    else totalExpense += t.amount;
  });
  const balance = totalIncome - totalExpense;

  const nowStr = new Date().toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  // Format currency
  const formatRp = (n) => 'Rp ' + Math.abs(n).toLocaleString('id-ID');

  const compactJson = JSON.stringify(parsed);

  // If payload is within Telegram message limit (~4000 chars)
  if (compactJson.length < 3200) {
    const messageText = 
      `📦 *FinFlow Database Snapshot*\n` +
      `🕒 *Tersimpan*: ${nowStr}\n` +
      `💰 *Saldo*: ${balance >= 0 ? '+' : '-'}${formatRp(balance)}\n` +
      `📝 *Transaksi*: ${txCount} | 🔄 *Tagihan*: ${recurringCount}\n\n` +
      `#FINFLOW_DATA_START#\n${compactJson}\n#FINFLOW_DATA_END#`;

    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: messageText
      })
    });

    const result = await res.json();
    if (!result.ok) {
      throw new Error(result.description || 'Gagal mengirim data ke Telegram.');
    }

    saveTelegramConfig({ lastSynced: new Date().toISOString(), isConnected: true });
    return { success: true, mode: 'text', messageId: result.result.message_id };
  } else {
    // If payload is larger, send as a JSON document attachment
    const blob = new Blob([jsonString], { type: 'application/json' });
    const formData = new FormData();
    formData.append('chat_id', config.chatId);
    formData.append('caption', `📦 *FinFlow Cloud Database File*\n🕒 ${nowStr}\n💰 Saldo: ${balance >= 0 ? '+' : '-'}${formatRp(balance)} (${txCount} transaksi)`);
    formData.append('document', blob, `finflow_db_${Date.now()}.json`);

    const url = `https://api.telegram.org/bot${config.botToken}/sendDocument`;
    const res = await fetch(url, {
      method: 'POST',
      body: formData
    });

    const result = await res.json();
    if (!result.ok) {
      throw new Error(result.description || 'Gagal mengirim dokumen database ke Telegram.');
    }

    saveTelegramConfig({ lastSynced: new Date().toISOString(), isConnected: true });
    return { success: true, mode: 'document', messageId: result.result.message_id };
  }
}

// Pull the latest database state from Telegram chat / updates
export async function pullDatabaseFromTelegram() {
  const config = getTelegramConfig();
  if (!config.botToken || !config.chatId) {
    throw new Error('Telegram Bot Token dan Chat ID belum dikonfigurasi.');
  }

  // Fetch recent updates from bot
  const url = `https://api.telegram.org/bot${config.botToken}/getUpdates?limit=100`;
  const res = await fetch(url);
  const result = await res.json();

  if (!result.ok) {
    throw new Error(result.description || 'Gagal mengambil data dari Telegram Bot.');
  }

  const updates = result.result || [];
  
  // Find the latest message containing database snapshot (either text or document)
  let foundJson = null;
  let snapshotDate = null;

  // Search in reverse (newest first)
  for (let i = updates.length - 1; i >= 0; i--) {
    const msg = updates[i].message || updates[i].channel_post;
    if (!msg) continue;

    // Check if matching chat_id
    const msgChatId = String(msg.chat.id);
    const configChatId = String(config.chatId);
    if (msgChatId !== configChatId && !configChatId.includes(msgChatId)) {
      // Continue or check if bot has messages
    }

    // 1. Check in message text
    if (msg.text && msg.text.includes('#FINFLOW_DATA_START#')) {
      const match = msg.text.match(/#FINFLOW_DATA_START#([\s\S]*?)#FINFLOW_DATA_END#/);
      if (match && match[1]) {
        try {
          foundJson = match[1].trim();
          snapshotDate = new Date(msg.date * 1000);
          break;
        } catch (e) {}
      }
    }

    // 2. Check if document attached (finflow_db_*.json)
    if (msg.document && msg.document.file_name && msg.document.file_name.endsWith('.json')) {
      try {
        const fileId = msg.document.file_id;
        const fileInfoRes = await fetch(`https://api.telegram.org/bot${config.botToken}/getFile?file_id=${fileId}`);
        const fileInfo = await fileInfoRes.json();
        if (fileInfo.ok && fileInfo.result.file_path) {
          const fileContentRes = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${fileInfo.result.file_path}`);
          foundJson = await fileContentRes.text();
          snapshotDate = new Date(msg.date * 1000);
          break;
        }
      } catch (e) {
        console.warn('Failed to fetch document file from Telegram:', e);
      }
    }
  }

  if (!foundJson) {
    throw new Error('Tidak ditemukan catatan database FinFlow di riwayat chat Telegram. Silakan lakukan "Simpan Database ke Telegram" terlebih dahulu.');
  }

  // Import into local database
  await importDatabaseFromJson(foundJson);
  
  saveTelegramConfig({
    lastSynced: new Date().toISOString(),
    isConnected: true
  });

  return {
    success: true,
    snapshotDate
  };
}
