/**
 * FinFlow Telegram Cloud Database Service
 * Uses Telegram Bot API as a 100% free, private, cloud-synced text/JSON database.
 * Supports auto-sync across all devices (mobile, tablet, desktop).
 */

import { exportDatabaseToJson, importDatabaseFromJson } from '../db/db';

const TELEGRAM_CONFIG_KEY = 'finflow_telegram_config';
const LAST_SYNCED_MSG_ID_KEY = 'finflow_tg_last_msg_id';

export const DEFAULT_TELEGRAM_BOT_TOKEN = '8732879033:AAFtR0soqSR0LYXfsMaxpm5JbQVH9xbc714';
export const DEFAULT_TELEGRAM_CHAT_ID = '372613511';

// Get stored Telegram configuration
export function getTelegramConfig() {
  try {
    const raw = localStorage.getItem(TELEGRAM_CONFIG_KEY);
    if (!raw) {
      return {
        botToken: DEFAULT_TELEGRAM_BOT_TOKEN,
        chatId: DEFAULT_TELEGRAM_CHAT_ID,
        autoSync: true,
        lastSynced: null,
        isConnected: true
      };
    }
    const parsed = JSON.parse(raw);
    return {
      botToken: parsed.botToken || DEFAULT_TELEGRAM_BOT_TOKEN,
      chatId: parsed.chatId || DEFAULT_TELEGRAM_CHAT_ID,
      autoSync: parsed.autoSync !== false,
      lastSynced: parsed.lastSynced || null,
      isConnected: parsed.isConnected !== false
    };
  } catch (e) {
    return {
      botToken: DEFAULT_TELEGRAM_BOT_TOKEN,
      chatId: DEFAULT_TELEGRAM_CHAT_ID,
      autoSync: true,
      lastSynced: null,
      isConnected: true
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

// Push local database state to Telegram as text / JSON and pin it
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
  let messageId = null;

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
    messageId = result.result.message_id;
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
    messageId = result.result.message_id;
  }

  // Pin the latest database snapshot in Telegram so any device can find it instantly via getChat
  if (messageId) {
    try {
      await fetch(`https://api.telegram.org/bot${config.botToken}/pinChatMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          message_id: messageId,
          disable_notification: true
        })
      });
      localStorage.setItem(LAST_SYNCED_MSG_ID_KEY, String(messageId));
    } catch (e) {
      console.warn('Telegram pin message error:', e);
    }
  }

  saveTelegramConfig({ lastSynced: new Date().toISOString(), isConnected: true });
  return { success: true, messageId };
}

// Pull the latest database state from Telegram chat / pinned snapshot
export async function pullDatabaseFromTelegram(isAutoSync = false) {
  const config = getTelegramConfig();
  if (!config.botToken || !config.chatId) {
    if (isAutoSync) return { skipped: true, reason: 'No telegram credentials' };
    throw new Error('Telegram Bot Token dan Chat ID belum dikonfigurasi.');
  }

  let foundJson = null;
  let snapshotDate = null;
  let snapshotMessageId = null;

  // 1. FAST LOOKUP: Check pinned message from getChat
  try {
    const chatUrl = `https://api.telegram.org/bot${config.botToken}/getChat?chat_id=${config.chatId}`;
    const chatRes = await fetch(chatUrl);
    const chatData = await chatRes.json();
    
    if (chatData.ok && chatData.result?.pinned_message) {
      const pinMsg = chatData.result.pinned_message;
      snapshotMessageId = pinMsg.message_id;
      snapshotDate = pinMsg.date ? new Date(pinMsg.date * 1000) : new Date();

      if (pinMsg.text && pinMsg.text.includes('#FINFLOW_DATA_START#')) {
        const match = pinMsg.text.match(/#FINFLOW_DATA_START#([\s\S]*?)#FINFLOW_DATA_END#/);
        if (match && match[1]) {
          foundJson = match[1].trim();
        }
      } else if (pinMsg.document && pinMsg.document.file_id) {
        const fileInfoRes = await fetch(`https://api.telegram.org/bot${config.botToken}/getFile?file_id=${pinMsg.document.file_id}`);
        const fileInfo = await fileInfoRes.json();
        if (fileInfo.ok && fileInfo.result?.file_path) {
          const fileContentRes = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${fileInfo.result.file_path}`);
          foundJson = await fileContentRes.text();
        }
      }
    }
  } catch (e) {
    console.warn('Error fetching Telegram pinned message:', e);
  }

  // 2. FALLBACK LOOKUP: Check getUpdates
  if (!foundJson) {
    try {
      const url = `https://api.telegram.org/bot${config.botToken}/getUpdates?limit=100`;
      const res = await fetch(url);
      const result = await res.json();
      if (result.ok && result.result) {
        const updates = result.result;
        for (let i = updates.length - 1; i >= 0; i--) {
          const msg = updates[i].message || updates[i].channel_post;
          if (!msg) continue;
          if (msg.text && msg.text.includes('#FINFLOW_DATA_START#')) {
            const match = msg.text.match(/#FINFLOW_DATA_START#([\s\S]*?)#FINFLOW_DATA_END#/);
            if (match && match[1]) {
              foundJson = match[1].trim();
              snapshotDate = new Date(msg.date * 1000);
              snapshotMessageId = msg.message_id;
              break;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error fetching Telegram updates fallback:', e);
    }
  }

  if (!foundJson) {
    if (isAutoSync) return { skipped: true, reason: 'No snapshot in Telegram' };
    throw new Error('Tidak ditemukan catatan database FinFlow di Telegram. Silakan lakukan "Simpan ke Telegram" dari perangkat utama terlebih dahulu.');
  }

  // Check if we already have this exact snapshot imported
  const lastImportedId = localStorage.getItem(LAST_SYNCED_MSG_ID_KEY);
  if (isAutoSync && lastImportedId && snapshotMessageId && String(lastImportedId) === String(snapshotMessageId)) {
    return { skipped: true, reason: 'Already at latest snapshot', snapshotMessageId };
  }

  // Import into local database
  await importDatabaseFromJson(foundJson);

  if (snapshotMessageId) {
    localStorage.setItem(LAST_SYNCED_MSG_ID_KEY, String(snapshotMessageId));
  }

  saveTelegramConfig({
    lastSynced: new Date().toISOString(),
    isConnected: true
  });

  return {
    success: true,
    snapshotDate,
    snapshotMessageId
  };
}

// Background auto-sync worker
export function initTelegramAutoSync({ onDataUpdated }) {
  let isSyncing = false;

  const runSync = async () => {
    if (isSyncing) return;
    try {
      isSyncing = true;
      const res = await pullDatabaseFromTelegram(true);
      if (res && res.success && onDataUpdated) {
        onDataUpdated(res);
      }
    } catch (err) {
      // Background sync silently catches error
    } finally {
      isSyncing = false;
    }
  };

  // 1. Initial sync on boot
  runSync();

  // 2. Sync when browser tab becomes active
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      runSync();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', runSync);

  // 3. Periodic background sync every 30 seconds
  const intervalId = setInterval(runSync, 30000);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', runSync);
    clearInterval(intervalId);
  };
}
