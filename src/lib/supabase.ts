import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL     ?? '';
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '';

// Peringatan hanya tampil di browser (runtime), bukan saat build
if (typeof window !== 'undefined' && (!supabaseUrl || !supabaseAnonKey)) {
  console.error(
    '[Keuanganku] PUBLIC_SUPABASE_URL dan PUBLIC_SUPABASE_ANON_KEY belum diisi. ' +
    'Salin .env.example ke .env atau tambahkan ke GitHub Secrets.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
