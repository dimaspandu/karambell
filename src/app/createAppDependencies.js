import { dataConfig } from "../config/data.js";
import { createSupabaseProvider } from "../providers/supabase.js";
import { createCompetitionRepository } from "../repositories/competitionRepository.js";
import { isKnownTeamSession } from "../shared/persistence/appStorage.js";

export function createAppDependencies(config = dataConfig) {
  const supabase = createSupabaseProvider({ url: config.supabaseUrl, key: config.supabaseAnonKey });
  const competitionRepository = createCompetitionRepository({ provider: supabase, isTeamSessionKnown: isKnownTeamSession });
  return { competitionRepository };
}

const appDependencies = createAppDependencies();
export const competitionRepository = appDependencies.competitionRepository;
