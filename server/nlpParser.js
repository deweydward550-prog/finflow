// FinFlow NLP Transaction Parser for WhatsApp Messages

const CATEGORY_KEYWORDS = {
  'Makanan & Minuman': [
    'naspad', 'nasi', 'makan', 'warteg', 'padang', 'soto', 'mie', 'bakso', 'ayam', 
    'bebek', 'kopi', 'coffee', 'kopsus', 'caffe', 'cafe', 'snack', 'roti', 'burger', 
    'pizza', 'gofood', 'grabfood', 'shopeefood', 'minum', 'es teh', 'jus', 'sarapan', 
    'lunch', 'dinner', 'jajan', 'martabak', 'gorengan', 'siomay', 'batagor', 'pecel',
    'seblak', 'cilok', 'cimol', 'boba', 'chatime', 'starbucks', 'angkringan', 'esteh'
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
      // Word boundary or partial match
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
 * Parse a single expense segment, e.g. "naspad 13000" or "bensin 20k" or "cukur 25.000"
 */
export function parseSingleItem(rawSegment, defaultPaymentMethod = 'BCA') {
  let text = rawSegment.trim();
  if (!text) return null;

  // Remove leading prefixes like "catat", "beli", "bayar", "isi", "buat"
  text = text.replace(/^(catat|beli|bayar|isi|buat|untuk)\s+/i, '');

  // Extract amount pattern at the end or beginning of string
  // Matches: 13000, 20.000, 25k, 25rb, 1.5jt, Rp 13.000
  const amountRegex = /(?:rp\.?\s*)?([\d.,]+(?:\s*(?:k|rb|ribu|jt|juta))?|\d+)/i;
  
  // Try matching amount at the end: "naspad 13000" or "naspad Rp 13.000"
  const endMatch = text.match(/(.*?)(?:\s+)?(?:rp\.?\s*)?(\b[\d.,]+\s*(?:k|rb|ribu|jt|juta)?|\b\d{3,}\b)$/i);
  
  let title = '';
  let rawAmount = '';

  if (endMatch && endMatch[1] && endMatch[2]) {
    title = endMatch[1].trim();
    rawAmount = endMatch[2].trim();
  } else {
    // Try matching amount anywhere
    const generalMatch = text.match(/^(.*?)(?:[:\s=-]+)(?:rp\.?\s*)?([\d.,]+\s*(?:k|rb|ribu|jt|juta)?|\d+)$/i);
    if (generalMatch) {
      title = generalMatch[1].trim();
      rawAmount = generalMatch[2].trim();
    }
  }

  // If still not matched, try reverse: "13000 naspad" or "20k bensin"
  if (!rawAmount) {
    const reverseMatch = text.match(/^(?:rp\.?\s*)?([\d.,]+\s*(?:k|rb|ribu|jt|juta)?|\d+)\s+(.*)$/i);
    if (reverseMatch) {
      rawAmount = reverseMatch[1].trim();
      title = reverseMatch[2].trim();
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

  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  return {
    id: 'tx_wa_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    title: capitalizeWords(title),
    amount: numAmount,
    type,
    category,
    paymentMethod: defaultPaymentMethod,
    date,
    time,
    notes: 'Input otomatis via WhatsApp Bot',
    source: 'whatsapp',
    createdAt: new Date().toISOString()
  };
}

/**
 * Main parser: takes a full WhatsApp chat message and returns an array of parsed transactions
 * Example input: "naspad 13000 / bensin 20.000 / cukur 25k"
 */
export function parseWhatsAppMessage(messageText, defaultPaymentMethod = 'BCA') {
  if (!messageText || typeof messageText !== 'string') return [];

  // Split by common delimiters: '/', '\n', ';', or commas separating item patterns
  // Clean message
  const rawText = messageText.trim();
  
  // Determine delimiter
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
    const item = parseSingleItem(seg, defaultPaymentMethod);
    if (item && item.amount > 0) {
      results.push(item);
    }
  }

  return results;
}
