import React, { useState, useEffect } from 'react';
import { 
  Trophy, CheckCircle2, Swords, Sparkles, Plus, 
  ChevronRight, ArrowRight, ShieldCheck, Check, Clock,
  Wallet, CreditCard, Banknote, Target, ChevronDown, Smartphone, Star
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { getCustomPaymentMethods, getPrimaryPaymentMethod } from '../db/db';
import { 
  formatRupiah, formatMonthYear, getRecurringDueInfo,
  formatAmountInput, parseAmountInput 
} from '../utils/formatters';

export default function MonthlyQuests({
  totalIncome = 0,
  onSaveIncome,
  recurringList = [],
  recurringPaymentsMap = {},
  selectedMonthYear,
  onMarkPaid,
  onOpenManageRecurring,
  onOpenNewRecurring
}) {
  const [animatingId, setAnimatingId] = useState(null);
  const [incomeAmount, setIncomeAmount] = useState('8.500.000');
  const [incomeTitle, setIncomeTitle] = useState('Gaji Pokok Bulanan');
  const [paymentMethodsList, setPaymentMethodsList] = useState(() => getCustomPaymentMethods());
  const [incomeMethod, setIncomeMethod] = useState(() => getPrimaryPaymentMethod()?.name || 'BCA');
  const [isSubmittingIncome, setIsSubmittingIncome] = useState(false);
  const [showIncomeDetails, setShowIncomeDetails] = useState(false);

  // Listen to payment methods updates
  useEffect(() => {
    const handleUpdate = () => {
      const methods = getCustomPaymentMethods();
      setPaymentMethodsList(methods);
      const primary = getPrimaryPaymentMethod();
      if (primary) {
        setIncomeMethod(primary.name);
      } else if (methods.length > 0 && !methods.some(m => m.name === incomeMethod)) {
        setIncomeMethod(methods[0].name);
      }
    };
    window.addEventListener('finflow_payment_methods_updated', handleUpdate);
    return () => window.removeEventListener('finflow_payment_methods_updated', handleUpdate);
  }, [incomeMethod]);

  // Trigger celebratory confetti on quest completion
  const triggerConfetti = (event) => {
    const rect = event?.currentTarget?.getBoundingClientRect();
    const x = rect ? (rect.left + rect.width / 2) / window.innerWidth : 0.5;
    const y = rect ? (rect.top + rect.height / 2) / window.innerHeight : 0.5;

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { x, y },
      colors: ['#10B981', '#34D399', '#F59E0B', '#3B82F6', '#8B5CF6']
    });
  };

  // Handle Income Quest Completion with automatic dot parsing
  const handleCompleteIncomeQuest = async (e) => {
    e.preventDefault();
    const num = parseAmountInput(incomeAmount);
    if (!num || num <= 0) return;

    triggerConfetti(e);
    setAnimatingId('income-quest');
    setIsSubmittingIncome(true);

    const todayDate = new Date().toISOString().split('T')[0];
    const defaultDate = todayDate.startsWith(selectedMonthYear) 
      ? todayDate 
      : `${selectedMonthYear}-01`;

    try {
      if (onSaveIncome) {
        await onSaveIncome({
          title: incomeTitle.trim() || 'Gaji Pokok Bulanan',
          amount: num,
          type: 'income',
          category: 'Gaji Utama',
          paymentMethod: incomeMethod,
          date: defaultDate,
          time: '08:00',
          notes: `Pemasukan awal bulan ${formatMonthYear(selectedMonthYear)}`
        });
      }
    } finally {
      setIsSubmittingIncome(false);
      setAnimatingId(null);
    }
  };

  // Process recurring items with payment status
  const itemsWithStatus = recurringList.map(item => {
    const payment = recurringPaymentsMap[item.id];
    const isPaid = !!payment;
    const dueInfo = getRecurringDueInfo(item.dueDay, isPaid, selectedMonthYear);
    return {
      ...item,
      isPaid,
      payment,
      dueInfo
    };
  });

  const hasIncomeQuest = totalIncome === 0;
  const totalRecurringCount = itemsWithStatus.length;
  const paidRecurringCount = itemsWithStatus.filter(i => i.isPaid).length;
  const unpaidItems = itemsWithStatus
    .filter(i => !i.isPaid)
    .sort((a, b) => a.dueDay - b.dueDay);
  
  const allRecurringPaid = totalRecurringCount > 0 && unpaidItems.length === 0;

  const handleCompleteRecurringQuest = (e, item) => {
    triggerConfetti(e);
    setAnimatingId(item.id);
    setTimeout(() => {
      onMarkPaid(item);
      setAnimatingId(null);
    }, 250);
  };

  // PHASE 2A: Income is recorded, but no recurring bills have been added yet
  if (!hasIncomeQuest && totalRecurringCount === 0) {
    return (
      <div className="quest-box-container">
        <div className="quest-box-header">
          <div className="quest-title-wrap">
            <Sparkles size={16} className="quest-sword-icon text-inc" />
            <span className="quest-main-title">Misi 2: Atur Tagihan Rutin Bulanan</span>
            <span className="quest-count-badge">Langkah 2 dari 2</span>
          </div>
          <button className="quest-manage-btn" onClick={onOpenManageRecurring} title="Kelola template tagihan">
            Kelola Tagihan
          </button>
        </div>

        <div className="quest-progress-track">
          <div className="quest-progress-fill" style={{ width: '50%' }} />
        </div>

        <div className="quest-items-list">
          <div className="quest-empty-recurring-setup">
            <div className="quest-empty-recurring-text">
              <span className="quest-empty-title">Pemasukan Bulan Ini Berhasil Dicatat! 🎉</span>
              <p className="quest-empty-desc">
                Tambahkan daftar tagihan bulanan Anda (seperti Listrik PLN, Wi-Fi, Kost, Netflix, BPJS, dll) untuk memantau status pembayaran setiap bulannya secara otomatis.
              </p>
            </div>
            <div className="quest-empty-actions">
              <button 
                type="button"
                className="quest-add-recurring-btn" 
                onClick={onOpenNewRecurring}
              >
                <Plus size={14} strokeWidth={2.5} />
                <span>Tambah Tagihan Rutin</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // PHASE 3: ALL Quests Completed (Income recorded & all bills paid)
  if (!hasIncomeQuest && allRecurringPaid) {
    return (
      <div className="quest-completed-banner">
        <div className="quest-completed-left">
          <Trophy size={18} className="trophy-gold" />
          <div className="quest-completed-text">
            <span className="quest-completed-title">Semua Misi Bulan Ini Selesai! 🎉</span>
            <span className="quest-completed-sub">Pemasukan tercatat & semua tagihan rutin telah lunas.</span>
          </div>
        </div>
        <button className="quest-manage-link" onClick={onOpenManageRecurring} title="Kelola daftar tagihan rutin">
          Kelola Tagihan
        </button>
      </div>
    );
  }

  return (
    <div className="quest-box-container">
      {/* =========================================================
          FASE 1: BELUM ADA PEMASUKAN -> HANYA TAMPILKAN MISI PEMASUKAN
          ========================================================= */}
      {hasIncomeQuest ? (
        <>
          {/* Header Fase 1 */}
          <div className="quest-box-header">
            <div className="quest-title-wrap">
              <Target size={16} className="quest-sword-icon text-inc" />
              <span className="quest-main-title">Misi 1: Pemasukan Bulan Ini</span>
              <span className="quest-count-badge">Langkah 1 dari 2</span>
            </div>

            <button className="quest-manage-btn" onClick={onOpenManageRecurring} title="Kelola template tagihan">
              Kelola Tagihan
            </button>
          </div>

          {/* Progress Track (0% on Step 1) */}
          <div className="quest-progress-track">
            <div className="quest-progress-fill" style={{ width: '15%' }} />
          </div>

          {/* Income Quest Card */}
          <div className="quest-items-list">
            <div className={`quest-income-card ${animatingId === 'income-quest' ? 'quest-item-completing' : ''}`}>
              <div className="quest-income-header">
                <div className="quest-income-badge">
                  <Sparkles size={13} className="text-inc" />
                  <span>Misi Utama</span>
                </div>
                <span className="quest-income-title">Catat Penghasilan / Gaji Bulan Ini</span>
              </div>

              <p className="quest-income-desc">
                Bulan ini belum ada pemasukan. Masukkan gaji atau penghasilan untuk memulai arus kas, lalu lanjut ke tagihan rutin.
              </p>

              {/* Income Inline Input with Automatic Dot Separator */}
              <form onSubmit={handleCompleteIncomeQuest} className="quest-income-form">
                <div className="quest-income-input-row">
                  <div className="quest-income-amount-box">
                    <span className="quest-currency-prefix">+Rp</span>
                    <input 
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      className="quest-amount-field"
                      value={incomeAmount}
                      onChange={(e) => setIncomeAmount(formatAmountInput(e.target.value))}
                      required
                      autoFocus
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="quest-income-submit-btn"
                    disabled={isSubmittingIncome || !incomeAmount || parseAmountInput(incomeAmount) <= 0}
                  >
                    <Check size={14} strokeWidth={3} />
                    <span>Simpan & Cek Tagihan</span>
                  </button>
                </div>

                {/* Toggle Additional Options Button */}
                <div className="quest-income-options-row">
                  <button 
                    type="button" 
                    className="quest-chip-toggle-details"
                    onClick={() => setShowIncomeDetails(!showIncomeDetails)}
                  >
                    <span>{showIncomeDetails ? 'Tutup Opsi' : 'Opsi Rekening & Keterangan'}</span>
                    <ChevronDown size={12} className={showIncomeDetails ? 'rotate-180' : ''} />
                  </button>
                </div>

                {/* Collapsible Details */}
                {showIncomeDetails && (
                  <div className="quest-income-extra-details">
                    <div className="quest-input-mini">
                      <label>Keterangan Pemasukan:</label>
                      <input 
                        type="text"
                        className="input-control text-xs"
                        value={incomeTitle}
                        onChange={(e) => setIncomeTitle(e.target.value)}
                        placeholder="Gaji Pokok Bulanan"
                      />
                    </div>

                    <div className="quest-input-mini">
                      <label>Rekening Penerima (Prioritas Utama):</label>
                      <div className="method-chips-scroll">
                        {[...paymentMethodsList]
                          .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
                          .map(m => {
                            const isCash = m.icon === 'Banknote' || m.name.toLowerCase().includes('tunai') || m.name.toLowerCase().includes('cash');
                            const isEwallet = m.icon === 'Smartphone' || ['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'].some(e => m.name.toLowerCase().includes(e));

                            return (
                              <button 
                                key={m.id}
                                type="button"
                                className={`method-chip-btn ${incomeMethod === m.name ? 'selected' : ''} ${m.isPrimary ? 'is-primary-chip' : ''}`}
                                onClick={() => setIncomeMethod(m.name)}
                              >
                                {isCash ? <Banknote size={12} /> : isEwallet ? <Smartphone size={12} /> : <CreditCard size={12} />}
                                <span>{m.name}</span>
                                {m.isPrimary && (
                                  <span className="chip-star-tag" title="Rekening Utama">
                                    <Star size={9} fill="currentColor" /> Utama
                                  </span>
                                )}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        </>
      ) : (
        /* =========================================================
           FASE 2: PEMASUKAN SUDAH TERCATAT -> BERGANTIAN TAMPILKAN TAGIHAN RUTIN
           ========================================================= */
        <>
          {/* Header Fase 2 */}
          <div className="quest-box-header">
            <div className="quest-title-wrap">
              <Swords size={16} className="quest-sword-icon" />
              <span className="quest-main-title">Misi Tagihan Bulanan</span>
              <span className="quest-count-badge">{unpaidItems.length} Tagihan Tersisa</span>
            </div>

            <button className="quest-manage-btn" onClick={onOpenManageRecurring} title="Kelola template tagihan">
              Kelola Tagihan
            </button>
          </div>

          {/* Progress Track (Berdasarkan persentase tagihan lunas) */}
          <div className="quest-progress-track">
            <div 
              className="quest-progress-fill" 
              style={{ 
                width: `${totalRecurringCount > 0 ? Math.round((paidRecurringCount / totalRecurringCount) * 100) : 100}%` 
              }}
            />
          </div>

          {/* Daftar Tagihan Rutin yang Belum Dibayar */}
          <div className="quest-items-list">
            {unpaidItems.length === 0 && totalRecurringCount === 0 ? (
              <div className="quest-empty-recurring">
                <span className="text-muted text-xs">Belum ada daftar tagihan rutin bulanan.</span>
                <button className="zen-link-btn" onClick={onOpenNewRecurring}>
                  + Tambah Tagihan Rutin Baru
                </button>
              </div>
            ) : (
              unpaidItems.map(item => {
                const isAnimating = animatingId === item.id;
                const isOverdue = item.dueInfo.status === 'overdue';

                return (
                  <div 
                    key={item.id} 
                    className={`quest-item-card ${isAnimating ? 'quest-item-completing' : ''}`}
                  >
                    <div className="quest-item-left">
                      <span className={`quest-due-tag ${isOverdue ? 'due-overdue' : ''}`}>
                        Tgl {item.dueDay}
                      </span>
                      <div className="quest-item-info">
                        <span className="quest-item-name">{item.title}</span>
                        <span className="quest-item-amount">{formatRupiah(item.amount)}</span>
                      </div>
                    </div>

                    {/* Tombol Bayar Tagihan */}
                    <button 
                      className="quest-complete-btn"
                      onClick={(e) => handleCompleteRecurringQuest(e, item)}
                      title="Bayar tagihan ini (otomatis tercatat ke pengeluaran)"
                    >
                      <Check size={13} strokeWidth={3} />
                      <span>Bayar</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
