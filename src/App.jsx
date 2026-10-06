import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  db, seedInitialDataIfEmpty, markRecurringExpensePaid, 
  unmarkRecurringExpensePaid, clearAllDatabaseData, getPrimaryPaymentMethod 
} from './db/db';
import Header from './components/Header';
import DailyExpenses from './components/DailyExpenses';
import TransactionModal from './components/TransactionModal';
import RecurringModal from './components/RecurringModal';
import RecurringManagerModal from './components/RecurringManagerModal';
import SettingsModal from './components/SettingsModal';
import ConfirmDialog from './components/ConfirmDialog';
import Toast from './components/Toast';
import { 
  getSupabaseConfig, 
  subscribeToRealtime,
  fetchTransactionsFromSupabase,
  insertTransactionToSupabase,
  updateTransactionInSupabase,
  deleteTransactionFromSupabase,
  fetchRecurringFromSupabase,
  insertRecurringToSupabase,
  updateRecurringInSupabase,
  deleteRecurringFromSupabase,
  fetchRecurringPaymentsFromSupabase,
  insertRecurringPaymentToSupabase,
  deleteRecurringPaymentsByTxId,
  fetchPaymentMethodsFromSupabase
} from './services/supabaseService';
import './App.css';

export default function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('finflow_theme') || 'light';
  });

  const [selectedMonthYear, setSelectedMonthYear] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [allTransactions, setAllTransactions] = useState([]);
  const [recurringList, setRecurringList] = useState([]);
  const [recurringPayments, setRecurringPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(() => getSupabaseConfig().isConfigured);

  // Modals
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState(null);

  const [isManageRecurringOpen, setIsManageRecurringOpen] = useState(false);
  const [returnToManage, setReturnToManage] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Delete Confirmation Dialog State
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Toast
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  // Handle URL shortcut parameters from PWA
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    if (action === 'add') {
      setIsTxModalOpen(true);
    }
  }, []);

  // Set Theme attribute on root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('finflow_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  // Load all DB data (Supabase primary + Dexie offline fallback)
  const loadData = useCallback(async () => {
    try {
      const cfg = getSupabaseConfig();
      setIsSupabaseConnected(cfg.isConfigured);

      if (cfg.isConfigured) {
        // 1. Primary: Fetch from Supabase Cloud (Transactions, Recurring, Payments, & Account Balances)
        const [cloudTxs, cloudRecurring, cloudPayments] = await Promise.all([
          fetchTransactionsFromSupabase(),
          fetchRecurringFromSupabase(),
          fetchRecurringPaymentsFromSupabase(),
          fetchPaymentMethodsFromSupabase()
        ]);

        if (cloudTxs !== null && cloudRecurring !== null && cloudPayments !== null) {
          setAllTransactions(cloudTxs);
          setRecurringList(cloudRecurring);
          setRecurringPayments(cloudPayments);

          // Update Dexie local cache in background
          try {
            await db.transactions.clear();
            if (cloudTxs.length > 0) await db.transactions.bulkAdd(cloudTxs);
            await db.recurringExpenses.clear();
            if (cloudRecurring.length > 0) await db.recurringExpenses.bulkAdd(cloudRecurring);
            await db.recurringPayments.clear();
            if (cloudPayments.length > 0) await db.recurringPayments.bulkAdd(cloudPayments);
          } catch {}
          return;
        }
      }

      // 2. Fallback: Load from local Dexie database
      const txCount = await db.transactions.count();
      if (txCount === 0) {
        await seedInitialDataIfEmpty();
      }
      
      const txs = await db.transactions.toArray();
      const recurring = await db.recurringExpenses.toArray();
      const payments = await db.recurringPayments.toArray();

      setAllTransactions(txs);
      setRecurringList(recurring);
      setRecurringPayments(payments);
    } catch (err) {
      console.error('Failed to load database:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-time Supabase WebSocket Listener (Instant sync across HP A, HP B, PC, Bot)
  useEffect(() => {
    const cleanup = subscribeToRealtime(() => {
      loadData();
      showToast('⚡ Data tersinkronisasi instan via Supabase!', 'info');
    });

    const handleConfigChange = () => {
      setIsSupabaseConnected(getSupabaseConfig().isConfigured);
      loadData();
    };

    window.addEventListener('finflow_supabase_config_updated', handleConfigChange);
    return () => {
      cleanup();
      window.removeEventListener('finflow_supabase_config_updated', handleConfigChange);
    };
  }, [loadData, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Current month transactions (sorted descending)
  const currentMonthTransactions = useMemo(() => {
    return allTransactions
      .filter(t => t.date && t.date.startsWith(selectedMonthYear))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
  }, [allTransactions, selectedMonthYear]);

  // Map of recurring payments
  const currentMonthPaymentsMap = useMemo(() => {
    const map = {};
    const txIdSet = new Set(allTransactions.map(t => String(t.id)));

    recurringPayments
      .filter(p => p.monthYear === selectedMonthYear)
      .forEach(p => {
        if (!p.transactionId || txIdSet.has(String(p.transactionId))) {
          map[p.recurringId] = p;
        }
      });
    return map;
  }, [recurringPayments, selectedMonthYear, allTransactions]);

  // Summary Metrics (Rolling / Cumulative Balance across months)
  const { totalIncome, totalExpense, priorBalance, netBalance } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    let priorInc = 0;
    let priorExp = 0;

    allTransactions.forEach(t => {
      if (!t.date) return;
      const monthPrefix = t.date.slice(0, 7);

      if (monthPrefix === selectedMonthYear) {
        if (t.type === 'income') inc += (t.amount || 0);
        else exp += (t.amount || 0);
      } else if (monthPrefix < selectedMonthYear) {
        if (t.type === 'income') priorInc += (t.amount || 0);
        else priorExp += (t.amount || 0);
      }
    });

    const priorBal = priorInc - priorExp;
    const currentMonthNet = inc - exp;

    return {
      totalIncome: inc,
      totalExpense: exp,
      priorBalance: priorBal,
      netBalance: priorBal + currentMonthNet
    };
  }, [allTransactions, selectedMonthYear]);

  // Transaction Handlers
  const handleSaveTransaction = async (txData) => {
    try {
      const cfg = getSupabaseConfig();
      if (cfg.isConfigured) {
        if (txData.id) {
          await updateTransactionInSupabase(txData.id, txData);
          showToast('Transaksi diperbarui di Supabase!', 'success');
        } else {
          await insertTransactionToSupabase(txData);
          showToast('Transaksi disimpan ke Supabase!', 'success');
        }
      } else {
        // Local Dexie save
        if (txData.id) {
          await db.transactions.update(txData.id, txData);
          showToast('Transaksi diperbarui!', 'success');
        } else {
          await db.transactions.add({
            ...txData,
            createdAt: new Date().toISOString()
          });
          showToast('Transaksi dicatat!', 'success');
        }
      }

      setIsTxModalOpen(false);
      setEditingTx(null);
      await loadData();
    } catch (err) {
      showToast('Gagal menyimpan: ' + err.message, 'error');
    }
  };

  const promptDeleteTransaction = (item) => {
    setDeleteConfirm({
      type: 'transaction',
      item,
      title: 'Hapus Transaksi?',
      message: `Apakah Anda yakin ingin menghapus catatan "${item.title}"?`
    });
  };

  // Recurring Handlers
  const handleSaveRecurring = async (recData) => {
    try {
      const cfg = getSupabaseConfig();
      if (cfg.isConfigured) {
        if (recData.id) {
          await updateRecurringInSupabase(recData.id, recData);
          showToast('Tagihan diperbarui di Supabase!', 'success');
        } else {
          await insertRecurringToSupabase(recData);
          showToast('Tagihan baru ditambahkan ke Supabase!', 'success');
        }
      } else {
        if (recData.id) {
          await db.recurringExpenses.update(recData.id, recData);
          showToast('Tagihan diperbarui!', 'success');
        } else {
          await db.recurringExpenses.add(recData);
          showToast('Tagihan baru ditambahkan!', 'success');
        }
      }

      setIsRecurringModalOpen(false);
      setEditingRecurring(null);
      
      if (returnToManage) {
        setIsManageRecurringOpen(true);
        setReturnToManage(false);
      }

      await loadData();
    } catch (err) {
      showToast('Gagal menyimpan tagihan: ' + err.message, 'error');
    }
  };

  const handleCloseRecurringModal = () => {
    setIsRecurringModalOpen(false);
    setEditingRecurring(null);
    if (returnToManage) {
      setIsManageRecurringOpen(true);
      setReturnToManage(false);
    }
  };

  const promptDeleteRecurring = (item) => {
    setDeleteConfirm({
      type: 'recurring',
      item,
      title: 'Hapus Tagihan Rutin?',
      message: `Apakah Anda yakin ingin menghapus tagihan bulanan "${item.title}"?`
    });
  };

  // Execute Deletion from Confirm Dialog
  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    const { type, item } = deleteConfirm;

    try {
      const cfg = getSupabaseConfig();
      if (type === 'transaction') {
        if (cfg.isConfigured) {
          await deleteTransactionFromSupabase(item.id);
          await deleteRecurringPaymentsByTxId(item.id);
        } else {
          await db.transactions.delete(item.id);
          await db.recurringPayments.where('transactionId').equals(item.id).delete();
        }
        showToast('Transaksi berhasil dihapus', 'info');
      } else if (type === 'recurring') {
        if (cfg.isConfigured) {
          await deleteRecurringFromSupabase(item.id);
        } else {
          await db.recurringExpenses.delete(item.id);
          await db.recurringPayments.where('recurringId').equals(item.id).delete();
        }
        showToast('Tagihan rutin berhasil dihapus', 'info');
      }
      setDeleteConfirm(null);
      await loadData();
    } catch (err) {
      showToast('Gagal menghapus: ' + err.message, 'error');
    }
  };

  // Mark Recurring Quest Paid
  const handleMarkRecurringPaid = async (recurringItem) => {
    try {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const paidDate = `${selectedMonthYear}-${day}`;
      const primary = getPrimaryPaymentMethod();
      const primaryName = primary ? primary.name : 'BSI';

      const sourceMethod = recurringItem.paymentMethod || primaryName;
      const destMethod = recurringItem.targetPaymentMethod || (recurringItem.title?.toLowerCase().includes('tabungan lily') ? 'BCA' : null);
      const isSavingsTransfer = Boolean(destMethod && destMethod !== sourceMethod);

      const cfg = getSupabaseConfig();
      if (cfg.isConfigured) {
        // Insert transaction into Supabase
        const txPayload = {
          title: recurringItem.title,
          amount: recurringItem.amount,
          type: isSavingsTransfer ? 'transfer' : 'expense',
          category: isSavingsTransfer ? 'Tabungan & Investasi' : (recurringItem.category || 'Tagihan & Utilitas'),
          date: paidDate,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          paymentMethod: sourceMethod,
          targetPaymentMethod: isSavingsTransfer ? destMethod : undefined,
          notes: isSavingsTransfer 
            ? `Tabungan Rutin (${recurringItem.title}) dari ${sourceMethod} ke ${destMethod} [to:${destMethod}]`
            : `Pembayaran Rutin Bulanan (${recurringItem.title})`,
          recurringId: recurringItem.id
        };
        const createdTx = await insertTransactionToSupabase(txPayload);

        // Record payment in Supabase
        await insertRecurringPaymentToSupabase({
          recurringId: recurringItem.id,
          monthYear: selectedMonthYear,
          paidDate,
          transactionId: createdTx?.id || null
        });
      } else {
        await markRecurringExpensePaid({
          recurring: recurringItem,
          monthYear: selectedMonthYear,
          paidDate,
          paymentMethod: sourceMethod
        });
      }

      if (isSavingsTransfer) {
        showToast(`🏦 Tabungan "${recurringItem.title}" berhasil dialokasikan: ${sourceMethod} ➔ ${destMethod}!`, 'success');
      } else {
        showToast(`⚔️ Misi "${recurringItem.title}" selesai! (${sourceMethod})`, 'success');
      }
      await loadData();
    } catch (err) {
      showToast('Gagal menandai lunas: ' + err.message, 'error');
    }
  };

  return (
    <div className="app-container">
      {/* Minimal Top Header */}
      <Header 
        selectedMonthYear={selectedMonthYear}
        setSelectedMonthYear={setSelectedMonthYear}
        theme={theme}
        toggleTheme={toggleTheme}
        isSupabaseConnected={isSupabaseConnected}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenNewTransaction={() => {
          setEditingTx(null);
          setIsTxModalOpen(true);
        }}
        onOpenManageRecurring={() => {
          setReturnToManage(false);
          setIsManageRecurringOpen(true);
        }}
      />

      {/* Main Single Clean Stream */}
      <main>
        <DailyExpenses 
          transactions={currentMonthTransactions}
          allTransactions={allTransactions}
          totalIncome={totalIncome}
          totalExpense={totalExpense}
          priorBalance={priorBalance}
          netBalance={netBalance}
          recurringList={recurringList}
          recurringPaymentsMap={currentMonthPaymentsMap}
          selectedMonthYear={selectedMonthYear}
          onSaveIncome={handleSaveTransaction}
          onOpenNewTransaction={() => {
            setEditingTx(null);
            setIsTxModalOpen(true);
          }}
          onEditTransaction={(item) => {
            setEditingTx(item);
            setIsTxModalOpen(true);
          }}
          onDeleteTransaction={promptDeleteTransaction}
          onMarkRecurringPaid={handleMarkRecurringPaid}
          onOpenManageRecurring={() => {
            setReturnToManage(false);
            setIsManageRecurringOpen(true);
          }}
          onOpenNewRecurring={() => {
            setReturnToManage(false);
            setEditingRecurring(null);
            setIsRecurringModalOpen(true);
          }}
          onDataChanged={loadData}
          showToast={showToast}
        />
      </main>

      {/* Transaction Modal */}
      <TransactionModal 
        isOpen={isTxModalOpen}
        onClose={() => {
          setIsTxModalOpen(false);
          setEditingTx(null);
        }}
        onSave={handleSaveTransaction}
        initialData={editingTx}
        selectedMonthYear={selectedMonthYear}
      />

      {/* Recurring Modal */}
      <RecurringModal 
        isOpen={isRecurringModalOpen}
        onClose={handleCloseRecurringModal}
        onSave={handleSaveRecurring}
        initialData={editingRecurring}
      />

      {/* Recurring Manager Modal */}
      <RecurringManagerModal 
        isOpen={isManageRecurringOpen}
        onClose={() => setIsManageRecurringOpen(false)}
        recurringList={recurringList}
        recurringPaymentsMap={currentMonthPaymentsMap}
        selectedMonthYear={selectedMonthYear}
        onOpenNewRecurring={() => {
          setReturnToManage(true);
          setIsManageRecurringOpen(false);
          setEditingRecurring(null);
          setIsRecurringModalOpen(true);
        }}
        onAddNew={() => {
          setReturnToManage(true);
          setIsManageRecurringOpen(false);
          setEditingRecurring(null);
          setIsRecurringModalOpen(true);
        }}
        onEditRecurring={(item) => {
          setReturnToManage(true);
          setIsManageRecurringOpen(false);
          setEditingRecurring(item);
          setIsRecurringModalOpen(true);
        }}
        onEdit={(item) => {
          setReturnToManage(true);
          setIsManageRecurringOpen(false);
          setEditingRecurring(item);
          setIsRecurringModalOpen(true);
        }}
        onDeleteRecurring={promptDeleteRecurring}
        onDelete={promptDeleteRecurring}
        onTogglePaid={handleMarkRecurringPaid}
      />

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onDataChanged={loadData}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog 
        isOpen={!!deleteConfirm}
        title={deleteConfirm?.title || 'Hapus Data'}
        message={deleteConfirm?.message || 'Apakah Anda yakin?'}
        confirmLabel="Hapus"
        isDanger={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Global Toast */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
}
