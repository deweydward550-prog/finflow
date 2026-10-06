import { createClient } from '@supabase/supabase-js';
import { db, getCustomPaymentMethods, saveCustomPaymentMethods } from '../db/db';

const STORAGE_URL_KEY = 'finflow_supabase_url';
const STORAGE_KEY_KEY = 'finflow_supabase_anon_key';

export const DEFAULT_SUPABASE_URL = 'https://gblddnytkjpvsftxfyor.supabase.co';
export const DEFAULT_SUPABASE_KEY = 'sb_publishable_B8r2kpKpbtY29m8LVKlafw_JbTQ7A7O';

// Default / fallback credentials if configured in environment
const ENV_URL = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const ENV_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;

let supabaseInstance = null;
let currentUrl = '';
let currentKey = '';

// Get configured credentials
export function getSupabaseConfig() {
  const url = localStorage.getItem(STORAGE_URL_KEY) || ENV_URL || DEFAULT_SUPABASE_URL;
  const anonKey = localStorage.getItem(STORAGE_KEY_KEY) || ENV_KEY || DEFAULT_SUPABASE_KEY;
  return {
    url: (url || '').trim(),
    anonKey: (anonKey || '').trim(),
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
  return (data || []).map(t => {
    let targetPaymentMethod = null;
    let cleanNotes = (t.notes || '').trim();
    const toMatch = cleanNotes.match(/\[to:([^\]]+)\]/i);
    if (toMatch) {
      targetPaymentMethod = toMatch[1].trim();
      cleanNotes = cleanNotes.replace(/\[to:[^\]]*\]/gi, '').trim();
    }
    // Auto-infer for Tabungan Lily
    if (!targetPaymentMethod && (t.title?.toLowerCase().includes('tabungan lily') || cleanNotes.toLowerCase().includes('tabungan lily'))) {
      targetPaymentMethod = 'BCA';
    }

    return {
      id: t.id,
      title: t.title,
      amount: Number(t.amount),
      type: targetPaymentMethod ? 'transfer' : t.type,
      category: t.category,
      date: t.date,
      time: t.time || '',
      paymentMethod: t.payment_method || 'BSI',
      targetPaymentMethod: targetPaymentMethod || undefined,
      notes: cleanNotes,
      recurringId: t.recurring_id ? (isNaN(t.recurring_id) ? t.recurring_id : Number(t.recurring_id)) : null,
      source: t.source || 'manual',
      createdAt: t.created_at || new Date().toISOString()
    };
  });
}

