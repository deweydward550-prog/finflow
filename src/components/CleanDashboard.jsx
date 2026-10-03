import React from 'react';
import { 
  Wallet, ArrowUpRight, ArrowDownRight, RefreshCw, 
  ChevronRight, Plus, Sparkles, Check, Clock, CalendarClock,
  ArrowRight, ShieldCheck, Tag
} from 'lucide-react';
import { 
  formatRupiah, formatRupiahCompact, formatDateID, 
  getCategoryIcon, getRecurringDueInfo 
} from '../utils/formatters';

export default function CleanDashboard({
  totalIncome,
  totalExpense,
  netBalance,
  allTimeBalance,
  recurringList,
  recurringPaymentsMap,
  recurringSummary,
  budget,
  recentTransactions,
  selectedMonthYear,
  onOpenNewTransaction,
  onOpenNewRecurring,
  onOpenBudgetModal,
  onNavigateTab,
  onMarkRecurringPaid
}) {
  const isOverBudget = budget?.totalBudget && totalExpense > budget.totalBudget;
  const budgetPercentage = budget?.totalBudget 
    ? Math.min(Math.round((totalExpense / budget.totalBudget) * 100), 100) 
    : null;

  // Find next upcoming unpaid recurring bill
  const upcomingUnpaidBills = recurringList
    .filter(item => !recurringPaymentsMap[item.id])
    .sort((a, b) => a.dueDay - b.dueDay);
  
  const nextDueBill = upcomingUnpaidBills[0] || null;

  return (
    <div className="clean-dashboard-wrapper">
      {/* 1. Hero Balance & Cashflow Card */}
      <div className="hero-balance-card">
        <div className="hero-balance-top">
          <div className="hero-label-wrap">
            <span className="hero-eyebrow">Arus Kas Bersih Bulan Ini</span>
            <h2 className="hero-balance-amount">
              {netBalance >= 0 ? '+' : ''}{formatRupiah(netBalance)}
            </h2>
          </div>
          <button 
            className="btn-hero-action" 
            onClick={onOpenNewTransaction}
            title="Catat transaksi baru"
          >
            <Plus size={18} />
            <span>Catat Transaksi</span>
          </button>
        </div>

        {/* Income & Expense Pill Row */}
        <div className="hero-pills-row">
          <div className="hero-stat-pill pill-income">
            <div className="pill-icon-wrap">
              <ArrowDownRight size={14} />
            </div>
            <div className="pill-text-wrap">
              <span className="pill-label">Pemasukan</span>
              <span className="pill-val">+{formatRupiah(totalIncome)}</span>
            </div>
          </div>

          <div className="hero-stat-pill pill-expense">
            <div className="pill-icon-wrap">
              <ArrowUpRight size={14} />
            </div>
            <div className="pill-text-wrap">
              <span className="pill-label">Pengeluaran</span>
              <span className="pill-val">-{formatRupiah(totalExpense)}</span>
            </div>
          </div>
        </div>

        {/* Minimal Budget Bar */}
        {budget?.totalBudget ? (
          <div className="hero-budget-strip" onClick={onOpenBudgetModal}>
            <div className="budget-strip-info">
              <span>Batas Budget: <strong>{formatRupiahCompact(budget.totalBudget)}</strong></span>
              <span className={isOverBudget ? 'text-danger font-bold' : ''}>
                {budgetPercentage}% terpakai {isOverBudget && '(Over!)'}
              </span>
            </div>
            <div className="progress-track">
              <div 
                className={`progress-fill ${isOverBudget ? 'progress-danger' : 'progress-primary'}`}
                style={{ width: `${budgetPercentage}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="hero-budget-cta" onClick={onOpenBudgetModal}>
            <span>💡 Pasang batas anggaran bulanan agar keuangan lebih terkendali</span>
            <span className="cta-link">Atur Budget →</span>
          </div>
        )}
      </div>

      {/* 2. Compact Two-Column Widgets */}
      <div className="clean-widgets-grid">
        {/* Widget 1: Status Pengeluaran Rutin */}
        <div className="card clean-widget-card">
          <div className="widget-header">
            <div className="widget-title-wrap">
              <div className="widget-icon-box box-purple">
                <CalendarClock size={16} />
              </div>
              <div>
                <h3 className="widget-title">Tagihan Rutin Bulanan</h3>
                <span className="widget-subtitle">
                  {recurringSummary.paidCount} dari {recurringSummary.totalCount} lunas ({recurringSummary.paidPercentage}%)
                </span>
              </div>
            </div>
            <button 
              className="btn-widget-link"
              onClick={() => onNavigateTab('recurring')}
            >
              Kelola →
            </button>
          </div>

          {/* Mini Progress */}
          <div className="progress-track mt-2">
            <div 
              className="progress-fill progress-success"
              style={{ width: `${recurringSummary.paidPercentage}%` }}
            />
          </div>

          {/* Next upcoming bill highlight or all paid */}
          {nextDueBill ? (
            <div className="next-bill-box">
              <div className="next-bill-left">
                <span className="text-muted text-2xs font-semibold">JATUH TEMPO BERIKUTNYA</span>
                <div className="next-bill-name-row">
                  <span className="next-bill-title">{nextDueBill.title}</span>
                  <span className="badge badge-warning text-2xs">Tgl {nextDueBill.dueDay}</span>
                </div>
                <span className="next-bill-amount">{formatRupiah(nextDueBill.amount)}</span>
              </div>
              <button 
                className="btn btn-sm btn-primary btn-quick-pay"
                onClick={() => onMarkRecurringPaid(nextDueBill)}
              >
                <Check size={13} />
                <span>Bayar</span>
              </button>
            </div>
          ) : (
            <div className="all-paid-box">
              <ShieldCheck size={18} className="text-income" />
              <span>Semua tagihan rutin bulan ini sudah lunas!</span>
            </div>
          )}
        </div>

        {/* Widget 2: Saldo & Info Ringkas */}
        <div className="card clean-widget-card">
          <div className="widget-header">
            <div className="widget-title-wrap">
              <div className="widget-icon-box box-emerald">
                <Wallet size={16} />
              </div>
              <div>
                <h3 className="widget-title">Akumulasi Saldo Total</h3>
                <span className="widget-subtitle">Saldo seluruh transaksi tersimpan</span>
              </div>
            </div>
          </div>

          <div className="all-time-balance-display">
            <span className="all-time-val">{formatRupiah(allTimeBalance)}</span>
            <span className="badge badge-success">
              <Sparkles size={11} /> Database Lokal Aktif
            </span>
          </div>

          <div className="quick-stats-summary-row">
            <div className="stat-col">
              <span className="text-muted text-xs">Sisa Tagihan Rutin:</span>
              <strong className="text-warning text-sm">{formatRupiah(recurringSummary.unpaidAmount)}</strong>
            </div>
            <div className="stat-col text-right">
              <span className="text-muted text-xs">Estimasi Sisa Kas:</span>
              <strong className="text-primary text-sm">
                {formatRupiah(Math.max(0, netBalance - recurringSummary.unpaidAmount))}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Recent Transactions (Only 4 Items, Minimalist & Focused) */}
      <div className="card clean-recent-card">
        <div className="recent-header">
          <div className="recent-title-wrap">
            <h3 className="widget-title">Transaksi Terkini</h3>
            <span className="text-muted text-xs">Aktivitas keuangan terbaru</span>
          </div>
          <button 
            className="btn-widget-link"
            onClick={() => onNavigateTab('daily')}
          >
            Lihat Semua Transaksi ({recentTransactions.length}) →
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="clean-empty-box">
            <p className="text-muted text-sm">Belum ada catatan transaksi pada bulan ini.</p>
            <button className="btn btn-sm btn-secondary mt-2" onClick={onOpenNewTransaction}>
              <Plus size={14} />
              <span>Catat Transaksi Pertama</span>
            </button>
          </div>
        ) : (
          <div className="clean-tx-list">
            {recentTransactions.slice(0, 4).map(item => {
              const isExpense = item.type === 'expense';
              return (
                <div key={item.id} className="clean-tx-row">
                  <div className="clean-tx-left">
                    <div className={`clean-tx-icon ${isExpense ? 'icon-expense' : 'icon-income'}`}>
                      {getCategoryIcon(item.category, 16)}
                    </div>
                    <div className="clean-tx-info">
                      <span className="clean-tx-title">{item.title}</span>
                      <div className="clean-tx-meta">
                        <span>{item.category}</span>
                        <span>•</span>
                        <span>{formatDateID(item.date, { day: 'numeric', month: 'short' })}</span>
                      </div>
                    </div>
                  </div>

                  <div className={`clean-tx-amount ${isExpense ? 'text-expense' : 'text-income'}`}>
                    {isExpense ? '-' : '+'}{formatRupiah(item.amount)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
