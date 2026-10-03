import React, { useState } from 'react';
import { 
  Plus, Check, Circle, Edit2, Trash2, ShieldCheck, Sparkles 
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  formatRupiah, getCategoryIcon, getRecurringDueInfo 
} from '../utils/formatters';

export default function RecurringExpenses({
  recurringList,
  recurringPaymentsMap,
  selectedMonthYear,
  onOpenNewRecurring,
  onEditRecurring,
  onDeleteRecurring,
  onMarkPaid,
  onUnmarkPaid
}) {
  const [filterState, setFilterState] = useState('all'); // 'all', 'unpaid', 'paid'

  const triggerConfetti = (event) => {
    const rect = event?.currentTarget?.getBoundingClientRect();
    const x = rect ? (rect.left + rect.width / 2) / window.innerWidth : 0.5;
    const y = rect ? (rect.top + rect.height / 2) / window.innerHeight : 0.5;

    confetti({
      particleCount: 30,
      spread: 40,
      origin: { x, y },
      colors: ['#10B981', '#34D399', '#3B82F6', '#F59E0B']
    });
  };

  const itemsWithStatus = recurringList.map(item => {
    const payment = recurringPaymentsMap[item.id];
    const isPaid = !payment;
    const dueInfo = getRecurringDueInfo(item.dueDay, isPaid, selectedMonthYear);
    return {
      ...item,
      isPaid,
      payment,
      dueInfo
    };
  });

  const totalAmount = itemsWithStatus.reduce((sum, item) => sum + item.amount, 0);
  const paidAmount = itemsWithStatus.filter(i => i.isPaid).reduce((sum, item) => sum + item.amount, 0);
  const unpaidAmount = totalAmount - paidAmount;
  const paidCount = itemsWithStatus.filter(i => i.isPaid).length;
  const totalCount = itemsWithStatus.length;

  const filteredItems = itemsWithStatus.filter(item => {
    if (filterState === 'unpaid') return !item.isPaid;
    if (filterState === 'paid') return item.isPaid;
    return true;
  }).sort((a, b) => {
    if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
    return a.dueDay - b.dueDay;
  });

  const handlePayClick = (e, item) => {
    triggerConfetti(e);
    onMarkPaid(item);
  };

  return (
    <div className="zen-content-flow">
      {/* 1. Calm Recurring Summary Strip */}
      <div className="zen-hero-balance">
        <span className="zen-hero-label">Sisa Tagihan Rutin</span>
        <h2 className="zen-hero-number text-warn">
          {formatRupiah(unpaidAmount)}
        </h2>

        <div className="zen-hero-subline">
          <span className="text-inc">{paidCount} dari {totalCount} lunas ({formatRupiah(paidAmount)})</span>
          <span className="zen-sub-dot">•</span>
          <span className="text-muted">Total {formatRupiah(totalAmount)}</span>
        </div>
      </div>

      {/* 2. Filter & Add Row */}
      <div className="zen-search-row">
        <div className="zen-type-filter">
          <button 
            className={`zen-filter-btn ${filterState === 'all' ? 'active' : ''}`}
            onClick={() => setFilterState('all')}
          >
            Semua ({totalCount})
          </button>
          <button 
            className={`zen-filter-btn ${filterState === 'unpaid' ? 'active' : ''}`}
            onClick={() => setFilterState('unpaid')}
          >
            Belum Lunas ({totalCount - paidCount})
          </button>
          <button 
            className={`zen-filter-btn ${filterState === 'paid' ? 'active' : ''}`}
            onClick={() => setFilterState('paid')}
          >
            Lunas ({paidCount})
          </button>
        </div>

        {totalCount > 0 && (
          <button className="zen-link-btn" onClick={onOpenNewRecurring}>
            + Tambah Tagihan
          </button>
        )}
      </div>

      {/* 3. Ultra-Clean Single-Line Bill Rows */}
      {filteredItems.length === 0 ? (
        <div className="zen-empty">
          <ShieldCheck size={26} className="text-inc" />
          <p className="text-muted text-xs">
            {filterState === 'unpaid' 
              ? 'Semua tagihan rutin bulan ini sudah lunas.' 
              : 'Belum ada tagihan rutin yang terdaftar.'}
          </p>
          {filterState !== 'unpaid' && (
            <button className="zen-link-btn" onClick={onOpenNewRecurring}>
              + Tambah Tagihan
            </button>
          )}
        </div>
      ) : (
        <div className="zen-recurring-flow">
          {filteredItems.map(item => {
            const { isPaid, dueInfo } = item;

            return (
              <div key={item.id} className={`zen-rec-item ${isPaid ? 'is-paid' : ''}`}>
                <div className="zen-rec-left">
                  {/* Circular Checkbox */}
                  <button 
                    className={`zen-circle-check ${isPaid ? 'checked' : ''}`}
                    onClick={(e) => isPaid ? onUnmarkPaid(item.id) : handlePayClick(e, item)}
                    title={isPaid ? 'Batalkan status lunas' : 'Tandai lunas'}
                  >
                    {isPaid && <Check size={12} strokeWidth={3} />}
                  </button>

                  <div className="zen-rec-title-wrap">
                    <span className="zen-rec-name">{item.title}</span>
                    <span className={`zen-due-pill ${dueInfo.status === 'overdue' && !isPaid ? 'due-overdue' : ''}`}>
                      Tgl {item.dueDay}
                    </span>
                  </div>
                </div>

                <div className="zen-rec-right">
                  <span className="zen-rec-val">{formatRupiah(item.amount)}</span>

                  <div className="zen-row-actions">
                    <button 
                      className="zen-action-btn" 
                      onClick={() => onEditRecurring(item)}
                      title="Edit Tagihan"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button 
                      className="zen-action-btn btn-del" 
                      onClick={() => onDeleteRecurring(item.id)}
                      title="Hapus Tagihan"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