export async function insertTransactionToSupabase(tx) {
  const client = getSupabase();
  if (!client) return null;

  let notes = tx.notes || '';
  if (tx.targetPaymentMethod) {
    if (!notes.includes(`[to:${tx.targetPaymentMethod}]`)) {
      notes = notes ? `${notes} [to:${tx.targetPaymentMethod}]` : `[to:${tx.targetPaymentMethod}]`;
    }
  }

  const payload = {
    id: tx.id || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title: tx.title,
    amount: tx.amount,
    type: tx.type || 'expense',
    category: tx.category,
    date: tx.date,
    time: tx.time || '',
    payment_method: tx.paymentMethod || 'BSI',
    notes: notes,
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

  let notes = tx.notes || '';
  if (tx.targetPaymentMethod) {
    if (!notes.includes(`[to:${tx.targetPaymentMethod}]`)) {
      notes = notes ? `${notes} [to:${tx.targetPaymentMethod}]` : `[to:${tx.targetPaymentMethod}]`;
    }
  }

  const payload = {
    title: tx.title,
    amount: tx.amount,
    type: tx.type,
    category: tx.category,
    date: tx.date,
    time: tx.time,
    payment_method: tx.paymentMethod,
    notes: notes,
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
// RECURRING EXPENSES METADATA HELPER (Icon, Color, & Target Account)
// =========================================================================
export function packRecurringNotes(notes = '', icon, color, targetPaymentMethod, isSavings) {
  let cleanNotes = (notes || '').replace(/\[meta:[^\]]*\]/gi, '').replace(/\[to:[^\]]*\]/gi, '').trim();
  const metaParts = [];
  if (icon) metaParts.push(`icon=${icon}`);
  if (color) metaParts.push(`color=${encodeURIComponent(color)}`);
  if (targetPaymentMethod) metaParts.push(`to=${encodeURIComponent(targetPaymentMethod)}`);
  if (isSavings) metaParts.push(`savings=1`);
  
  if (metaParts.length > 0) {
    const metaTag = `[meta:${metaParts.join(',')}]`;
    return cleanNotes ? `${cleanNotes} ${metaTag}` : metaTag;
  }
  return cleanNotes;
}

export function unpackRecurringNotes(rawNotes = '', title = '', category = '') {
  let notes = (rawNotes || '').trim();
  let icon = null;
  let color = null;
  let targetPaymentMethod = null;
  let isSavings = false;

  const metaMatch = notes.match(/\[meta:([^\]]+)\]/i);
  if (metaMatch) {
    const content = metaMatch[1];
    const pairs = content.split(',');
    pairs.forEach(pair => {
      const [k, v] = pair.split('=');
      if (k === 'icon' && v) icon = v.trim();
      if (k === 'color' && v) color = decodeURIComponent(v.trim());
      if (k === 'to' && v) targetPaymentMethod = decodeURIComponent(v.trim());
      if (k === 'savings' && (v === '1' || v === 'true')) isSavings = true;
    });
    notes = notes.replace(/\[meta:[^\]]*\]/gi, '').trim();
  }

  const toMatch = notes.match(/\[to:([^\]]+)\]/i);
  if (toMatch && !targetPaymentMethod) {
    targetPaymentMethod = toMatch[1].trim();
    isSavings = true;
    notes = notes.replace(/\[to:[^\]]*\]/gi, '').trim();
  }

  // Smart fallback inference for savings & target accounts
  const t = (title || '').toLowerCase();
  const c = (category || '').toLowerCase();
  if (!targetPaymentMethod) {
    if (t.includes('lily') || (t.includes('tabungan') && !t.includes('bsi'))) {
      targetPaymentMethod = 'BCA';
      isSavings = true;
    }
  }

  if (targetPaymentMethod) {
    isSavings = true;
  }

  // Smart fallback inference if icon / color missing
  if (!icon) {
    if (t.includes('bpjs') || t.includes('medis') || t.includes('dokter') || t.includes('obat') || c.includes('kesehatan')) {
      icon = 'HeartPulse';
    } else if (t.includes('wifi') || t.includes('internet') || t.includes('indihome') || t.includes('biznet') || t.includes('myrepublic') || t.includes('firstmedia')) {
      icon = 'Wifi';
    } else if (t.includes('pln') || t.includes('listrik') || t.includes('token') || t.includes('daya')) {
      icon = 'Zap';
    } else if (t.includes('pdam') || t.includes('air') || t.includes('water')) {
      icon = 'Droplets';
    } else if (t.includes('kost') || t.includes('rumah') || t.includes('kontrakan') || t.includes('ipl') || t.includes('sewa')) {
      icon = 'Home';
    } else if (t.includes('netflix') || t.includes('spotify') || t.includes('youtube') || t.includes('disney') || t.includes('prime') || t.includes('vidio') || c.includes('hiburan')) {
      icon = 'Tv';
    } else if (t.includes('asuransi') || t.includes('insurance') || t.includes('prudential') || t.includes('allianz') || t.includes('axa')) {
      icon = 'Shield';
    } else if (t.includes('gym') || t.includes('fitness') || t.includes('fitnes')) {
      icon = 'Dumbbell';
    } else if (t.includes('katering') || t.includes('makan') || t.includes('galon') || t.includes('beras') || c.includes('makanan')) {
      icon = 'Utensils';
    } else if (isSavings || t.includes('tabungan') || t.includes('cicilan') || t.includes('investasi') || t.includes('arisan') || t.includes('deposito') || t.includes('lily')) {
      icon = 'Wallet';
    } else {
      icon = 'Zap';
    }
  }

  if (!color) {
    switch (icon?.toLowerCase()) {
      case 'heartpulse':
        color = '#10B981';
        break;
      case 'wifi':
        color = '#3B82F6';
        break;
      case 'zap':
        color = '#F59E0B';
        break;
      case 'droplets':
        color = '#06B6D4';
        break;
      case 'home':
        color = '#8B5CF6';
        break;
      case 'tv':
        color = '#EC4899';
        break;
      case 'shield':
        color = '#3B82F6';
        break;
      case 'dumbbell':
        color = '#EF4444';
        break;
      case 'utensils':
        color = '#F59E0B';
        break;
      case 'wallet':
        color = '#10B981';
        break;
      default:
        color = isSavings ? '#10B981' : '#3B82F6';
        break;
    }
  }

  return { notes, icon, color, targetPaymentMethod, isSavings };
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

  return (data || []).map(r => {
    const { notes, icon, color, targetPaymentMethod, isSavings } = unpackRecurringNotes(r.notes, r.title, r.category);
    return {
      id: isNaN(r.id) ? r.id : Number(r.id),
      title: r.title,
      amount: Number(r.amount),
      category: r.category,
      paymentMethod: r.payment_method || 'BSI',
      targetPaymentMethod: targetPaymentMethod || undefined,
      isSavings: Boolean(isSavings || targetPaymentMethod),
      dueDay: Number(r.due_day),
      billingCycle: r.billing_cycle || 'monthly',
      notes: notes,
      active: r.active !== false,
      icon: r.icon || icon,
      color: r.color || color,
      createdAt: r.created_at || new Date().toISOString()
    };
  });
}

export async function insertRecurringToSupabase(rec) {
  const client = getSupabase();
  if (!client) return null;

  const packedNotes = packRecurringNotes(rec.notes, rec.icon, rec.color, rec.targetPaymentMethod, rec.isSavings);

  const payload = {
    id: rec.id ? String(rec.id) : `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    title: rec.title,
    amount: rec.amount,
    category: rec.category,
    payment_method: rec.paymentMethod || 'BSI',
    due_day: Number(rec.dueDay),
    billing_cycle: rec.billingCycle || 'monthly',
    notes: packedNotes,
    active: rec.active !== false,
    created_at: rec.createdAt || new Date().toISOString()
  };

  const { data, error } = await client.from('recurring_expenses').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateRecurringInSupabase(id, rec) {
  const client = getSupabase();
  if (!client) return null;

  const packedNotes = packRecurringNotes(rec.notes, rec.icon, rec.color, rec.targetPaymentMethod, rec.isSavings);

  const payload = {
    title: rec.title,
    amount: rec.amount,
    category: rec.category,
    payment_method: rec.paymentMethod,
    due_day: Number(rec.dueDay),
    billing_cycle: rec.billingCycle || 'monthly',
    notes: packedNotes,
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
      notes: packRecurringNotes(r.notes, r.icon, r.color),
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
