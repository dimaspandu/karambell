import { createLeaderboardData } from "../domain/leaderboard.js";
import { normalizeCompetition } from "../domain/competitionModel.js";
import { validateParticipantAddition } from "../domain/participantValidation.js";
import { getDownstreamMatchPath, validateMatchScore, validateMatchWinner } from "../domain/matchRules.js";
import { validateCompetitionCreation } from "../domain/teamPairing.js";

function normalizeParticipantError(error) {
  const message = String(error?.message || "").toLowerCase();
  let userMessage = null;
  if (error?.code === "23505" || message.includes("already in this session") || message.includes("duplicate key")) {
    userMessage = "Nama peserta sudah ada.";
  } else if (message.includes("cannot add participants to a completed session")) {
    userMessage = "Kompetisi yang sudah selesai tidak dapat ditambahkan peserta.";
  } else if (message.includes("only be added before any match has started")) {
    userMessage = "Peserta hanya dapat ditambahkan sebelum pertandingan dimulai.";
  } else if (message.includes("maximum of 64 participants")) {
    userMessage = "Maksimal 64 peserta untuk setiap kompetisi.";
  } else if (message.includes("session not found") || message.includes("kompetisi tidak ditemukan")) {
    userMessage = "Kompetisi tidak ditemukan.";
  }
  if (!userMessage) return error;
  const normalized = new Error(userMessage);
  normalized.code = "PARTICIPANT_VALIDATION";
  normalized.cause = error;
  return normalized;
}

/**
 * @typedef {Object} LeaderboardCompetition
 * @property {{session_id: string, name: string, event_date?: string, location?: string, status: string, format: string}} session
 * @property {Array<{participant_id: string, name: string}>} participants
 * @property {Array<{match_id: string, round: number, match_number: number, participant1_id: string|null, participant2_id: string|null, winner_id: string|null, status: string}>} matches
 *
 * The Supabase data layer maps team_members and winner_team_id into this
 * canonical shape. Team-result score semantics are kept out of leaderboard DTOs.
 */
