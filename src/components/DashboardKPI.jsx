import React from 'react';
import { 
  TrendingUp, TrendingDown, Wallet, CalendarClock, 
  AlertCircle, CheckCircle2, ArrowUpRight, ArrowDownRight,
  ShieldCheck, PiggyBank
} from 'lucide-react';
import { formatRupiah, formatRupiahCompact } from '../utils/formatters';

export default function DashboardKPI({
  totalIncome,
  totalExpense,
  netBalance,
  allTimeBalance,
  recurringSummary,
  budget,
  onOpenBudgetModal,
  onOpenNewRecurring,
  onOpenNewTransaction
}) {
  const expensePercentageOfBudget = budget?.totalBudget 
    ? Math.min(Math.round((totalExpense / budget.totalBudget) * 100), 100) 
    : null;

  const isOverBudget = budget?.totalBudget && totalExpense > budget.totalBudget;

  return (
    <div className="kpi-grid">
      {/* 1. Saldo / Cashflow Card */}
      <div className="card kpi-card kpi-card-main">
        <div className="kpi-header">
          <div className="kpi-label-wrap">
            <span className="kpi-subtitle">Cashflow Bulan Ini</span>
            <h3 className="kpi-title">Net Kas Bersih</h3>
          </div>
          <div className={`kpi-icon-badge ${netBalance >= 0 ? 'badge-income' : 'badge-expense'}`}>
            <Wallet size={20} />
          </div>
        </div>

        <div className="kpi-body">
          <div className={`kpi-amount ${netBalance >= 0 ? 'text-income' : 'text-expense'}`}>
            {netBalance >= 0 ? '+' : ''}{formatRupiah(netBalance)}
          </div>
          
          <div className="kpi-footer-detail">
            <span className="text-muted">Total Saldo Kumulatif:</span>
            <strong className="balance-highlight">{formatRupiah(allTimeBalance)}</strong>
          </div>
        </div>
      </div>

      {/* 2. Total Pengeluaran Card */}
      <div className="card kpi-card">
        <div className="kpi-header">
          <div className="kpi-label-wrap">
            <span className="kpi-subtitle">Total Pengeluaran</span>
            <h3 className="kpi-title">Keluar Bulan Ini</h3>
          </div>
          <div className="kpi-icon-badge badge-expense">
            <TrendingDown size={20} />
          </div>
        </div>

        <div className="kpi-body">
          <div className="kpi-amount text-expense">
            {formatRupiah(totalExpense)}
          </div>

          {budget?.totalBudget ? (
            <div className="budget-bar-container">
              <div className="budget-bar-labels">
                <span className="text-muted">
                  Budget: {formatRupiahCompact(budget.totalBudget)}
                </span>
                <span className={`budget-percent ${isOverBudget ? 'text-danger' : ''}`}>
                  {expensePercentageOfBudget}%
                </span>
              </div>
              <div className="progress-track">
                <div 
                  className={`progress-fill ${isOverBudget ? 'progress-danger' : 'progress-primary'}`}
                  style={{ width: `${expensePercentageOfBudget}%` }}
                />
              </div>
            </div>
          ) : (
            <button className="btn-link-budget" onClick={onOpenBudgetModal}>
              + Pasang Batas Anggaran (Budget)
            </button>
          )}
        </div>
      </div>

      {/* 3. Total Pemasukan Card */}
      <div className="card kpi-card">
        <div className="kpi-header">
          <div className="kpi-label-wrap">
            <span className="kpi-subtitle">Total Pemasukan</span>
            <h3 className="kpi-title">Masuk Bulan Ini</h3>
          </div>
          <div className="kpi-icon-badge badge-income">
            <TrendingUp size={20} />
          </div>
        </div>

        <div className="kpi-body">
          <div className="kpi-amount text-income">
            {formatRupiah(totalIncome)}
          </div>
          
          <div className="kpi-footer-detail">
            <span className="badge badge-success">
              <ArrowUpRight size={12} />
              Pemasukan aktif
            </span>
          </div>
        </div>
      </div>

      {/* 4. Tagihan Rutin Bulanan Card */}
      <div className="card kpi-card">
        <div className="kpi-header">
          <div className="kpi-label-wrap">
            <span className="kpi-subtitle">Tagihan Rutin</span>
            <h3 className="kpi-title">Pengeluaran Rutin</h3>
          </div>
          <div className="kpi-icon-badge badge-purple">
            <CalendarClock size={20} />
          </div>
        </div>

        <div className="kpi-body">
          <div className="recurring-kpi-row">
            <div>
              <span className="text-muted text-xs">Sisa Belum Bayar:</span>
              <div className="kpi-amount-sm text-warning">
                {formatRupiah(recurringSummary.unpaidAmount)}
              </div>
            </div>
            <div className="text-right">
              <span className="text-muted text-xs">Total Rutin:</span>
              <div className="kpi-amount-muted">
                {formatRupiah(recurringSummary.totalAmount)}
              </div>
            </div>
          </div>

          <div className="recurring-progress-wrap">
            <div className="progress-track">
              <div 
                className="progress-fill progress-success"
                style={{ width: `${recurringSummary.paidPercentage}%` }}
              />
            </div>
            <div className="recurring-status-text">
              <span>{recurringSummary.paidCount} dari {recurringSummary.totalCount} terbayar ({recurringSummary.paidPercentage}%)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
