import { db, getCustomPaymentMethods, getPrimaryPaymentMethod } from '../db/db';
import { pushDatabaseToTelegram, getTelegramConfig } from './telegramDb';

export const PERMANENT_BOT_URL = 'https://finflow-dewey-bot.loca.lt';
export const LOCAL_WIFI_BOT_URL = 'http://192.168.0.2:5051';

export function getBotServerUrl() {
  const saved = localStorage.getItem('finflow_wa_server_url');
  if (saved && saved.trim()) {
    return saved.trim().replace(/\/+$/, '');
  }

  // If accessed from localhost / 127.0.0.1 in development
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:5051';
  }

  // Default to permanent HTTPS tunnel URL on Vercel / Production
  return PERMANENT_BOT_URL;
}

export function setBotServerUrl(url) {
  if (!url || !url.trim() || url.trim() === PERMANENT_BOT_URL) {
    localStorage.removeItem('finflow_wa_server_url');
  } else {
    localStorage.setItem('finflow_wa_server_url', url.trim().replace(/\/+$/, ''));
  }
}

const COMMON_HEADERS = {
  'Bypass-Tunnel-Reminder': 'true',
  'bypass-tunnel-reminder': 'true'
};

// Helper for fast fetch with timeout
export async function fetchWithTimeout(url, options = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

// =========================================================================
// AUTO DISCOVERY: SCAN LOCAL WI-FI SUBNET (192.168.0.0 - 192.168.0.255)
// Scans ascending from smallest IP (192.168.0.1, .2, .3, ...)
// =========================================================================
let isScanning = false;
let lastAutoScanTime = 0;

export async function autoDiscoverLocalBotServer(onProgress) {
  if (isScanning) {
    console.log('[FinFlow Auto-Discovery] Scan is already in progress...');
    return null;
  }

  isScanning = true;
  lastAutoScanTime = Date.now();

  const BATCH_SIZE = 12; // 12 IPs in parallel per batch for maximum speed without overloading network
  const TIMEOUT_MS = 1200; // 1.2s timeout per IP probe
  const START_IP = 1;
  const END_IP = 254;

  let foundUrl = null;

  try {
    // Generate ordered list of IPs from lowest to highest: 192.168.0.1 -> 192.168.0.254
    const ipList = [];
    for (let i = START_IP; i <= END_IP; i++) {
      ipList.push(`192.168.0.${i}`);
    }

    // Process in ascending chunks starting from lowest IP
    for (let i = 0; i < ipList.length; i += BATCH_SIZE) {
      if (foundUrl) break;

      const batch = ipList.slice(i, i + BATCH_SIZE);
      const fromIp = batch[0];
      const toIp = batch[batch.length - 1];
      const progressPercent = Math.round((i / ipList.length) * 100);

      onProgress?.({
        currentBatch: batch,
        scannedCount: i,
        total: ipList.length,
        fromIp,
        toIp,
        percent: progressPercent,
        status: `Memeriksa ${fromIp} - ${toIp}...`
      });

      const batchController = new AbortController();

      // Probe each IP in the batch
      const probePromises = batch.map(async (ip) => {
        const candidateUrl = `http://${ip}:5051`;
        const singleController = new AbortController();
        const timeoutId = setTimeout(() => singleController.abort(), TIMEOUT_MS);

        const abortHandler = () => singleController.abort();
        batchController.signal.addEventListener('abort', abortHandler);

        try {
          const res = await fetch(`${candidateUrl}/api/ping`, {
            method: 'GET',
            headers: COMMON_HEADERS,
            signal: singleController.signal
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.ok) {
              // Active FinFlow bot server found!
              batchController.abort(); // Cancel remaining requests in this batch immediately
              return candidateUrl;
            }
          }
        } catch {
          // Host is offline or port closed
        } finally {
          clearTimeout(timeoutId);
          batchController.signal.removeEventListener('abort', abortHandler);
        }
        return null;
      });

      const results = await Promise.all(probePromises);
      const matched = results.find(url => url !== null);
      if (matched) {
        foundUrl = matched;
        break;
      }
    }

    if (foundUrl) {
      console.log(`🎯 [FinFlow Auto-Discovery] Server ditemukan di Wi-Fi: ${foundUrl}`);
      setBotServerUrl(foundUrl);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('finflow_bot_server_discovered', { detail: { url: foundUrl } }));
      }
      onProgress?.({
        scannedCount: ipList.length,
        total: ipList.length,
        percent: 100,
        foundUrl,
        success: true,
        status: `Ditemukan: ${foundUrl}`
      });
      return foundUrl;
    } else {
      console.log('⚠️ [FinFlow Auto-Discovery] Tidak ada server aktif di range 192.168.0.0 - 192.168.0.255');
      onProgress?.({
        scannedCount: ipList.length,
        total: ipList.length,
        percent: 100,
        foundUrl: null,
        success: false,
        status: 'Tidak ditemukan server aktif di jaringan lokal'
      });
      return null;
    }
  } catch (err) {
    console.error('Error during auto discovery:', err);
    return null;
  } finally {
    isScanning = false;
  }
}

let eventSource = null;
let pollInterval = null;

