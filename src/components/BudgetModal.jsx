import React, { useState, useEffect } from 'react';
import { X, Check, PiggyBank, Sparkles } from 'lucide-react';
import { formatRupiah, formatMonthYear } from '../utils/formatters';

export default function BudgetModal({
  isOpen,
  onClose,
  onSave,
  currentBudget,
  selectedMonthYear
}) {
  if (!isOpen) return null;

  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentBudget?.totalBudget) {
      setAmount(String(currentBudget.totalBudget));
    } else {
      setAmount('4500000');
    }
    setError('');
  }, [currentBudget, isOpen]);

  const addQuickAmount = (val) => {
    const current = parseInt(amount, 10) || 0;
    setAmount(String(current + val));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const num = parseInt(amount, 10);
    if (!num || num <= 0) {
      setError('Masukkan jumlah anggaran yang valid');
      return;
    }

    onSave({
      monthYear: selectedMonthYear,
      totalBudget: num
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <h3 className="modal-title">Batas Anggaran (Budget) Bulanan</h3>
            <span className="text-muted text-xs">Periode: {formatMonthYear(selectedMonthYear)}</span>
          </div>
          <button className="btn-icon-subtle" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="amount-input-card">
            <label className="amount-label">Target Batas Pengeluaran (Rp)</label>
            <div className="amount-input-wrapper">
              <span className="currency-prefix">Rp</span>
              <input 
                type="number"
                placeholder="0"
                className="amount-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>

            <div className="quick-amount-chips">
              <button type="button" className="chip-btn" onClick={() => addQuickAmount(500000)}>+500rb</button>
              <button type="button" className="chip-btn" onClick={() => addQuickAmount(1000000)}>+1 Juta</button>
              <button type="button" className="chip-btn" onClick={() => addQuickAmount(2000000)}>+2 Juta</button>
              <button type="button" className="chip-btn chip-clear" onClick={() => setAmount('')}>Reset</button>
            </div>
          </div>

          <p className="text-muted text-xs">
            Menentukan budget bulanan membantumu memantau persentase pengeluaran harian dan tagihan rutin agar tidak melebihi kapasitas dompet.
          </p>

          {error && <div className="form-error-alert">{error}</div>}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary btn-submit">
              <Check size={16} />
              <span>Simpan Anggaran</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
