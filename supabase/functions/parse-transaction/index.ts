import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: selalu return 200 agar supabase.functions.invoke() selalu mengisi `data`
function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { prompt, currentDate } = await req.json();

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return ok({ error: 'Parameter "prompt" wajib diisi.' });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      console.error('GEMINI_API_KEY tidak ditemukan di environment secrets.');
      return ok({ error: 'Konfigurasi server tidak lengkap. Hubungi administrator.' });
    }

    const systemInstruction = `Anda adalah asisten keuangan cerdas. Ekstrak SEMUA transaksi dari cerita berikut.
Tanggal hari ini: ${currentDate}.
Jika teks menyebut kata relatif seperti "tadi", "kemarin", "minggu lalu", gunakan tanggal hari ini sebagai acuan perhitungan.
Jika ada beberapa barang atau item berbeda yang disebutkan, pisahkan masing-masing sebagai item terpisah dalam array "items".

Format JSON yang WAJIB dikembalikan (selalu gunakan array "items", meski hanya 1 transaksi):
{
  "items": [
    {
      "type": "income" atau "expense",
      "amount": angka bulat tanpa titik atau koma (contoh: 25000),
      "category_name": "nama kategori yang paling sesuai dalam Bahasa Indonesia (contoh: Makan & Minum, Transportasi, Belanja, Hiburan, Kesehatan, Gaji, dll)",
      "description": "deskripsi singkat item ini dalam Bahasa Indonesia",
      "transaction_date": "YYYY-MM-DD"
    }
  ]
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: systemInstruction + `\n\nTeks transaksi: "${prompt.trim()}"` }],
          },
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.1,
        },
      }),
    });

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      // Log detail error Gemini ke console Supabase (tampil di tab Logs dashboard)
      console.error('Gemini API error:', geminiResponse.status, JSON.stringify(geminiData));
      const geminiMsg = geminiData?.error?.message ?? 'Unknown error dari Gemini API';
      return ok({ error: `Gagal menghubungi layanan AI: ${geminiMsg}` });
    }

    const resultText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      console.error('Gemini response kosong:', JSON.stringify(geminiData));
      return ok({ error: 'AI tidak menghasilkan respons. Coba ulangi dengan kalimat yang lebih jelas.' });
    }

    // Validasi JSON sebelum dikirim ke client
    const parsed = JSON.parse(resultText);
    if (!parsed.items || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      return ok({ error: 'AI tidak dapat mendeteksi transaksi. Coba ulangi dengan kalimat yang lebih jelas.' });
    }
    return ok(parsed);

  } catch (e) {
    const message = e instanceof Error ? e.message : 'Terjadi kesalahan tak terduga.';
    console.error('Edge Function error:', message);
    return ok({ error: `Terjadi kesalahan: ${message}` });
  }
});
