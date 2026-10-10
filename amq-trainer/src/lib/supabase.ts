import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/**
 * Client Supabase, ou `null` si le site est compilé sans configuration (les comptes sont alors masqués).
 * La clé publishable est publique par conception : la Row Level Security protège les données.
 */
export const supabase = url && key ? createClient(url, key) : null;
