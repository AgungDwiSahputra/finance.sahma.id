import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variabel lingkungan PUBLIC_SUPABASE_URL dan PUBLIC_SUPABASE_ANON_KEY wajib diisi. ' +
    'Salin .env.example ke .env dan isi nilainya.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
