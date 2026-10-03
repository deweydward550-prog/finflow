import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  db, seedInitialDataIfEmpty, markRecurringExpensePaid, 
  unmarkRecurringExpensePaid, clearAllDatabaseData 
} from './db/db';
import Header from './components/Header';
import DailyExpenses from './components/DailyExpenses';
import TransactionModal from './components/TransactionModal';
import RecurringModal from './components/RecurringModal';
import RecurringManagerModal from './components/RecurringManagerModal';
import SettingsModal from './components/SettingsModal';
import ConfirmDialog from './components/ConfirmDialog';
import Toast from './components/Toast';
import { pushDatabaseToTelegram, getTelegramConfig } from './services/telegramDb';
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
      const WIPE_KEY = 'finflow_wiped_clean_v1';
      if (!localStorage.getItem(WIPE_KEY)) {
        await clearAllDatabaseData();
        localStorage.setItem(WIPE_KEY, 'true');
      } else {
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
  }, [selectedMonthYear]);

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
    recurringPayments
      .filter(p => p.monthYear === selectedMonthYear)
      .forEach(p => {
        map[p.recurringId] = p;
      });
    return map;
  }, [recurringPayments, selectedMonthYear]);

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

      await markRecurringExpensePaid({
        recurring: recurringItem,
        monthYear: selectedMonthYear,
        paidDate,
        paymentMethod: recurringItem.paymentMethod
      });

      showToast(`⚔️ Misi "${recurringItem.title}" selesai!`, 'success');
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

