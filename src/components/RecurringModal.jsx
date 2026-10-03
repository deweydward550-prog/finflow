import React, { useState, useEffect } from 'react';
import { 
  X, Check, Calendar, Tag, Sparkles, 
  Wifi, Zap, Home, Tv, HeartPulse, Shield, Droplets, Dumbbell, Wallet, Utensils
} from 'lucide-react';
import { getCategoryIcon, formatAmountInput, parseAmountInput } from '../utils/formatters';

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
    if (initialData) {
      setTitle(initialData.title || '');
      setAmount(initialData.amount ? formatAmountInput(initialData.amount) : '');
      setDueDay(initialData.dueDay || 5);
      setIcon(initialData.icon || 'Zap');
      setColor(initialData.color || '#3B82F6');
      setNotes(initialData.notes || '');
    } else {
      setTitle('');
      setAmount('');
      setDueDay(5);
      setIcon('Wifi');
      setColor('#3B82F6');
      setNotes('');
    }
    setError('');
  }, [initialData, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const numAmount = parseAmountInput(amount);
    if (!numAmount || numAmount <= 0) {
      setError('Masukkan nominal tagihan yang valid lebih dari 0');
      return;
    }
    if (!title.trim()) {
      setError('Masukkan nama pengeluaran rutin');
      return;
    }
    if (dueDay < 1 || dueDay > 31) {
      setError('Pilih tanggal jatuh tempo antara 1 - 31');
      return;
    }

    onSave({
      ...(initialData?.id ? { id: initialData.id } : {}),
      title: title.trim(),
      amount: numAmount,
      category: initialData?.category || 'Tagihan & Utilitas',
      dueDay: parseInt(dueDay, 10),
      billingCycle: 'monthly',
      paymentMethod: initialData?.paymentMethod || 'BCA',
      icon,
      color,
      notes: notes.trim(),
      active: true,
      ...(initialData?.createdAt ? { createdAt: initialData.createdAt } : { createdAt: new Date().toISOString() })
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-compact-no-scroll" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-wrap">
            <h3 className="modal-title">
              {initialData ? 'Edit Tagihan Rutin' : 'Tambah Pengeluaran Rutin Bulanan'}
            </h3>
            <span className="text-muted text-xs">Jadwal pengeluaran tetap berulang setiap bulan</span>
          </div>
          <button className="btn-icon-subtle" onClick={onClose} title="Tutup">
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="modal-body compact-form-body">
          {/* Amount Card */}
          <div className="amount-input-card">
            <label className="amount-label">Nominal Tagihan per Bulan (Rp)</label>
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
            <label className="input-label">Nama Pengeluaran / Tagihan</label>
            <input 
              type="text"
              placeholder="Contoh: Tagihan Wi-Fi, Listrik PLN, Kost..."
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
            <label className="input-label">Catatan / No. Pelanggan (Opsional)</label>
            <input 
              type="text"
              placeholder="Contoh: ID Pelanggan PLN 5382910..."
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
