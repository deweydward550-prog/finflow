import React from 'react';
import { CalendarDays, RefreshCw, Plus } from 'lucide-react';

export default function MobileBottomNav({
  activeTab,
  setActiveTab,
  onOpenNewTransaction,
  stats
}) {
  return (
    <nav className="mobile-bottom-nav">
      <div className="bottom-nav-inner two-tabs">
        {/* Tab 1: Harian */}
        <button 
          className={`bottom-nav-item ${activeTab === 'daily' ? 'active' : ''}`}
          onClick={() => setActiveTab('daily')}
          aria-label="Pengeluaran Harian"
        >
          <div className="nav-icon-wrapper">
            <CalendarDays size={20} />
            {stats?.dailyCount > 0 && (
              <span className="bottom-nav-badge">{stats.dailyCount}</span>
            )}
          </div>
          <span className="nav-label">Harian</span>
        </button>

        {/* Center Floating Action Button (FAB) */}
        <div className="bottom-fab-wrapper">
          <button 
            className="bottom-fab-btn"
            onClick={onOpenNewTransaction}
            aria-label="Catat Transaksi"
            title="Catat Transaksi Baru"
          >
            <Plus size={22} />
          </button>
        </div>

        {/* Tab 2: Rutin Bulanan */}
        <button 
          className={`bottom-nav-item ${activeTab === 'recurring' ? 'active' : ''}`}
          onClick={() => setActiveTab('recurring')}
          aria-label="Tagihan Rutin"
        >
          <div className="nav-icon-wrapper">
            <RefreshCw size={20} />
            {stats?.unpaidRecurringCount > 0 ? (
              <span className="bottom-nav-badge badge-warn">{stats.unpaidRecurringCount}</span>
            ) : null}
          </div>
          <span className="nav-label">Tagihan Rutin</span>
        </button>
      </div>
    </nav>
  );
}
