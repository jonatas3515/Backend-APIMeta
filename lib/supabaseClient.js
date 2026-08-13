import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Singleton para evitar múltiplas instâncias do GoTrueClient no mesmo contexto
const globalForSupabase = typeof globalThis !== 'undefined' ? globalThis : {};

export const supabase =
  globalForSupabase.__ncSupabaseClient ||
  (globalForSupabase.__ncSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