export function createCompetitionRepository({ provider, isTeamSessionKnown = () => false }) {
  if (typeof provider?.listCompetitions !== "function" || typeof provider?.getCompetition !== "function" || typeof provider?.listLeaderboardCompetitions !== "function" || typeof provider?.createCompetition !== "function" || typeof provider?.addPlayer !== "function" || typeof provider?.recordMatchScore !== "function" || typeof provider?.recordMatchWinner !== "function") {
    throw new TypeError("Competition provider must implement the competition read, create, participant, and match operations.");
  }

  async function normalizeMatchResult(payload, competition, expectedMatchId, expectedWinnerId) {
    try {
      if (!payload?.session?.session_id) throw new Error("Respons provider tidak memuat detail kompetisi yang diperbarui.");
      const result = normalizeProviderCompetition(payload);
      if (result.id !== competition.id) throw new Error("Respons provider mengembalikan kompetisi yang berbeda.");
      const match = result.matches.find(item => item.id === String(expectedMatchId));
      if (!match) throw new Error("Respons provider tidak memuat pertandingan yang diperbarui.");
      if (match.winnerId !== String(expectedWinnerId)) throw new Error("Pemenang pertandingan belum terkonfirmasi pada kompetisi.");
      return result;
    } catch (error) {
      error.code = error.code || "MATCH_REFRESH_FAILED";
      throw error;
    }
  }

  function validateDownstream(competition, matchId) {
    try { return getDownstreamMatchPath(competition, matchId); }
    catch (cause) {
      const error = new Error(cause.message);
      error.code = "MATCH_VALIDATION";
      throw error;
    }
  }

  function normalizeProviderCompetition(payload) {
    const sessionId = payload?.session?.session_id;
    return normalizeCompetition(payload, { isTeamSessionKnown: Boolean(isTeamSessionKnown(sessionId)) });
  }

  return {
    async listCompetitions() {
      const competitions = await provider.listCompetitions();
      if (!Array.isArray(competitions)) throw new TypeError("Competition provider returned an invalid competition list.");
      return competitions.map(competition => {
        if (!competition?.session?.session_id) throw new Error("Competition provider returned a session without an ID.");
        return normalizeProviderCompetition(competition);
      });
    },
    async getCompetition(sessionId) {
      if (sessionId == null || String(sessionId).trim() === "") throw new Error("ID kompetisi tidak valid.");
      const competition = await provider.getCompetition(sessionId);
      if (!competition?.session?.session_id) throw new Error("Kompetisi tidak ditemukan.");
      return normalizeProviderCompetition(competition);
    },
    async createCompetition(input) {
      const validation = validateCompetitionCreation(input);
      if (!validation.valid) {
        const error = new Error(validation.error);
        error.code = "COMPETITION_VALIDATION";
        throw error;
      }
      const payload = await provider.createCompetition(validation.value);
      if (!payload?.session?.session_id) {
        const error = new Error("Provider tidak mengembalikan kompetisi yang dibuat.");
        error.code = "COMPETITION_CREATE_RESPONSE";
        throw error;
      }
      try {
        const competition = normalizeProviderCompetition(payload);
        if (!competition.id || !competition.matches.length) throw new Error("Respons provider belum memuat kompetisi dan bagannya.");
        if (competition.isTeamCompetition) competition.format = "team_single_elimination";
        return competition;
      } catch (cause) {
        if (cause.code) throw cause;
        const error = new Error("Kompetisi tersimpan, tetapi hasil pembuatan tidak dapat dibaca.", { cause });
        error.code = "COMPETITION_REFRESH_FAILED";
        throw error;
      }
    },
    async addParticipant({ competition, name }) {
      const validation = validateParticipantAddition({ competition, name });
      if (!validation.valid) {
        const error = new Error(validation.error);
        error.code = "PARTICIPANT_VALIDATION";
        throw error;
      }
      let payload;
      try {
        payload = await provider.addPlayer({ session_id: competition.id, name: validation.name });
      } catch (error) {
        throw normalizeParticipantError(error);
      }
      if (!payload?.session?.session_id) throw new Error("Respons provider tidak memuat detail kompetisi yang diperbarui.");
      const result = normalizeProviderCompetition(payload);
      if (!result.participants.some(participant => participant.name === validation.name)) {
        throw new Error("Penambahan peserta belum terkonfirmasi pada data kompetisi.");
      }
      return result;
    },
    async recordMatchScore({ competition, matchId, score1, score2 }) {
      const outcome = validateMatchScore({ competition, matchId, score1, score2 });
      if (!outcome.valid) {
        const error = new Error(outcome.error);
        error.code = "MATCH_VALIDATION";
        throw error;
      }
      validateDownstream(competition, matchId);
      const payload = await provider.recordMatchScore({ sessionId: competition.id, matchId: String(matchId), score1: outcome.score1, score2: outcome.score2 });
      return normalizeMatchResult(payload, competition, matchId, outcome.winnerId);
    },
    async recordMatchWinner({ competition, matchId, winnerId }) {
      const outcome = validateMatchWinner({ competition, matchId, winnerId });
      if (!outcome.valid) {
        const error = new Error(outcome.error);
        error.code = "MATCH_VALIDATION";
        throw error;
      }
      validateDownstream(competition, matchId);
      const [participant1Id, participant2Id] = [outcome.match.participant1Id, outcome.match.participant2Id];
      const payload = await provider.recordMatchWinner({ sessionId: competition.id, matchId: String(matchId), winnerId: outcome.winnerId, participant1Id, participant2Id });
      return normalizeMatchResult(payload, competition, matchId, outcome.winnerId);
    },
    async getLeaderboardData() {
      const competitions = await provider.listLeaderboardCompetitions();
      if (!Array.isArray(competitions)) {
        throw new TypeError("Leaderboard provider returned an invalid competition list.");
      }
      return createLeaderboardData(competitions);
    }
  };
}
