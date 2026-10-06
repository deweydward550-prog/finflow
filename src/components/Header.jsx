import React from 'react';
import { 
  ChevronLeft, ChevronRight, Moon, Sun, 
  Settings, Plus, Zap, Swords
} from 'lucide-react';
import { formatMonthYear } from '../utils/formatters';

export default function Header({
  selectedMonthYear,
  setSelectedMonthYear,
  theme,
  toggleTheme,
  isSupabaseConnected = false,
  onOpenSettings,
  onOpenNewTransaction,
  onOpenManageRecurring
}) {
  const now = new Date();
  const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentOrFuture = selectedMonthYear >= currentMonthYear;

  const handlePrevMonth = () => {
    const [year, month] = selectedMonthYear.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    setSelectedMonthYear(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    if (isCurrentOrFuture) return;
    const [year, month] = selectedMonthYear.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const newMonthYear = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    
    // Only allow navigating up to the current month
    if (newMonthYear <= currentMonthYear) {
      setSelectedMonthYear(newMonthYear);
    }
  };

  const handleCurrentMonth = () => {
    setSelectedMonthYear(currentMonthYear);
  };

  return (
    <header className="zen-header">
      <div className="zen-top-bar">
        {/* Brand with Supabase Realtime Badge */}
        <div className="zen-brand">
          <span className="zen-brand-title">FinFlow</span>
          <div 
            className={`zen-cloud-sync-badge ${isSupabaseConnected ? 'active' : 'offline'}`}
            title={isSupabaseConnected ? "⚡ Supabase Realtime Aktif (Multi-Device Otomatis)" : "Supabase Belum Diatur (Klik untuk Menghubungkan)"}
            onClick={onOpenSettings}
            style={{ cursor: 'pointer' }}
          >
            <Zap size={11} className={isSupabaseConnected ? 'cloud-pulse' : ''} />
            <span className="zen-cloud-text">{isSupabaseConnected ? 'Realtime' : 'Setup Cloud'}</span>
          </div>
        </div>

        {/* Month Selector */}
        <div className="zen-month-nav">
          <button className="zen-nav-arrow" onClick={handlePrevMonth} title="Bulan Lalu" aria-label="Bulan Lalu">
            <ChevronLeft size={16} />
          </button>
          
          <span 
            className="zen-month-text" 
            onClick={handleCurrentMonth} 
            title={selectedMonthYear !== currentMonthYear ? "Klik untuk kembali ke bulan ini" : "Bulan saat ini"}
          >
            {formatMonthYear(selectedMonthYear)}
          </span>

          <button 
            className={`zen-nav-arrow ${isCurrentOrFuture ? 'disabled' : ''}`} 
            onClick={handleNextMonth} 
            disabled={isCurrentOrFuture}
            title={isCurrentOrFuture ? "Tidak dapat berpindah ke bulan masa depan" : "Bulan Berikutnya"}
            aria-label="Bulan Berikutnya"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Action buttons */}
        <div className="zen-actions">
          <button 
            className="header-tagihan-btn" 
            onClick={onOpenManageRecurring} 
            title="Kelola Daftar Tagihan Rutin Bulanan"
            aria-label="Daftar Tagihan"
          >
            <Swords size={14} className="text-warning" />
            <span className="header-btn-text">Tagihan</span>
          </button>
          <button className="zen-icon-btn" onClick={toggleTheme} title="Ganti Tema" aria-label="Ganti Tema">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="zen-icon-btn" onClick={onOpenSettings} title="Pengaturan & Database Cloud" aria-label="Pengaturan">
            <Settings size={17} />
          </button>
          <button 
            className="zen-btn-add" 
            onClick={onOpenNewTransaction} 
            title="Catat Transaksi Baru (Pemasukan / Pengeluaran)"
          >
            <Plus size={15} />
            <span>Catat</span>
          </button>
        </div>
      </div>
    </header>
  );
}
