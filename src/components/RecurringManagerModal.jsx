import React from 'react';
import { 
  X, Plus, Edit2, Trash2, Swords, RefreshCw, 
  Check, Calendar, ShieldCheck 
} from 'lucide-react';
import { formatRupiah, getCategoryIcon } from '../utils/formatters';

export default function RecurringManagerModal({
  isOpen,
  onClose,
  recurringList,
  onOpenNewRecurring,
  onEditRecurring,
  onDeleteRecurring
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-wrap">
            <h3 className="modal-title">Kelola Misi Tagihan Rutin</h3>
            <span className="text-muted text-xs">Daftar pengeluaran rutin yang aktif setiap bulan</span>
          </div>
          <button className="btn-icon-subtle" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          <div className="manage-rec-header">
            <span className="text-muted text-xs font-semibold">
              TOTAL {recurringList.length} MISI TAGIHAN
            </span>
            {recurringList.length > 0 && (
              <button className="btn btn-sm btn-primary" onClick={onOpenNewRecurring}>
                <Plus size={14} />
                <span>Tambah Tagihan Baru</span>
              </button>
            )}
          </div>

          {recurringList.length === 0 ? (
            <div className="clean-empty-state">
              <RefreshCw size={28} className="text-muted" />
              <h4>Belum Ada Template Tagihan</h4>
              <p className="text-muted text-xs">Tambahkan tagihan bulanan seperti Wi-Fi, Kost, atau Listrik.</p>
              <button className="btn btn-sm btn-primary mt-2" onClick={onOpenNewRecurring}>
                <Plus size={14} />
                <span>Tambah Tagihan Baru</span>
              </button>
            </div>
          ) : (
            <div className="manage-rec-list">
              {recurringList.map(item => (
                <div key={item.id} className="manage-rec-row">
                  <div className="manage-rec-left">
                    <div className="manage-rec-info">
                      <span className="manage-rec-title">{item.title}</span>
                      <span className="manage-rec-sub">
                        Jatuh Tempo: <strong>Tgl {item.dueDay}</strong> • {item.category}
                      </span>
                    </div>
                  </div>

                  <div className="manage-rec-right">
                    <span className="manage-rec-amount">{formatRupiah(item.amount)}</span>

                    <div className="manage-rec-actions">
                      <button 
                        className="btn-icon-subtle" 
                        onClick={() => onEditRecurring(item)}
                        title="Edit Tagihan"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button 
                        className="btn-icon-subtle btn-delete" 
                        onClick={() => onDeleteRecurring(item)}
                        title="Hapus Tagihan"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
