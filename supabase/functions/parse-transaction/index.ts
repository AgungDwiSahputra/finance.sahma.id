import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { prompt, currentDate } = await req.json();

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Parameter "prompt" wajib diisi.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Konfigurasi server tidak lengkap (API key tidak ditemukan).' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const systemInstruction = `Anda adalah asisten keuangan cerdas. Ekstrak informasi transaksi keuangan dari cerita berikut ke dalam format JSON.
Tanggal hari ini: ${currentDate}.
Jika teks menyebut kata relatif seperti "tadi", "kemarin", "minggu lalu", gunakan tanggal hari ini sebagai acuan perhitungan.

Format JSON yang WAJIB dikembalikan (tanpa teks lain, tanpa markdown, hanya objek JSON murni):
{
  "type": "income" atau "expense",
  "amount": angka bulat tanpa titik atau koma (contoh: 25000),
  "category_name": "nama kategori yang paling sesuai dalam Bahasa Indonesia (contoh: Makan & Minum, Transportasi, Belanja, Hiburan, Kesehatan, Gaji, dll)",
  "description": "deskripsi singkat transaksi dalam Bahasa Indonesia",
  "transaction_date": "YYYY-MM-DD"
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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

    if (!geminiResponse.ok) {
      const errBody = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errBody);
      return new Response(
        JSON.stringify({ error: 'Gagal menghubungi layanan AI. Coba lagi.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    const geminiData = await geminiResponse.json();
    const resultText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      return new Response(
        JSON.stringify({ error: 'AI tidak menghasilkan respons yang valid.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    // Validasi bahwa response adalah JSON valid
    const parsed = JSON.parse(resultText);

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (e) {
    const message = e instanceof Error ? e.message : 'Terjadi kesalahan tak terduga.';
    console.error('Edge Function error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
