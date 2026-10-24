// Vite exposes these values to the browser. Configure only public Supabase credentials.
export const dataConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || ""
};
