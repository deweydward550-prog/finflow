import React, { useMemo } from 'react';
import { 
  PieChart, BarChart3, TrendingDown, TrendingUp, 
  CreditCard, Sparkles, Layers, ArrowUpRight, ArrowDownRight 
} from 'lucide-react';
import { formatRupiah, formatRupiahCompact, getCategoryIcon } from '../utils/formatters';

export default function AnalyticsView({
  transactions,
  selectedMonthYear,
  budget
}) {
  // Category breakdown
  const { categoryStats, totalExpense, totalIncome, paymentMethodStats, dailySpending } = useMemo(() => {
    const catMap = {};
    const methodMap = {};
    const dayMap = {};
    let exp = 0;
    let inc = 0;

    // Get number of days in selected month
    const [year, month] = selectedMonthYear.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      dayMap[dayStr] = 0;
    }

    transactions.forEach(t => {
      if (t.type === 'expense') {
        exp += t.amount;
        catMap[t.category] = (catMap[t.category] || 0) + t.amount;
        
        if (t.paymentMethod) {
          methodMap[t.paymentMethod] = (methodMap[t.paymentMethod] || 0) + t.amount;
        }

        if (dayMap[t.date] !== undefined) {
          dayMap[t.date] += t.amount;
        }
      } else {
        inc += t.amount;
      }
    });

    // Category sorted array
    const sortedCats = Object.entries(catMap)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: exp > 0 ? Math.round((amount / exp) * 100) : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    // Payment methods sorted
    const sortedMethods = Object.entries(methodMap)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: exp > 0 ? Math.round((amount / exp) * 100) : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    // Daily spending array
    const dailyArr = Object.entries(dayMap).map(([date, amount]) => ({
      date,
      day: parseInt(date.split('-')[2], 10),
      amount
    }));

    return {
      categoryStats: sortedCats,
      totalExpense: exp,
      totalIncome: inc,
      paymentMethodStats: sortedMethods,
      dailySpending: dailyArr
    };
  }, [transactions, selectedMonthYear]);

  const maxDailyAmount = useMemo(() => {
    return Math.max(...dailySpending.map(d => d.amount), 1);
  }, [dailySpending]);

  const CATEGORY_COLORS = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1', '#14B8A6', '#F97316'
  ];

  return (
    <div className="analytics-wrapper">
      {/* Overview Cards Row */}
      <div className="analytics-kpi-row">
        <div className="card analytics-kpi-card">
          <div className="kpi-mini-header">
            <span className="text-muted text-xs font-semibold">TOTAL PENGELUARAN</span>
            <TrendingDown size={16} className="text-expense" />
          </div>
          <div className="kpi-mini-amount text-expense">
            {formatRupiah(totalExpense)}
          </div>
          <span className="text-muted text-2xs">{categoryStats.length} kategori pengeluaran aktif</span>
        </div>

        <div className="card analytics-kpi-card">
          <div className="kpi-mini-header">
            <span className="text-muted text-xs font-semibold">TOTAL PEMASUKAN</span>
            <TrendingUp size={16} className="text-income" />
          </div>
          <div className="kpi-mini-amount text-income">
            {formatRupiah(totalIncome)}
          </div>
          <span className="text-muted text-2xs">Arus kas masuk bulan ini</span>
        </div>

        <div className="card analytics-kpi-card">
          <div className="kpi-mini-header">
            <span className="text-muted text-xs font-semibold">RASIO TABUNGAN</span>
            <Sparkles size={16} className="text-warning" />
          </div>
          <div className="kpi-mini-amount text-primary">
            {totalIncome > 0 
              ? `${Math.max(0, Math.round(((totalIncome - totalExpense) / totalIncome) * 100))}%`
              : '0%'}
          </div>
          <span className="text-muted text-2xs">
            {totalIncome > totalExpense ? 'Arus kas surplus' : 'Perhatikan pengeluaranmu'}
          </span>
        </div>
      </div>

      {/* Daily Spending Trend Bar Chart */}
      <div className="card chart-card">
        <div className="chart-header">
          <div className="chart-title-wrap">
            <BarChart3 size={18} className="text-primary" />
            <h3 className="chart-title">Grafik Pengeluaran Harian</h3>
          </div>
          <span className="text-muted text-xs">Aktivitas per tanggal bulan ini</span>
        </div>

        {totalExpense === 0 ? (
          <div className="chart-empty-state">
            <p className="text-muted text-sm">Belum ada data pengeluaran harian pada bulan ini.</p>
          </div>
        ) : (
          <div className="bar-chart-container">
            <div className="bar-chart-bars">
              {dailySpending.map(item => {
                const heightPercent = item.amount > 0 
                  ? Math.max(8, Math.round((item.amount / maxDailyAmount) * 100))
                  : 0;

                return (
                  <div key={item.date} className="bar-column">
                    <div className="bar-track">
                      {item.amount > 0 && (
                        <div 
                          className="bar-fill" 
                          style={{ height: `${heightPercent}%` }}
                          title={`Tgl ${item.day}: ${formatRupiah(item.amount)}`}
                        >
                          <div className="bar-tooltip">
                            <span>Tgl {item.day}</span>
                            <strong>{formatRupiah(item.amount)}</strong>
                          </div>
                        </div>
                      )}
                    </div>
                    <span className={`bar-day-label ${item.amount > 0 ? 'has-data' : ''}`}>
                      {item.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Two Column Grid: Category Breakdown & Payment Methods */}
      <div className="analytics-two-col">
        {/* Category Breakdown */}
        <div className="card breakdown-card">
          <div className="chart-header">
            <div className="chart-title-wrap">
              <PieChart size={18} className="text-purple" />
              <h3 className="chart-title">Alokasi per Kategori</h3>
            </div>
            <span className="badge badge-neutral">{categoryStats.length} Kategori</span>
          </div>

          {categoryStats.length === 0 ? (
            <div className="chart-empty-state">
              <p className="text-muted text-sm">Belum ada pengeluaran yang tercatat.</p>
            </div>
          ) : (
            <div className="category-breakdown-list">
              {categoryStats.map((cat, idx) => {
                const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                return (
                  <div key={cat.name} className="cat-breakdown-item">
                    <div className="cat-item-top">
                      <div className="cat-name-left">
                        <span className="cat-color-dot" style={{ backgroundColor: color }} />
                        <span className="cat-name-text">{cat.name}</span>
                      </div>
                      <div className="cat-amount-right">
                        <span className="cat-amount-text">{formatRupiah(cat.amount)}</span>
                        <span className="cat-percent-text">({cat.percentage}%)</span>
                      </div>
                    </div>
                    <div className="progress-track">
                      <div 
                        className="progress-fill"
                        style={{ width: `${cat.percentage}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment Methods Distribution */}
        <div className="card breakdown-card">
          <div className="chart-header">
            <div className="chart-title-wrap">
              <CreditCard size={18} className="text-info" />
              <h3 className="chart-title">Metode & Rekening</h3>
            </div>
            <span className="badge badge-neutral">{paymentMethodStats.length} Akun</span>
          </div>

          {paymentMethodStats.length === 0 ? (
            <div className="chart-empty-state">
              <p className="text-muted text-sm">Belum ada data metode pembayaran.</p>
            </div>
          ) : (
            <div className="payment-method-list">
              {paymentMethodStats.map((item, idx) => (
                <div key={item.name} className="method-stat-card">
                  <div className="method-stat-left">
                    <div className="method-icon-circle">
                      <CreditCard size={16} />
                    </div>
                    <div>
                      <h4 className="method-name">{item.name}</h4>
                      <span className="text-muted text-2xs">{item.percentage}% dari total pengeluaran</span>
                    </div>
                  </div>
                  <div className="method-stat-right">
                    <span className="method-amount">{formatRupiah(item.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
