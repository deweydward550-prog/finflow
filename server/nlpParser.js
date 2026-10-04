// FinFlow NLP Transaction Parser for WhatsApp Messages

const CATEGORY_KEYWORDS = {
  'Makanan & Minuman': [
    'naspad', 'nasi', 'makan', 'warteg', 'padang', 'soto', 'mie', 'bakso', 'ayam', 
    'bebek', 'kopi', 'coffee', 'kopsus', 'caffe', 'cafe', 'snack', 'roti', 'burger', 
    'pizza', 'gofood', 'grabfood', 'shopeefood', 'minum', 'es teh', 'jus', 'sarapan', 
    'lunch', 'dinner', 'jajan', 'martabak', 'gorengan', 'siomay', 'batagor', 'pecel',
    'seblak', 'cilok', 'cimol', 'boba', 'chatime', 'starbucks', 'angkringan', 'esteh',
    'lauk', 'sayur', 'pecel lele', 'ketoprak', 'sate', 'gudeg', 'rawon'
  ],
  'Transportasi & Bensin': [
    'bensin', 'pertamax', 'pertalite', 'solar', 'shell', 'spbu', 'ojol', 'gojek', 
    'goride', 'gocar', 'grab', 'grabride', 'grabcar', 'maxim', 'indrive', 'parkir', 
    'tol', 'e-toll', 'etoll', 'kereta', 'krl', 'mrt', 'lrt', 'busway', 'transjakarta', 
    'tj', 'tambal ban', 'cuci motor', 'cuci mobil', 'bengkel', 'servis', 'helm', 'oli'
  ],
  'Belanja Kebutuhan': [
    'belanja', 'supermarket', 'indomaret', 'alfamart', 'alfamidi', 'hypermart', 
    'superindo', 'pasar', 'sabun', 'shampoo', 'odol', 'deterjen', 'pewangi', 'beras', 
    'telur', 'minyak', 'sayur', 'buah', 'daging', 'shopee', 'tokopedia', 'lazada', 
    'tiktok shop', 'skincare', 'baju', 'kaos', 'celana', 'sepatu', 'sandal'
  ],
  'Tagihan & Utilitas': [
    'listrik', 'pln', 'token', 'wifi', 'indihome', 'myrepublic', 'biznet', 'firstmedia', 
    'pulsa', 'kuota', 'paket data', 'telkomsel', 'by.u', 'xl', 'indosat', 'tri', 
    'smartfren', 'pdam', 'air', 'bpjs', 'iuran'
  ],
  'Kost / Rumah': [
    'kost', 'kos', 'kosan', 'kontrakan', 'sewa', 'sewa rumah', 'uang sampah', 
    'iuran warga', 'renovasi', 'tukang', 'galon', 'gas lpg', 'gas', 'lpg', 'aqua'
  ],
  'Hiburan & Langganan': [
    'netflix', 'spotify', 'youtube', 'youtube premium', 'disney', 'prime', 'vidio', 
    'bioskop', 'cinema', 'xxi', 'cgv', 'tiket', 'steam', 'game', 'topup', 'diamond', 
    'mobile legends', 'mlbb', 'pubg', 'genshin', 'valorant', 'playstation', 'ps', 'konser'
  ],
  'Kesehatan & Medis': [
    'obat', 'apotek', 'k24', 'kimia farma', 'dokter', 'periksa', 'klinik', 'vitamin', 
    'rumah sakit', 'rs', 'paracetamol', 'flu', 'batuk', 'masker', 'panadol', 'salon', 
    'pijat', 'urut'
  ],
  'Pengeluaran Lainnya': [
    'cukur', 'potong rambut', 'barbershop', 'laundry', 'cuci baju', 'fotocopy', 
    'print', 'sedekah', 'infaq', 'zakat', 'donasi', 'tip', 'rokok', 'vape', 'liquid', 
    'biaya admin', 'admin'
  ]
};

const INCOME_KEYWORDS = [
  'gaji', 'salary', 'honor', 'fee', 'freelance', 'proyek', 'project', 
  'bonus', 'thr', 'dapat uang', 'terima uang', 'tf masuk', 'transfer masuk', 
  'pemasukan', 'income', 'cair', 'penjualan', 'hasil jualan', 'cashback', 'dividen'
];

