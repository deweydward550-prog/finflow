import React, { useState, useEffect } from 'react';
import { 
  X, Check, Calendar, Tag, Sparkles, 
  Wifi, Zap, Home, Tv, HeartPulse, Shield, Droplets, Dumbbell, Wallet, Utensils,
  CreditCard, Banknote, Smartphone, Star
} from 'lucide-react';
import { getCategoryIcon, formatAmountInput, parseAmountInput } from '../utils/formatters';
import { getCustomPaymentMethods, getPrimaryPaymentMethod } from '../db/db';

export default function RecurringModal({
  isOpen,
  onClose,
  onSave,
  initialData = null
}) {
  if (!isOpen) return null;

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState(5);
  const [paymentMethod, setPaymentMethod] = useState(() => {
    return initialData?.paymentMethod || getPrimaryPaymentMethod()?.name || 'BSI';
  });
  const [paymentMethodsList, setPaymentMethodsList] = useState(() => getCustomPaymentMethods());
  const [isSavings, setIsSavings] = useState(false);
  const [targetPaymentMethod, setTargetPaymentMethod] = useState('BCA');
  const [icon, setIcon] = useState('Zap');
  const [color, setColor] = useState('#3B82F6');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const ICONS_LIST = [
    { id: 'Zap', label: 'Listrik/PLN' },
    { id: 'Wifi', label: 'Internet' },
    { id: 'Home', label: 'Kost/Rumah' },
    { id: 'Tv', label: 'Langganan' },
    { id: 'HeartPulse', label: 'BPJS/Medis' },
    { id: 'Shield', label: 'Asuransi' },
    { id: 'Droplets', label: 'PDAM/Air' },
    { id: 'Dumbbell', label: 'Gym/Fitness' },
    { id: 'Utensils', label: 'Katering' },
    { id: 'Wallet', label: 'Cicilan/Tabungan' },
  ];

  const COLOR_LIST = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1'
  ];

  useEffect(() => {
    const methods = getCustomPaymentMethods();
    setPaymentMethodsList(methods);
    const primary = getPrimaryPaymentMethod();
    const defaultTarget = methods.find(m => m.name !== (primary?.name || 'BSI'))?.name || 'BCA';

    if (initialData) {
      const isSav = Boolean(
        initialData.isSavings || 
        initialData.targetPaymentMethod || 
        initialData.title?.toLowerCase().includes('tabungan') || 
        initialData.title?.toLowerCase().includes('lily')
      );
      setTitle(initialData.title || '');
      setAmount(initialData.amount ? formatAmountInput(initialData.amount) : '');
      setDueDay(initialData.dueDay || 5);
      setPaymentMethod(initialData.paymentMethod || primary?.name || 'BSI');
      setIsSavings(isSav);
      setTargetPaymentMethod(initialData.targetPaymentMethod || (initialData.paymentMethod === 'BCA' ? 'BSI' : 'BCA'));
      setIcon(initialData.icon || (isSav ? 'Wallet' : 'Zap'));
      setColor(initialData.color || (isSav ? '#10B981' : '#3B82F6'));
      setNotes(initialData.notes || '');
    } else {
      setTitle('');
      setAmount('');
      setDueDay(5);
      setPaymentMethod(primary?.name || 'BSI');
      setIsSavings(false);
      setTargetPaymentMethod(defaultTarget);
      setIcon('Wifi');
      setColor('#3B82F6');
      setNotes('');
    }
    setError('');
  }, [initialData, isOpen]);

  const handleToggleSavings = (enableSavings) => {
    setIsSavings(enableSavings);
    if (enableSavings) {
      if (icon === 'Zap' || icon === 'Wifi') setIcon('Wallet');
      if (color === '#3B82F6') setColor('#10B981');
      if (!targetPaymentMethod || targetPaymentMethod === paymentMethod) {
        const other = paymentMethodsList.find(m => m.name !== paymentMethod)?.name || 'BCA';
        setTargetPaymentMethod(other);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const numAmount = parseAmountInput(amount);
    if (!numAmount || numAmount <= 0) {
      setError('Masukkan nominal tagihan yang valid lebih dari 0');
      return;
    }
    if (!title.trim()) {
      setError('Masukkan nama pengeluaran / tabungan rutin');
      return;
    }
    if (dueDay < 1 || dueDay > 31) {
      setError('Pilih tanggal jatuh tempo antara 1 - 31');
      return;
    }
    if (isSavings && paymentMethod === targetPaymentMethod) {
      setError('Rekening sumber dan rekening tujuan tidak boleh sama');
      return;
    }

    const currentPrimary = getPrimaryPaymentMethod();

    onSave({
      ...(initialData?.id ? { id: initialData.id } : {}),
      title: title.trim(),
      amount: numAmount,
      category: isSavings ? 'Tabungan & Investasi' : (initialData?.category || 'Tagihan & Utilitas'),
      dueDay: parseInt(dueDay, 10),
      billingCycle: 'monthly',
      paymentMethod: paymentMethod || currentPrimary?.name || 'BSI',
      targetPaymentMethod: isSavings ? targetPaymentMethod : undefined,
      isSavings: isSavings,
      icon,
      color,
      notes: notes.trim(),
      active: true,
      ...(initialData?.createdAt ? { createdAt: initialData.createdAt } : { createdAt: new Date().toISOString() })
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-wrap">
            <h3 className="modal-title">
              {initialData ? (isSavings ? 'Edit Tabungan Rutin' : 'Edit Tagihan Rutin') : 'Tambah Misi Rutin Bulanan'}
            </h3>
            <span className="text-muted text-xs">Jadwal pengeluaran atau tabungan berulang setiap bulan</span>
          </div>
          <button className="btn-icon-subtle" onClick={onClose} title="Tutup">
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="modal-body compact-form-body">
          {/* Mission Type Segmented Toggle */}
          <div className="type-toggle-group full-width mb-2">
            <button 
              type="button"
              className={`type-toggle-btn type-expense ${!isSavings ? 'active' : ''}`}
              onClick={() => handleToggleSavings(false)}
            >
              <Zap size={14} />
              <span>Tagihan / Beban Rutin</span>
            </button>
            <button 
              type="button"
              className={`type-toggle-btn type-income ${isSavings ? 'active' : ''}`}
              onClick={() => handleToggleSavings(true)}
            >
              <Wallet size={14} />
              <span>Tabungan / Pindah Rekening</span>
            </button>
          </div>

          {/* Amount Card */}
          <div className="amount-input-card">
            <label className="amount-label">
              {isSavings ? 'Nominal Tabungan per Bulan (Rp)' : 'Nominal Tagihan per Bulan (Rp)'}
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

          {/* Title */}
          <div className="input-group">
            <label className="input-label">
              {isSavings ? 'Nama Tabungan / Misi' : 'Nama Pengeluaran / Tagihan'}
            </label>
            <input 
              type="text"
              placeholder={isSavings ? 'Contoh: Tabungan Lily, Tabungan Emas, Deposito...' : 'Contoh: Tagihan Wi-Fi, Listrik PLN, Kost...'}
              className="input-control"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Due Day */}
          <div className="input-group">
            <label className="input-label">Jatuh Tempo Tiap Tanggal</label>
            <div className="due-day-select-wrap">
              <select 
                className="input-control select-day-picker"
                value={dueDay}
                onChange={(e) => setDueDay(Number(e.target.value))}
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                  <option key={day} value={day}>
                    Tanggal {day} setiap bulan
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Source Account */}
          <div className="input-group">
            <label className="input-label">
              {isSavings ? '1. Potong dari Rekening (Sumber Dana)' : 'Potong dari Rekening / Sumber Dana'}
            </label>
            <div className="method-chips-scroll">
              {[...paymentMethodsList]
                .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
                .map(m => {
                  const isSelected = paymentMethod === m.name;
                  const isCash = m.icon === 'Banknote' || m.name.toLowerCase().includes('tunai') || m.name.toLowerCase().includes('cash');
                  const isEwallet = m.icon === 'Smartphone' || ['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'].some(e => m.name.toLowerCase().includes(e));

                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`method-chip-btn ${isSelected ? 'selected' : ''} ${m.isPrimary ? 'is-primary-chip' : ''}`}
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

          {/* Target Account (Only for Savings / Transfer) */}
          {isSavings && (
            <div className="input-group">
              <label className="input-label text-inc">
                2. Masuk ke Rekening Tabungan (Tujuan)
              </label>
              <div className="method-chips-scroll">
                {[...paymentMethodsList]
                  .map(m => {
                    const isSelected = targetPaymentMethod === m.name;
                    const isSource = paymentMethod === m.name;
                    const isCash = m.icon === 'Banknote' || m.name.toLowerCase().includes('tunai') || m.name.toLowerCase().includes('cash');
                    const isEwallet = m.icon === 'Smartphone' || ['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'].some(e => m.name.toLowerCase().includes(e));

                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={isSource}
                        className={`method-chip-btn ${isSelected ? 'selected' : ''} ${isSource ? 'opacity-40' : ''}`}
                        onClick={() => setTargetPaymentMethod(m.name)}
                        title={isSource ? 'Tidak bisa memilih rekening yang sama dengan sumber' : `Simpan ke ${m.name}`}
                      >
                        {isCash ? <Banknote size={13} /> : isEwallet ? <Smartphone size={13} /> : <CreditCard size={13} />}
                        <span>{m.name}</span>
                      </button>
                    );
                  })}
              </div>

              {/* Informative helper banner */}
              <div className="zen-savings-helper-banner">
                <Sparkles size={14} className="text-inc" />
                <span>
                  Saat misi diselesaikan, uang <strong>{paymentMethod}</strong> dipindahkan masuk ke <strong>{targetPaymentMethod}</strong> (menambah saldo rekening tujuan).
                </span>
              </div>
            </div>
          )}

          {/* Icon & Color selector in 2 columns */}
          <div className="form-row-2">
            <div className="input-group">
              <label className="input-label">Pilih Ikon</label>
              <div className="icon-selector-grid">
                {ICONS_LIST.map(ic => (
                  <button 
                    key={ic.id}
                    type="button"
                    className={`icon-select-btn ${icon === ic.id ? 'selected' : ''}`}
                    onClick={() => setIcon(ic.id)}
                    title={ic.label}
                  >
                    {getCategoryIcon(ic.id, 15)}
                  </button>
                ))}
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Pilih Warna</label>
              <div className="color-selector-grid">
                {COLOR_LIST.map(c => (
                  <button 
                    key={c}
                    type="button"
                    className={`color-dot-btn ${color === c ? 'selected' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="input-group">
            <label className="input-label">Catatan / Keterangan (Opsional)</label>
            <input 
              type="text"
              placeholder={isSavings ? 'Contoh: Rekening Lily Tabungan Pendidikan...' : 'Contoh: ID Pelanggan PLN 5382910...'}
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

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary btn-submit">
              <Check size={16} />
              <span>{initialData ? 'Perbarui Tagihan' : 'Simpan Tagihan Rutin'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
