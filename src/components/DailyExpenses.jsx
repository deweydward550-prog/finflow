import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Plus, Trash2, Edit2, Edit3, Layers, Info, 
  ChevronDown, CreditCard, Banknote, Smartphone, Wallet, Star,
  ArrowUpRight, ArrowDownRight, Activity, Sparkles
} from 'lucide-react';
import { 
  formatRupiah, formatDateID, getRelativeDayLabel, 
  getCategoryIcon, getCategoryColor, formatMonthYear 
} from '../utils/formatters.jsx';
import { getCustomPaymentMethods, saveCustomPaymentMethods } from '../db/db';
import MonthlyQuests from './MonthlyQuests';
import EditAccountBalancesModal from './EditAccountBalancesModal';

export default function DailyExpenses({
  transactions,
  allTransactions = [],
  totalIncome,
  totalExpense,
  priorBalance = 0,
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
  onOpenNewRecurring,
  onDataChanged,
  showToast
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, expense, income
  const [showAccountBreakdown, setShowAccountBreakdown] = useState(false);
  const [isEditBalancesOpen, setIsEditBalancesOpen] = useState(false);
  const [paymentMethodsList, setPaymentMethodsList] = useState(() => getCustomPaymentMethods());

  // Listen to payment methods updates
  useEffect(() => {
    const handleUpdate = () => {
      setPaymentMethodsList(getCustomPaymentMethods());
    };
    window.addEventListener('finflow_payment_methods_updated', handleUpdate);
    return () => window.removeEventListener('finflow_payment_methods_updated', handleUpdate);
  }, []);

  // Map of recurring templates for instant icon & color lookup
  const recurringMap = useMemo(() => {
    const map = new Map();
    if (Array.isArray(recurringList)) {
      recurringList.forEach(r => {
        if (r && r.id != null) {
          map.set(r.id, r);
          map.set(String(r.id), r);
          if (!isNaN(r.id)) map.set(Number(r.id), r);
        }
      });
    }
    return map;
  }, [recurringList]);

  // Resolve visual icon & color for transaction
  const getItemVisual = (item) => {
    if (item.icon) {
      return {
        icon: item.icon,
        color: item.color || getCategoryColor(item.icon)
      };
    }
    if (item.recurringId != null) {
      const rec = recurringMap.get(item.recurringId) || recurringMap.get(String(item.recurringId));
      if (rec) {
        return {
          icon: rec.icon || rec.category || item.category,
          color: rec.color || getCategoryColor(rec.icon || rec.title || item.category)
        };
      }
    }
    // Check if title mentions a known recurring item
    const matchedRec = (recurringList || []).find(r => 
      item.title && r.title && item.title.toLowerCase().includes(r.title.toLowerCase())
    );
    if (matchedRec) {
      return {
        icon: matchedRec.icon || matchedRec.category || item.category,
        color: matchedRec.color || getCategoryColor(matchedRec.icon || matchedRec.title)
      };
    }

    return {
      icon: item.category,
      color: getCategoryColor(item.category || item.title)
    };
  };

  // Compute breakdown per account / payment method (excluding cash)
  const accountBalances = useMemo(() => {
    return paymentMethodsList
      .filter(method => {
        const isCash = method.icon === 'Banknote' || method.id === 'cash' || 
          method.name.toLowerCase().includes('tunai') || 
          method.name.toLowerCase().includes('cash');
        return !isCash;
      })
      .map(method => {
        let totalIncUpToMonth = 0;
        let totalExpUpToMonth = 0;
        let currentMonthInc = 0;
        let currentMonthExp = 0;
        let priorMonthInc = 0;
        let priorMonthExp = 0;

        (allTransactions || []).forEach(t => {
          if (!t.date) return;
          const monthPrefix = t.date.slice(0, 7);
          const isUpToMonth = monthPrefix <= selectedMonthYear;
          const isCurrentMonth = monthPrefix === selectedMonthYear;
          const isPriorMonth = monthPrefix < selectedMonthYear;

          const sourceMethod = (t.paymentMethod || '').trim().toLowerCase();
          const targetMethod = (t.targetPaymentMethod || 
            (t.notes?.match(/\[to:([^\]]+)\]/i)?.[1]) ||
            (t.title?.toLowerCase().includes('tabungan lily') ? 'BCA' : '')
          ).trim().toLowerCase();

          const currentMethodName = method.name.trim().toLowerCase();

          // Inflow to this account:
          // 1. Regular income received in this account
          // 2. OR Savings/Transfer arriving in this account (targetMethod)
          const isInflow = (t.type === 'income' && sourceMethod === currentMethodName) ||
            (targetMethod && targetMethod === currentMethodName && sourceMethod !== currentMethodName);

          // Outflow from this account:
          // 1. Regular expense or transfer paid out of this account (sourceMethod)
          const isOutflow = ((t.type === 'expense' || t.type === 'transfer' || targetMethod) && sourceMethod === currentMethodName);

          if (isUpToMonth) {
            if (isInflow) totalIncUpToMonth += (t.amount || 0);
            if (isOutflow) totalExpUpToMonth += (t.amount || 0);
          }

          if (isCurrentMonth) {
            if (isInflow) currentMonthInc += (t.amount || 0);
            if (isOutflow) currentMonthExp += (t.amount || 0);
          }

          if (isPriorMonth) {
            if (isInflow) priorMonthInc += (t.amount || 0);
            if (isOutflow) priorMonthExp += (t.amount || 0);
          }
        });

        const isEwallet = method.icon === 'Smartphone' || 
          ['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'].some(e => method.name.toLowerCase().includes(e));

        // Baseline balance (saldo awal terdaftar)
        const baseInitial = method.initialBalance !== undefined 
          ? method.initialBalance 
          : 0;

        // Saldo Sebelumnya (sebelum mutasi bulan berjalan):
        const priorBalance = baseInitial + priorMonthInc - priorMonthExp;

        // Saldo Terkini / Realtime (hingga bulan berjalan):
        const finalBalance = baseInitial + totalIncUpToMonth - totalExpUpToMonth;

        // Perubahan bersih bulan ini:
        const netChange = currentMonthInc - currentMonthExp;

        return {
          ...method,
          priorBalance,
          income: currentMonthInc,
          expense: currentMonthExp,
          netChange,
          totalIncUpToMonth,
          totalExpUpToMonth,
          balance: finalBalance,
          isEwallet
        };
      })
      .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
  }, [paymentMethodsList, allTransactions, selectedMonthYear]);

  // Aggregate Vault summary totals across all accounts
  const vaultTotals = useMemo(() => {
    let totalPrior = 0;
    let totalInc = 0;
    let totalExp = 0;
    let totalLive = 0;

    accountBalances.forEach(acc => {
      totalPrior += (acc.priorBalance || 0);
      totalInc += (acc.income || 0);
      totalExp += (acc.expense || 0);
      totalLive += (acc.balance || 0);
    });

    return {
      totalPrior,
      totalInc,
      totalExp,
      totalLive,
      netChange: totalInc - totalExp
    };
  }, [accountBalances]);

  // Handle saving new stored balances from Edit Modal
  const handleSaveAccountBalances = (updatedMethods) => {
    setPaymentMethodsList(updatedMethods);
    saveCustomPaymentMethods(updatedMethods);
    if (onDataChanged) {
      onDataChanged();
    }
  };

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

  // Total balance sum from accounts or net balance
  const hasCustomInitialBalances = useMemo(() => {
    return paymentMethodsList.some(m => m.initialBalance !== undefined && m.initialBalance !== 0);
  }, [paymentMethodsList]);

  const totalAccountBalances = useMemo(() => {
    return accountBalances.reduce((sum, acc) => sum + (acc.balance || 0), 0);
  }, [accountBalances]);

  const displayedHeroBalance = hasCustomInitialBalances ? totalAccountBalances : netBalance;

  return (
    <div className="zen-content-flow">
      {/* 1. Large Calm Balance Hero with Info Dropdown Button */}
      <div className="zen-hero-balance">
        <div className="zen-hero-top-row">
          <span className="zen-hero-label">Total Saldo Bersih</span>

          <button 
            type="button" 
            className={`zen-hero-info-btn ${showAccountBreakdown ? 'active' : ''}`}
            onClick={() => setShowAccountBreakdown(!showAccountBreakdown)}
            title="Lihat rincian saldo per rekening / dompet"
            aria-label="Informasi Saldo Rekening"
          >
            <Info size={14} />
            <span className="zen-hero-info-text">Rincian Rekening</span>
            <ChevronDown size={13} className={showAccountBreakdown ? 'rotate-180' : ''} />
          </button>
        </div>

        <h2 className={`zen-hero-number ${displayedHeroBalance >= 0 ? 'text-inc' : 'text-exp'}`}>
          {displayedHeroBalance >= 0 ? '+' : ''}{formatRupiah(displayedHeroBalance)}
        </h2>

        <div className="zen-hero-subline">
          <span className="text-inc">+{formatRupiah(totalIncome)}</span>
          <span className="zen-sub-dot">•</span>
          <span className="text-exp">-{formatRupiah(totalExpense)}</span>
          {priorBalance !== 0 && (
            <>
              <span className="zen-sub-dot">•</span>
              <span className="zen-sub-prior" title="Saldo bawaan yang diteruskan dari bulan-bulan sebelumnya">
                Awal: {priorBalance >= 0 ? '+' : ''}{formatRupiah(priorBalance, false)}
              </span>
            </>
          )}
        </div>

        {/* Dropdown Information Panel - Window Game HUD Aesthetic */}
        {showAccountBreakdown && (
          <div className="game-hud-window-panel">
            {/* 1. Game Window Titlebar */}
            <div className="game-hud-titlebar">
              <div className="game-hud-title-left">
                <span className="game-hud-live-badge">
                  <span className="game-live-pulse-dot"></span>
                  LIVE HUD
                </span>
                <span className="game-hud-main-title">
                  VAULT REKENING & ARUS KAS
                </span>
                <span className="game-hud-period-tag">
                  {formatMonthYear(selectedMonthYear)}
                </span>
              </div>
              
              <div className="game-hud-actions">
                <button
                  type="button"
                  className="game-hud-action-btn"
                  onClick={() => setIsEditBalancesOpen(true)}
                  title="Ubah Nominal Baseline / Saldo Awal Rekening"
                >
                  <Edit3 size={13} />
                  <span>Atur Saldo Awal</span>
                </button>
              </div>
            </div>

            {/* 2. Global Game Vault Equation Strip (Total Awal + Masuk - Keluar = Total Live) */}
            <div className="game-vault-summary-strip">
              <div className="vault-eq-col">
                <span className="vault-eq-label">SALDO AWAL TOTAL</span>
                <span className="vault-eq-val">{formatRupiah(vaultTotals.totalPrior)}</span>
              </div>

              <span className="vault-eq-sign">+</span>

              <div className="vault-eq-col col-inc">
                <span className="vault-eq-label text-inc">TOTAL MASUK (+)</span>
                <span className="vault-eq-val text-inc">+{formatRupiah(vaultTotals.totalInc, false)}</span>
              </div>

              <span className="vault-eq-sign">-</span>

              <div className="vault-eq-col col-exp">
                <span className="vault-eq-label text-exp">TOTAL KELUAR (-)</span>
                <span className="vault-eq-val text-exp">-{formatRupiah(vaultTotals.totalExp, false)}</span>
              </div>

              <span className="vault-eq-sign sign-arrow">➔</span>

              <div className="vault-eq-col col-live">
                <span className="vault-eq-label text-highlight">SALDO TERKINI (LIVE)</span>
                <span className="vault-eq-val text-highlight">{formatRupiah(vaultTotals.totalLive)}</span>
              </div>
            </div>

            {/* 3. Game Accounts Grid */}
            <div className="game-accounts-grid">
              {accountBalances.map(acc => {
                const isNetPos = acc.netChange > 0;
                const isNetNeg = acc.netChange < 0;

                return (
                  <div 
                    key={acc.id} 
                    className={`game-account-card ${acc.isPrimary ? 'is-primary-slot' : ''}`}
                    style={{ '--slot-accent': acc.color || '#0060AF' }}
                  >
                    {/* Card Header */}
                    <div className="game-card-header">
                      <div className="game-card-identity">
                        <div 
                          className="game-card-icon-frame" 
                          style={{ 
                            color: acc.color || '#0060AF', 
                            borderColor: `${acc.color || '#0060AF'}40`, 
                            background: `${acc.color || '#0060AF'}12` 
                          }}
                        >
                          {acc.isCash ? <Banknote size={15} /> : acc.isEwallet ? <Smartphone size={15} /> : <CreditCard size={15} />}
                        </div>
                        <div className="game-card-titles">
                          <div className="game-card-name-row">
                            <span className="game-card-name">{acc.name}</span>
                            {acc.isPrimary && (
                              <span className="game-card-rank-tag" title="Rekening Utama Sistem FinFlow">
                                <Star size={9} fill="currentColor" /> UTAMA
                              </span>
                            )}
                          </div>
                          {acc.number && <span className="game-card-account-num">{acc.number}</span>}
                        </div>
                      </div>

                      <div className="game-card-status-badge">
                        {isNetPos ? (
                          <span className="net-flow-badge badge-inc" title="Arus kas surplus bulan ini">
                            <ArrowUpRight size={11} /> +{formatRupiah(acc.netChange, false)}
                          </span>
                        ) : isNetNeg ? (
                          <span className="net-flow-badge badge-exp" title="Arus kas defisit bulan ini">
                            <ArrowDownRight size={11} /> -{formatRupiah(Math.abs(acc.netChange), false)}
                          </span>
                        ) : (
                          <span className="net-flow-badge badge-neutral" title="Tidak ada mutasi kas bulan ini">
                            ▬ Tetap
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Core Live Balance Section */}
                    <div className="game-card-live-section">
                      <div className="game-card-live-label">
                        <span className="game-card-live-dot"></span>
                        SALDO REALTIME (TERKINI)
                      </div>
                      <div className={`game-card-live-balance ${acc.balance >= 0 ? 'text-inc' : 'text-exp'}`}>
                        {acc.balance >= 0 ? '+' : ''}{formatRupiah(acc.balance)}
                      </div>
                    </div>

                    {/* Audit Flow Equation Track */}
                    <div className="game-card-equation-track">
                      {/* Saldo Sebelumnya */}
                      <div className="eq-cell cell-prior" title="Saldo awal sebelum mutasi bulan ini">
                        <span className="eq-cell-sub">Saldo Awal</span>
                        <span className="eq-cell-val">{formatRupiah(acc.priorBalance, false)}</span>
                      </div>

                      <span className="eq-track-math">+</span>

                      {/* Masuk (+) */}
                      <div className="eq-cell cell-inc" title="Total pemasukan & transfer masuk">
                        <span className="eq-cell-sub text-inc">Masuk (+)</span>
                        <span className="eq-cell-val text-inc">+{formatRupiah(acc.income, false)}</span>
                      </div>

                      <span className="eq-track-math">-</span>

                      {/* Keluar (-) */}
                      <div className="eq-cell cell-exp" title="Total pengeluaran & transfer keluar">
                        <span className="eq-cell-sub text-exp">Keluar (-)</span>
                        <span className="eq-cell-val text-exp">-{formatRupiah(acc.expense, false)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
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

      {/* 4. Zen Daily Stream */}
      <div className="zen-groups-container">
        {groupedTransactions.length === 0 ? (
          <div className="zen-empty">
            <div className="zen-empty-icon">🍃</div>
            <p className="zen-empty-title">Belum ada catatan transaksi</p>
            <p className="zen-empty-subtitle">Kirim pesan di WhatsApp atau klik tombol + untuk mencatat</p>
          </div>
        ) : (
          groupedTransactions.map(group => (
            <div key={group.date} className="zen-date-group">
              {/* Day Header */}
              <div className="zen-group-header">
                <span className="zen-group-day">{getRelativeDayLabel(group.date)}</span>

                <div className="zen-group-total">
                  {group.totalIncome > 0 && (
                    <span className="text-inc font-mono">+{formatRupiah(group.totalIncome, false)}</span>
                  )}
                  {group.totalIncome > 0 && group.totalExpense > 0 && (
                    <span className="zen-sub-dot">•</span>
                  )}
                  {group.totalExpense > 0 && (
                    <span className="text-exp font-mono">-{formatRupiah(group.totalExpense, false)}</span>
                  )}
                </div>
              </div>

              {/* Transactions List */}
              <div className="zen-items-list">
                {group.items.map(item => {
                  const visual = getItemVisual(item);
                  const destAccount = item.targetPaymentMethod || 
                    (item.notes?.match(/\[to:([^\]]+)\]/i)?.[1]) ||
                    (item.title?.toLowerCase().includes('tabungan lily') ? 'BCA' : null);
                  const isTransfer = Boolean(destAccount && destAccount.toLowerCase() !== (item.paymentMethod || '').toLowerCase());

                  return (
                    <div 
                      key={item.id} 
                      className="zen-tx-row"
                      onClick={() => onEditTransaction(item)}
                    >
                      <div className="zen-tx-left">
                        <div 
                          className="zen-tx-icon"
                          style={visual.color ? {
                            background: `${visual.color}15`,
                            color: visual.color,
                            borderColor: `${visual.color}35`
                          } : undefined}
                        >
                          {getCategoryIcon(visual.icon, 16)}
                        </div>

                      <div className="zen-tx-details">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="zen-tx-title">{item.title}</span>
                          {isTransfer && (
                            <span className="badge badge-success text-2xs py-0 px-1 font-medium">
                              Tabungan {destAccount}
                            </span>
                          )}
                        </div>
                        <div className="zen-tx-meta">
                          <span className="zen-meta-cat">{item.category}</span>
                          {item.paymentMethod && (
                            <>
                              <span className="zen-meta-dot">•</span>
                              <span className="zen-meta-payment">
                                {isTransfer ? (
                                  <strong className="text-inc font-medium">{item.paymentMethod} ➔ {destAccount}</strong>
                                ) : (
                                  item.paymentMethod
                                )}
                              </span>
                            </>
                          )}
                          {item.notes && (
                            <>
                              <span className="zen-meta-dot">•</span>
                              <span className="zen-meta-notes">{item.notes}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="zen-tx-right">
                      <span className={`zen-tx-amount font-mono ${item.type === 'income' ? 'text-inc' : (isTransfer ? 'text-inc font-medium' : 'text-exp')}`}>
                        {item.type === 'income' ? '+' : (isTransfer ? '➔ ' : '-')}{formatRupiah(item.amount)}
                      </span>

                      <div className="zen-tx-actions" onClick={(e) => e.stopPropagation()}>
                        <button 
                          type="button" 
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
          ))
        )}
      </div>

      {/* Edit Account Balances Modal */}
      <EditAccountBalancesModal 
        isOpen={isEditBalancesOpen}
        onClose={() => setIsEditBalancesOpen(false)}
        paymentMethods={paymentMethodsList}
        accountBalances={accountBalances}
        onSaveBalances={handleSaveAccountBalances}
        showToast={showToast}
      />
    </div>
  );
}
