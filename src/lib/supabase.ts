import { createClient } from '@supabase/supabase-js';

// Valores de fallback para garantir compatibilidade local total sem crashar
const supabaseUrl = 'https://placeholder.supabase.co';
const supabaseAnonKey = 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);