export const KNOWN_ACCOUNT_ALIASES = {
  'sea': 'SeaBank',
  'seabank': 'SeaBank',
  'bca': 'BCA',
  'bni': 'BNI',
  'bri': 'BRI',
  'bsi': 'BSI',
  'mandiri': 'Mandiri',
  'jago': 'Bank Jago',
  'bank jago': 'Bank Jago',
  'jenius': 'Jenius',
  'btpn': 'Jenius',
  'dana': 'DANA',
  'gopay': 'GoPay',
  'ovo': 'OVO',
  'spay': 'ShopeePay',
  'shopeepay': 'ShopeePay',
  'linkaja': 'LinkAja',
  'cash': 'Tunai',
  'tunai': 'Tunai'
};

/**
 * Resolves account token into registered account or fallback to Primary Account
 */
export function resolvePaymentMethod(accountToken, availableAccounts = [], defaultPrimary = 'BCA') {
  if (!accountToken || !accountToken.trim()) {
    if (Array.isArray(availableAccounts) && availableAccounts.length > 0) {
      const primary = availableAccounts.find(a => a.isPrimary) || availableAccounts[0];
      if (primary && primary.name) return primary.name;
    }
    return defaultPrimary || 'BCA';
  }

  const token = accountToken.trim().toLowerCase();

  // 1. Exact match with user custom accounts
  if (Array.isArray(availableAccounts) && availableAccounts.length > 0) {
    const exact = availableAccounts.find(a => a.name.toLowerCase() === token);
    if (exact) return exact.name;
  }

  // 2. Check if token matches standard known alias (e.g. sea -> SeaBank, bsi -> BSI)
  if (KNOWN_ACCOUNT_ALIASES[token]) {
    const standardName = KNOWN_ACCOUNT_ALIASES[token];
    if (Array.isArray(availableAccounts) && availableAccounts.length > 0) {
      const matchInUser = availableAccounts.find(a => a.name.toLowerCase() === standardName.toLowerCase());
      if (matchInUser) return matchInUser.name;
    }
    return standardName;
  }

  // 3. Partial prefix match on user accounts
  if (Array.isArray(availableAccounts) && availableAccounts.length > 0 && token.length >= 2) {
    const partial = availableAccounts.find(a => 
      a.name.toLowerCase().startsWith(token) || 
      (a.name.length >= 3 && token.startsWith(a.name.toLowerCase()))
    );
    if (partial) return partial.name;
  }

  // 4. Default to uppercase
  return accountToken.toUpperCase();
}

/**
 * Parse an amount string into numeric integer (Rupiah)
 * Supports: 13000, 20.000, 25k, 25rb, 1.5jt, Rp 50.000
 */
export function parseAmount(str) {
  if (!str) return 0;
  let clean = str.trim().toLowerCase();

  // Remove currency prefix
  clean = clean.replace(/^(rp\.?|idr)\s*/i, '');

  // Handle 'jt' or 'juta' (e.g. 1.5jt, 2juta)
  const jtMatch = clean.match(/^([\d.,]+)\s*(jt|juta)$/);
  if (jtMatch) {
    const val = parseFloat(jtMatch[1].replace(/\./g, '').replace(',', '.'));
    return Math.round(val * 1000000);
  }

  // Handle 'k', 'rb', 'ribu' (e.g. 25k, 25rb, 25 ribu)
  const kMatch = clean.match(/^([\d.,]+)\s*(k|rb|ribu)$/);
  if (kMatch) {
    const val = parseFloat(kMatch[1].replace(/\./g, '').replace(',', '.'));
    return Math.round(val * 1000);
  }

  // Standard numeric with dots / commas (e.g. 20.000 or 20000)
  const digitsOnly = clean.replace(/[^\d]/g, '');
  return parseInt(digitsOnly, 10) || 0;
}

/**
 * Detects category automatically from item title text
 */
