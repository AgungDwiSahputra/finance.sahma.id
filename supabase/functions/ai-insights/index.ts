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

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { mode } = body;

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return ok({ error: 'Konfigurasi server tidak lengkap. Hubungi administrator.' });

    if (mode === 'analysis') return handleAnalysis(body, apiKey);

    return ok({ error: `Mode "${mode}" belum tersedia.` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Terjadi kesalahan tak terduga.';
    console.error('Edge function error:', msg);
    return ok({ error: msg });
  }
});
