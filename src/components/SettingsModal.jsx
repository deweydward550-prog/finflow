import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Database, Download, Upload, RefreshCw, 
  ShieldCheck, HardDrive, Check, AlertTriangle, Sparkles, 
  CheckCircle2, AlertCircle, HelpCircle, ExternalLink, Eye, EyeOff, 
  CreditCard, ChevronRight, ChevronLeft, Plus, Edit2, Trash2, 
  Banknote, Smartphone, Wallet, Star, MessageCircle, Terminal, Copy, Zap
} from 'lucide-react';
import { 
  getSupabaseConfig, saveSupabaseConfig, testSupabaseConnection, 
  migrateLocalDataToSupabase, SUPABASE_SQL_SCHEMA, insertTransactionToSupabase 
} from '../services/supabaseService';
import { 
  exportDatabaseToJson, importDatabaseFromJson, resetDatabaseToSample,
  clearAllDatabaseData, getCustomPaymentMethods, saveCustomPaymentMethods,
  setPrimaryPaymentMethod, DEFAULT_PAYMENT_METHODS, db
} from '../db/db';
import { parseWhatsAppMessage } from '../services/whatsappParser';

export default function SettingsModal({
  isOpen,
  onClose,
  onDataChanged
}) {
  if (!isOpen) return null;

  // Navigation View: 'main' | 'supabase' | 'whatsapp_bot' | 'payment_methods' | 'data'
  const [currentView, setCurrentView] = useState('main');

  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [migratingData, setMigratingData] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Supabase Config State
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showSqlGuide, setShowSqlGuide] = useState(false);

  // WhatsApp Simulator State
  const [testChatText, setTestChatText] = useState('naspad 13000 sea / bensin 30k bsi / kopi 18k');
  const [isSendingTestChat, setIsSendingTestChat] = useState(false);
  const [showWaGuide, setShowWaGuide] = useState(false);

  // Payment Methods State
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [editingMethod, setEditingMethod] = useState(null);
  const [isAddingMethod, setIsAddingMethod] = useState(false);
  const [methodName, setMethodName] = useState('');
  const [methodType, setMethodType] = useState('bank');
  const [methodNumber, setMethodNumber] = useState('');
  const [methodIsPrimary, setMethodIsPrimary] = useState(false);

  const fileInputRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load configs on open
  useEffect(() => {
    const cfg = getSupabaseConfig();
    setSupabaseUrl(cfg.url || '');
    setSupabaseKey(cfg.anonKey || '');
    setIsSupabaseConnected(cfg.isConfigured);
    setPaymentMethods(getCustomPaymentMethods());
  }, [isOpen]);

  // Save & Test Supabase Connection
  const handleSaveAndTestSupabase = async (e) => {
    e?.preventDefault();
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      showToast('Masukkan Supabase Project URL dan Anon Key', 'error');
      return;
    }

    try {
      setTestingConnection(true);
      await testSupabaseConnection(supabaseUrl.trim(), supabaseKey.trim());
      saveSupabaseConfig({ url: supabaseUrl.trim(), anonKey: supabaseKey.trim() });
      setIsSupabaseConnected(true);
      showToast('🟢 Berhasil terhubung ke Supabase Realtime Cloud!', 'success');
      await onDataChanged?.();
    } catch (err) {
      setIsSupabaseConnected(false);
      showToast('Gagal terhubung: ' + err.message, 'error');
    } finally {
      setTestingConnection(false);
    }
  };

  // 1-Click Migration
  const handleMigrateData = async () => {
    if (!isSupabaseConnected) {
      showToast('Hubungkan Supabase terlebih dahulu sebelum migrasi', 'error');
      return;
    }

    if (window.confirm('Unggah seluruh catatan transaksi & tagihan lokal ke database Supabase Cloud?')) {
      try {
        setMigratingData(true);
        const res = await migrateLocalDataToSupabase();
        showToast(`🚀 Migrasi selesai: ${res.txUploaded} transaksi & ${res.recUploaded} tagihan terunggah!`, 'success');
        await onDataChanged?.();
      } catch (err) {
        showToast('Gagal migrasi: ' + err.message, 'error');
      } finally {
        setMigratingData(false);
      }
    }
  };

  // Test WhatsApp Chat Simulator
  const handleTestSendChat = async (e) => {
    e.preventDefault();
    if (!testChatText.trim()) return;

    try {
      setIsSendingTestChat(true);
      const accounts = getCustomPaymentMethods();
      const primary = accounts.find(a => a.isPrimary) || accounts[0];
      const parsedItems = parseWhatsAppMessage(testChatText.trim(), {
        primaryAccount: primary ? primary.name : 'BSI',
        accounts
      });

      if (!parsedItems || parsedItems.length === 0) {
        showToast('Format chat tidak dikenali. Contoh: "naspad 13000 sea / bensin 30k"', 'error');
        return;
      }

      for (const item of parsedItems) {
        if (isSupabaseConnected) {
          await insertTransactionToSupabase(item);
        } else {
          await db.transactions.add({
            ...item,
            createdAt: new Date().toISOString()
          });
        }
      }

      showToast(`✅ ${parsedItems.length} transaksi berhasil dicatat via Simulator!`, 'success');
      await onDataChanged?.();
    } catch (err) {
      showToast('Gagal memproses simulator: ' + err.message, 'error');
    } finally {
      setIsSendingTestChat(false);
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

  const handleSavePaymentMethod = (e) => {
    e.preventDefault();
    if (!methodName.trim()) {
      showToast('Nama rekening / metode pembayaran tidak boleh kosong', 'error');
      return;
    }

    const icon = methodType === 'cash' ? 'Banknote' : methodType === 'ewallet' ? 'Smartphone' : 'CreditCard';
    const color = methodType === 'cash' ? '#059669' : methodType === 'ewallet' ? '#8B5CF6' : '#0060AF';

    let updated = [];
    if (editingMethod) {
      updated = paymentMethods.map(m => {
        if (m.id === editingMethod.id) {
          return {
            ...m,
            name: methodName.trim(),
            icon,
            color: m.color || color,
            number: methodNumber.trim(),
            isPrimary: methodIsPrimary
          };
        }
        return methodIsPrimary ? { ...m, isPrimary: false } : m;
      });
      showToast('Rekening berhasil diperbarui!', 'success');
    } else {
      const newMethod = {
        id: methodName.trim().toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString(36),
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
          await onDataChanged?.();
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
        await onDataChanged?.();
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
        await onDataChanged?.();
        onClose();
      } catch (err) {
        showToast('Gagal mengosongkan data: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  const getViewTitle = () => {
    switch (currentView) {
      case 'supabase':
        return 'Koneksi Cloud Supabase';
      case 'whatsapp_bot':
        return 'WhatsApp Bot Hub (Auto-Sync)';
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
                title="Kembali"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <h3 className="modal-title">{getViewTitle()}</h3>
          </div>
          <button className="btn-icon-subtle" onClick={onClose} title="Tutup">
            <X size={18} />
          </button>
        </div>

        {/* Modal Inline Toast */}
        {toastMessage && (
          <div style={{
            padding: '0.6rem 1rem',
            margin: '0.5rem 1.5rem',
            borderRadius: '10px',
            fontSize: '0.85rem',
            fontWeight: 600,
            background: toastMessage.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            color: toastMessage.type === 'error' ? '#f87171' : '#34d399',
            border: `1px solid ${toastMessage.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
          }}>
            {toastMessage.message}
          </div>
        )}

        <div className="modal-body">
          {/* =========================================================
              MAIN MENU
              ========================================================= */}
          {currentView === 'main' && (
            <div className="settings-vertical-menu">
              {/* Row 1: Supabase Cloud Database */}
              <button 
                type="button" 
                className="settings-menu-item-row"
                onClick={() => setCurrentView('supabase')}
              >
                <div className="settings-menu-left">
                  <div className="settings-menu-icon-box" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                    <Zap size={18} />
                  </div>
                  <div className="settings-menu-info">
                    <span className="settings-menu-title">Database Cloud Supabase</span>
                    <span className="settings-menu-desc">Sinkronisasi real-time instan multi-device (HP A, HP B, PC)</span>
                  </div>
                </div>

                <div className="settings-menu-right">
                  <span className={`badge ${isSupabaseConnected ? 'badge-success' : 'badge-neutral'}`}>
                    {isSupabaseConnected ? '🟢 Realtime Aktif' : '⚪ Belum Terhubung'}
                  </span>
                  <ChevronRight size={16} className="text-muted" />
                </div>
              </button>

              {/* Row 2: WhatsApp Bot Hub */}
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
                    <span className="settings-menu-title">WhatsApp Bot Hub</span>
                    <span className="settings-menu-desc">Catat pengeluaran otomatis lewat pesan chat WhatsApp</span>
                  </div>
                </div>

                <div className="settings-menu-right">
                  <span className="badge badge-success">🤖 Siap</span>
                  <ChevronRight size={16} className="text-muted" />
                </div>
              </button>

              {/* Row 3: Metode Pembayaran */}
              <button 
                type="button" 
                className="settings-menu-item-row"
                onClick={() => setCurrentView('payment_methods')}
              >
                <div className="settings-menu-left">
                  <div className="settings-menu-icon-box icon-pm-purple">
                    <CreditCard size={18} />
                  </div>
                  <div className="settings-menu-info">
                    <span className="settings-menu-title">Metode Pembayaran / Rekening</span>
                    <span className="settings-menu-desc">BSI, BCA, SeaBank, E-Wallet, Tunai, dan rekening utama</span>
                  </div>
                </div>

                <div className="settings-menu-right">
                  <span className="badge badge-neutral">{paymentMethods.length} Rekening</span>
                  <ChevronRight size={16} className="text-muted" />
                </div>
              </button>

              {/* Row 4: Cadangan & Reset */}
              <button 
                type="button" 
                className="settings-menu-item-row"
                onClick={() => setCurrentView('data')}
              >
                <div className="settings-menu-left">
                  <div className="settings-menu-icon-box icon-dt-slate">
                    <HardDrive size={18} />
                  </div>
                  <div className="settings-menu-info">
                    <span className="settings-menu-title">Cadangan & Reset Data</span>
                    <span className="settings-menu-desc">Ekspor/impor file JSON dan bersihkan data transaksi</span>
                  </div>
                </div>

                <div className="settings-menu-right">
                  <ChevronRight size={16} className="text-muted" />
                </div>
              </button>
            </div>
          )}

          {/* =========================================================
              1. SUB-MENU: SUPABASE CLOUD
              ========================================================= */}
          {currentView === 'supabase' && (
            <div className="settings-section">
              <div className="status-indicator-box">
                <div className="status-indicator-header">
                  <div className="status-indicator-title">
                    <Zap size={18} className="text-primary" />
                    <span className="font-semibold text-sm">Status Supabase Realtime</span>
                  </div>
                  <span className={`badge ${isSupabaseConnected ? 'badge-success' : 'badge-neutral'}`}>
                    {isSupabaseConnected ? '🟢 Terhubung (Multi-Device Active)' : '⚪ Belum Dikonfigurasi'}
                  </span>
                </div>
                <p className="text-muted text-xs leading-relaxed mt-1">
                  Supabase menyinkronkan seluruh transaksi dan tagihan ke semua perangkat (HP A, HP B, PC) secara real-time via WebSockets (&lt;50ms).
                </p>
              </div>

              <form onSubmit={handleSaveAndTestSupabase} className="settings-form mt-4">
                <div className="form-group">
                  <label className="form-label text-xs">Project URL Supabase</label>
                  <input 
                    type="text" 
                    className="input-control font-mono text-xs" 
                    placeholder="https://xyzproject.supabase.co" 
                    value={supabaseUrl} 
                    onChange={(e) => setSupabaseUrl(e.target.value)} 
                    required 
                  />
                </div>

                <div className="form-group">
                  <label className="form-label text-xs">Anon Public Key</label>
                  <div className="input-with-action">
                    <input 
                      type={showKey ? 'text' : 'password'} 
                      className="input-control font-mono text-xs" 
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI..." 
                      value={supabaseKey} 
                      onChange={(e) => setSupabaseKey(e.target.value)} 
                      required 
                    />
                    <button 
                      type="button" 
                      className="btn-input-action" 
                      onClick={() => setShowKey(!showKey)}
                      title={showKey ? 'Sembunyikan Key' : 'Tampilkan Key'}
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="settings-action-row" style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button 
                    type="submit" 
                    className="btn btn-primary btn-sm flex-1" 
                    disabled={testingConnection}
                  >
                    <RefreshCw size={13} className={testingConnection ? 'spin' : ''} />
                    <span>{testingConnection ? 'Memeriksa...' : 'Simpan & Tes Koneksi'}</span>
                  </button>
                  
                  {isSupabaseConnected && (
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm"
                      onClick={handleMigrateData}
                      disabled={migratingData}
                      title="Unggah data transaksi lokal ke Supabase"
                    >
                      <Upload size={13} className={migratingData ? 'spin' : ''} />
                      <span>{migratingData ? 'Mengunggah...' : 'Migrasi Data Lokal'}</span>
                    </button>
                  )}
                </div>
              </form>

              {/* SQL Schema Helper Drawer */}
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <button 
                  type="button" 
                  className="tg-guide-toggle-btn"
                  onClick={() => setShowSqlGuide(!showSqlGuide)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-color)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>
                    <Copy size={14} className="text-primary" />
                    <span>Skrip SQL Schema Supabase (Klik untuk Menyalin)</span>
                  </div>
                  <span className="text-xs">{showSqlGuide ? '▲' : '▼'}</span>
                </button>

                {showSqlGuide && (
                  <div style={{ marginTop: '0.75rem', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '10px' }}>
                    <p className="text-xs text-muted mb-2">
                      Jalankan skrip ini sekali di <strong>Supabase Dashboard &gt; SQL Editor</strong> untuk membuat tabel & mengaktifkan Realtime:
                    </p>
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm mb-2"
                      onClick={() => {
                        navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
                        showToast('Skrip SQL berhasil disalin ke clipboard!', 'info');
                      }}
                    >
                      <Copy size={13} />
                      <span>Salin Skrip SQL</span>
                    </button>
                    <pre style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '0.7rem', padding: '0.5rem', background: 'rgba(0,0,0,0.4)', borderRadius: '6px', color: '#93c5fd' }}>
                      {SUPABASE_SQL_SCHEMA}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =========================================================
              2. SUB-MENU: WHATSAPP BOT HUB
              ========================================================= */}
          {currentView === 'whatsapp_bot' && (
            <div className="settings-section">
              <div className="status-indicator-box">
                <div className="status-indicator-header">
                  <div className="status-indicator-title">
                    <MessageCircle size={18} className="text-success" />
                    <span className="font-semibold text-sm">WhatsApp Bot Terintegrasi Cloud</span>
                  </div>
                  <span className="badge badge-success">⚡ Terhubung ke Supabase</span>
                </div>
                <p className="text-muted text-xs leading-relaxed mt-1">
                  Pesan transaksi yang dikirim ke WhatsApp langsung disimpan oleh bot ke <strong>Supabase Cloud</strong> dan otomatis muncul di seluruh HP secara instan!
                </p>
              </div>

              {/* Command Runner Box */}
              <div className="wa-card mt-3">
                <div className="wa-card-title text-xs font-semibold mb-2">
                  <Terminal size={14} className="text-primary" />
                  <span>Jalankan Bot di Komputer (Terminal / CMD):</span>
                </div>
                <div className="wa-cmd-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                  <code className="text-xs font-mono text-success">npm run bot</code>
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      navigator.clipboard.writeText('npm run bot');
                      showToast('Perintah "npm run bot" disalin!', 'info');
                    }}
                  >
                    <Copy size={12} />
                    <span>Salin</span>
                  </button>
                </div>
                <p className="text-xs text-muted mt-2">
                  Atau buka dashboard scan QR di browser komputer: <code>http://localhost:5051/qr</code>
                </p>
              </div>

              {/* Simulator Quick Test */}
              <div className="wa-card mt-3">
                <div className="wa-card-title text-xs font-semibold mb-2" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Zap size={14} className="text-warning" />
                  <span>Simulator Chat WhatsApp (Uji Coba Langsung):</span>
                </div>
                <form onSubmit={handleTestSendChat}>
                  <input 
                    type="text"
                    className="input-control font-mono text-xs mb-2"
                    value={testChatText}
                    onChange={(e) => setTestChatText(e.target.value)}
                    placeholder="naspad 13000 sea / bensin 30k bsi / kopi 18k"
                  />
                  <button 
                    type="submit" 
                    className="btn btn-primary btn-sm w-full"
                    disabled={isSendingTestChat || !testChatText.trim()}
                  >
                    {isSendingTestChat ? 'Memproses...' : 'Kirim & Catat ke FinFlow'}
                  </button>
                </form>
              </div>

              {/* Formatting Guide */}
              <div className="mt-3">
                <button 
                  type="button" 
                  className="tg-guide-toggle-btn"
                  onClick={() => setShowWaGuide(!showWaGuide)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-color)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>
                    <HelpCircle size={14} className="text-primary" />
                    <span>Panduan Format Chat WhatsApp</span>
                  </div>
                  <span className="text-xs">{showWaGuide ? '▲' : '▼'}</span>
                </button>

                {showWaGuide && (
                  <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', fontSize: '0.75rem', lineHeight: '1.6' }}>
                    <p><strong>1. Rekening Tertentu:</strong> <code>naspad 13000 sea / bensin 30k bsi / jajan 25rb bca</code></p>
                    <p><strong>2. Otomatis Rekening Utama:</strong> <code>lauk 20k / kopi 18rb / cukur 25k</code></p>
                    <p><strong>3. Pemasukan:</strong> <code>gaji 5jt / freelance 1.5jt sea</code></p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =========================================================
              3. SUB-MENU: PAYMENT METHODS
              ========================================================= */}
          {currentView === 'payment_methods' && (
            <div className="settings-section">
              <div className="settings-section-header-row mb-3">
                <div>
                  <h4 className="settings-section-title text-sm font-semibold">Daftar Rekening & Dompet</h4>
                  <p className="text-muted text-xs">Pilih salah satu sebagai Rekening Utama default untuk input chat.</p>
                </div>
                {!isAddingMethod && (
                  <button 
                    type="button" 
                    className="btn btn-primary btn-xs"
                    onClick={handleStartAddMethod}
                  >
                    <Plus size={14} />
                    <span>Tambah</span>
                  </button>
                )}
              </div>

              {isAddingMethod ? (
                <form onSubmit={handleSavePaymentMethod} className="card-form-subtle mb-4">
                  <div className="form-group mb-2">
                    <label className="form-label text-xs">Nama Rekening / Dompet</label>
                    <input 
                      type="text" 
                      className="input-control text-xs" 
                      placeholder="Misal: BSI, BCA, SeaBank, GoPay..."
                      value={methodName}
                      onChange={(e) => setMethodName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid-2-col gap-2 mb-2">
                    <div className="form-group">
                      <label className="form-label text-xs">Tipe</label>
                      <select 
                        className="select-control text-xs"
                        value={methodType}
                        onChange={(e) => setMethodType(e.target.value)}
                      >
                        <option value="bank">Bank</option>
                        <option value="ewallet">E-Wallet</option>
                        <option value="cash">Tunai (Cash)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label text-xs">Nomor Rek / Akun (Opsional)</label>
                      <input 
                        type="text" 
                        className="input-control text-xs" 
                        placeholder="1234-5678"
                        value={methodNumber}
                        onChange={(e) => setMethodNumber(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-group mb-3">
                    <label className="checkbox-control text-xs" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input 
                        type="checkbox" 
                        checked={methodIsPrimary}
                        onChange={(e) => setMethodIsPrimary(e.target.checked)}
                      />
                      <span>Jadikan sebagai Rekening Utama</span>
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="btn btn-primary btn-sm flex-1">
                      {editingMethod ? 'Simpan Perubahan' : 'Tambahkan'}
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm"
                      onClick={() => setIsAddingMethod(false)}
                    >
                      Batal
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="payment-methods-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {paymentMethods.map(item => (
                  <div 
                    key={item.id} 
                    className="pm-item-card"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.65rem 0.85rem', borderRadius: '10px',
                      background: 'var(--card-bg)', border: '1px solid var(--border-color)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {item.icon === 'Banknote' ? <Banknote size={16} /> : item.icon === 'Smartphone' ? <Smartphone size={16} /> : <CreditCard size={16} />}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.name}</span>
                          {item.isPrimary && (
                            <span className="badge badge-success" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>Utama</span>
                          )}
                        </div>
                        {item.number && <span className="text-xs text-muted">{item.number}</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {!item.isPrimary && (
                        <button 
                          type="button" 
                          className="btn btn-secondary btn-xs"
                          onClick={() => {
                            setPrimaryPaymentMethod(item.id);
                            setPaymentMethods(getCustomPaymentMethods());
                            showToast(`"${item.name}" diatur sebagai Rekening Utama`, 'info');
                          }}
                        >
                          Pilih Utama
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
                        className="btn-icon-subtle text-danger"
                        onClick={() => handleDeletePaymentMethod(item.id)}
                        title="Hapus"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* =========================================================
              4. SUB-MENU: DATA BACKUP & RESET
              ========================================================= */}
          {currentView === 'data' && (
            <div className="settings-section">
              <div className="data-action-card mb-3" style={{ padding: '0.85rem', borderRadius: '10px', background: 'var(--card-bg)', border: '1px solid var(--border-color)' }}>
                <h4 className="text-xs font-semibold mb-1">Cadangan File JSON</h4>
                <p className="text-muted text-xs mb-3">Simpan atau pulihkan seluruh data catatan keuangan ke file JSON.</p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    type="button" 
                    className="btn btn-primary btn-sm flex-1"
                    onClick={handleExport}
                    disabled={loading}
                  >
                    <Download size={13} />
                    <span>Ekspor JSON</span>
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-sm flex-1"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                  >
                    <Upload size={13} />
                    <span>Impor JSON</span>
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

              <div className="data-action-card" style={{ padding: '0.85rem', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <h4 className="text-xs font-semibold text-danger mb-1">Pembersihan Data</h4>
                <p className="text-muted text-xs mb-3">Hati-hati: Tindakan ini tidak dapat dibatalkan.</p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-sm flex-1"
                    onClick={handleResetSample}
                    disabled={loading}
                  >
                    <RefreshCw size={13} />
                    <span>Reset Data Contoh</span>
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-danger btn-sm flex-1"
                    onClick={handleClearAllData}
                    disabled={loading}
                  >
                    <Trash2 size={13} />
                    <span>Kosongkan Seluruh Data</span>
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
