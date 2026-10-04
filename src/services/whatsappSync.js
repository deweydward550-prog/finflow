import { db, getCustomPaymentMethods, getPrimaryPaymentMethod } from '../db/db';
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

const COMMON_HEADERS = {
  'Bypass-Tunnel-Reminder': 'true',
  'bypass-tunnel-reminder': 'true'
};

let eventSource = null;
let pollInterval = null;

export async function syncAccountsToBotServer() {
  try {
    const serverUrl = getBotServerUrl();
    const accounts = getCustomPaymentMethods();
    const primary = getPrimaryPaymentMethod();
    await fetch(`${serverUrl}/api/accounts-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...COMMON_HEADERS
      },
      body: JSON.stringify({
        primaryAccount: primary ? primary.name : 'BCA',
        accounts: accounts.map(a => ({ id: a.id, name: a.name, isPrimary: !!a.isPrimary }))
      })
    });
  } catch {
    // Ignore if bot server is unreachable
  }
}

export function initWhatsAppSync({ onNewTransactions, onStatusChange }) {
  const serverUrl = getBotServerUrl();

  // Sync Telegram credentials & registered accounts to local bot server
  const syncCredentialsAndAccounts = async () => {
    try {
      // 1. Telegram config
      const tgConfig = getTelegramConfig();
      if (tgConfig.botToken && tgConfig.chatId) {
        await fetch(`${serverUrl}/api/telegram-config`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...COMMON_HEADERS
          },
          body: JSON.stringify({
            botToken: tgConfig.botToken,
            chatId: tgConfig.chatId,
            autoSync: tgConfig.autoSync
          })
        });
      }

      // 2. Accounts & Primary Account config
      await syncAccountsToBotServer();
    } catch {
      // Ignore if bot server is unreachable
    }
  };

  // Listen to custom payment methods updates from UI
  const handleAccountsUpdated = () => {
    syncAccountsToBotServer();
  };
  window.addEventListener('finflow_payment_methods_updated', handleAccountsUpdated);

  // 1. Initial status check
  const checkStatus = async () => {
    try {
      const currentUrl = getBotServerUrl();
      const res = await fetch(`${currentUrl}/api/status`, {
        headers: COMMON_HEADERS
      });
      if (res.ok) {
        const data = await res.json();
        onStatusChange?.(data);
        syncCredentialsAndAccounts();
        return true;
      }
    } catch {
      onStatusChange?.({ ok: false, status: 'offline' });
    }
    return false;
  };

  checkStatus();

  // Helper to import incoming transaction item into Dexie
  const importItemToDb = async (item) => {
    const primary = getPrimaryPaymentMethod();
    const defaultMethod = primary ? primary.name : 'BCA';
    const finalPaymentMethod = item.paymentMethod || defaultMethod;

    const existing = await db.transactions.where('id').equals(item.id).first();
    if (!existing) {
      await db.transactions.add({
        title: item.title,
        amount: item.amount,
        type: item.type || 'expense',
        category: item.category || 'Pengeluaran Lainnya',
        paymentMethod: finalPaymentMethod,
        date: item.date,
        time: item.time || '12:00',
        notes: item.notes || `Input otomatis via WhatsApp Bot (${finalPaymentMethod})`,
        createdAt: item.createdAt || new Date().toISOString()
      });
    }
  };

  // 2. Fetch pending transactions helper
  const fetchPending = async () => {
    try {
      const currentUrl = getBotServerUrl();
      const res = await fetch(`${currentUrl}/api/pending`, {
        headers: COMMON_HEADERS
      });
      if (res.ok) {
        const { data } = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          for (const item of data) {
            await importItemToDb(item);
          }

          // Clear server queue
          await fetch(`${currentUrl}/api/pending/ack`, { 
            method: 'POST',
            headers: COMMON_HEADERS
          });

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
        syncCredentialsAndAccounts();
      };

      eventSource.onmessage = async (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'NEW_TRANSACTIONS' && Array.isArray(parsed.payload)) {
            for (const item of parsed.payload) {
              await importItemToDb(item);
            }

            // Clear server queue
            fetch(`${getBotServerUrl()}/api/pending/ack`, { 
              method: 'POST',
              headers: COMMON_HEADERS 
            }).catch(() => {});

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
    window.removeEventListener('finflow_payment_methods_updated', handleAccountsUpdated);
  };
}

export async function testSendManualChat(messageText) {
  const currentUrl = getBotServerUrl();
  const accounts = getCustomPaymentMethods();
  const primary = getPrimaryPaymentMethod();

  const res = await fetch(`${currentUrl}/api/manual-test`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...COMMON_HEADERS
    },
    body: JSON.stringify({ 
      message: messageText,
      options: {
        primaryAccount: primary ? primary.name : 'BCA',
        accounts: accounts.map(a => ({ id: a.id, name: a.name, isPrimary: !!a.isPrimary }))
      }
    })
  });
  return res.json();
}
