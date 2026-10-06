import { createClient } from '@supabase/supabase-js';
import { db, getCustomPaymentMethods, saveCustomPaymentMethods } from '../db/db';

const STORAGE_URL_KEY = 'finflow_supabase_url';
const STORAGE_KEY_KEY = 'finflow_supabase_anon_key';

// Default / fallback credentials if configured in environment
const ENV_URL = import.meta.env.VITE_SUPABASE_URL || '';
const ENV_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabaseInstance = null;
let currentUrl = '';
let currentKey = '';

// Get configured credentials
export function getSupabaseConfig() {
  const url = localStorage.getItem(STORAGE_URL_KEY) || ENV_URL;
  const anonKey = localStorage.getItem(STORAGE_KEY_KEY) || ENV_KEY;
  return {
    url: url.trim(),
    anonKey: anonKey.trim(),
    isConfigured: Boolean(url && anonKey)
  };
}

// Save credentials
export function saveSupabaseConfig({ url, anonKey }) {
  if (url && url.trim()) {
    localStorage.setItem(STORAGE_URL_KEY, url.trim().replace(/\/+$/, ''));
  } else {
    localStorage.removeItem(STORAGE_URL_KEY);
  }

  if (anonKey && anonKey.trim()) {
    localStorage.setItem(STORAGE_KEY_KEY, anonKey.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_KEY);
  }

  supabaseInstance = null;
  window.dispatchEvent(new CustomEvent('finflow_supabase_config_updated'));
}

// Initialize Supabase Client
export function getSupabase() {
  const { url, anonKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;

  if (!supabaseInstance || currentUrl !== url || currentKey !== anonKey) {
    currentUrl = url;
    currentKey = anonKey;
    supabaseInstance = createClient(url, anonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
  }

  return supabaseInstance;
}

// Test connection
export async function testSupabaseConnection(customUrl, customKey) {
  const url = customUrl || getSupabaseConfig().url;
  const anonKey = customKey || getSupabaseConfig().anonKey;

  if (!url || !anonKey) {
    throw new Error('Supabase URL dan Anon Key belum diisi.');
  }

  const client = createClient(url, anonKey);
  const { data, error } = await client.from('transactions').select('id').limit(1);

  if (error) {
    // If table doesn't exist yet, message is specific
    if (error.code === '42P01') {
      throw new Error('Tabel "transactions" belum dibuat di Supabase. Jalankan skrip SQL di menu SQL Editor Supabase terlebih dahulu.');
    }
    throw new Error(error.message || 'Gagal terhubung ke Supabase');
  }

  return { success: true, count: data ? data.length : 0 };
}

// =========================================================================
// REALTIME SUBSCRIPTION (Broadcast across all devices)
// =========================================================================
export function subscribeToRealtime(onDataChanged) {
  const client = getSupabase();
  if (!client) return () => {};

  const channel = client
    .channel('finflow-realtime-all')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
      onDataChanged?.({ table: 'transactions' });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_expenses' }, () => {
      onDataChanged?.({ table: 'recurring_expenses' });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_payments' }, () => {
      onDataChanged?.({ table: 'recurring_payments' });
    })
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

// =========================================================================
// TRANSACTIONS CRUD
// =========================================================================
export async function fetchTransactionsFromSupabase() {
  const client = getSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from('transactions')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    console.warn('[Supabase] Failed to fetch transactions:', error.message);
    return null;
  }

  // Normalize field names (snake_case to camelCase)
  return (data || []).map(t => ({
    id: t.id,
    title: t.title,
    amount: Number(t.amount),
    type: t.type,
    category: t.category,
    date: t.date,
    time: t.time || '',
    paymentMethod: t.payment_method || 'BSI',
    notes: t.notes || '',
    recurringId: t.recurring_id ? (isNaN(t.recurring_id) ? t.recurring_id : Number(t.recurring_id)) : null,
    source: t.source || 'manual',
    createdAt: t.created_at || new Date().toISOString()
  }));
}

