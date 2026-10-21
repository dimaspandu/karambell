import { dataConfig } from "../config/data.js";
import { googleSheetsProvider } from "../providers/googleSheets.js";
import { createSupabaseProvider } from "../providers/supabase.js";

export const dataService = (() => {
  if (dataConfig.dataProvider === "google-sheets") return googleSheetsProvider;
  if (dataConfig.dataProvider === "supabase") return createSupabaseProvider({ url: dataConfig.supabaseUrl, key: dataConfig.supabaseAnonKey });
  throw new Error(`Provider data tidak didukung: ${dataConfig.dataProvider}`);
})();
