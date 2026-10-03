import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Plus, Trash2, Edit2, Layers, Info, 
  ChevronDown, CreditCard, Banknote, Smartphone, Wallet, Star
} from 'lucide-react';
import { 
  formatRupiah, formatDateID, getRelativeDayLabel, 
  getCategoryIcon, formatMonthYear 
} from '../utils/formatters';
import { getCustomPaymentMethods } from '../db/db';
import MonthlyQuests from './MonthlyQuests';

export default function DailyExpenses({
  transactions,
  totalIncome,
  totalExpense,
  netBalance,
  recurringList,
  recurringPaymentsMap,
  selectedMonthYear,
  onSaveIncome,
  onOpenNewTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onMarkRecurringPaid,
  onOpenManageRecurring,
  onOpenNewRecurring
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, expense, income
  const [showAccountBreakdown, setShowAccountBreakdown] = useState(false);
  const [paymentMethodsList, setPaymentMethodsList] = useState(getCustomPaymentMethods());

  // Listen to payment methods updates
  useEffect(() => {
    const handleUpdate = () => {
      setPaymentMethodsList(getCustomPaymentMethods());
    };
    window.addEventListener('finflow_payment_methods_updated', handleUpdate);
    return () => window.removeEventListener('finflow_payment_methods_updated', handleUpdate);
  }, []);

  // Compute breakdown per account / payment method (excluding cash as requested)
  // Khusus pengeluaran harian tidak memotong saldo rekening (khusus pencatatan saja)
  const accountBalances = useMemo(() => {
    return paymentMethodsList
      .filter(method => {
        const isCash = method.icon === 'Banknote' || method.id === 'cash' || 
          method.name.toLowerCase().includes('tunai') || 
          method.name.toLowerCase().includes('cash');
        return !isCash;
      })
      .map(method => {
        let inc = 0;
        let exp = 0;

        transactions.forEach(t => {
          if (t.paymentMethod && t.paymentMethod.toLowerCase() === method.name.toLowerCase()) {
            if (t.type === 'income') inc += t.amount;
            else exp += t.amount;
          }
        });

        const isEwallet = method.icon === 'Smartphone' || ['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'].some(e => method.name.toLowerCase().includes(e));

        // Saldo simpanan rekening murni dari pemasukan tercatat (pengeluaran harian tidak memotong saldo)
        return {
          ...method,
          income: inc,
          expense: exp,
          balance: inc,
          isEwallet
        };
      })
      .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
  }, [paymentMethodsList, transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(item => {
      const matchSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.notes && item.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.paymentMethod && item.paymentMethod.toLowerCase().includes(searchQuery.toLowerCase())) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchType = filterType === 'all' || item.type === filterType;

      return matchSearch && matchType;
    });
  }, [transactions, searchQuery, filterType]);

  // Group by date
  const groupedTransactions = useMemo(() => {
    const groups = {};
    filteredTransactions.forEach(item => {
      if (!groups[item.date]) {
        groups[item.date] = {
          date: item.date,
          items: [],
          totalExpense: 0,
          totalIncome: 0
        };
      }
      groups[item.date].items.push(item);
      if (item.type === 'expense') {
        groups[item.date].totalExpense += item.amount;
      } else {
        groups[item.date].totalIncome += item.amount;
      }
    });

    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredTransactions]);

  return (
    <div className="zen-content-flow">
      {/* 1. Large Calm Balance Hero with Info Dropdown Button */}
      <div className="zen-hero-balance">
        <div className="zen-hero-main-row">
          <div className="zen-hero-left">
            <span className="zen-hero-label">Total Saldo Bersih</span>
            <h2 className={`zen-hero-number ${netBalance >= 0 ? 'text-inc' : 'text-exp'}`}>
              {netBalance >= 0 ? '+' : ''}{formatRupiah(netBalance)}
            </h2>

            <div className="zen-hero-subline">
              <span className="text-inc">+{formatRupiah(totalIncome)}</span>
              <span className="zen-sub-dot">•</span>
              <span className="text-exp">-{formatRupiah(totalExpense)}</span>
            </div>
          </div>

          {/* Info Button in the right empty space */}
          <div className="zen-hero-right">
            <button 
              type="button" 
              className={`zen-hero-info-btn ${showAccountBreakdown ? 'active' : ''}`}
              onClick={() => setShowAccountBreakdown(!showAccountBreakdown)}
              title="Lihat rincian saldo per rekening / dompet"
              aria-label="Informasi Saldo Rekening"
            >
              <Info size={16} />
              <span className="zen-hero-info-text">Rincian Rekening</span>
              <ChevronDown size={14} className={showAccountBreakdown ? 'rotate-180' : ''} />
            </button>
          </div>
        </div>

        {/* Dropdown Information Panel */}
        {showAccountBreakdown && (
          <div className="zen-hero-dropdown-panel">
            <div className="zen-dropdown-header">
              <span className="zen-dropdown-title">
                Saldo & Arus Kas per Rekening ({formatMonthYear(selectedMonthYear)})
              </span>
            </div>

            <div className="zen-accounts-grid">
              {accountBalances.map(acc => (
                <div key={acc.id} className={`zen-account-card ${acc.isPrimary ? 'is-primary-card' : ''}`}>
                  <div className="zen-account-card-left">
                    <div className="zen-account-card-icon" style={{ color: acc.color || '#0060AF' }}>
                      {acc.isCash ? <Banknote size={15} /> : acc.isEwallet ? <Smartphone size={15} /> : <CreditCard size={15} />}
                    </div>
                    <div className="zen-account-card-name-wrap">
                      <div className="zen-account-name-row">
                        <span className="zen-account-card-name">{acc.name}</span>
                        {acc.isPrimary && (
                          <span className="zen-card-primary-tag" title="Rekening Utama">
                            <Star size={9} fill="currentColor" /> Utama
                          </span>
                        )}
                      </div>
                      {acc.number && <span className="zen-account-card-num">{acc.number}</span>}
                    </div>
                  </div>

                  <div className="zen-account-card-right">
                    <span className={`zen-account-card-balance ${acc.balance > 0 ? 'text-inc' : ''}`}>
                      {acc.balance > 0 ? '+' : ''}{formatRupiah(acc.balance)}
                    </span>
                    <span className="zen-account-card-flow">
                      +{formatRupiah(acc.income, false)} / -{formatRupiah(acc.expense, false)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Gamified Monthly Quest (Auto-disappears when all quests paid!) */}
      <MonthlyQuests 
        totalIncome={totalIncome}
        onSaveIncome={onSaveIncome}
        recurringList={recurringList}
        recurringPaymentsMap={recurringPaymentsMap}
        selectedMonthYear={selectedMonthYear}
        onMarkPaid={onMarkRecurringPaid}
        onOpenManageRecurring={onOpenManageRecurring}
        onOpenNewRecurring={onOpenNewRecurring}
      />

      {/* 3. Minimalist Search & Filter Strip */}
      <div className="zen-search-row">
        <div className="zen-search-input-wrap">
          <Search size={14} className="zen-search-icon" />
          <input 
            type="text"
            placeholder="Cari transaksi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="zen-search-clear" onClick={() => setSearchQuery('')}>×</button>
          )}
        </div>

        <div className="zen-type-filter">
          <button 
            className={`zen-filter-btn ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            Semua
          </button>
          <button 
            className={`zen-filter-btn ${filterType === 'expense' ? 'active' : ''}`}
            onClick={() => setFilterType('expense')}
          >
            Keluar
          </button>
          <button 
            className={`zen-filter-btn ${filterType === 'income' ? 'active' : ''}`}
            onClick={() => setFilterType('income')}
          >
            Masuk
          </button>
        </div>
      </div>

      {/* 4. Flat Minimalist Transactions Flow */}
      {groupedTransactions.length === 0 ? (
        <div className="zen-empty">
          <p className="text-muted text-sm">Belum ada transaksi pada bulan ini.</p>
          <button className="zen-link-btn" onClick={onOpenNewTransaction}>
            + Catat Sekarang
          </button>
        </div>
      ) : (
        <div className="zen-groups-container">
          {groupedTransactions.map(group => (
            <div key={group.date} className="zen-date-group">
              {/* Date Separator Header */}
              <div className="zen-group-header">
                <span className="zen-group-day">{getRelativeDayLabel(group.date)}</span>
                <span className="zen-group-total">
                  {group.totalExpense > 0 && <span>-{formatRupiah(group.totalExpense)}</span>}
                  {group.totalIncome > 0 && <span className="text-inc">+{formatRupiah(group.totalIncome)}</span>}
                </span>
              </div>

              {/* Transactions List */}
              <div className="zen-items-list">
                {group.items.map(item => {
                  const isExpense = item.type === 'expense';
                  return (
                    <div key={item.id} className="zen-tx-row">
                      <div className="zen-tx-left">
                        <div className="zen-tx-icon">
                          {getCategoryIcon(item.category, 16)}
                        </div>
                        <div className="zen-tx-details">
                          <span className="zen-tx-title">{item.title}</span>
                          <span className="zen-tx-meta">
                            {item.category}
                            {item.paymentMethod && ` • ${item.paymentMethod}`}
                            {item.notes && ` • ${item.notes}`}
                          </span>
                        </div>
                      </div>

                      <div className="zen-tx-right">
                        <span className={`zen-tx-amount ${isExpense ? 'text-exp' : 'text-inc'}`}>
                          {isExpense ? '-' : '+'}{formatRupiah(item.amount)}
                        </span>

                        <div className="zen-tx-actions">
                          <button 
                            className="zen-action-btn" 
                            onClick={() => onEditTransaction(item)}
                            title="Edit"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button 
                            className="zen-action-btn btn-del" 
                            onClick={() => onDeleteTransaction(item)}
                            title="Hapus Transaksi"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
