import { createClient } from '@supabase/supabase-js';

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
  }
  return url;
}

function getSupabaseAnonKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
  }
  return key;
}

export const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());

export type HnEvaluation = {
  id: string;
  created_at: string;
  evaluation_output: string;
  model: string;
  generated_at: string;
};

