// Set these deployment values here for the Supabase provider. The anon key is
// intentionally public; never put a service-role key in browser code.
export const dataConfig = {
  dataProvider: "google-sheets", // "google-sheets" | "supabase"
  supabaseUrl: "",
  supabaseAnonKey: ""
};
