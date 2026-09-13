import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client "anon": rispetta sempre le policy RLS, va usato in tutto il frontend
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
