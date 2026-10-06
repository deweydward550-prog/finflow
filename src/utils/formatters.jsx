import React from 'react';
import { 
  Utensils, Car, Zap, ShoppingBag, Tv, HeartPulse, Home, 
  GraduationCap, HeartHandshake, MoreHorizontal, Briefcase, 
  Laptop, TrendingUp, Gift, Wallet, Banknote, CreditCard, 
  Smartphone, Wifi, Coffee, Film, Droplets, Dumbbell, Shield
} from 'lucide-react';

// Format number to Indonesian Rupiah
export function formatRupiah(amount, withPrefix = true) {
  if (amount === undefined || amount === null || isNaN(amount)) return withPrefix ? 'Rp 0' : '0';
  const formatted = Math.abs(amount).toLocaleString('id-ID');
  return withPrefix ? `Rp ${formatted}` : formatted;
}

// Format raw digits string to Indonesian thousand dots e.g. "8500000" -> "8.500.000"
export function formatAmountInput(val) {
  if (val === undefined || val === null || val === '') return '';
  const clean = String(val).replace(/\D/g, '');
  if (!clean) return '';
  return Number(clean).toLocaleString('id-ID');
}

// Parse string with dots back to numeric integer e.g. "8.500.000" -> 8500000
export function parseAmountInput(val) {
  if (val === undefined || val === null || val === '') return 0;
  const clean = String(val).replace(/\D/g, '');
  return parseInt(clean, 10) || 0;
}

// Compact currency (e.g. 1.5jt, 500rb)
export function formatRupiahCompact(amount) {
  if (!amount || isNaN(amount)) return 'Rp 0';
  if (amount >= 1000000000) {
    return `Rp ${(amount / 1000000000).toFixed(1).replace('.0', '')} M`;
  }
  if (amount >= 1000000) {
    return `Rp ${(amount / 1000000).toFixed(1).replace('.0', '')} jt`;
  }
  if (amount >= 1000) {
    return `Rp ${(amount / 1000).toFixed(0)} rb`;
  }
  return `Rp ${amount}`;
}

// Format Date to Indonesian
export function formatDateID(dateStr, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!dateStr) return '';
  const date = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  return new Intl.DateTimeFormat('id-ID', options).format(date);
}

// Get Month Year string formatted e.g. "Oktober 2026"
export function formatMonthYear(monthYearStr) {
  if (!monthYearStr) return '';
  const [year, month] = monthYearStr.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(date);
}

// Get relative day label: "Hari Ini", "Kemarin", etc.
export function getRelativeDayLabel(dateStr) {
  const today = new Date();
  const target = new Date(dateStr + 'T00:00:00');
  
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const targetDateOnly = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  
  const diffTime = todayDateOnly.getTime() - targetDateOnly.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hari Ini';
  if (diffDays === 1) return 'Kemarin';
  if (diffDays === -1) return 'Besok';
  
  return formatDateID(dateStr, { weekday: 'long', day: 'numeric', month: 'short' });
}

// Get Status & Due Info for Recurring Expense
export function getRecurringDueInfo(dueDay, isPaid, selectedMonthYear) {
  if (isPaid) {
    return {
      status: 'paid',
      label: 'Lunas',
      badgeClass: 'badge-success',
      color: '#10B981',
      daysDiff: 0
    };
  }

  const now = new Date();
  const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // If viewing a past month and still not paid
  if (selectedMonthYear < currentMonthYear) {
    return {
      status: 'overdue',
      label: 'Tertunggak',
      badgeClass: 'badge-danger',
      color: '#EF4444',
      daysDiff: -999
    };
  }

  // If viewing a future month
  if (selectedMonthYear > currentMonthYear) {
    return {
      status: 'upcoming',
      label: `Tgl ${dueDay}`,
      badgeClass: 'badge-neutral',
      color: '#6B7280',
      daysDiff: 999
    };
  }

  // Current month calculation
  const currentDay = now.getDate();
  const daysDiff = dueDay - currentDay;

  if (daysDiff < 0) {
    return {
      status: 'overdue',
      label: `Lewat ${Math.abs(daysDiff)} hari`,
      badgeClass: 'badge-danger',
      color: '#EF4444',
      daysDiff
    };
  }
  if (daysDiff === 0) {
    return {
      status: 'today',
      label: 'Jatuh Tempo Hari Ini!',
      badgeClass: 'badge-warning',
      color: '#F59E0B',
      daysDiff: 0
    };
  }
  if (daysDiff <= 3) {
    return {
      status: 'soon',
      label: `${daysDiff} hari lagi`,
      badgeClass: 'badge-warning',
      color: '#F59E0B',
      daysDiff
    };
  }

  return {
    status: 'upcoming',
    label: `Tgl ${dueDay}`,
    badgeClass: 'badge-info',
    color: '#3B82F6',
    daysDiff
  };
}

