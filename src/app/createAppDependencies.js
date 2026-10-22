import { dataConfig } from "../config/data.js";
import { googleSheetsProvider } from "../providers/googleSheets.js";
import { createSupabaseProvider } from "../providers/supabase.js";
import { createCompetitionRepository } from "../repositories/competitionRepository.js";
import { isKnownTeamSession } from "../shared/persistence/appStorage.js";

export function createAppDependencies(config = dataConfig) {
  let provider;
  if (config.dataProvider === "google-sheets") provider = googleSheetsProvider;
  else if (config.dataProvider === "supabase") provider = createSupabaseProvider({ url: config.supabaseUrl, key: config.supabaseAnonKey });
  else throw new Error(`Provider data tidak didukung: ${config.dataProvider}`);

  const competitionRepository = createCompetitionRepository({ provider, isTeamSessionKnown: isKnownTeamSession });
  return { provider, competitionRepository };
}

const appDependencies = createAppDependencies();
export const competitionRepository = appDependencies.competitionRepository;
