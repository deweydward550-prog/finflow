import React, { useState, useEffect } from 'react';
import { 
  X, Plus, Check, Calendar, Clock, CreditCard, Tag, 
  AlignLeft, ArrowDownCircle, ArrowUpCircle, Sparkles, Banknote, Smartphone
} from 'lucide-react';
import { DEFAULT_CATEGORIES, getCustomPaymentMethods } from '../db/db';
import { getCategoryIcon, formatRupiah, formatAmountInput, parseAmountInput } from '../utils/formatters';

export default function TransactionModal({
  isOpen,
  onClose,
  onSave,
  initialData = null,
  selectedMonthYear
}) {
  if (!isOpen) return null;

  const [type, setType] = useState('expense'); // 'expense' | 'income'
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Tunai (Cash)');
  const [paymentMethodsList, setPaymentMethodsList] = useState(getCustomPaymentMethods());
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  // Listen to payment methods updates
  useEffect(() => {
    const handleUpdate = () => {
      setPaymentMethodsList(getCustomPaymentMethods());
    };
    window.addEventListener('finflow_payment_methods_updated', handleUpdate);
    return () => window.removeEventListener('finflow_payment_methods_updated', handleUpdate);
  }, []);

  // Initial load or edit
  useEffect(() => {
    const methods = getCustomPaymentMethods();
    setPaymentMethodsList(methods);
    const defaultMethod = methods[0]?.name || 'Tunai (Cash)';

    if (initialData) {
      setType(initialData.type || 'expense');
      setAmount(initialData.amount ? formatAmountInput(initialData.amount) : '');
      setTitle(initialData.title || '');
      setCategory(initialData.category || '');
      setPaymentMethod(initialData.paymentMethod || defaultMethod);
      setDate(initialData.date || '');
      setTime(initialData.time || '');
      setNotes(initialData.notes || '');
    } else {
      // Default to today's date or matching current selected month
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
      setPaymentMethod(defaultMethod);
      setDate(defaultDate);
      setTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
      setNotes('');
    }
    setError('');
  }, [initialData, isOpen, selectedMonthYear]);

  // Filter categories by type
  const availableCategories = DEFAULT_CATEGORIES.filter(c => c.type === type);

  // Set default category when type switches
  const handleTypeChange = (newType) => {
    setType(newType);
    const firstCat = DEFAULT_CATEGORIES.find(c => c.type === newType);
    if (firstCat) setCategory(firstCat.name);
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
    if (!category) {
      setError('Pilih kategori transaksi');
      return;
    }
    if (!date) {
      setError('Pilih tanggal transaksi');
      return;
    }

    onSave({
      ...(initialData?.id ? { id: initialData.id } : {}),
      title: title.trim(),
      amount: numAmount,
      type,
      category,
      paymentMethod,
      date,
      time: time || '12:00',
      notes: notes.trim(),
      ...(initialData?.recurringId ? { recurringId: initialData.recurringId } : {})
    });
  };

  // Suggestion chips
  const expenseSuggestions = ['Makan Siang', 'Kopi & Snack', 'Bensin Motor/Mobil', 'Belanja Harian', 'Parkir', 'Makan Malam'];
  const incomeSuggestions = ['Gaji Bulanan', 'Freelance Project', 'Bonus / THR', 'Penjualan Online', 'Cashback'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-wrap">
            <h3 className="modal-title">
              {initialData ? 'Edit Transaksi' : 'Catat Transaksi Baru'}
            </h3>
            <span className="text-muted text-xs">Simpan otomatis ke database lokal gratis</span>
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
              <ArrowDownCircle size={16} />
              <span>Pengeluaran</span>
            </button>
            <button 
              type="button"
              className={`type-toggle-btn type-income ${type === 'income' ? 'active' : ''}`}
              onClick={() => handleTypeChange('income')}
            >
              <ArrowUpCircle size={16} />
              <span>Pemasukan</span>
            </button>
          </div>

          {/* Amount Input */}
          <div className="amount-input-card">
            <label className="amount-label">Nominal Transaksi (Rp)</label>
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
              placeholder="Contoh: Makan Siang Nasi Padang, Bensin..."
              className="input-control"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {/* Quick suggestions */}
            <div className="suggestions-list">
              {(type === 'expense' ? expenseSuggestions : incomeSuggestions).map((sug) => (
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

          {/* Category Selector */}
          <div className="input-group">
            <label className="input-label">Pilih Kategori</label>
            <div className="category-chips-grid">
              {availableCategories.map(cat => (
                <button 
                  key={cat.id}
                  type="button"
                  className={`cat-chip-btn ${category === cat.name ? 'selected' : ''}`}
                  onClick={() => setCategory(cat.name)}
                >
                  <span className="cat-chip-icon" style={{ color: cat.color }}>
                    {getCategoryIcon(cat.icon, 14)}
                  </span>
                  <span className="cat-chip-text">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

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

          {/* Payment Method Selector */}
          <div className="input-group">
            <label className="input-label">Metode Pembayaran / Rekening</label>
            <div className="method-chips-scroll">
              {paymentMethodsList.map(m => {
                const isCash = m.icon === 'Banknote' || m.name.toLowerCase().includes('tunai') || m.name.toLowerCase().includes('cash');
                const isEwallet = m.icon === 'Smartphone' || ['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'].some(e => m.name.toLowerCase().includes(e));

                return (
                  <button 
                    key={m.id}
                    type="button"
                    className={`method-chip-btn ${paymentMethod === m.name ? 'selected' : ''}`}
                    onClick={() => setPaymentMethod(m.name)}
                  >
                    {isCash ? <Banknote size={13} /> : isEwallet ? <Smartphone size={13} /> : <CreditCard size={13} />}
                    <span>{m.name}</span>
                  </button>
                );
              })}
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
