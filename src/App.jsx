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
import { pushDatabaseToTelegram, getTelegramConfig, initTelegramAutoSync } from './services/telegramDb';
import { initWhatsAppSync } from './services/whatsappSync';
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

  // Load all DB data
  const loadData = useCallback(async () => {
    try {
      await seedInitialDataIfEmpty();
      
      const txs = await db.transactions.toArray();
      const recurring = await db.recurringExpenses.toArray();
      const payments = await db.recurringPayments.toArray();

      // Auto-align recurring templates and legacy recurring transactions to current Primary Account if they have default BCA
      const primary = getPrimaryPaymentMethod();
      const primaryName = primary ? primary.name : 'BSI';
      if (primaryName !== 'BCA') {
        for (const r of recurring) {
          if (r.paymentMethod === 'BCA' || !r.paymentMethod) {
            r.paymentMethod = primaryName;
            await db.recurringExpenses.update(r.id, { paymentMethod: primaryName });
          }
        }
        for (const t of txs) {
          if (t.recurringId && (t.paymentMethod === 'BCA' || !t.paymentMethod)) {
            t.paymentMethod = primaryName;
            await db.transactions.update(t.id, { paymentMethod: primaryName });
          }
        }
      }

      // Clean orphaned payments whose transaction was deleted
      const txIdSet = new Set(txs.map(t => t.id));
      const orphanedPaymentIds = [];
      const validPayments = [];

      for (const p of payments) {
        if (p.transactionId && !txIdSet.has(p.transactionId)) {
          orphanedPaymentIds.push(p.id);
        } else {
          validPayments.push(p);
        }
      }

      if (orphanedPaymentIds.length > 0) {
        await db.recurringPayments.bulkDelete(orphanedPaymentIds);
      }

      setAllTransactions(txs);
      setRecurringList(recurring);
      setRecurringPayments(validPayments);
    } catch (err) {
      console.error('Failed to load database:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-time Telegram Cloud Sync Listener & Background Worker (Syncs across devices)
  useEffect(() => {
    const cleanup = initTelegramAutoSync({
      onDataUpdated: () => {
        loadData();
        showToast('☁️ Data keuangan tersinkronisasi dari Telegram Cloud!', 'info');
      }
    });
    return cleanup;
  }, [loadData, showToast]);

  // Real-time WhatsApp Bot Sync Listener
  useEffect(() => {
    const cleanup = initWhatsAppSync({
      onNewTransactions: (items) => {
        loadData();
        showToast(`💬 ${items.length} transaksi baru berhasil diinput dari WhatsApp!`, 'success');
      },
      onServerDiscovered: (url) => {
        showToast(`📶 Terhubung otomatis ke Bot Server di Wi-Fi: ${url}`, 'info');
      }
    });
    return cleanup;
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

  // Map of recurring payments (only valid if linked transaction exists)
  const currentMonthPaymentsMap = useMemo(() => {
    const map = {};
    const txIdSet = new Set(allTransactions.map(t => t.id));

    recurringPayments
      .filter(p => p.monthYear === selectedMonthYear)
      .forEach(p => {
        if (!p.transactionId || txIdSet.has(p.transactionId)) {
          map[p.recurringId] = p;
        }
      });
    return map;
  }, [recurringPayments, selectedMonthYear, allTransactions]);

  // Summary Metrics
  const { totalIncome, totalExpense, netBalance } = useMemo(() => {
    let inc = 0;
    let exp = 0;

    currentMonthTransactions.forEach(t => {
      if (t.type === 'income') inc += t.amount;
      else exp += t.amount;
    });

    return {
      totalIncome: inc,
      totalExpense: exp,
      netBalance: inc - exp
    };
  }, [currentMonthTransactions]);

  // Telegram Auto-Sync helper
  const triggerTelegramSync = async () => {
    try {
      const config = getTelegramConfig();
      if (config.botToken && config.chatId && config.autoSync) {
        await pushDatabaseToTelegram();
      }
    } catch (err) {
      console.warn('Auto sync to Telegram skipped/failed:', err);
    }
  };

  // Transaction Handlers
  const handleSaveTransaction = async (txData) => {
    try {
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
      setIsTxModalOpen(false);
      setEditingTx(null);
      await loadData();
      triggerTelegramSync();
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
      if (recData.id) {
        await db.recurringExpenses.update(recData.id, recData);
        showToast('Tagihan diperbarui!', 'success');
      } else {
        await db.recurringExpenses.add(recData);
        showToast('Tagihan baru ditambahkan!', 'success');
      }
      setIsRecurringModalOpen(false);
      setEditingRecurring(null);
      
      // If user opened this from manage modal, reopen manage modal smoothly
      if (returnToManage) {
        setIsManageRecurringOpen(true);
        setReturnToManage(false);
      }

      await loadData();
      triggerTelegramSync();
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
      if (type === 'transaction') {
        await db.transactions.delete(item.id);
        if (item.recurringId) {
          const monthYear = item.date ? item.date.substring(0, 7) : selectedMonthYear;
          await db.recurringPayments
            .where('recurringId')
            .equals(Number(item.recurringId))
            .and(p => p.monthYear === monthYear)
            .delete();
        }
        await db.recurringPayments.where('transactionId').equals(item.id).delete();
        showToast('Transaksi berhasil dihapus', 'info');
      } else if (type === 'recurring') {
        await db.recurringExpenses.delete(item.id);
        await db.recurringPayments.where('recurringId').equals(item.id).delete();
        showToast('Tagihan rutin berhasil dihapus', 'info');
      }
      setDeleteConfirm(null);
      await loadData();
      triggerTelegramSync();
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

      const targetMethod = (recurringItem.paymentMethod && recurringItem.paymentMethod !== 'BCA')
        ? recurringItem.paymentMethod
        : primaryName;

      await markRecurringExpensePaid({
        recurring: recurringItem,
        monthYear: selectedMonthYear,
        paidDate,
        paymentMethod: targetMethod
      });

      showToast(`⚔️ Misi "${recurringItem.title}" selesai! (${targetMethod})`, 'success');
      await loadData();
      triggerTelegramSync();
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
          totalIncome={totalIncome}
          totalExpense={totalExpense}
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
        onOpenNewRecurring={() => {
          setEditingRecurring(null);
          setIsManageRecurringOpen(false);
          setReturnToManage(true);
          setIsRecurringModalOpen(true);
        }}
        onEditRecurring={(item) => {
          setEditingRecurring(item);
          setIsManageRecurringOpen(false);
          setReturnToManage(true);
          setIsRecurringModalOpen(true);
        }}
        onDeleteRecurring={promptDeleteRecurring}
      />

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onDataChanged={loadData}
        showToast={showToast}
      />

      {/* Dedicated Custom Confirm Dialog */}
      <ConfirmDialog 
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleConfirmDelete}
        title={deleteConfirm?.title || 'Konfirmasi Hapus'}
        message={deleteConfirm?.message || 'Apakah Anda yakin ingin menghapus data ini?'}
        item={deleteConfirm?.item}
        confirmText="Ya, Hapus"
        cancelText="Batal"
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