export async function syncAccountsToBotServer() {
  try {
    const serverUrl = getBotServerUrl();
    const accounts = getCustomPaymentMethods();
    const primary = getPrimaryPaymentMethod();
    await fetchWithTimeout(`${serverUrl}/api/accounts-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...COMMON_HEADERS
      },
      body: JSON.stringify({
        primaryAccount: primary ? primary.name : 'BCA',
        accounts: accounts.map(a => ({ id: a.id, name: a.name, isPrimary: !!a.isPrimary }))
      })
    }, 3000);
  } catch {
    // Ignore if bot server is unreachable
  }
}

export function initWhatsAppSync({ onNewTransactions, onStatusChange, onServerDiscovered }) {
  // Sync Telegram credentials & registered accounts to local bot server
  const syncCredentialsAndAccounts = async () => {
    try {
      const serverUrl = getBotServerUrl();
      // 1. Telegram config
      const tgConfig = getTelegramConfig();
      if (tgConfig.botToken && tgConfig.chatId) {
        await fetchWithTimeout(`${serverUrl}/api/telegram-config`, {
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
        }, 3000);
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

  // Helper to import incoming transaction item into Dexie
  const importItemToDb = async (item) => {
    const primary = getPrimaryPaymentMethod();
    const currentPrimaryName = primary ? primary.name : 'BSI';

    let finalPaymentMethod = item.paymentMethod;
    if (item.isDefaultPrimary || !item.isExplicitAccount || !finalPaymentMethod) {
      finalPaymentMethod = currentPrimaryName;
    }

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
        source: 'whatsapp',
        createdAt: item.createdAt || new Date().toISOString()
      });
    }
  };

  // 1. Fetch pending transactions helper
  const fetchPending = async () => {
    try {
      const currentUrl = getBotServerUrl();
      const res = await fetchWithTimeout(`${currentUrl}/api/pending`, {
        headers: COMMON_HEADERS
      }, 3500);
      if (res.ok) {
        const { data } = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          for (const item of data) {
            await importItemToDb(item);
          }

          // Clear server queue
          await fetchWithTimeout(`${currentUrl}/api/pending/ack`, { 
            method: 'POST',
            headers: COMMON_HEADERS
          }, 3000);

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

  // 2. Status check with automatic Wi-Fi local discovery fallback
  const checkStatus = async () => {
    try {
      const currentUrl = getBotServerUrl();
      const res = await fetchWithTimeout(`${currentUrl}/api/status`, {
        headers: COMMON_HEADERS
      }, 3500);
      if (res.ok) {
        const data = await res.json();
        onStatusChange?.(data);
        syncCredentialsAndAccounts();
        return true;
      }
    } catch {
      onStatusChange?.({ ok: false, status: 'offline' });

      // If offline, automatically scan local Wi-Fi range 192.168.0.0 - 192.168.0.255 starting from lowest IP
      const now = Date.now();
      if (!isScanning && (now - lastAutoScanTime > 30000)) {
        console.log('🔍 [FinFlow] HTTPS Tunnel/Server offline. Memulai pencarian otomatis jaringan lokal (192.168.0.0 - 255)...');
        autoDiscoverLocalBotServer().then((discoveredUrl) => {
          if (discoveredUrl) {
            onServerDiscovered?.(discoveredUrl);
            connectSSE();
            checkStatus();
            fetchPending();
          }
        });
      }
    }
    return false;
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
            fetchWithTimeout(`${getBotServerUrl()}/api/pending/ack`, { 
              method: 'POST',
              headers: COMMON_HEADERS 
            }, 3000).catch(() => {});

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

        // Trigger local Wi-Fi auto-discovery when SSE connection drops
        const now = Date.now();
        if (!isScanning && (now - lastAutoScanTime > 30000)) {
          autoDiscoverLocalBotServer().then((discoveredUrl) => {
            if (discoveredUrl) {
              onServerDiscovered?.(discoveredUrl);
              connectSSE();
              checkStatus();
              fetchPending();
            }
          });
        }
      };
    } catch {
      // SSE not available
    }
  };

  // Listen for discovered server event across window
  const handleServerDiscovered = (e) => {
    console.log('[FinFlow] Discovered new bot server via event:', e.detail?.url);
    connectSSE();
    checkStatus();
    fetchPending();
  };
  window.addEventListener('finflow_bot_server_discovered', handleServerDiscovered);

  // Initial calls
  checkStatus();
  connectSSE();

  // Fallback Polling every 8s
  pollInterval = setInterval(() => {
    fetchPending();
    checkStatus();
  }, 8000);

  // Return cleanup function
  return () => {
    if (eventSource) eventSource.close();
    if (pollInterval) clearInterval(pollInterval);
    window.removeEventListener('finflow_payment_methods_updated', handleAccountsUpdated);
    window.removeEventListener('finflow_bot_server_discovered', handleServerDiscovered);
  };
}

export async function testSendManualChat(messageText) {
  const currentUrl = getBotServerUrl();
  const accounts = getCustomPaymentMethods();
  const primary = getPrimaryPaymentMethod();

  const res = await fetchWithTimeout(`${currentUrl}/api/manual-test`, {
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
  }, 5000);
  return res.json();
}

