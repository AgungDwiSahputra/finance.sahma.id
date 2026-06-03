export interface Profile {
  id:         string;
  updated_at: string;
  username:   string | null;
  full_name:  string | null;
  avatar_url: string | null;
}

export interface Category {
  id:         string;
  user_id:    string;
  name:       string;
  type:       'income' | 'expense';
  icon:       string | null;
  color:      string | null;
  created_at: string;
}

export interface Transaction {
  id:               string;
  user_id:          string;
  amount:           number;
  category_id:      string;
  description:      string | null;
  transaction_date: string;
  created_at:       string;
  categories?:      Category | null;
}

export type TransactionType = 'income' | 'expense';
