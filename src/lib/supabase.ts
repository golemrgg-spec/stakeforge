import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[supabase] Missing env vars. VITE_SUPABASE_URL:',
    supabaseUrl,
    'VITE_SUPABASE_ANON_KEY:',
    supabaseAnonKey ? '<set>' : '<missing>'
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