export async function insertTransactionToSupabase(tx) {
  const client = getSupabase();
  if (!client) return null;

  const payload = {
    id: tx.id || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title: tx.title,
    amount: tx.amount,
    type: tx.type || 'expense',
    category: tx.category,
    date: tx.date,
    time: tx.time || '',
    payment_method: tx.paymentMethod || 'BSI',
    notes: tx.notes || '',
    recurring_id: tx.recurringId ? String(tx.recurringId) : null,
    source: tx.source || 'manual',
    created_at: tx.createdAt || new Date().toISOString()
  };

  const { data, error } = await client.from('transactions').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateTransactionInSupabase(id, tx) {
  const client = getSupabase();
  if (!client) return null;

  const payload = {
    title: tx.title,
    amount: tx.amount,
    type: tx.type,
    category: tx.category,
    date: tx.date,
    time: tx.time,
    payment_method: tx.paymentMethod,
    notes: tx.notes,
    recurring_id: tx.recurringId ? String(tx.recurringId) : null
  };

  const { error } = await client.from('transactions').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteTransactionFromSupabase(id) {
  const client = getSupabase();
  if (!client) return null;

  const { error } = await client.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

// =========================================================================
// RECURRING EXPENSES CRUD
// =========================================================================
export async function fetchRecurringFromSupabase() {
  const client = getSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from('recurring_expenses')
    .select('*')
    .order('due_day', { ascending: true });

  if (error) {
    console.warn('[Supabase] Failed to fetch recurring expenses:', error.message);
    return null;
  }

  return (data || []).map(r => ({
    id: isNaN(r.id) ? r.id : Number(r.id),
    title: r.title,
    amount: Number(r.amount),
    category: r.category,
    paymentMethod: r.payment_method || 'BSI',
    dueDay: Number(r.due_day),
    billingCycle: r.billing_cycle || 'monthly',
    notes: r.notes || '',
    active: r.active !== false,
    icon: r.icon || undefined,
    color: r.color || undefined,
    createdAt: r.created_at || new Date().toISOString()
  }));
}

export async function insertRecurringToSupabase(rec) {
  const client = getSupabase();
  if (!client) return null;

  const payload = {
    id: rec.id ? String(rec.id) : `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    title: rec.title,
    amount: rec.amount,
    category: rec.category,
    payment_method: rec.paymentMethod || 'BSI',
    due_day: Number(rec.dueDay),
    billing_cycle: rec.billingCycle || 'monthly',
    notes: rec.notes || '',
    active: rec.active !== false,
    created_at: new Date().toISOString()
  };

  const { data, error } = await client.from('recurring_expenses').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateRecurringInSupabase(id, rec) {
  const client = getSupabase();
  if (!client) return null;

  const payload = {
    title: rec.title,
    amount: rec.amount,
    category: rec.category,
    payment_method: rec.paymentMethod,
    due_day: Number(rec.dueDay),
    billing_cycle: rec.billingCycle || 'monthly',
    notes: rec.notes,
    active: rec.active !== false
  };

  const { error } = await client.from('recurring_expenses').update(payload).eq('id', String(id));
  if (error) throw error;
}

export async function deleteRecurringFromSupabase(id) {
  const client = getSupabase();
  if (!client) return null;

  const { error } = await client.from('recurring_expenses').delete().eq('id', String(id));
  if (error) throw error;
}

// =========================================================================
// RECURRING PAYMENTS CRUD
// =========================================================================
export async function fetchRecurringPaymentsFromSupabase() {
  const client = getSupabase();
  if (!client) return null;

  const { data, error } = await client.from('recurring_payments').select('*');
  if (error) {
    console.warn('[Supabase] Failed to fetch recurring payments:', error.message);
    return null;
  }

  return (data || []).map(p => ({
    id: isNaN(p.id) ? p.id : Number(p.id),
    recurringId: isNaN(p.recurring_id) ? p.recurring_id : Number(p.recurring_id),
    monthYear: p.month_year,
    paidDate: p.paid_date,
    transactionId: p.transaction_id
  }));
}

export async function insertRecurringPaymentToSupabase(payment) {
  const client = getSupabase();
  if (!client) return null;

  const payload = {
    id: `pmt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    recurring_id: String(payment.recurringId),
    month_year: payment.monthYear,
    paid_date: payment.paidDate,
    transaction_id: payment.transactionId ? String(payment.transactionId) : null,
    created_at: new Date().toISOString()
  };

  const { data, error } = await client.from('recurring_payments').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteRecurringPaymentFromSupabase(recurringId, monthYear) {
  const client = getSupabase();
  if (!client) return null;

  const { error } = await client
    .from('recurring_payments')
    .delete()
    .eq('recurring_id', String(recurringId))
    .eq('month_year', monthYear);

  if (error) throw error;
}

export async function deleteRecurringPaymentsByTxId(txId) {
  const client = getSupabase();
  if (!client) return null;

  const { error } = await client.from('recurring_payments').delete().eq('transaction_id', String(txId));
  if (error) throw error;
}

// =========================================================================
// 1-CLICK DATA MIGRATION: DEXIE -> SUPABASE
// =========================================================================
export async function migrateLocalDataToSupabase() {
  const client = getSupabase();
  if (!client) throw new Error('Supabase belum terhubung.');

  const localTxs = await db.transactions.toArray();
  const localRec = await db.recurringExpenses.toArray();
  const localPmts = await db.recurringPayments.toArray();

  let txUploaded = 0;
  let recUploaded = 0;

  // 1. Upload transactions
  if (localTxs.length > 0) {
    const txPayloads = localTxs.map(t => ({
      id: String(t.id),
      title: t.title,
      amount: t.amount,
      type: t.type || 'expense',
      category: t.category,
      date: t.date,
      time: t.time || '',
      payment_method: t.paymentMethod || 'BSI',
      notes: t.notes || '',
      recurring_id: t.recurringId ? String(t.recurringId) : null,
      source: t.source || 'manual',
      created_at: t.createdAt || new Date().toISOString()
    }));

    const { error: txErr } = await client.from('transactions').upsert(txPayloads, { onConflict: 'id' });
    if (txErr) throw txErr;
    txUploaded = txPayloads.length;
  }

  // 2. Upload recurring expenses
  if (localRec.length > 0) {
    const recPayloads = localRec.map(r => ({
      id: String(r.id),
      title: r.title,
      amount: r.amount,
      category: r.category,
      payment_method: r.paymentMethod || 'BSI',
      due_day: Number(r.dueDay),
      billing_cycle: r.billingCycle || 'monthly',
      notes: r.notes || '',
      active: r.active !== false,
      created_at: r.createdAt || new Date().toISOString()
    }));

    const { error: recErr } = await client.from('recurring_expenses').upsert(recPayloads, { onConflict: 'id' });
    if (recErr) throw recErr;
    recUploaded = recPayloads.length;
  }

  // 3. Upload recurring payments
  if (localPmts.length > 0) {
    const pmtPayloads = localPmts.map(p => ({
      id: String(p.id),
      recurring_id: String(p.recurringId),
      month_year: p.monthYear,
      paid_date: p.paidDate,
      transaction_id: p.transactionId ? String(p.transactionId) : null,
      created_at: new Date().toISOString()
    }));

    await client.from('recurring_payments').upsert(pmtPayloads, { onConflict: 'id' });
  }

  return { txUploaded, recUploaded };
}

// SQL Schema Generator for copy-paste
export const SUPABASE_SQL_SCHEMA = `-- ========================================================
-- FINFLOW SUPABASE DATABASE SCHEMA & REALTIME SETUP
-- Jalankan skrip ini di SQL Editor Supabase Anda
-- ========================================================

-- 1. Tabel Transaksi
create table if not exists public.transactions (
  id text primary key,
  title text not null,
  amount numeric not null,
  type text not null default 'expense',
  category text not null,
  date text not null,
  time text,
  payment_method text,
  notes text,
  recurring_id text,
  source text default 'manual',
  created_at timestamptz default now()
);

-- 2. Tabel Tagihan Rutin Bulanan
create table if not exists public.recurring_expenses (
  id text primary key,
  title text not null,
  amount numeric not null,
  category text not null,
  payment_method text,
  due_day integer not null,
  billing_cycle text default 'monthly',
  notes text,
  active boolean default true,
  created_at timestamptz default now()
);

-- 3. Tabel Riwayat Bayar Tagihan
create table if not exists public.recurring_payments (
  id text primary key,
  recurring_id text not null,
  month_year text not null,
  paid_date text not null,
  transaction_id text,
  created_at timestamptz default now()
);

-- 4. Buka Akses Publik / Anon (Read, Insert, Update, Delete)
alter table public.transactions enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.recurring_payments enable row level security;

create policy "Public Access Transactions" on public.transactions for all using (true) with check (true);
create policy "Public Access Recurring" on public.recurring_expenses for all using (true) with check (true);
create policy "Public Access Payments" on public.recurring_payments for all using (true) with check (true);

-- 5. Aktifkan Realtime Publication (Wajib untuk Sinkronisasi Instan Multi-Device)
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.recurring_expenses;
alter publication supabase_realtime add table public.recurring_payments;
`;
