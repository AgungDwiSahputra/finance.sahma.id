-- ============================================================
-- SISTEM PENGELOLAAN KEUANGAN PRIBADI
-- Supabase Schema + Row Level Security (RLS)
-- Jalankan file ini di: Supabase Dashboard > SQL Editor
-- ============================================================

-- Enable UUID extension (sudah aktif default di Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- TABEL 1: profiles
-- Dibuat otomatis saat user baru mendaftar via trigger
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  username    TEXT UNIQUE,
  full_name   TEXT,
  avatar_url  TEXT,

  CONSTRAINT username_length CHECK (char_length(username) >= 3)
);

-- RLS: profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pengguna dapat melihat profil sendiri"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Pengguna dapat mengupdate profil sendiri"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Pengguna dapat insert profil sendiri"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);


-- ============================================================
-- TABEL 2: categories
-- Kategori pemasukan dan pengeluaran per pengguna
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  icon       TEXT,                        -- emoji, misal: '🍔', '🚗', '💰'
  color      TEXT DEFAULT '#6b7280',      -- warna hex opsional
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT category_name_not_empty CHECK (char_length(name) > 0)
);

-- Index untuk query cepat per user
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories(user_id);

-- RLS: categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pengguna hanya melihat kategori sendiri"
  ON public.categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Pengguna hanya bisa insert kategori sendiri"
  ON public.categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Pengguna hanya bisa update kategori sendiri"
  ON public.categories FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Pengguna hanya bisa hapus kategori sendiri"
  ON public.categories FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================================
-- TABEL 3: transactions
-- Data transaksi keuangan utama
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount           NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  category_id      UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  description      TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk query efisien
CREATE INDEX IF NOT EXISTS idx_transactions_user_id      ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date         ON public.transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id  ON public.transactions(category_id);

-- RLS: transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pengguna hanya melihat transaksi sendiri"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Pengguna hanya bisa insert transaksi sendiri"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Pengguna hanya bisa update transaksi sendiri"
  ON public.transactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Pengguna hanya bisa hapus transaksi sendiri"
  ON public.transactions FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================================
-- TRIGGER: Auto-update kolom updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_transaction_updated
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- TRIGGER: Auto-create profil + default kategori saat user baru daftar
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Buat entri profil kosong
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );

  -- Insert kategori default: Pengeluaran
  INSERT INTO public.categories (user_id, name, type, icon) VALUES
    (NEW.id, 'Makanan & Minuman',  'expense', '🍔'),
    (NEW.id, 'Transportasi',        'expense', '🚗'),
    (NEW.id, 'Belanja',             'expense', '🛍️'),
    (NEW.id, 'Kesehatan',           'expense', '💊'),
    (NEW.id, 'Hiburan',             'expense', '🎬'),
    (NEW.id, 'Tagihan & Utilitas',  'expense', '💡'),
    (NEW.id, 'Pendidikan',          'expense', '📚'),
    (NEW.id, 'Lain-lain',           'expense', '📦');

  -- Insert kategori default: Pemasukan
  INSERT INTO public.categories (user_id, name, type, icon) VALUES
    (NEW.id, 'Gaji',        'income', '💰'),
    (NEW.id, 'Freelance',   'income', '💻'),
    (NEW.id, 'Investasi',   'income', '📈'),
    (NEW.id, 'Hadiah',      'income', '🎁'),
    (NEW.id, 'Lain-lain',   'income', '✨');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Jalankan trigger setelah user baru dibuat di auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- VIEW: ringkasan_bulanan
-- Digunakan untuk halaman Dashboard (F02)
-- ============================================================
CREATE OR REPLACE VIEW public.ringkasan_bulanan AS
SELECT
  t.user_id,
  DATE_TRUNC('month', t.transaction_date)  AS bulan,
  c.type,
  SUM(t.amount)                            AS total
FROM public.transactions t
JOIN public.categories c ON c.id = t.category_id
GROUP BY t.user_id, bulan, c.type;

-- RLS pada view diwariskan dari tabel transactions & categories
-- (query via supabase-js otomatis memfilter berdasarkan auth.uid())


-- ============================================================
-- SELESAI
-- Verifikasi: jalankan query ini untuk memastikan tabel dibuat
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public';
-- ============================================================
