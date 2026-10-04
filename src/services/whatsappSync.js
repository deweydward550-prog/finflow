import { db } from '../db/db';
import { pushDatabaseToTelegram, getTelegramConfig } from './telegramDb';

export function getBotServerUrl() {
  const saved = localStorage.getItem('finflow_wa_server_url');
  if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '');
  return 'http://localhost:5051';
}

export function setBotServerUrl(url) {
  if (!url || !url.trim()) {
    localStorage.removeItem('finflow_wa_server_url');
  } else {
    localStorage.setItem('finflow_wa_server_url', url.trim().replace(/\/+$/, ''));
  }
}

let eventSource = null;
let pollInterval = null;

export function initWhatsAppSync({ onNewTransactions, onStatusChange }) {
  const serverUrl = getBotServerUrl();

  // Sync Telegram credentials to local bot server so bot can push directly to Telegram
  const syncTelegramCredentialsToBot = async () => {
    try {
      const tgConfig = getTelegramConfig();
      if (tgConfig.botToken && tgConfig.chatId) {
        await fetch(`${serverUrl}/api/telegram-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            botToken: tgConfig.botToken,
            chatId: tgConfig.chatId,
            autoSync: tgConfig.autoSync
          })
        });
      }
    } catch {
      // Ignore if bot server is unreachable
    }
  };

  // 1. Initial status check
  const checkStatus = async () => {
    try {
      const currentUrl = getBotServerUrl();
      const res = await fetch(`${currentUrl}/api/status`);
      if (res.ok) {
        const data = await res.json();
        onStatusChange?.(data);
        syncTelegramCredentialsToBot();
        return true;
      }
    } catch {
      onStatusChange?.({ ok: false, status: 'offline' });
    }
    return false;
  };

  checkStatus();

  // 2. Fetch pending transactions helper
  const fetchPending = async () => {
    try {
      const currentUrl = getBotServerUrl();
      const res = await fetch(`${currentUrl}/api/pending`);
      if (res.ok) {
        const { data } = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          // Import to Dexie DB
          for (const item of data) {
            const existing = await db.transactions.where('id').equals(item.id).first();
            if (!existing) {
              await db.transactions.add({
                title: item.title,
                amount: item.amount,
                type: item.type || 'expense',
                category: item.category || 'Pengeluaran Lainnya',
                paymentMethod: item.paymentMethod || 'BCA',
                date: item.date,
                time: item.time || '12:00',
                notes: item.notes || 'Input otomatis via WhatsApp Bot',
                createdAt: item.createdAt || new Date().toISOString()
              });
            }
          }

          // Clear server queue
          await fetch(`${currentUrl}/api/pending/ack`, { method: 'POST' });

          // Notify frontend
          onNewTransactions?.(data);

          // Auto-sync to Telegram if active
          try {
            const tgConfig = getTelegramConfig();
            if (tgConfig.botToken && tgConfig.chatId && tgConfig.autoSync) {
              await pushDatabaseToTelegram();
            }
          } catch (e) {
            console.warn('Auto sync to telegram failed:', e);
          }
        }
      }
    } catch {
      // Server not running or blocked, ignore
    }
  };

  // 3. Connect to Realtime EventSource (SSE)
  const connectSSE = () => {
    if (eventSource) {
      eventSource.close();
    }

    try {
      const currentUrl = getBotServerUrl();
      eventSource = new EventSource(`${currentUrl}/api/stream`);

      eventSource.onopen = () => {
        onStatusChange?.({ ok: true, status: 'connected' });
        fetchPending();
      };

      eventSource.onmessage = async (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'NEW_TRANSACTIONS' && Array.isArray(parsed.payload)) {
            for (const item of parsed.payload) {
              const existing = await db.transactions.where('id').equals(item.id).first();
              if (!existing) {
                await db.transactions.add({
                  title: item.title,
                  amount: item.amount,
                  type: item.type || 'expense',
                  category: item.category || 'Pengeluaran Lainnya',
                  paymentMethod: item.paymentMethod || 'BCA',
                  date: item.date,
                  time: item.time || '12:00',
                  notes: item.notes || 'Input otomatis via WhatsApp Bot',
                  createdAt: item.createdAt || new Date().toISOString()
                });
              }
            }

            // Clear server queue
            fetch(`${getBotServerUrl()}/api/pending/ack`, { method: 'POST' }).catch(() => {});

            onNewTransactions?.(parsed.payload);

            // Auto-sync to Telegram
            try {
              const tgConfig = getTelegramConfig();
              if (tgConfig.botToken && tgConfig.chatId && tgConfig.autoSync) {
                await pushDatabaseToTelegram();
              }
            } catch (e) {
              console.warn('Auto sync to telegram failed:', e);
            }
          } else if (parsed.type === 'CONNECTED') {
            onStatusChange?.({ ok: true, status: parsed.status });
          }
        } catch (err) {
          console.error('Error handling SSE message:', err);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        onStatusChange?.({ ok: false, status: 'offline' });
      };
    } catch {
      // SSE not available
    }
  };

  connectSSE();

  // Fallback Polling every 5s
  pollInterval = setInterval(() => {
    fetchPending();
    checkStatus();
  }, 5000);

  // Return cleanup function
  return () => {
    if (eventSource) eventSource.close();
    if (pollInterval) clearInterval(pollInterval);
  };
}

export async function testSendManualChat(messageText, paymentMethod = 'BCA') {
  const currentUrl = getBotServerUrl();
  const res = await fetch(`${currentUrl}/api/manual-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: messageText, paymentMethod })
  });
  return res.json();
}
