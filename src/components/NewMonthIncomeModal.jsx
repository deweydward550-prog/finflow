import React, { useState } from 'react';
import { 
  X, Check, Wallet, ArrowRight, Swords, Sparkles, 
  CreditCard, Banknote, ShieldCheck, ChevronRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PAYMENT_METHODS } from '../db/db';
import { formatRupiah, formatMonthYear, getCategoryIcon } from '../utils/formatters';

export default function NewMonthIncomeModal({
  isOpen,
  onClose,
  selectedMonthYear,
  onSaveIncome,
  recurringList,
  recurringPaymentsMap,
  onMarkRecurringPaid
}) {
  if (!isOpen) return null;

  // Step 1 = Input Income, Step 2 = Review Monthly Bills
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState('8500000');
  const [title, setTitle] = useState('Gaji Pokok Bulanan');
  const [paymentMethod, setPaymentMethod] = useState('BCA');
  const [error, setError] = useState('');
  const [recordedIncomeAmount, setRecordedIncomeAmount] = useState(0);

  // Quick Amount additions
  const addQuickAmount = (val) => {
    const current = parseInt(amount, 10) || 0;
    setAmount(String(current + val));
  };

  const triggerConfetti = (event) => {
    const rect = event?.currentTarget?.getBoundingClientRect();
    const x = rect ? (rect.left + rect.width / 2) / window.innerWidth : 0.5;
    const y = rect ? (rect.top + rect.height / 2) / window.innerHeight : 0.5;

    confetti({
      particleCount: 40,
      spread: 55,
      origin: { x, y },
      colors: ['#10B981', '#34D399', '#F59E0B', '#3B82F6']
    });
  };

  // Handle Step 1 Submit (Save income & proceed to Step 2)
  const handleSubmitIncome = async (e) => {
    e.preventDefault();
    const num = parseInt(amount, 10);
    if (!num || num <= 0) {
      setError('Masukkan nominal penghasilan yang valid');
      return;
    }

    const todayDate = new Date().toISOString().split('T')[0];
    const defaultDate = todayDate.startsWith(selectedMonthYear) 
      ? todayDate 
      : `${selectedMonthYear}-01`;

    await onSaveIncome({
      title: title.trim() || 'Gaji Pokok Bulanan',
      amount: num,
      type: 'income',
      category: 'Gaji Utama',
      paymentMethod,
      date: defaultDate,
      time: '08:00',
      notes: `Pemasukan awal bulan ${formatMonthYear(selectedMonthYear)}`
    });

    setRecordedIncomeAmount(num);
    setStep(2);
  };

  // Process recurring bills
  const totalRecurringAmount = recurringList.reduce((sum, item) => sum + item.amount, 0);
  const unpaidQuests = recurringList.filter(item => !recurringPaymentsMap[item.id]);

  const handlePayBillInModal = (e, item) => {
    triggerConfetti(e);
    onMarkRecurringPaid(item);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content new-month-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="step-indicator">
              Langkah {step} dari 2
            </span>
            <h3 className="modal-title">
              {step === 1 ? 'Mulai Arus Kas Baru' : 'Alokasi Tagihan Rutin'}
            </h3>
            <span className="text-muted text-xs">Periode: {formatMonthYear(selectedMonthYear)}</span>
          </div>
          <button className="btn-icon-subtle" onClick={onClose} title="Tutup">
            <X size={18} />
          </button>
        </div>

        {/* Body Step 1: Input Income */}
        {step === 1 && (
          <form onSubmit={handleSubmitIncome} className="modal-body">
            <p className="text-muted text-xs">
              Bulan ini belum memiliki catatan pemasukan sama sekali. Masukkan penghasilan atau gaji utamamu untuk memulai pencatatan.
            </p>

            {/* Amount Input */}
            <div className="amount-input-card">
              <label className="amount-label">Nominal Pemasukan / Gaji (Rp)</label>
              <div className="amount-input-wrapper">
                <span className="currency-prefix text-inc">+Rp</span>
                <input 
                  type="number"
                  placeholder="0"
                  className="amount-input text-inc"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="quick-amount-chips">
                <button type="button" className="chip-btn" onClick={() => addQuickAmount(1000000)}>+1 Juta</button>
                <button type="button" className="chip-btn" onClick={() => addQuickAmount(3000000)}>+3 Juta</button>
                <button type="button" className="chip-btn" onClick={() => addQuickAmount(5000000)}>+5 Juta</button>
                <button type="button" className="chip-btn chip-clear" onClick={() => setAmount('')}>Reset</button>
              </div>
            </div>

            {/* Title / Description */}
            <div className="input-group">
              <label className="input-label">Keterangan Pemasukan</label>
              <input 
                type="text"
                className="input-control"
                placeholder="Contoh: Gaji Pokok Bulanan, Freelance..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Payment Method */}
            <div className="input-group">
              <label className="input-label">Diterima di Rekening / Dompet</label>
              <div className="method-chips-scroll">
                {PAYMENT_METHODS.map(m => (
                  <button 
                    key={m.id}
                    type="button"
                    className={`method-chip-btn ${paymentMethod === m.name ? 'selected' : ''}`}
                    onClick={() => setPaymentMethod(m.name)}
                  >
                    <CreditCard size={13} />
                    <span>{m.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="form-error-alert">{error}</div>}

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Lewati (Nanti Saja)
              </button>
              <button type="submit" className="btn btn-primary">
                <span>Simpan & Cek Tagihan</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </form>
        )}

        {/* Body Step 2: Transition to Monthly Bills Quests */}
        {step === 2 && (
          <div className="modal-body">
            {/* Income & Recurring Summary Strip */}
            <div className="step2-summary-box">
              <div className="step2-row">
                <span className="text-muted text-xs">Pemasukan Awal Terinput:</span>
                <strong className="text-inc">+{formatRupiah(recordedIncomeAmount)}</strong>
              </div>
              <div className="step2-row">
                <span className="text-muted text-xs">Total Tagihan Rutin Bulan Ini:</span>
                <strong className="text-warn">-{formatRupiah(totalRecurringAmount)}</strong>
              </div>
              <div className="step2-row-highlight">
                <span className="text-xs font-semibold">Estimasi Sisa Kas Bersih:</span>
                <span className="text-sm font-bold text-main">
                  {formatRupiah(Math.max(0, recordedIncomeAmount - totalRecurringAmount))}
                </span>
              </div>
            </div>

            {/* List of active unpaid quests */}
            <div className="step2-quests-section">
              <div className="step2-quests-header">
                <span className="text-xs font-bold text-muted uppercase">
                  Misi Tagihan ({unpaidQuests.length} Belum Dibayar)
                </span>
                <span className="text-2xs text-muted">Tekan 'Bayar' untuk menyelesaikan</span>
              </div>

              {unpaidQuests.length === 0 ? (
                <div className="step2-all-done">
                  <ShieldCheck size={24} className="text-inc" />
                  <span className="text-xs font-semibold text-inc">Semua tagihan rutin sudah lunas!</span>
                </div>
              ) : (
                <div className="step2-quests-list">
                  {unpaidQuests.map(item => (
                    <div key={item.id} className="step2-quest-card">
                      <div className="step2-quest-left">
                        <span className="step2-due-pill">Tgl {item.dueDay}</span>
                        <div className="step2-quest-info">
                          <span className="step2-quest-title">{item.title}</span>
                          <span className="step2-quest-amount">{formatRupiah(item.amount)}</span>
                        </div>
                      </div>

                      <button 
                        className="quest-complete-btn"
                        onClick={(e) => handlePayBillInModal(e, item)}
                        title="Bayar tagihan ini sekarang"
                      >
                        <Check size={12} strokeWidth={3} />
                        <span>Bayar</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-primary full-width-btn" 
                onClick={onClose}
              >
                <span>Selesai & Mulai Catat Keuangan</span>
                <Check size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
