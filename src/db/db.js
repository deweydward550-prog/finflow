import Dexie from 'dexie';

export const db = new Dexie('FinFlowDB');

db.version(1).stores({
  transactions: '++id, title, amount, type, category, date, paymentMethod, recurringId, createdAt',
  recurringExpenses: '++id, title, amount, category, dueDay, billingCycle, active, createdAt',
  recurringPayments: '++id, recurringId, monthYear, paidDate, transactionId',
  budgets: '++id, &monthYear',
  settings: 'key'
});

export const DEFAULT_CATEGORIES = [
  { id: 'makanan', name: 'Makanan & Minuman', icon: 'Utensils', color: '#F59E0B', type: 'expense' },
  { id: 'transportasi', name: 'Transportasi & Bensin', icon: 'Car', color: '#3B82F6', type: 'expense' },
  { id: 'tagihan', name: 'Tagihan & Utilitas', icon: 'Zap', color: '#EF4444', type: 'expense' },
  { id: 'belanja', name: 'Belanja Kebutuhan', icon: 'ShoppingBag', color: '#8B5CF6', type: 'expense' },
  { id: 'hiburan', name: 'Hiburan & Langganan', icon: 'Tv', color: '#EC4899', type: 'expense' },
  { id: 'kesehatan', name: 'Kesehatan & Medis', icon: 'HeartPulse', color: '#10B981', type: 'expense' },
  { id: 'tempat_tinggal', name: 'Kost / Rumah', icon: 'Home', color: '#6366F1', type: 'expense' },
  { id: 'pendidikan', name: 'Pendidikan & Buku', icon: 'GraduationCap', color: '#06B6D4', type: 'expense' },
  { id: 'keluarga', name: 'Keluarga & Sedekah', icon: 'HeartHandshake', color: '#14B8A6', type: 'expense' },
  { id: 'lainnya', name: 'Pengeluaran Lainnya', icon: 'MoreHorizontal', color: '#6B7280', type: 'expense' },
  // Income
  { id: 'gaji', name: 'Gaji Utama', icon: 'Briefcase', color: '#10B981', type: 'income' },
  { id: 'freelance', name: 'Freelance & Side Job', icon: 'Laptop', color: '#3B82F6', type: 'income' },
  { id: 'investasi', name: 'Dividen & Investasi', icon: 'TrendingUp', color: '#8B5CF6', type: 'income' },
  { id: 'bonus', name: 'Bonus / THR', icon: 'Gift', color: '#F59E0B', type: 'income' },
  { id: 'pemasukan_lain', name: 'Pemasukan Lainnya', icon: 'Wallet', color: '#059669', type: 'income' },
];

export const DEFAULT_PAYMENT_METHODS = [
  { id: 'bca', name: 'BCA', icon: 'CreditCard', color: '#0060AF', isPrimary: true },
  { id: 'bni', name: 'BNI', icon: 'CreditCard', color: '#F15A24', isPrimary: false },
  { id: 'seabank', name: 'SeaBank', icon: 'CreditCard', color: '#0060AF', isPrimary: false },
  { id: 'bsi', name: 'BSI', icon: 'CreditCard', color: '#0060AF', isPrimary: false },
];

