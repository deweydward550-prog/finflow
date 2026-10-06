import React from 'react';
import { 
  X, Plus, Edit2, Trash2, Swords, RefreshCw, 
  Check, Calendar, ShieldCheck 
} from 'lucide-react';
import { formatRupiah, getCategoryIcon, getCategoryColor } from '../utils/formatters';

export default function RecurringManagerModal({
  isOpen,
  onClose,
  recurringList = [],
  onOpenNewRecurring,
  onAddNew,
  onEditRecurring,
  onEdit,
  onDeleteRecurring,
  onDelete
}) {
  if (!isOpen) return null;

  const handleAddNew = onOpenNewRecurring || onAddNew;
  const handleEdit = onEditRecurring || onEdit;
  const handleDelete = onDeleteRecurring || onDelete;

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
              <button 
                type="button" 
                className="btn btn-sm btn-primary" 
                onClick={() => handleAddNew?.()}
              >
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
              <button 
                type="button" 
                className="btn btn-sm btn-primary mt-2" 
                onClick={() => handleAddNew?.()}
              >
                <Plus size={14} />
                <span>Tambah Tagihan Baru</span>
              </button>
            </div>
          ) : (
            <div className="manage-rec-list">
              {recurringList.map(item => {
                const badgeColor = item.color || getCategoryColor(item.icon || item.title || item.category);
                return (
                  <div key={item.id} className="manage-rec-row">
                    <div className="manage-rec-left">
                      <div 
                        className="manage-rec-icon"
                        style={{
                          background: `${badgeColor}18`,
                          color: badgeColor,
                          borderColor: `${badgeColor}35`
                        }}
                      >
                        {getCategoryIcon(item.icon || item.category, 16)}
                      </div>
                      <div className="manage-rec-info">
                        <div className="flex items-center gap-1">
                          <span className="manage-rec-title">{item.title}</span>
                          {(item.targetPaymentMethod || item.isSavings) && (
                            <span className="badge badge-success text-2xs py-0 px-1 font-medium">Tabungan</span>
                          )}
                        </div>
                        <span className="manage-rec-sub">
                          Jatuh Tempo: <strong>Tgl {item.dueDay}</strong>
                          {(item.targetPaymentMethod || item.isSavings) ? (
                            <> • <strong className="text-inc">{item.paymentMethod || 'BSI'} ➔ {item.targetPaymentMethod || 'BCA'}</strong></>
                          ) : (
                            <> • {item.paymentMethod || 'BSI'} • {item.category}</>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="manage-rec-right">
                      <span className="manage-rec-amount">{formatRupiah(item.amount)}</span>

                      <div className="manage-rec-actions">
                        <button 
                          type="button"
                          className="btn-icon-subtle" 
                          onClick={() => handleEdit?.(item)}
                          title="Edit Tagihan"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button 
                          type="button"
                          className="btn-icon-subtle btn-delete" 
                          onClick={() => handleDelete?.(item)}
                          title="Hapus Tagihan"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
