import { atom, computed } from 'nanostores';
import type { User, Session } from '@supabase/supabase-js';

export const $user    = atom<User | null>(null);
export const $session = atom<Session | null>(null);
export const $isAuthLoading = atom<boolean>(true);

export const $isAuthenticated = computed($user, (user) => user !== null);

export const $displayName = computed($user, (user) => {
  if (!user) return '';
  return (
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    'Pengguna'
  );
});