// Icon mapper for categories and recurring items using React.createElement
export function getCategoryIcon(iconName, size = 18, className = '') {
  const iconProps = { size, className };
  switch (iconName?.toLowerCase()) {
    case 'utensils':
    case 'makanan':
    case 'makanan & minuman':
    case 'food':
      return React.createElement(Utensils, iconProps);
    case 'car':
    case 'transportasi':
    case 'transportasi & bensin':
    case 'transport':
      return React.createElement(Car, iconProps);
    case 'zap':
    case 'tagihan':
    case 'tagihan & utilitas':
    case 'listrik':
      return React.createElement(Zap, iconProps);
    case 'shoppingbag':
    case 'belanja':
    case 'belanja kebutuhan':
      return React.createElement(ShoppingBag, iconProps);
    case 'tv':
    case 'hiburan':
    case 'hiburan & langganan':
    case 'netflix':
      return React.createElement(Tv, iconProps);
    case 'heartpulse':
    case 'kesehatan':
    case 'kesehatan & medis':
    case 'bpjs':
      return React.createElement(HeartPulse, iconProps);
    case 'home':
    case 'kost':
    case 'kost / rumah':
    case 'rumah':
      return React.createElement(Home, iconProps);
    case 'graduationcap':
    case 'pendidikan':
    case 'pendidikan & buku':
      return React.createElement(GraduationCap, iconProps);
    case 'hearthandshake':
    case 'keluarga':
    case 'keluarga & sedekah':
      return React.createElement(HeartHandshake, iconProps);
    case 'briefcase':
    case 'gaji':
    case 'gaji utama':
      return React.createElement(Briefcase, iconProps);
    case 'laptop':
    case 'freelance':
    case 'freelance & side job':
      return React.createElement(Laptop, iconProps);
    case 'trendingup':
    case 'investasi':
    case 'dividen & investasi':
      return React.createElement(TrendingUp, iconProps);
    case 'gift':
    case 'bonus':
    case 'bonus / thr':
      return React.createElement(Gift, iconProps);
    case 'wifi':
    case 'internet':
      return React.createElement(Wifi, iconProps);
    case 'coffee':
      return React.createElement(Coffee, iconProps);
    case 'film':
      return React.createElement(Film, iconProps);
    case 'droplets':
    case 'air':
      return React.createElement(Droplets, iconProps);
    case 'dumbbell':
    case 'gym':
      return React.createElement(Dumbbell, iconProps);
    case 'shield':
    case 'asuransi':
      return React.createElement(Shield, iconProps);
    case 'banknote':
    case 'cash':
    case 'tunai':
    case 'tunai (cash)':
      return React.createElement(Banknote, iconProps);
    case 'creditcard':
    case 'bank':
      return React.createElement(CreditCard, iconProps);
    case 'smartphone':
    case 'ewallet':
      return React.createElement(Smartphone, iconProps);
    case 'wallet':
    case 'tabungan':
    case 'cicilan':
      return React.createElement(Wallet, iconProps);
    default:
      return React.createElement(Wallet, iconProps);
  }
}

// Get vibrant accent color for a category, icon name, or recurring title
export function getCategoryColor(nameOrCategory, defaultColor = '#3B82F6') {
  if (!nameOrCategory) return defaultColor;
  const key = String(nameOrCategory).toLowerCase();
  if (key.includes('makan') || key.includes('food') || key.includes('utensils') || key.includes('kuliner') || key.includes('katering')) return '#F59E0B';
  if (key.includes('trans') || key.includes('bensin') || key.includes('car') || key.includes('motor') || key.includes('ojol')) return '#3B82F6';
  if (key.includes('tagihan') || key.includes('utilitas') || key.includes('listrik') || key.includes('pln') || key.includes('zap')) return '#F59E0B';
  if (key.includes('belanja') || key.includes('shopping')) return '#8B5CF6';
  if (key.includes('hiburan') || key.includes('nonton') || key.includes('netflix') || key.includes('spotify') || key.includes('tv') || key.includes('game')) return '#EC4899';
  if (key.includes('kesehatan') || key.includes('medis') || key.includes('bpjs') || key.includes('dokter') || key.includes('obat') || key.includes('heartpulse')) return '#10B981';
  if (key.includes('rumah') || key.includes('kost') || key.includes('kontrakan') || key.includes('home') || key.includes('ipl')) return '#6366F1';
  if (key.includes('pendidikan') || key.includes('buku') || key.includes('kursus') || key.includes('kuliah') || key.includes('graduationcap')) return '#06B6D4';
  if (key.includes('keluarga') || key.includes('sedekah') || key.includes('zakat') || key.includes('infaq') || key.includes('hearthandshake')) return '#14B8A6';
  if (key.includes('gaji') || key.includes('salary') || key.includes('briefcase')) return '#10B981';
  if (key.includes('freelance') || key.includes('proyek') || key.includes('laptop')) return '#3B82F6';
  if (key.includes('investasi') || key.includes('dividen') || key.includes('saham') || key.includes('reksadana') || key.includes('trendingup')) return '#8B5CF6';
  if (key.includes('bonus') || key.includes('thr') || key.includes('hadiah') || key.includes('gift')) return '#F59E0B';
  if (key.includes('tabungan') || key.includes('lily') || key.includes('wallet') || key.includes('cicilan') || key.includes('arisan')) return '#10B981';
  if (key.includes('air') || key.includes('pdam') || key.includes('droplets')) return '#06B6D4';
  if (key.includes('wifi') || key.includes('internet') || key.includes('indihome') || key.includes('biznet')) return '#3B82F6';
  if (key.includes('gym') || key.includes('fitness') || key.includes('fitnes') || key.includes('dumbbell')) return '#EF4444';
  if (key.includes('asuransi') || key.includes('shield')) return '#3B82F6';
  return defaultColor;
}