export function getCustomPaymentMethods() {
  try {
    const raw = localStorage.getItem('finflow_payment_methods');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure at least one account is marked isPrimary
        const hasPrimary = parsed.some(m => m.isPrimary);
        if (!hasPrimary) {
          parsed[0].isPrimary = true;
          localStorage.setItem('finflow_payment_methods', JSON.stringify(parsed));
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading payment methods:', e);
  }
  return DEFAULT_PAYMENT_METHODS;
}

export function saveCustomPaymentMethods(methods) {
  // Ensure at least one method is primary
  let list = [...methods];
  if (!list.some(m => m.isPrimary) && list.length > 0) {
    list[0] = { ...list[0], isPrimary: true };
  }
  localStorage.setItem('finflow_payment_methods', JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('finflow_payment_methods_updated', { detail: list }));
}

export function getPrimaryPaymentMethod() {
  const methods = getCustomPaymentMethods();
  return methods.find(m => m.isPrimary) || methods[0] || null;
}

export function setPrimaryPaymentMethod(id) {
  const methods = getCustomPaymentMethods();
  const updated = methods.map(m => ({
    ...m,
    isPrimary: m.id === id
  }));
  saveCustomPaymentMethods(updated);
  return updated;
}

export const PAYMENT_METHODS = getCustomPaymentMethods();

// Helper to clean up duplicate recurring expenses if any
export async function cleanUniqueRecurring() {
  const all = await db.recurringExpenses.toArray();
  const seen = new Set();
  const toDelete = [];

  for (const item of all) {
    const key = item.title.trim().toLowerCase();
    if (seen.has(key)) {
      toDelete.push(item.id);
    } else {
      seen.add(key);
    }
  }

  if (toDelete.length > 0) {
    await db.recurringExpenses.bulkDelete(toDelete);
  }
}

// Clear all data completely (empty database)
export async function clearAllDatabaseData() {
  await db.transactions.clear();
  await db.recurringExpenses.clear();
  await db.recurringPayments.clear();
  await db.budgets.clear();
  localStorage.setItem('finflow_seeded', 'true');
}

// Helper to seed initial sample data if empty
export async function seedInitialDataIfEmpty(force = false) {
  if (!force && localStorage.getItem('finflow_seeded')) {
    return;
  }
  localStorage.setItem('finflow_seeded', 'true');
  
  await cleanUniqueRecurring();
  const transactionCount = await db.transactions.count();
  const recurringCount = await db.recurringExpenses.count();

  if (recurringCount === 0) {
    const defaultRecurring = [
      {
        title: 'Wi-Fi & Internet Rumah',
        amount: 375000,
        category: 'Tagihan & Utilitas',
        paymentMethod: 'BCA',
        dueDay: 5,
        billingCycle: 'monthly',
        notes: 'Tagihan Indihome / Oxygen',
        active: true,
        icon: 'Wifi',
        color: '#3B82F6',
        createdAt: new Date().toISOString()
      },
      {
        title: 'Sewa Kost / Hunian',
        amount: 1500000,
        category: 'Kost / Rumah',
        paymentMethod: 'BCA',
        dueDay: 1,
        billingCycle: 'monthly',
        notes: 'Bayar ke pemilik kost tanggal 1',
        active: true,
        icon: 'Home',
        color: '#6366F1',
        createdAt: new Date().toISOString()
      },
      {
        title: 'Langganan Netflix & Spotify',
        amount: 215000,
        category: 'Hiburan & Langganan',
        paymentMethod: 'GoPay',
        dueDay: 12,
        billingCycle: 'monthly',
        notes: 'Family plan auto debit',
        active: true,
        icon: 'Tv',
        color: '#EC4899',
        createdAt: new Date().toISOString()
      },
      {
        title: 'Listrik PLN Pasca / Token',
        amount: 250000,
        category: 'Tagihan & Utilitas',
        paymentMethod: 'DANA',
        dueDay: 15,
        billingCycle: 'monthly',
        notes: 'Estimasi pemakaian 1 bulan',
        active: true,
        icon: 'Zap',
        color: '#F59E0B',
        createdAt: new Date().toISOString()
      },
      {
        title: 'BPJS Kesehatan',
        amount: 100000,
        category: 'Kesehatan & Medis',
        paymentMethod: 'Mandiri',
        dueDay: 10,
        billingCycle: 'monthly',
        notes: 'Iuran kelas 1',
        active: true,
        icon: 'HeartPulse',
        color: '#10B981',
        createdAt: new Date().toISOString()
      }
    ];

    await db.recurringExpenses.bulkAdd(defaultRecurring);
  }

  if (transactionCount === 0) {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    // Create sample transactions for this month
    const sampleTransactions = [
      {
        title: 'Gaji Bulanan',
        amount: 8500000,
        type: 'income',
        category: 'Gaji Utama',
        date: `${currentYear}-${currentMonth}-01`,
        time: '08:30',
        paymentMethod: 'BCA',
        notes: 'Gaji pokok + tunjangan',
        createdAt: new Date(`${currentYear}-${currentMonth}-01T08:30:00`).toISOString()
      },
      {
        title: 'Sewa Kost / Hunian',
        amount: 1500000,
        type: 'expense',
        category: 'Kost / Rumah',
        date: `${currentYear}-${currentMonth}-01`,
        time: '09:15',
        paymentMethod: 'BCA',
        notes: 'Bayar ke pemilik kost tanggal 1',
        recurringId: 2,
        createdAt: new Date(`${currentYear}-${currentMonth}-01T09:15:00`).toISOString()
      },
      {
        title: 'Belanja Mingguan Supermarket',
        amount: 320000,
        type: 'expense',
        category: 'Belanja Kebutuhan',
        date: `${currentYear}-${currentMonth}-02`,
        time: '14:20',
        paymentMethod: 'GoPay',
        notes: 'Sayur, beras, telur, sabun',
        createdAt: new Date(`${currentYear}-${currentMonth}-02T14:20:00`).toISOString()
      },
      {
        title: 'Makan Siang Nasi Padang',
        amount: 35000,
        type: 'expense',
        category: 'Makanan & Minuman',
        date: `${currentYear}-${currentMonth}-${day}`,
        time: '12:30',
        paymentMethod: 'Tunai (Cash)',
        notes: 'Rendang + es teh manis',
        createdAt: new Date().toISOString()
      },
      {
        title: 'Isi Bensin Pertamax',
        amount: 50000,
        type: 'expense',
        category: 'Transportasi & Bensin',
        date: `${currentYear}-${currentMonth}-${day}`,
        time: '08:10',
        paymentMethod: 'ShopeePay',
        notes: 'Full tank motor',
        createdAt: new Date().toISOString()
      },
      {
        title: 'Kopi & Snack Sore',
        amount: 28000,
        type: 'expense',
        category: 'Makanan & Minuman',
        date: `${currentYear}-${currentMonth}-${day}`,
        time: '16:00',
        paymentMethod: 'GoPay',
        notes: 'Iced Americano',
        createdAt: new Date().toISOString()
      }
    ];

    await db.transactions.bulkAdd(sampleTransactions);

    // Also mark Kost as paid in recurringPayments for current month
    const monthYear = `${currentYear}-${currentMonth}`;
    await db.recurringPayments.add({
      recurringId: 2,
      monthYear: monthYear,
      paidDate: `${currentYear}-${currentMonth}-01`,
      transactionId: 2
    });

    // Default monthly budget
    await db.budgets.put({
      monthYear: monthYear,
      totalBudget: 4500000,
      createdAt: new Date().toISOString()
    });
  }
}

// Mark recurring expense as paid: logs transaction & updates recurringPayments
export async function markRecurringExpensePaid({ recurring, monthYear, paidDate, paymentMethod }) {
  const transactionId = await db.transactions.add({
    title: recurring.title,
    amount: recurring.amount,
    type: 'expense',
    category: recurring.category,
    date: paidDate,
    time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    paymentMethod: paymentMethod || recurring.paymentMethod,
    notes: `Pembayaran Rutin Bulanan (${recurring.title})`,
    recurringId: recurring.id,
    createdAt: new Date().toISOString()
  });

  await db.recurringPayments.add({
    recurringId: recurring.id,
    monthYear: monthYear,
    paidDate: paidDate,
    transactionId: transactionId
  });

  return transactionId;
}

// Unmark payment for a month
export async function unmarkRecurringExpensePaid(recurringId, monthYear) {
  const payment = await db.recurringPayments
    .where({ recurringId: Number(recurringId), monthYear: monthYear })
    .first();

  if (payment) {
    if (payment.transactionId) {
      await db.transactions.delete(payment.transactionId);
    }
    await db.recurringPayments.delete(payment.id);
  }
}

// Export database to JSON string
export async function exportDatabaseToJson() {
  const transactions = await db.transactions.toArray();
  const recurringExpenses = await db.recurringExpenses.toArray();
  const recurringPayments = await db.recurringPayments.toArray();
  const budgets = await db.budgets.toArray();
  const settings = await db.settings.toArray();

  const data = {
    version: 1,
    exportDate: new Date().toISOString(),
    appName: 'FinFlow',
    data: {
      transactions,
      recurringExpenses,
      recurringPayments,
      budgets,
      settings
    }
  };

  return JSON.stringify(data, null, 2);
}

// Import database from JSON string
export async function importDatabaseFromJson(jsonString) {
  const parsed = JSON.parse(jsonString);
  if (!parsed.data) throw new Error('Format file backup tidak valid');

  await db.transaction('rw', db.transactions, db.recurringExpenses, db.recurringPayments, db.budgets, db.settings, async () => {
    if (parsed.data.transactions) {
      await db.transactions.clear();
      await db.transactions.bulkAdd(parsed.data.transactions);
    }
    if (parsed.data.recurringExpenses) {
      await db.recurringExpenses.clear();
      await db.recurringExpenses.bulkAdd(parsed.data.recurringExpenses);
    }
    if (parsed.data.recurringPayments) {
      await db.recurringPayments.clear();
      await db.recurringPayments.bulkAdd(parsed.data.recurringPayments);
    }
    if (parsed.data.budgets) {
      await db.budgets.clear();
      await db.budgets.bulkAdd(parsed.data.budgets);
    }
    if (parsed.data.settings) {
      await db.settings.clear();
      await db.settings.bulkAdd(parsed.data.settings);
    }
  });
}

// Reset database to default sample
export async function resetDatabaseToSample() {
  await db.transactions.clear();
  await db.recurringExpenses.clear();
  await db.recurringPayments.clear();
  await db.budgets.clear();
  localStorage.removeItem('finflow_seeded');
  await seedInitialDataIfEmpty(true);
}
