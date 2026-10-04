import React, { useState, useEffect } from 'react';
import { 
  X, CreditCard, Smartphone, Banknote, Star, 
  Check, DollarSign, Wallet, RotateCcw, Sparkles 
} from 'lucide-react';
import { formatAmountInput, parseAmountInput, formatRupiah } from '../utils/formatters.jsx';

export default function EditAccountBalancesModal({
  isOpen,
  onClose,
  paymentMethods = [],
  accountBalances = [],
  onSaveBalances,
  showToast
}) {
  if (!isOpen) return null;

  // Filter out cash as requested in previous requirements
  const nonCashMethods = paymentMethods.filter(method => {
    const isCash = method.icon === 'Banknote' || method.id === 'cash' || 
      method.name.toLowerCase().includes('tunai') || 
      method.name.toLowerCase().includes('cash');
    return !isCash;
  });

  // State to hold amount string for each account ID
  const [balanceInputs, setBalanceInputs] = useState({});

  useEffect(() => {
    const initial = {};
    nonCashMethods.forEach(acc => {
      // Find current computed balance or stored balance
      const match = accountBalances.find(b => b.id === acc.id);
      const currentVal = acc.storedBalance !== undefined 
        ? acc.storedBalance 
        : (match ? match.balance : 0);

      initial[acc.id] = currentVal > 0 ? formatAmountInput(String(currentVal)) : '0';
    });
    setBalanceInputs(initial);
  }, [isOpen, paymentMethods, accountBalances]);

  const handleInputChange = (id, val) => {
    const formatted = formatAmountInput(val);
    setBalanceInputs(prev => ({
      ...prev,
      [id]: formatted
    }));
  };

  const handleSetQuick = (id, amount) => {
    setBalanceInputs(prev => ({
      ...prev,
      [id]: formatAmountInput(String(amount))
    }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    const updatedMethods = paymentMethods.map(m => {
      if (balanceInputs[m.id] !== undefined) {
        const num = parseAmountInput(balanceInputs[m.id]);
        const match = accountBalances.find(b => b.id === m.id);
        const inc = match ? match.income : 0;
        const exp = match ? match.expense : 0;
        const calculatedInitial = num - inc + exp;

        return {
          ...m,
          storedBalance: num,
          initialBalance: calculatedInitial
        };
      }
      return m;
    });

    if (onSaveBalances) {
      onSaveBalances(updatedMethods);
    }
    if (showToast) {
      showToast('Nominal saldo rekening berhasil diperbarui!', 'success');
    }
    onClose();
  };

  // Calculate total stored balance preview
  const totalSum = Object.values(balanceInputs).reduce((sum, str) => {
    return sum + parseAmountInput(str);
  }, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content edit-balances-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-title-wrap">
            <h3 className="modal-title">Ubah Saldo Rekening</h3>
            <p className="modal-subtitle">Atur nominal uang tersimpan pada setiap rekening</p>
          </div>
          <button 
            type="button" 
            className="modal-close-btn" 
            onClick={onClose}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSave} className="modal-body edit-balances-body">
          <div className="edit-balances-list">
            {nonCashMethods.map(acc => {
              const isEwallet = acc.icon === 'Smartphone' || 
                ['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'].some(e => acc.name.toLowerCase().includes(e));

              return (
                <div key={acc.id} className={`edit-balance-item ${acc.isPrimary ? 'is-primary-item' : ''}`}>
                  <div className="edit-balance-item-header">
                    <div className="edit-balance-acc-info">
                      <div className="edit-balance-icon" style={{ color: acc.color || '#0060AF' }}>
                        {isEwallet ? <Smartphone size={16} /> : <CreditCard size={16} />}
                      </div>
                      <div className="edit-balance-acc-name-wrap">
                        <span className="edit-balance-acc-name">{acc.name}</span>
                        {acc.isPrimary && (
                          <span className="zen-card-primary-tag">
                            <Star size={9} fill="currentColor" /> Utama
                          </span>
                        )}
                      </div>
                    </div>

                    {acc.number && (
                      <span className="edit-balance-acc-number text-muted text-2xs font-mono">
                        {acc.number}
                      </span>
                    )}
                  </div>

                  {/* Amount Input with Prefix */}
                  <div className="edit-balance-input-wrap">
                    <span className="edit-balance-currency-prefix">Rp</span>
                    <input 
                      type="text"
                      className="edit-balance-input font-mono"
                      value={balanceInputs[acc.id] || ''}
                      onChange={(e) => handleInputChange(acc.id, e.target.value)}
                      placeholder="0"
                    />
                    {balanceInputs[acc.id] && balanceInputs[acc.id] !== '0' && (
                      <button 
                        type="button"
                        className="edit-balance-clear-btn"
                        onClick={() => handleInputChange(acc.id, '0')}
                        title="Set ke 0"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Quick Chips */}
                  <div className="edit-balance-chips">
                    <button type="button" className="chip-btn" onClick={() => handleSetQuick(acc.id, 0)}>0</button>
                    <button type="button" className="chip-btn" onClick={() => handleSetQuick(acc.id, 500000)}>500rb</button>
                    <button type="button" className="chip-btn" onClick={() => handleSetQuick(acc.id, 1000000)}>1jt</button>
                    <button type="button" className="chip-btn" onClick={() => handleSetQuick(acc.id, 2500000)}>2.5jt</button>
                    <button type="button" className="chip-btn" onClick={() => handleSetQuick(acc.id, 5000000)}>5jt</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total Preview Summary Banner */}
          <div className="edit-balances-total-strip">
            <span className="text-xs text-muted font-medium">Total Saldo Semua Rekening:</span>
            <span className="text-sm font-bold text-inc font-mono">{formatRupiah(totalSum)}</span>
          </div>

          {/* Footer Actions */}
          <div className="modal-footer edit-balances-footer">
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={onClose}
            >
              Batal
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
            >
              <Check size={16} />
              <span>Simpan Perubahan</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
