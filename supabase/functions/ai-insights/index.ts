import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: 'application/json', temperature: 0.3 },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? 'Gemini API error');
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Respons AI kosong.');
  return text;
}

// ── Mode: analysis ───────────────────────────────────────────────────────────
async function handleAnalysis(payload: any, apiKey: string) {
  const { month_label, summary } = payload;
  if (!month_label || !summary) return ok({ error: 'Data tidak lengkap.' });

  const {
    total_income = 0,
    total_expense = 0,
    expense_by_category = [],
    income_by_category = [],
  } = summary;

  const balance = total_income - total_expense;
  const fmt = (n: number) => `Rp ${Number(n).toLocaleString('id-ID')}`;

  const expenseLines = expense_by_category.length > 0
    ? expense_by_category
        .map((e: any) => `  - ${e.category}: ${fmt(e.total)} (${e.count} transaksi)`)
        .join('\n')
    : '  (tidak ada pengeluaran tercatat)';

  const incomeLines = income_by_category.length > 0
    ? income_by_category
        .map((i: any) => `  - ${i.category}: ${fmt(i.total)}`)
        .join('\n')
    : '  (tidak ada pemasukan tercatat)';

  const prompt = `Anda adalah analis keuangan pribadi yang cerdas, ramah, dan tidak menghakimi.

Data keuangan bulan ${month_label}:
- Total Pemasukan : ${fmt(total_income)}
- Total Pengeluaran: ${fmt(total_expense)}
- Saldo Bersih    : ${fmt(Math.abs(balance))} (${balance >= 0 ? 'surplus' : 'defisit'})

Pengeluaran per Kategori (diurutkan dari terbesar):
${expenseLines}

Pemasukan per Kategori:
${incomeLines}

Berikan analisis dalam Bahasa Indonesia yang ramah dan tidak menghakimi.
Kembalikan HANYA objek JSON berikut (tanpa teks lain, tanpa markdown):
{
  "kondisi": "ringkasan 1-2 kalimat kondisi keuangan bulan ini dengan nada positif dan supportif",
  "pola_pengeluaran": "analisis 2-3 kalimat tentang pola pengeluaran dan kategori yang mendominasi",
  "rasio_kesehatan": "1 kalimat penilaian rasio keuangan. Akhiri kalimat dengan salah satu label dalam kurung siku: [Sangat Sehat], [Sehat], [Perlu Perhatian], atau [Kritis]",
  "tips": [
    "saran konkret dan spesifik pertama berdasarkan data di atas",
    "saran konkret dan spesifik kedua berdasarkan data di atas",
    "saran konkret dan spesifik ketiga berdasarkan data di atas"
  ]
}`;

  try {
    const text = await callGemini(apiKey, prompt);
    const parsed = JSON.parse(text);
    return ok({ result: parsed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('Analysis error:', msg);
    return ok({ error: `Gagal menganalisis: ${msg}` });
  }
}

// ── Mode: prediction ─────────────────────────────────────────────────────────
async function handlePrediction(payload: any, apiKey: string) {
  const {
    next_month_label,
    months_available = 0,
    available_months = [] as string[],
    missing_months   = [] as string[],
    history          = [],
  } = payload;

  if (!next_month_label || history.length === 0) {
    return ok({ error: 'Data tidak lengkap untuk prediksi.' });
  }

  const fmt = (n: number) => `Rp ${Number(n).toLocaleString('id-ID')}`;

  // Bangun kalimat konteks berdasarkan jumlah bulan yang tersedia
  let contextLine: string;
  if (months_available === 3) {
    contextLine = `Berikut adalah ringkasan pengeluaran pengguna selama 3 bulan terakhir (${available_months.join(', ')}). Gunakan tren dari ketiga bulan ini untuk memprediksi pengeluaran bulan ${next_month_label}.`;
  } else if (months_available === 2) {
    contextLine = `Berikut adalah ringkasan pengeluaran pengguna selama 2 bulan terakhir (${available_months.join(' dan ')}). Catatan: Data bulan ${missing_months.join(', ')} tidak tersedia/kosong — tolong gunakan tren dari 2 bulan yang ada ini saja untuk memprediksi pengeluaran bulan ${next_month_label}.`;
  } else {
    contextLine = `Berikut adalah ringkasan pengeluaran pengguna untuk 1 bulan terakhir (${available_months[0]}). Karena data historis sangat terbatas (hanya 1 bulan tersedia dari 3 bulan yang diinginkan — ${missing_months.join(' dan ')} tidak ada data), berikan estimasi kasar untuk bulan ${next_month_label} berdasarkan pola 1 bulan ini saja.`;
  }

  // Susun baris data historis
  const historyLines = history.map((h: any) => {
    const catLines = (h.expense_by_category ?? [])
      .map((c: any) => `    - ${c.category}: ${fmt(c.total)}`)
      .join('\n');
    return `Bulan ${h.month}:\n  Total Pengeluaran: ${fmt(h.total_expense)}\n${catLines || '    (tidak ada rincian kategori)'}`;
  }).join('\n\n');

  const prompt = `Anda adalah analis keuangan pribadi yang cerdas dan ramah.

${contextLine}

=== DATA HISTORIS PENGELUARAN ===
${historyLines}

Berikan prediksi pengeluaran untuk bulan ${next_month_label} dalam Bahasa Indonesia.
Kembalikan HANYA objek JSON berikut (tanpa teks lain, tanpa markdown):
{
  "ringkasan_tren": "2-3 kalimat ringkasan tren pengeluaran berdasarkan data yang tersedia, sebutkan apakah tren naik/turun/stabil secara keseluruhan",
  "prediksi_total": angka bulat estimasi total pengeluaran bulan ${next_month_label} (tanpa titik/koma),
  "prediksi_per_kategori": [
    {
      "category": "nama kategori persis seperti di data historis",
      "prediksi": angka bulat estimasi pengeluaran kategori ini,
      "tren": "naik" atau "stabil" atau "turun"
    }
  ],
  "catatan": "1-2 kalimat catatan penting atau faktor yang perlu diperhatikan, atau string kosong jika tidak ada"
}`;

  try {
    const text = await callGemini(apiKey, prompt);
    const parsed = JSON.parse(text);
    return ok({ result: parsed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('Prediction error:', msg);
    return ok({ error: `Gagal membuat prediksi: ${msg}` });
  }
}

// ── Mode: anomaly ────────────────────────────────────────────────────────────
async function handleAnomaly(payload: any, apiKey: string) {
  const {
    current_month_label,
    current_month,
    baseline            = [],
    transaksi_terbesar  = [],
    has_baseline        = false,
    baseline_months     = 0,
  } = payload;

  if (!current_month_label || !current_month) {
    return ok({ error: 'Data tidak lengkap.' });
  }

  const fmt = (n: number) => `Rp ${Number(n).toLocaleString('id-ID')}`;

  // Konteks ketersediaan data historis — disuntikkan ke prompt agar Gemini
  // memahami mengapa baseline mungkin terbatas dan menyesuaikan analisisnya
  let baselineContext: string;
  if (!has_baseline || baseline.length === 0) {
    baselineContext = 'Tidak ada data historis yang tersedia untuk perbandingan. ' +
      'Lakukan deteksi anomali hanya berdasarkan pola absolut dan transaksi individual yang nilainya sangat besar atau tidak wajar di bulan ini.';
  } else if (baseline_months < 3) {
    baselineContext = `Data historis hanya tersedia untuk ${baseline_months} bulan (kurang dari 3 bulan ideal). ` +
      'Gunakan rata-rata yang ada sebagai baseline perbandingan, namun sertakan catatan bahwa akurasi deteksi mungkin berkurang karena baseline terbatas.';
  } else {
    baselineContext = 'Data historis tersedia lengkap untuk 3 bulan penuh. ' +
      'Gunakan rata-rata bulanan sebagai baseline yang andal untuk perbandingan.';
  }

  const currentLines = (current_month.expense_by_category ?? [])
    .map((c: any) => `  - ${c.category}: ${fmt(c.total)} (${c.count} transaksi)`)
    .join('\n') || '  (tidak ada pengeluaran tercatat)';

  const baselineLines = baseline.length > 0
    ? baseline.map((b: any) => `  - ${b.category}: rata-rata ${fmt(b.avg_bulanan)}/bulan`).join('\n')
    : '  (tidak ada data historis)';

  const topTxLines = transaksi_terbesar.length > 0
    ? transaksi_terbesar
        .map((t: any, i: number) =>
          `  ${i + 1}. "${t.description}" — ${fmt(t.amount)} (${t.category}, ${t.date})`)
        .join('\n')
    : '  (tidak ada data)';

  const prompt = `Anda adalah analis keuangan pribadi yang cerdas dan teliti.

Tugas: Deteksi anomali pengeluaran pengguna di bulan ${current_month_label}.

Konteks data: ${baselineContext}

=== PENGELUARAN BULAN INI (${current_month_label}) ===
${currentLines}

=== RATA-RATA HISTORIS (BULAN-BULAN SEBELUMNYA) ===
${baselineLines}

=== TOP TRANSAKSI TERBESAR BULAN INI ===
${topTxLines}

Deteksi anomali berdasarkan dua dimensi:
1. Kategori yang total pengeluarannya jauh melebihi baseline historis (>1.5× rata-rata)
2. Transaksi individual yang nilainya sangat besar dibanding transaksi lain di kategori yang sama

Kembalikan HANYA objek JSON berikut (tanpa teks lain, tanpa markdown):
{
  "anomali_ditemukan": true atau false,
  "ringkasan": "1 kalimat ringkasan hasil deteksi, sebutkan jumlah anomali jika ada",
  "anomali": [
    {
      "tingkat": "tinggi" atau "sedang" atau "rendah",
      "judul": "judul singkat maksimal 5 kata",
      "deskripsi": "1-2 kalimat penjelasan anomali ini dengan angka konkret (sebutkan nilai aktual vs rata-rata jika relevan)",
      "saran": "1 kalimat saran tindakan yang konkret dan actionable"
    }
  ]
}

Catatan penting: Jika tidak ditemukan anomali, kembalikan "anomali_ditemukan": false dan "anomali": [].`;

  try {
    const text = await callGemini(apiKey, prompt);
    const parsed = JSON.parse(text);
    return ok({ result: parsed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('Anomaly error:', msg);
    return ok({ error: `Gagal mendeteksi anomali: ${msg}` });
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { mode } = body;

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return ok({ error: 'Konfigurasi server tidak lengkap. Hubungi administrator.' });

    if (mode === 'analysis')   return handleAnalysis(body, apiKey);
    if (mode === 'prediction') return handlePrediction(body, apiKey);
    if (mode === 'anomaly')    return handleAnomaly(body, apiKey);

    return ok({ error: `Mode "${mode}" belum tersedia.` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Terjadi kesalahan tak terduga.';
    console.error('Edge function error:', msg);
    return ok({ error: msg });
  }
});
