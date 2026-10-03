import React, { useEffect } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { formatRupiah, formatDateID } from '../utils/formatters';

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Konfirmasi Hapus',
  message = 'Apakah Anda yakin ingin menghapus data ini?',
  item = null,
  confirmText = 'Ya, Hapus',
  cancelText = 'Batal',
  isDanger = true
}) {
  if (!isOpen) return null;

  // Handle ESC key to cancel
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay modal-confirm-overlay" onClick={onClose}>
      <div 
        className="modal-content modal-confirm-box" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Close button */}
        <button className="confirm-close-btn" onClick={onClose} title="Tutup">
          <X size={16} />
        </button>

        {/* Icon */}
        <div className="confirm-icon-wrap">
          <div className="confirm-icon-circle danger-circle">
            <Trash2 size={24} className="text-danger" />
          </div>
        </div>

        {/* Content */}
        <div className="confirm-body">
          <h3 className="confirm-title">{title}</h3>
          <p className="confirm-message">{message}</p>

          {/* Item details card if provided */}
          {item && (
            <div className="confirm-item-preview">
              <div className="confirm-item-main">
                <span className="confirm-item-title">{item.title}</span>
                {item.amount !== undefined && (
                  <span className={`confirm-item-amount ${item.type === 'expense' ? 'text-exp' : 'text-inc'}`}>
                    {item.type === 'expense' ? '-' : item.type === 'income' ? '+' : ''}{formatRupiah(item.amount)}
                  </span>
                )}
              </div>
              <div className="confirm-item-meta">
                {item.category && <span>{item.category}</span>}
                {item.date && <span>• {formatDateID(item.date)}</span>}
                {item.dueDay && <span>• Jatuh tempo tgl {item.dueDay}</span>}
              </div>
            </div>
          )}

          <p className="confirm-warning-note">
            Tindakan ini permanen dan data akan dihapus dari penyimpanan.
          </p>
        </div>

        {/* Actions */}
        <div className="confirm-actions">
          <button 
            type="button" 
            className="btn btn-secondary confirm-btn-cancel" 
            onClick={onClose}
          >
            {cancelText}
          </button>
          <button 
            type="button" 
            className="btn btn-danger confirm-btn-delete" 
            onClick={onConfirm}
            autoFocus
          >
            <Trash2 size={15} />
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
