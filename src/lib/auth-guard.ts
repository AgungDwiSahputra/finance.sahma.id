import { supabase } from './supabase';

const base = import.meta.env.BASE_URL; // '/finance.sahma.id/' di produksi, '/' di dev

/** Redirect ke /login jika tidak ada sesi aktif. */
export async function requireAuth(): Promise<import('@supabase/supabase-js').Session | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.replace(`${base}login`);
    return null;
  }
  return session;
}

/** Redirect ke / jika sudah login (untuk halaman /login). */
export async function requireGuest(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.replace(base);
  }
}