export function detectCategory(title, type = 'expense') {
  if (type === 'income') {
    const t = title.toLowerCase();
    if (t.includes('gaji') || t.includes('salary')) return 'Gaji Utama';
    if (t.includes('freelance') || t.includes('project') || t.includes('proyek') || t.includes('fee')) return 'Freelance & Side Job';
    if (t.includes('bonus') || t.includes('thr')) return 'Bonus / THR';
    if (t.includes('dividen') || t.includes('investasi') || t.includes('crypto')) return 'Dividen & Investasi';
    return 'Pemasukan Lainnya';
  }

  const cleanTitle = title.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw}\\b|${kw}`, 'i');
      if (regex.test(cleanTitle)) {
        return category;
      }
    }
  }

  return 'Pengeluaran Lainnya';
}

/**
 * Capitalizes string nicely
 */
function capitalizeWords(str) {
  return str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Parse a single expense segment:
 * Formats:
 * 1. "naspad 13000 sea" -> Naspad, Rp 13.000, SeaBank
 * 2. "bensin 30k bsi" -> Bensin, Rp 30.000, BSI
 * 3. "jajan 25.000 bca" -> Jajan, Rp 25.000, BCA
 * 4. "lauk 20k" -> Lauk, Rp 20.000, Rekening Utama
 */
export function parseSingleItem(rawSegment, options = {}) {
  let text = rawSegment.trim();
  if (!text) return null;

  // Options normalization
  let primaryAccount = 'BCA';
  let availableAccounts = [];

  if (typeof options === 'string') {
    primaryAccount = options;
  } else if (typeof options === 'object' && options !== null) {
    primaryAccount = options.primaryAccount || options.defaultPaymentMethod || 'BCA';
    availableAccounts = options.accounts || options.availableAccounts || [];
  }

  // Remove leading prefixes like "catat", "beli", "bayar", "isi", "buat"
  text = text.replace(/^(catat|beli|bayar|isi|buat|untuk)\s+/i, '');

  let title = '';
  let rawAmount = '';
  let rawAccount = '';

  // Pattern 1: [Title] [Amount] [Optional Account Suffix]
  // e.g. "naspad 13000 sea" or "bensin 30k bsi" or "lauk 20k" or "jajan 25.000 bca"
  const standardMatch = text.match(/^(.*?)(?:[:\s=-]+)?(?:rp\.?\s*)?(\b[\d.,]+(?:\s*(?:k|rb|ribu|jt|juta))?|\b\d{3,}\b)(?:\s+(?:via|pake|pakai|rek|rekening|dari)?\s*([a-zA-Z0-9_\-]+))?$/i);

  if (standardMatch && standardMatch[1] && standardMatch[2]) {
    title = standardMatch[1].trim();
    rawAmount = standardMatch[2].trim();
    rawAccount = standardMatch[3] ? standardMatch[3].trim() : '';
  } else {
    // Pattern 2: [Amount] [Title] [Optional Account]
    // e.g. "13000 naspad sea" or "20k lauk"
    const reverseMatch = text.match(/^(?:rp\.?\s*)?([\d.,]+(?:\s*(?:k|rb|ribu|jt|juta))?|\d+)\s+(.*?)(?:\s+(?:via|pake|pakai|rek|rekening|dari)?\s*([a-zA-Z0-9_\-]+))?$/i);
    if (reverseMatch) {
      rawAmount = reverseMatch[1].trim();
      title = reverseMatch[2].trim();
      rawAccount = reverseMatch[3] ? reverseMatch[3].trim() : '';
    }
  }

  if (!rawAmount) return null;

  const numAmount = parseAmount(rawAmount);
  if (!numAmount || numAmount <= 0) return null;

  // Fallback title if empty
  if (!title) {
    title = 'Pengeluaran';
  }

  // Detect if income
  const isIncome = INCOME_KEYWORDS.some(kw => title.toLowerCase().includes(kw));
  const type = isIncome ? 'income' : 'expense';
  const category = detectCategory(title, type);

  // Resolve payment method / account
  const paymentMethod = resolvePaymentMethod(rawAccount, availableAccounts, primaryAccount);

  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  return {
    id: 'tx_wa_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    title: capitalizeWords(title),
    amount: numAmount,
    type,
    category,
    paymentMethod,
    date,
    time,
    notes: `Input otomatis via WhatsApp Bot (${paymentMethod})`,
    source: 'whatsapp',
    createdAt: new Date().toISOString()
  };
}

/**
 * Main parser: takes a full WhatsApp chat message and returns an array of parsed transactions
 * Example input: "naspad 13000 sea / bensin 30k bsi / lauk 20k / jajan 25.000 bca"
 */
export function parseWhatsAppMessage(messageText, options = {}) {
  if (!messageText || typeof messageText !== 'string') return [];

  const rawText = messageText.trim();
  
  // Split by common delimiters: '/', '\n', ';', or commas separating item patterns
  let segments = [];
  if (rawText.includes('/')) {
    segments = rawText.split('/');
  } else if (rawText.includes('\n')) {
    segments = rawText.split('\n');
  } else if (rawText.includes(';')) {
    segments = rawText.split(';');
  } else if (rawText.includes(',')) {
    segments = rawText.split(',');
  } else if (/\s+dan\s+/i.test(rawText)) {
    segments = rawText.split(/\s+dan\s+/i);
  } else {
    segments = [rawText];
  }

  const results = [];
  for (const seg of segments) {
    const item = parseSingleItem(seg, options);
    if (item && item.amount > 0) {
      results.push(item);
    }
  }

  return results;
}
