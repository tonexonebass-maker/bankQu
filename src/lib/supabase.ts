import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Debt {
  id: string;
  name: string;
  phone: string;
  principal: number;
  annual_rate: number;
  start_date: string;
  created_at: string;
}

export interface Installment {
  id: string;
  debt_id: string;
  number: number;
  due_date: string;
  principal_amount: number;
  interest_amount: number;
  total_bill: number;
  paid: boolean;
  paid_date: string | null;
  created_at: string;
}

export interface InstallmentDraft {
  number: number;
  due_date: string;
  principal_amount: number;
  interest_amount: number;
  total_bill: number;
}
