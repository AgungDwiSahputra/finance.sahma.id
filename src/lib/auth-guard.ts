import { supabase } from './supabase';

/** Redirect ke /login jika tidak ada sesi aktif. */
export async function requireAuth(): Promise<import('@supabase/supabase-js').Session | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.replace('/login');
    return null;
  }
  return session;
}

/** Redirect ke / jika sudah login (untuk halaman /login). */
export async function requireGuest(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.replace('/');
  }
}
