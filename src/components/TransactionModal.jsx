import React, { useState, useEffect } from 'react';
import { 
  X, Plus, Check, Calendar, Clock, CreditCard, Tag, 
  AlignLeft, ArrowDownCircle, ArrowUpCircle, Sparkles, Banknote, Smartphone, Star
} from 'lucide-react';
import { DEFAULT_CATEGORIES, getCustomPaymentMethods, getPrimaryPaymentMethod } from '../db/db';
import { getCategoryIcon, formatRupiah, formatAmountInput, parseAmountInput } from '../utils/formatters';

export default function TransactionModal({
  isOpen,
  onClose,
  onSave,
  initialData = null,
  selectedMonthYear
}) {
  if (!isOpen) return null;

  const [type, setType] = useState('expense'); // 'expense' | 'income' | 'transfer'
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(() => getPrimaryPaymentMethod()?.name || 'BSI');
  const [targetAccount, setTargetAccount] = useState('BCA');
  const [paymentMethodsList, setPaymentMethodsList] = useState(getCustomPaymentMethods());
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  // Listen to payment methods updates
  useEffect(() => {
    const handleUpdate = () => {
      const methods = getCustomPaymentMethods();
      setPaymentMethodsList(methods);
      const primary = getPrimaryPaymentMethod();
      if (!initialData && primary) {
        setPaymentMethod(primary.name);
      }
    };
    window.addEventListener('finflow_payment_methods_updated', handleUpdate);
    return () => window.removeEventListener('finflow_payment_methods_updated', handleUpdate);
  }, [initialData]);

  // Initial load or edit
  useEffect(() => {
    const methods = getCustomPaymentMethods();
    setPaymentMethodsList(methods);
    const primaryMethod = getPrimaryPaymentMethod()?.name || methods[0]?.name || 'BSI';
    const defaultTarget = methods.find(m => m.name !== primaryMethod)?.name || 'BCA';

    if (initialData) {
      const txType = initialData.type || (initialData.targetPaymentMethod ? 'transfer' : 'expense');
      setType(txType);
      setAmount(initialData.amount ? formatAmountInput(initialData.amount) : '');
      setTitle(initialData.title || '');
      setCategory(initialData.category || (txType === 'transfer' ? 'Tabungan & Investasi' : 'Makanan & Minuman'));
      setPaymentMethod(initialData.paymentMethod || primaryMethod);
      setTargetAccount(initialData.targetPaymentMethod || defaultTarget);
      setDate(initialData.date || '');
      setTime(initialData.time || '');
      setNotes(initialData.notes || '');
    } else {
      const now = new Date();
      const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      let defaultDate = now.toISOString().split('T')[0];
      
      if (selectedMonthYear && selectedMonthYear !== currentYearMonth) {
        defaultDate = `${selectedMonthYear}-01`;
      }

      setType('expense');
      setAmount('');
      setTitle('');
      setCategory('Makanan & Minuman');
      setPaymentMethod(primaryMethod);
      setTargetAccount(defaultTarget);
      setDate(defaultDate);
      setTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
      setNotes('');
    }
    setError('');
  }, [initialData, isOpen, selectedMonthYear]);

  // Filter categories by type
  const availableCategories = DEFAULT_CATEGORIES.filter(c => type === 'transfer' ? (c.id === 'investasi' || c.id === 'pemasukan_lain' || c.id === 'tagihan' || c.id === 'lainnya') : c.type === type);

  // Set default category when type switches
  const handleTypeChange = (newType) => {
    setType(newType);
    if (newType === 'transfer') {
      setCategory('Tabungan & Investasi');
      if (targetAccount === paymentMethod) {
        const other = paymentMethodsList.find(m => m.name !== paymentMethod)?.name || 'BCA';
        setTargetAccount(other);
      }
    } else {
      const firstCat = DEFAULT_CATEGORIES.find(c => c.type === newType);
      if (firstCat) setCategory(firstCat.name);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const numAmount = parseAmountInput(amount);
    if (!numAmount || numAmount <= 0) {
      setError('Masukkan nominal yang valid lebih dari 0');
      return;
    }
    if (!title.trim()) {
      setError('Masukkan judul transaksi');
      return;
    }
    if (!date) {
      setError('Pilih tanggal transaksi');
      return;
    }
    if (type === 'transfer' && paymentMethod === targetAccount) {
      setError('Rekening sumber dan tujuan transfer tidak boleh sama');
      return;
    }

    onSave({
      ...(initialData?.id ? { id: initialData.id } : {}),
      title: title.trim(),
      amount: numAmount,
      type,
      category: category || (type === 'transfer' ? 'Tabungan & Investasi' : 'Pengeluaran Lainnya'),
      paymentMethod,
      targetPaymentMethod: type === 'transfer' ? targetAccount : undefined,
      date,
      time: time || '12:00',
      notes: notes.trim(),
      ...(initialData?.recurringId ? { recurringId: initialData.recurringId } : {})
    });
  };

  // Suggestion chips
  const expenseSuggestions = ['Makan Siang', 'Kopi & Snack', 'Bensin Motor/Mobil', 'Belanja Harian', 'Parkir', 'Makan Malam'];
  const incomeSuggestions = ['Gaji Bulanan', 'Freelance Project', 'Bonus / THR', 'Penjualan Online', 'Cashback'];
  const transferSuggestions = ['Tabungan Lily', 'Pindah Saldo BCA', 'Top Up SeaBank', 'Tabungan Darurat', 'Investasi Reksadana'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-wrap">
            <h3 className="modal-title">
              {initialData ? 'Edit Transaksi' : 'Catat Transaksi Baru'}
            </h3>
            <span className="text-muted text-xs">Simpan otomatis ke database lokal dan cloud</span>
          </div>
          <button className="btn-icon-subtle" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="modal-body">
          {/* Type Toggle */}
          <div className="type-toggle-group full-width">
            <button 
              type="button"
              className={`type-toggle-btn type-expense ${type === 'expense' ? 'active' : ''}`}
              onClick={() => handleTypeChange('expense')}
            >
              <ArrowDownCircle size={15} />
              <span>Pengeluaran</span>
            </button>
            <button 
              type="button"
              className={`type-toggle-btn type-income ${type === 'income' ? 'active' : ''}`}
              onClick={() => handleTypeChange('income')}
            >
              <ArrowUpCircle size={15} />
              <span>Pemasukan</span>
            </button>
            <button 
              type="button"
              className={`type-toggle-btn type-transfer ${type === 'transfer' ? 'active' : ''}`}
              onClick={() => handleTypeChange('transfer')}
            >
              <Sparkles size={15} />
              <span>Tabungan / Transfer</span>
            </button>
          </div>

          {/* Amount Input */}
          <div className="amount-input-card">
            <label className="amount-label">
              {type === 'transfer' ? 'Nominal Tabungan / Transfer (Rp)' : 'Nominal Transaksi (Rp)'}
            </label>
            <div className="amount-input-wrapper">
              <span className="currency-prefix">Rp</span>
              <input 
                type="text"
                inputMode="numeric"
                placeholder="0"
                className="amount-input"
                value={amount}
                onChange={(e) => setAmount(formatAmountInput(e.target.value))}
                autoFocus
              />
            </div>
          </div>

          {/* Title & Suggestions */}
          <div className="input-group">
            <label className="input-label">Judul / Keperluan</label>
            <input 
              type="text"
              placeholder={type === 'transfer' ? 'Contoh: Tabungan Lily, Pindah Saldo ke BCA...' : 'Contoh: Makan Siang Nasi Padang, Bensin...'}
              className="input-control"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {/* Quick suggestions */}
            <div className="suggestions-list">
              {(type === 'expense' ? expenseSuggestions : type === 'income' ? incomeSuggestions : transferSuggestions).map((sug) => (
                <button 
                  key={sug} 
                  type="button" 
                  className="suggestion-chip"
                  onClick={() => setTitle(sug)}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          {/* Account / Payment Methods */}
          <div className="input-group">
            <label className="input-label">
              {type === 'transfer' ? '1. Dari Rekening (Sumber Dana)' : 'Metode Pembayaran / Rekening'}
            </label>
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
                      className={`method-chip-btn ${paymentMethod === m.name ? 'selected' : ''} ${m.isPrimary ? 'is-primary-chip' : ''}`}
                      onClick={() => setPaymentMethod(m.name)}
                    >
                      {isCash ? <Banknote size={13} /> : isEwallet ? <Smartphone size={13} /> : <CreditCard size={13} />}
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

          {/* Destination Account (Only for Transfer / Tabungan) */}
          {type === 'transfer' && (
            <div className="input-group">
              <label className="input-label text-inc">
                2. Ke Rekening Tujuan (Masuk Menambah Saldo)
              </label>
              <div className="method-chips-scroll">
                {[...paymentMethodsList]
                  .map(m => {
                    const isSelected = targetAccount === m.name;
                    const isSource = paymentMethod === m.name;
                    const isCash = m.icon === 'Banknote' || m.name.toLowerCase().includes('tunai') || m.name.toLowerCase().includes('cash');
                    const isEwallet = m.icon === 'Smartphone' || ['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'].some(e => m.name.toLowerCase().includes(e));

                    return (
                      <button 
                        key={m.id}
                        type="button"
                        disabled={isSource}
                        className={`method-chip-btn ${isSelected ? 'selected' : ''} ${isSource ? 'opacity-40' : ''}`}
                        onClick={() => setTargetAccount(m.name)}
                        title={isSource ? 'Tidak bisa memilih rekening yang sama' : `Tujuan: ${m.name}`}
                      >
                        {isCash ? <Banknote size={13} /> : isEwallet ? <Smartphone size={13} /> : <CreditCard size={13} />}
                        <span>{m.name}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Date & Time Row */}
          <div className="form-row-2">
            <div className="input-group">
              <label className="input-label">Tanggal</label>
              <div className="input-icon-wrap">
                <Calendar size={15} className="input-left-icon" />
                <input 
                  type="date"
                  className="input-control input-with-icon"
                  max={new Date().toISOString().split('T')[0]}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Waktu / Jam</label>
              <div className="input-icon-wrap">
                <Clock size={15} className="input-left-icon" />
                <input 
                  type="time"
                  className="input-control input-with-icon"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="input-group">
            <label className="input-label">Catatan Tambahan (Opsional)</label>
            <input 
              type="text"
              placeholder="Contoh: Dibayar patungan dengan teman..."
              className="input-control"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="form-error-alert">
              {error}
            </div>
          )}

          {/* Modal Footer */}
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary btn-submit">
              <Check size={16} />
              <span>{initialData ? 'Perbarui Transaksi' : 'Simpan Transaksi'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
