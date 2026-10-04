import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Database, Download, Upload, RefreshCw, 
  ShieldCheck, HardDrive, Check, AlertTriangle, Sparkles, 
  Send, Bot, Cloud, CheckCircle2, AlertCircle, HelpCircle,
  ExternalLink, Eye, EyeOff, CreditCard, ChevronRight, ChevronLeft,
  Plus, Edit2, Trash2, Banknote, Smartphone, Wallet, Star,
  MessageCircle, Terminal, Copy, Zap
} from 'lucide-react';
import { 
  getTelegramConfig, saveTelegramConfig, testTelegramConnection, 
  pushDatabaseToTelegram, pullDatabaseFromTelegram 
} from '../services/telegramDb';
import { 
  exportDatabaseToJson, importDatabaseFromJson, resetDatabaseToSample,
  clearAllDatabaseData, getCustomPaymentMethods, saveCustomPaymentMethods,
  setPrimaryPaymentMethod, DEFAULT_PAYMENT_METHODS
} from '../db/db';
import { 
  testSendManualChat, getBotServerUrl, setBotServerUrl, 
  PERMANENT_BOT_URL, LOCAL_WIFI_BOT_URL, autoDiscoverLocalBotServer 
} from '../services/whatsappSync';

export default function SettingsModal({
  isOpen,
  onClose,
  onDataChanged,
  showToast
}) {
  if (!isOpen) return null;

  // Navigation View: 'main' | 'connection' | 'payment_methods' | 'whatsapp_bot' | 'data'
  const [currentView, setCurrentView] = useState('main');

  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [pushingToTg, setPushingToTg] = useState(false);
  const [pullingFromTg, setPullingFromTg] = useState(false);
  
  // Telegram Config State
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // WhatsApp Bot State
  const [serverUrlInput, setServerUrlInput] = useState(() => getBotServerUrl());
  const [waServerStatus, setWaServerStatus] = useState({ ok: false, status: 'checking' });
  const [testChatText, setTestChatText] = useState('naspad 13000 / bensin 20.000 / cukur 25k');
  const [isSendingTestChat, setIsSendingTestChat] = useState(false);
  const [isScanningNetwork, setIsScanningNetwork] = useState(false);
  const [scanProgressText, setScanProgressText] = useState('');
  const [showWaGuide, setShowWaGuide] = useState(false);

  const refreshWaStatus = async (customUrl) => {
    const urlToUse = (customUrl !== undefined ? customUrl : serverUrlInput) || getBotServerUrl();
    try {
      const res = await fetch(`${urlToUse}/api/status`, {
        headers: { 'Bypass-Tunnel-Reminder': 'true' }
      });
      if (res.ok) {
        const data = await res.json();
        setWaServerStatus(data);
        return;
      }
    } catch {
      // Offline / blocked
    }
    setWaServerStatus({ ok: false, status: 'offline' });
  };

  // Payment Methods State
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [editingMethod, setEditingMethod] = useState(null);
  const [isAddingMethod, setIsAddingMethod] = useState(false);
  const [methodName, setMethodName] = useState('');
  const [methodType, setMethodType] = useState('bank');
  const [methodNumber, setMethodNumber] = useState('');
  const [methodIsPrimary, setMethodIsPrimary] = useState(false);

  const fileInputRef = useRef(null);

  // Listen to auto-discovered server event
  useEffect(() => {
    const handleDiscovered = (e) => {
      if (e.detail?.url) {
        setServerUrlInput(e.detail.url);
        refreshWaStatus(e.detail.url);
      }
    };
    window.addEventListener('finflow_bot_server_discovered', handleDiscovered);
    return () => {
      window.removeEventListener('finflow_bot_server_discovered', handleDiscovered);
    };
  }, []);

  // Scan local Wi-Fi range 192.168.0.0 - 192.168.0.255 ascending
  const handleScanLocalNetwork = async () => {
    try {
      setIsScanningNetwork(true);
      setScanProgressText('Memulai pencarian IP (192.168.0.1 - 254)...');
      const foundUrl = await autoDiscoverLocalBotServer((progress) => {
        if (progress.status) {
          setScanProgressText(progress.status);
        }
      });
      if (foundUrl) {
        setServerUrlInput(foundUrl);
        refreshWaStatus(foundUrl);
        showToast(`🎯 Ditemukan WhatsApp Bot Server di ${foundUrl}!`, 'success');
      } else {
        showToast('⚠️ Tidak ditemukan server bot aktif di rentang IP 192.168.0.0 - 255. Pastikan PC & HP di Wi-Fi yang sama.', 'warning');
      }
    } catch (err) {
      showToast('Gagal memindai jaringan lokal: ' + err.message, 'error');
    } finally {
      setIsScanningNetwork(false);
      setScanProgressText('');
    }
  };

  // Load configs on open
  useEffect(() => {
    const config = getTelegramConfig();
    setBotToken(config.botToken || '');
    setChatId(config.chatId || '');
    setAutoSync(config.autoSync !== false);
    setIsConnected(!!config.isConnected && !!config.botToken && !!config.chatId);
    setLastSynced(config.lastSynced || null);

    setPaymentMethods(getCustomPaymentMethods());

    // Check WhatsApp Server Status
    const currentUrl = getBotServerUrl();
    setServerUrlInput(currentUrl);
    refreshWaStatus(currentUrl);
  }, [isOpen]);

  // Test WhatsApp Chat Input
  const handleTestSendChat = async (e) => {
    e.preventDefault();
    if (!testChatText.trim()) return;
    try {
      setIsSendingTestChat(true);
      const res = await testSendManualChat(testChatText.trim());
      if (res.ok && res.parsed?.length > 0) {
        showToast(`✅ ${res.parsed.length} transaksi berhasil diinput via WhatsApp Simulator!`, 'success');
        await onDataChanged();
      } else {
        showToast('Gagal memproses pesan chat: format tidak valid', 'error');
      }
    } catch (err) {
      showToast('Gagal terhubung ke Bot Server: Pastikan server aktif (npm run bot) atau periksa Server URL', 'error');
    } finally {
      setIsSendingTestChat(false);
    }
  };

  // Save Telegram config
  const handleSaveConfig = () => {
    saveTelegramConfig({
      botToken: botToken.trim(),
      chatId: chatId.trim(),
      autoSync
    });
    showToast('Konfigurasi Telegram disimpan!', 'success');
  };

  // Test Telegram Connection
  const handleTestConnection = async () => {
    if (!botToken.trim() || !chatId.trim()) {
      showToast('Masukkan Bot Token dan Chat ID terlebih dahulu', 'error');
      return;
    }

    try {
      setTestingConnection(true);
      await testTelegramConnection(botToken.trim(), chatId.trim());
      setIsConnected(true);
      setLastSynced(new Date().toISOString());
      showToast('🟢 Berhasil terhubung! Pesan konfirmasi telah dikirim ke Telegram.', 'success');
    } catch (err) {
      setIsConnected(false);
      showToast('❌ Gagal terhubung ke Telegram: ' + err.message, 'error');
    } finally {
      setTestingConnection(false);
    }
  };

  // Push full database snapshot to Telegram
  const handlePushToTelegram = async () => {
    if (!botToken.trim() || !chatId.trim()) {
      showToast('Konfigurasikan Bot Token dan Chat ID terlebih dahulu', 'error');
      return;
    }

    try {
      setPushingToTg(true);
      saveTelegramConfig({ botToken: botToken.trim(), chatId: chatId.trim(), autoSync });
      const res = await pushDatabaseToTelegram();
      if (res.success) {
        setIsConnected(true);
        setLastSynced(new Date().toISOString());
        showToast('📦 Database berhasil disimpan & dikirim ke Telegram!', 'success');
      }
    } catch (err) {
      showToast('Gagal menyimpan ke Telegram: ' + err.message, 'error');
    } finally {
      setPushingToTg(false);
    }
  };

  // Pull database from Telegram
  const handlePullFromTelegram = async () => {
    if (!botToken.trim() || !chatId.trim()) {
      showToast('Konfigurasikan Bot Token dan Chat ID terlebih dahulu', 'error');
      return;
    }

    if (window.confirm('Tarik database dari Telegram? Data lokal saat ini akan ditimpa dengan riwayat terbaru dari Telegram.')) {
      try {
        setPullingFromTg(true);
        saveTelegramConfig({ botToken: botToken.trim(), chatId: chatId.trim(), autoSync });
        const res = await pullDatabaseFromTelegram();
        if (res.success) {
          setIsConnected(true);
          setLastSynced(new Date().toISOString());
          showToast('📥 Data berhasil dipulihkan dari Telegram!', 'success');
          await onDataChanged();
          onClose();
        }
      } catch (err) {
        showToast('Gagal menarik data dari Telegram: ' + err.message, 'error');
      } finally {
        setPullingFromTg(false);
      }
    }
  };

  // Payment Methods Handlers
  const handleStartAddMethod = () => {
    setEditingMethod(null);
    setMethodName('');
    setMethodType('bank');
    setMethodNumber('');
    setMethodIsPrimary(paymentMethods.length === 0);
    setIsAddingMethod(true);
  };

  const handleStartEditMethod = (item) => {
    setEditingMethod(item);
    setMethodName(item.name || '');
    setMethodType(item.icon === 'Banknote' ? 'cash' : item.icon === 'Smartphone' ? 'ewallet' : 'bank');
    setMethodNumber(item.number || '');
    setMethodIsPrimary(!!item.isPrimary);
    setIsAddingMethod(true);
  };

  const handleSetPrimary = (id) => {
    const updated = setPrimaryPaymentMethod(id);
    setPaymentMethods(updated);
    showToast('⭐ Rekening Utama berhasil diatur!', 'success');
  };

  const handleSavePaymentMethod = (e) => {
    e.preventDefault();
    if (!methodName.trim()) {
      showToast('Masukkan nama rekening / metode pembayaran', 'error');
      return;
    }

    const icon = methodType === 'cash' ? 'Banknote' : methodType === 'ewallet' ? 'Smartphone' : 'CreditCard';
    const color = methodType === 'cash' ? '#10B981' : methodType === 'ewallet' ? '#00AA13' : '#0060AF';

    let updated;
    if (editingMethod) {
      updated = paymentMethods.map(m => {
        if (m.id === editingMethod.id) {
          return {
            ...m,
            name: methodName.trim(),
            icon,
            color,
            number: methodNumber.trim(),
            isPrimary: methodIsPrimary ? true : (m.isPrimary && !paymentMethods.some(other => other.id !== m.id && other.isPrimary))
          };
        }
        return methodIsPrimary ? { ...m, isPrimary: false } : m;
      });
      showToast('Rekening berhasil diperbarui!', 'success');
    } else {
      const newMethod = {
        id: 'pm_' + Date.now(),
        name: methodName.trim(),
        icon,
        color,
        number: methodNumber.trim(),
        isPrimary: methodIsPrimary || paymentMethods.length === 0
      };
      if (newMethod.isPrimary) {
        updated = [...paymentMethods.map(m => ({ ...m, isPrimary: false })), newMethod];
      } else {
        updated = [...paymentMethods, newMethod];
      }
      showToast('Rekening baru berhasil ditambahkan!', 'success');
    }

    // Ensure at least one primary
    if (!updated.some(m => m.isPrimary) && updated.length > 0) {
      updated[0].isPrimary = true;
    }

    setPaymentMethods(updated);
    saveCustomPaymentMethods(updated);
    setIsAddingMethod(false);
    setEditingMethod(null);
  };

  const handleDeletePaymentMethod = (id) => {
    if (paymentMethods.length <= 1) {
      showToast('Minimal harus ada 1 rekening / metode pembayaran', 'error');
      return;
    }
    const itemToDelete = paymentMethods.find(m => m.id === id);
    let updated = paymentMethods.filter(m => m.id !== id);
    if (itemToDelete?.isPrimary && updated.length > 0) {
      updated[0].isPrimary = true;
    }
    setPaymentMethods(updated);
    saveCustomPaymentMethods(updated);
    showToast('Rekening berhasil dihapus', 'info');
  };

  // Export JSON backup file
  const handleExport = async () => {
    try {
      setLoading(true);
      const jsonStr = await exportDatabaseToJson();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `finflow-backup-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Database berhasil diekspor ke file JSON!', 'success');
    } catch (err) {
      showToast('Gagal mengekspor: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Import JSON backup file
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result;
          await importDatabaseFromJson(content);
          showToast('Data berhasil dipulihkan dari backup!', 'success');
          await onDataChanged();
          onClose();
        } catch (err) {
          showToast('Format file backup tidak valid: ' + err.message, 'error');
        } finally {
          setLoading(false);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      showToast('Gagal membaca file: ' + err.message, 'error');
      setLoading(false);
    }
  };

  // Reset to sample data
  const handleResetSample = async () => {
    if (window.confirm('Reset database ke data contoh bawaan? Semua data saat ini akan digantikan dengan data contoh.')) {
      try {
        setLoading(true);
        await resetDatabaseToSample();
        showToast('Database direset ke data contoh bawaan!', 'success');
        await onDataChanged();
        onClose();
      } catch (err) {
        showToast('Gagal reset: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  // Clear all database data completely
  const handleClearAllData = async () => {
    if (window.confirm('Kosongkan seluruh data saat ini? Semua catatan transaksi dan tagihan akan dihapus bersih (0 data).')) {
      try {
        setLoading(true);
        await clearAllDatabaseData();
        showToast('Seluruh data berhasil dikosongkan!', 'info');
        await onDataChanged();
        onClose();
      } catch (err) {
        showToast('Gagal mengosongkan data: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  // Title rendering based on current sub-menu
  const getViewTitle = () => {
    switch (currentView) {
      case 'connection':
        return 'Atur Koneksi Telegram';
      case 'whatsapp_bot':
        return 'WhatsApp Bot Server (Input Chat)';
      case 'payment_methods':
        return 'Metode Pembayaran / Rekening';
      case 'data':
        return 'Cadangan & Reset Data';
      default:
        return 'Pengaturan';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal-wide" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header settings-modal-header">
          <div className="settings-header-left">
            {currentView !== 'main' && (
              <button 
                type="button" 
                className="btn-back-circle" 
                onClick={() => {
                  setIsAddingMethod(false);
                  setCurrentView('main');
                }}
                title="Kembali ke menu"
                aria-label="Kembali"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <h3 className="modal-title">{getViewTitle()}</h3>
          </div>
          <button className="btn-icon-subtle" onClick={onClose} title="Tutup" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* =========================================================
              1. MAIN SETTINGS LIST (OPSI MENU MENURUN / BARIS)
              ========================================================= */}
          {currentView === 'main' && (
            <div className="settings-vertical-menu">
              {/* Row 1: Atur Koneksi Telegram */}
              <button 
                type="button" 
                className="settings-menu-item-row"
                onClick={() => setCurrentView('connection')}
              >
                <div className="settings-menu-left">
                  <div className="settings-menu-icon-box icon-tg-blue">
                    <Send size={18} />
                  </div>
                  <div className="settings-menu-info">
                    <span className="settings-menu-title">Atur Koneksi</span>
                    <span className="settings-menu-desc">Sinkronisasi bot Telegram & database cloud gratis</span>
                  </div>
                </div>

                <div className="settings-menu-right">
                  <span className={`badge ${isConnected ? 'badge-success' : 'badge-neutral'}`}>
                    {isConnected ? 'Terhubung' : 'Belum Terhubung'}
                  </span>
                  <ChevronRight size={16} className="text-muted" />
                </div>
              </button>

              {/* Row 2: WhatsApp Bot Server (Auto-Input Chat) */}
              <button 
                type="button" 
                className="settings-menu-item-row"
                onClick={() => setCurrentView('whatsapp_bot')}
              >
                <div className="settings-menu-left">
                  <div className="settings-menu-icon-box icon-wa-green">
                    <MessageCircle size={18} />
                  </div>
                  <div className="settings-menu-info">
                    <span className="settings-menu-title">WhatsApp Bot Server</span>
                    <span className="settings-menu-desc">Pencatatan pengeluaran otomatis via chat WhatsApp (Multi-item)</span>
                  </div>
                </div>

                <div className="settings-menu-right">
                  <span className={`badge ${waServerStatus.status === 'connected' ? 'badge-success' : waServerStatus.status === 'qr' ? 'badge-warning' : 'badge-neutral'}`}>
                    {waServerStatus.status === 'connected' ? '🟢 Bot Aktif' : waServerStatus.status === 'qr' ? '🟡 Scan QR' : 'npm run bot'}
                  </span>
                  <ChevronRight size={16} className="text-muted" />
                </div>
              </button>

              {/* Row 3: Atur Metode Pembayaran / Rekening */}
              <button 
                type="button" 
                className="settings-menu-item-row"
                onClick={() => setCurrentView('payment_methods')}
              >
                <div className="settings-menu-left">
                  <div className="settings-menu-icon-box icon-wallet-green">
                    <CreditCard size={18} />
                  </div>
                  <div className="settings-menu-info">
                    <span className="settings-menu-title">Atur Metode Pembayaran / Rekening</span>
                    <span className="settings-menu-desc">Kelola daftar rekening bank, e-wallet, dan uang tunai</span>
                  </div>
                </div>

                <div className="settings-menu-right">
                  <span className="badge badge-neutral">
                    {paymentMethods.length} Rekening
                  </span>
                  <ChevronRight size={16} className="text-muted" />
                </div>
              </button>

              {/* Row 4: Cadangan & Reset Data */}
              <button 
                type="button" 
                className="settings-menu-item-row"
                onClick={() => setCurrentView('data')}
              >
                <div className="settings-menu-left">
                  <div className="settings-menu-icon-box icon-data-purple">
                    <HardDrive size={18} />
                  </div>
                  <div className="settings-menu-info">
                    <span className="settings-menu-title">Cadangan & Reset Data</span>
                    <span className="settings-menu-desc">Ekspor / impor file JSON dan opsi kosongkan data</span>
                  </div>
                </div>

                <div className="settings-menu-right">
                  <ChevronRight size={16} className="text-muted" />
                </div>
              </button>
            </div>
          )}

          {/* =========================================================
              2. SUB-MENU: ATUR KONEKSI (TELEGRAM DATABASE)
              ========================================================= */}
          {currentView === 'connection' && (
            <div className="settings-section tg-database-section">
              <div className="tg-section-header">
                <div className="tg-title-wrap">
                  <Send size={18} className="text-info" />
                  <h4 className="settings-section-title">Koneksi Database Telegram</h4>
                </div>

                <span className={`badge ${isConnected ? 'badge-success' : 'badge-neutral'}`}>
                  {isConnected ? (
                    <>
                      <CheckCircle2 size={12} />
                      <span>Terhubung</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={12} />
                      <span>Belum Terhubung</span>
                    </>
                  )}
                </span>
              </div>

              <p className="text-muted text-xs">
                Gunakan bot Telegram pribadimu sebagai database cloud gratis untuk menyimpan seluruh catatan keuangan secara otomatis dan aman.
              </p>

              {/* Telegram Inputs Form */}
              <div className="tg-config-card">
                {/* Bot Token */}
                <div className="input-group">
                  <div className="tg-input-label-row">
                    <label className="input-label">Telegram Bot Token (dari @BotFather)</label>
                    <button 
                      type="button" 
                      className="btn-toggle-mask" 
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                      <span>{showToken ? 'Sembunyikan' : 'Tampilkan'}</span>
                    </button>
                  </div>
                  <input 
                    type={showToken ? "text" : "password"}
                    className="input-control font-mono text-xs"
                    placeholder="Contoh: 7123456789:AAH_XYZabcdef12345..."
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    onBlur={handleSaveConfig}
                  />
                </div>

                {/* Chat ID */}
                <div className="input-group">
                  <label className="input-label">Telegram Chat ID / Channel ID</label>
                  <input 
                    type="text"
                    className="input-control font-mono text-xs"
                    placeholder="Contoh: 123456789 atau -100123456789"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    onBlur={handleSaveConfig}
                  />
                </div>

                {/* Auto-Sync Toggle */}
                <label className="tg-checkbox-row">
                  <input 
                    type="checkbox" 
                    checked={autoSync}
                    onChange={(e) => {
                      setAutoSync(e.target.checked);
                      saveTelegramConfig({ autoSync: e.target.checked });
                    }}
                  />
                  <span className="text-xs">
                    <strong>Otomatis Sinkron ke Telegram</strong> setiap kali menambah/mengubah data
                  </span>
                </label>

                {/* Action Buttons: Test, Push, Pull */}
                <div className="tg-actions-grid">
                  <button 
                    type="button"
                    className="btn btn-secondary tg-action-btn"
                    onClick={handleTestConnection}
                    disabled={testingConnection || !botToken || !chatId}
                  >
                    <Bot size={15} />
                    <span>{testingConnection ? 'Menguji...' : 'Tes Koneksi'}</span>
                  </button>

                  <button 
                    type="button"
                    className="btn btn-primary tg-action-btn"
                    onClick={handlePushToTelegram}
                    disabled={pushingToTg || !botToken || !chatId}
                  >
                    <Upload size={15} />
                    <span>{pushingToTg ? 'Mengirim...' : 'Simpan ke Telegram'}</span>
                  </button>

                  <button 
                    type="button"
                    className="btn btn-secondary tg-action-btn"
                    onClick={handlePullFromTelegram}
                    disabled={pullingFromTg || !botToken || !chatId}
                  >
                    <Download size={15} />
                    <span>{pullingFromTg ? 'Menarik...' : 'Tarik dari Telegram'}</span>
                  </button>
                </div>

                {lastSynced && (
                  <div className="tg-last-synced text-2xs text-muted">
                    Terakhir tersinkronisasi: {new Date(lastSynced).toLocaleString('id-ID')}
                  </div>
                )}
              </div>

              {/* Collapsible Quick Guide */}
              <div className="tg-guide-box">
                <button 
                  type="button" 
                  className="tg-guide-toggle-btn"
                  onClick={() => setShowGuide(!showGuide)}
                >
                  <HelpCircle size={14} className="text-primary" />
                  <span>Panduan: Cara Membuat Bot & Mendapatkan Chat ID</span>
                  <span className="text-xs">{showGuide ? '▲' : '▼'}</span>
                </button>

                {showGuide && (
                  <div className="tg-guide-steps">
                    <ol className="text-xs text-muted leading-relaxed">
                      <li>
                        Buka aplikasi Telegram, cari <strong>@BotFather</strong> dan kirim <code>/newbot</code>.
                      </li>
                      <li>
                        Beri nama bot dan username bot (misal: <em>my_finflow_db_bot</em>).
                      </li>
                      <li>
                        Salin <strong>HTTP API Token</strong> dan tempel pada kolom <em>Bot Token</em> di atas.
                      </li>
                      <li>
                        Buka bot yang baru dibuat, lalu tekan tombol <strong>Start</strong>.
                      </li>
                      <li>
                        Selesai! Sekarang kamu bisa mencadangkan & memulihkan data langsung via Telegram.
                      </li>
                    </ol>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =========================================================
              2. SUB-MENU: WHATSAPP BOT SERVER
              ========================================================= */}
          {currentView === 'whatsapp_bot' && (
            <div className="wa-container-clean">
              {/* 1. Primary Card: Server & Status */}
              <div className="wa-card">
                <div className="wa-card-header">
                  <div className="wa-card-title">
                    <MessageCircle size={16} className="text-inc" />
                    <span>Status WhatsApp Bot</span>
                  </div>
                  <span className={`badge ${waServerStatus.status === 'connected' ? 'badge-success' : waServerStatus.status === 'qr' ? 'badge-warning' : 'badge-neutral'}`}>
                    {waServerStatus.status === 'connected' ? '🟢 Bot Aktif & Siap' : waServerStatus.status === 'qr' ? '🟡 Scan QR WhatsApp' : '⚪ Server Offline'}
                  </span>
                </div>

                {/* Segmented Preset Selector */}
                <div className="wa-mode-tabs">
                  <button
                    type="button"
                    className={`wa-mode-btn ${serverUrlInput === LOCAL_WIFI_BOT_URL ? 'active' : ''}`}
                    onClick={() => {
                      setServerUrlInput(LOCAL_WIFI_BOT_URL);
                      setBotServerUrl(LOCAL_WIFI_BOT_URL);
                      refreshWaStatus(LOCAL_WIFI_BOT_URL);
                      showToast('📶 Mode Wi-Fi Lokal PC (192.168.0.2)', 'success');
                    }}
                  >
                    <span>📶 Wi-Fi Lokal</span>
                  </button>

                  <button
                    type="button"
                    className={`wa-mode-btn ${serverUrlInput === PERMANENT_BOT_URL ? 'active' : ''}`}
                    onClick={() => {
                      setServerUrlInput(PERMANENT_BOT_URL);
                      setBotServerUrl(PERMANENT_BOT_URL);
                      refreshWaStatus(PERMANENT_BOT_URL);
                      showToast('🌐 Mode HTTPS Tunnel Online', 'info');
                    }}
                  >
                    <span>🌐 HTTPS Tunnel</span>
                  </button>

                  <button
                    type="button"
                    className={`wa-mode-btn ${serverUrlInput === 'http://localhost:5051' ? 'active' : ''}`}
                    onClick={() => {
                      setServerUrlInput('http://localhost:5051');
                      setBotServerUrl('http://localhost:5051');
                      refreshWaStatus('http://localhost:5051');
                      showToast('💻 Mode Localhost (5051)', 'info');
                    }}
                  >
                    <span>💻 Localhost</span>
                  </button>
                </div>

                {/* Server URL Input with Auto-Scan and Refresh */}
                <div className="wa-input-actions-bar">
                  <input 
                    type="text"
                    className="input-control font-mono text-xs"
                    placeholder="http://192.168.0.2:5051 atau https://finflow-dewey-bot.loca.lt"
                    value={serverUrlInput}
                    onChange={(e) => setServerUrlInput(e.target.value)}
                    onBlur={() => {
                      setBotServerUrl(serverUrlInput);
                      refreshWaStatus(serverUrlInput);
                    }}
                  />
                  <button 
                    type="button" 
                    className="wa-btn-scan"
                    onClick={handleScanLocalNetwork}
                    disabled={isScanningNetwork}
                    title="Otomatis cari server di subnet 192.168.0.0 - 255"
                  >
                    <RefreshCw size={12} className={isScanningNetwork ? 'spin' : ''} />
                    <span>{isScanningNetwork ? 'Scan...' : 'Auto Scan'}</span>
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setBotServerUrl(serverUrlInput);
                      refreshWaStatus(serverUrlInput);
                      showToast('Status server diperbarui', 'info');
                    }}
                    title="Periksa koneksi server"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>

                {/* Live Scan Progress Info */}
                {isScanningNetwork && (
                  <div className="wa-scan-progress-strip">
                    <RefreshCw size={12} className="spin" />
                    <span>{scanProgressText || 'Memindai jaringan lokal 192.168.0.0 - 255...'}</span>
                  </div>
                )}

                {/* HTTPS Mixed Content Warning Notice */}
                {typeof window !== 'undefined' && window.location.protocol === 'https:' && serverUrlInput.startsWith('http://') && (
                  <div className="wa-https-warning-banner">
                    <AlertCircle size={14} className="text-warning flex-shrink-0" />
                    <span>
                      <strong>Info Keamanan Browser:</strong> Web ini dibuka via HTTPS (Vercel/Cloud). Browser memblokir HTTP lokal (Mixed Content). Gunakan tombol <strong>🌐 HTTPS Tunnel</strong> atau buka web via Wi-Fi: <code>http://192.168.0.2:5173</code>
                    </span>
                  </div>
                )}
              </div>

              {/* 2. Terminal Command Card */}
              <div className="wa-card">
                <div className="wa-cmd-label">
                  <Terminal size={14} className="text-muted" />
                  <span>Jalankan bot server di komputer (Terminal / CMD):</span>
                </div>
                <div className="wa-cmd-clean">
                  <code>npm run bot</code>
                  <button 
                    type="button" 
                    className="btn-copy-cmd" 
                    onClick={() => {
                      navigator.clipboard.writeText('npm run bot');
                      showToast('Perintah "npm run bot" disalin ke clipboard!', 'info');
                    }}
                    title="Salin Perintah"
                  >
                    <Copy size={12} />
                    <span>Salin</span>
                  </button>
                </div>
              </div>

              {/* 3. Simulator Quick Test Card */}
              <div className="wa-card">
                <div className="wa-card-title">
                  <Zap size={14} className="text-warn" />
                  <span>Simulator Chat WhatsApp (Langsung Masuk ke FinFlow):</span>
                </div>
                <form onSubmit={handleTestSendChat} className="wa-simulator-form">
                  <input 
                    type="text"
                    className="input-control font-mono text-xs"
                    value={testChatText}
                    onChange={(e) => setTestChatText(e.target.value)}
                    placeholder="naspad 13000 / bensin 20.000 / cukur 25k"
                  />
                  <button 
                    type="submit" 
                    className="btn btn-primary btn-sm wa-sim-btn"
                    disabled={isSendingTestChat || !testChatText.trim()}
                  >
                    {isSendingTestChat ? 'Memproses...' : 'Kirim & Catat ke FinFlow'}
                  </button>
                </form>
              </div>

              {/* 4. Collapsible Formatting Guide (Clean Drawer) */}
              <div className="wa-guide-accordion">
                <button 
                  type="button" 
                  className="wa-guide-header-btn"
                  onClick={() => setShowWaGuide(!showWaGuide)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <HelpCircle size={14} className="text-primary" />
                    <span>Panduan Format Chat WhatsApp</span>
                  </div>
                  <span className="text-xs text-muted">{showWaGuide ? '▲ Tutup' : '▼ Buka Contoh'}</span>
                </button>

                {showWaGuide && (
                  <div className="wa-guide-content">
                    <div className="wa-example-item">
                      <span className="wa-ex-badge">Format Khusus Rekening (Nama, Nominal, Rekening)</span>
                      <code>naspad 13000 sea / bensin 30k bsi / jajan 25.000 bca</code>
                    </div>
                    <div className="wa-example-item">
                      <span className="wa-ex-badge">Otomatis Rekening Utama (Tanpa Rekening)</span>
                      <code>lauk 20k / kopi 18rb / cukur 25k</code>
                    </div>
                    <div className="wa-example-item">
                      <span className="wa-ex-badge">Pemisah Multi-Item</span>
                      <code>Garis miring ( / ), koma ( , ), atau baris baru</code>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =========================================================
              3. SUB-MENU: ATUR METODE PEMBAYARAN / REKENING
              ========================================================= */}
          {currentView === 'payment_methods' && (
            <div className="settings-methods-tab-flow">
              {/* Header & Add Button */}
              <div className="methods-header-strip">
                <span className="text-muted text-xs font-bold uppercase">
                  TOTAL {paymentMethods.length} REKENING
                </span>
                {!isAddingMethod && (
                  <button 
                    type="button" 
                    className="btn btn-sm btn-primary"
                    onClick={handleStartAddMethod}
                  >
                    <Plus size={14} />
                    <span>Tambah Rekening</span>
                  </button>
                )}
              </div>

              {/* Add / Edit Form */}
              {isAddingMethod && (
                <form onSubmit={handleSavePaymentMethod} className="method-edit-card">
                  <div className="method-edit-title">
                    <span className="text-xs font-bold">
                      {editingMethod ? 'Edit Rekening / Metode' : 'Tambah Rekening / Metode Baru'}
                    </span>
                    <button 
                      type="button" 
                      className="btn-icon-subtle" 
                      onClick={() => setIsAddingMethod(false)}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Nama Rekening / E-Wallet / Dompet</label>
                    <input 
                      type="text"
                      className="input-control"
                      placeholder="Contoh: SeaBank, BCA, Jenius, GoPay, Dompet Saku"
                      value={methodName}
                      onChange={(e) => setMethodName(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>

                  <div className="form-row-2">
                    <div className="input-group">
                      <label className="input-label">Jenis / Tipe</label>
                      <select 
                        className="input-control"
                        value={methodType}
                        onChange={(e) => setMethodType(e.target.value)}
                      >
                        <option value="bank">Rekening Bank</option>
                        <option value="ewallet">E-Wallet / Dompet Digital</option>
                        <option value="cash">Uang Tunai (Cash)</option>
                      </select>
                    </div>

                    <div className="input-group">
                      <label className="input-label">No. Rek / Catatan (Opsional)</label>
                      <input 
                        type="text"
                        className="input-control"
                        placeholder="Contoh: 1234-5678"
                        value={methodNumber}
                        onChange={(e) => setMethodNumber(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Set as Primary Toggle */}
                  <label className="method-primary-toggle-row">
                    <input 
                      type="checkbox"
                      checked={methodIsPrimary}
                      onChange={(e) => setMethodIsPrimary(e.target.checked)}
                    />
                    <span className="text-xs">
                      <Star size={13} className="text-warn inline" style={{ verticalAlign: 'middle', marginRight: '4px' }} fill={methodIsPrimary ? 'currentColor' : 'none'} />
                      <strong>Jadikan Rekening Utama</strong> (Prioritas pemasukan & simpanan)
                    </span>
                  </label>

                  <div className="method-form-actions">
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm"
                      onClick={() => setIsAddingMethod(false)}
                    >
                      Batal
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm">
                      <Check size={14} />
                      <span>{editingMethod ? 'Perbarui Rekening' : 'Simpan Rekening'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Methods List */}
              <div className="methods-items-list">
                {paymentMethods.map(item => {
                  const isCash = item.icon === 'Banknote' || item.name.toLowerCase().includes('tunai') || item.name.toLowerCase().includes('cash');
                  const isEwallet = item.icon === 'Smartphone' || ['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'].some(e => item.name.toLowerCase().includes(e));

                  return (
                    <div key={item.id} className={`method-item-row ${item.isPrimary ? 'is-primary-row' : ''}`}>
                      <div className="method-item-left">
                        <div className="method-item-icon" style={{ color: item.color || '#0060AF' }}>
                          {isCash ? <Banknote size={16} /> : isEwallet ? <Smartphone size={16} /> : <CreditCard size={16} />}
                        </div>
                        <div className="method-item-info">
                          <div className="method-item-name-row">
                            <span className="method-item-name">{item.name}</span>
                            {item.isPrimary && (
                              <span className="badge-primary-pill" title="Rekening Utama">
                                <Star size={10} fill="currentColor" />
                                <span>Utama</span>
                              </span>
                            )}
                          </div>
                          {item.number && <span className="method-item-number">{item.number}</span>}
                        </div>
                      </div>

                      <div className="method-item-actions">
                        {!item.isPrimary && (
                          <button 
                            type="button" 
                            className="btn-set-primary-subtle" 
                            onClick={() => handleSetPrimary(item.id)}
                            title="Jadikan sebagai Rekening Utama"
                          >
                            <Star size={12} />
                            <span>Jadikan Utama</span>
                          </button>
                        )}
                        <button 
                          type="button"
                          className="btn-icon-subtle"
                          onClick={() => handleStartEditMethod(item)}
                          title="Edit"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button 
                          type="button"
                          className="btn-icon-subtle btn-delete"
                          onClick={() => handleDeletePaymentMethod(item.id)}
                          title="Hapus"
                          disabled={paymentMethods.length <= 1}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =========================================================
              4. SUB-MENU: CADANGAN & RESET DATA
              ========================================================= */}
          {currentView === 'data' && (
            <div className="settings-data-tab-flow">
              {/* Backup JSON */}
              <div className="settings-section">
                <h4 className="settings-section-title">
                  <HardDrive size={16} className="text-primary" />
                  Backup File JSON (Lokal)
                </h4>

                <div className="backup-actions-grid">
                  <button 
                    className="btn btn-secondary backup-action-btn"
                    onClick={handleExport}
                    disabled={loading}
                  >
                    <Download size={16} className="text-primary" />
                    <div className="btn-col">
                      <strong>Ekspor File JSON</strong>
                      <span className="text-muted text-2xs">Unduh database ke file .json</span>
                    </div>
                  </button>

                  <button 
                    className="btn btn-secondary backup-action-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                  >
                    <Upload size={16} className="text-info" />
                    <div className="btn-col">
                      <strong>Impor File JSON</strong>
                      <span className="text-muted text-2xs">Pulihkan dari file .json</span>
                    </div>
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    accept=".json" 
                    onChange={handleImportFile}
                  />
                </div>
              </div>

              {/* Reset Zone */}
              <div className="settings-section section-danger-zone">
                <h4 className="settings-section-title text-danger">
                  <AlertTriangle size={16} />
                  Zona Reset Data
                </h4>
                <div className="reset-action-row">
                  <div className="reset-info">
                    <strong className="text-sm">Muat Ulang Data Contoh</strong>
                    <p className="text-muted text-xs">Ganti data saat ini dengan template contoh bawaan.</p>
                  </div>
                  <button 
                    className="btn btn-secondary btn-sm btn-danger-outline"
                    onClick={handleResetSample}
                    disabled={loading}
                  >
                    <RefreshCw size={13} />
                    <span>Reset Contoh</span>
                  </button>
                </div>

                <div className="reset-action-row" style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border-hairline)' }}>
                  <div className="reset-info">
                    <strong className="text-sm text-danger">Kosongkan Seluruh Data</strong>
                    <p className="text-muted text-xs">Hapus semua transaksi dan tagihan rutin bersih (0 data).</p>
                  </div>
                  <button 
                    className="btn btn-secondary btn-sm btn-danger-outline"
                    onClick={handleClearAllData}
                    disabled={loading}
                  >
                    <AlertTriangle size={13} />
                    <span>Kosongkan Semua</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
