import { getCompetitionProgress } from "../domain/competitionProgress.js";
import { validateMatchScore, validateMatchWinner } from "../domain/matchRules.js";
import { validateCompetitionCreation } from "../domain/teamPairing.js";
import { validateParticipantAddition } from "../domain/participantValidation.js";
import { buildTournamentPlan } from "../domain/tournamentGenerator.js";
import { getTournamentStandings } from "../domain/tournamentStandings.js";
import { TOURNAMENT_FORMATS } from "../domain/tournamentFormats.js";

export function createSupabaseProvider({ url, key }) {
  const base = url ? `${url.replace(/\/$/, "")}/rest/v1` : null;

  async function query(table, params = {}, { method = "GET", body, prefer = "return=representation", range } = {}) {
    if (!base || !key) throw new Error("Supabase belum dikonfigurasi. Atur supabaseUrl dan supabaseAnonKey di src/config/data.js.");
    const target = new URL(`${base}/${table}`);
    for (const [name, value] of Object.entries(params)) target.searchParams.set(name, String(value));
    let response;
    try {
      response = await fetch(target, {
        method,
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json", Prefer: prefer, ...(range ? { Range: `${range[0]}-${range[1]}`, "Range-Unit": "items" } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (cause) {
      const error = new Error(`Unable to reach Supabase while requesting ${table}. Check the project URL, network access, and browser console for CORS details.`, { cause });
      error.code = "SUPABASE_NETWORK_ERROR";
      throw error;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.message || data?.details || `Supabase ${table}: HTTP ${response.status}`);
      error.code = data?.code;
      error.constraint = data?.constraint;
      error.details = data?.details;
      error.hint = data?.hint;
      error.status = response.status;
      throw error;
    }
    return data || [];
  }

  const byId = id => `eq.${id}`;

  async function shuffleTeamPlayers({ sessionId, assignments }) {
    if (!base || !key) throw new Error("Supabase belum dikonfigurasi.");
    const target = new URL(`${base}/rpc/shuffle_team_players`);
    let response;
    try {
      response = await fetch(target, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ p_session_id: sessionId, p_assignments: assignments }) });
    } catch (cause) { throw new Error("Gagal menghubungi Supabase untuk mengacak pemain.", { cause }); }
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.message || "Susunan pemain berubah atau tidak lagi memenuhi syarat. Muat ulang lalu coba lagi.");
    }
    return getCompetition(sessionId);
  }

  async function listLeaderboardCompetitions() {
    const sessions = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await query("sessions", { select: "id", order: "created_at.desc" }, { range: [offset, offset + 999] });
      sessions.push(...page);
      if (page.length < 1000) break;
    }
    return Promise.all(sessions.map(session => getCompetition(session.id)));
  }

  async function getCompetition(id) {
    const [sessions, players, teams, matches, competitionParticipants, progressions, groups, groupMembers] = await Promise.all([
      query("sessions", { select: "*", id: byId(id) }),
      query("players", { select: "*", session_id: byId(id), order: "created_at.asc" }),
      query("teams", { select: "*", session_id: byId(id), order: "created_at.asc" }),
      query("matches", { select: "*", session_id: byId(id), order: "round.asc,match_number.asc" }),
      query("competition_participants", { select: "*", session_id: byId(id) }),
      query("match_progressions", { select: "*", session_id: byId(id) }),
      query("tournament_groups", { select: "*", session_id: byId(id), order: "group_number.asc" }),
      query("tournament_group_members", { select: "*", session_id: byId(id) })
    ]);
    const session = sessions[0];
    if (!session) throw new Error("Kompetisi tidak ditemukan.");
    const teamMode = session.participant_mode === "team" || teams.length > 0 || String(session.format || "").includes("team");
    const members = teams.length ? await query("team_members", { select: "*", session_id: byId(id), team_id: `in.(${teams.map(team => team.id).join(",")})` }) : [];
    const participantRows = competitionParticipants.length ? competitionParticipants : (teamMode
      ? teams.map(team => ({ id: team.id, team_id: team.id, participant_mode: "team" }))
      : players.map(player => ({ id: player.id, player_id: player.id, participant_mode: "individual" })));
    const participants = participantRows.map(participant => {
      if (participant.participant_mode === "team" || participant.team_id) {
        const team = teams.find(row => String(row.id) === String(participant.team_id));
        const teamMembers = members.filter(member => String(member.team_id) === String(participant.team_id))
          .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
          .map(member => ({ player_id: String(member.player_id), name: players.find(player => String(player.id) === String(member.player_id))?.name || "", position: member.position ?? null }));
        const names = teamMembers.map(member => member.name).filter(Boolean);
        return { participant_id: participant.id, source_id: participant.team_id, source_type: "team", name: names.join(" & ") || team?.name || "Tim", seed: team?.seed || 0, members: teamMembers };
      }
      const player = players.find(row => String(row.id) === String(participant.player_id));
      return { participant_id: participant.id, source_id: participant.player_id, source_type: "individual", name: player?.name || "Peserta", seed: player?.seed || 0 };
    });
    const winnerProgressionBySource = new Map(progressions.filter(edge => edge.source_outcome === "winner").map(edge => [String(edge.source_match_id), edge]));
    const normalizedGroups = groups.map(group => ({
      id: String(group.id),
      name: group.name,
      groupNumber: Number(group.group_number),
      qualifyingPlaces: Number(group.qualifying_places) || 0,
      participantIds: groupMembers.filter(member => String(member.group_id) === String(group.id)).map(member => String(member.participant_id))
    }));
    const matchIndexes = new Map();
    const normalizedMatches = matches.map(match => {
      const scope = `${match.stage || "main"}:${match.round}:${match.group_id || ""}`;
      const index = matchIndexes.get(scope) || 0;
      matchIndexes.set(scope, index + 1);
      return {
        match_id: match.id,
        round: match.round,
        match_number: match.match_number,
        index,
        participant1_id: match.participant1_participant_id == null ? null : String(match.participant1_participant_id),
        participant2_id: match.participant2_participant_id == null ? null : String(match.participant2_participant_id),
        winner_id: match.winner_participant_id == null ? null : String(match.winner_participant_id),
        score1: match.score1 ?? "",
        score2: match.score2 ?? "",
        stage: match.stage || "main",
        group_id: match.group_id == null ? null : String(match.group_id),
        status: match.winner_participant_id && Boolean(match.participant1_participant_id) !== Boolean(match.participant2_participant_id) ? "bye" : match.status,
        next_match_id: winnerProgressionBySource.get(String(match.id))?.target_match_id || null,
        next_slot: winnerProgressionBySource.get(String(match.id))?.target_slot || null
      };
    });
    return {
      session: { ...session, session_id: session.id, format: session.format },
      participants,
      groups: normalizedGroups,
      progressions,
      matches: normalizedMatches
    };
  }

  async function persistBracket(sessionId, teams, participants, { format, groupCount, onStage = () => {} }) {
    onStage("generate format plan");
    const plan = buildTournamentPlan({ format, teams, participants, groupCount });
    onStage("insert groups and memberships");
    const groupRows = plan.groups.map(({ key, ...group }) => ({ ...group, session_id: sessionId }));
    const savedGroups = groupRows.length ? await query("tournament_groups", {}, { method: "POST", body: groupRows }) : [];
    const savedGroupByNumber = new Map(savedGroups.map(group => [Number(group.group_number), group]));
    const groupIdByKey = new Map(plan.groups.map(group => [group.key, savedGroupByNumber.get(group.group_number)?.id]));
    if (savedGroups.length !== groupRows.length || groupRows.some((group, index) => !savedGroups[index]?.id || String(savedGroups[index].session_id) !== String(sessionId))) {
      throw new Error("Grup kompetisi tidak tersimpan lengkap.");
    }
    const participantByTeam = new Map(participants.map(participant => [String(participant.team_id), participant]));
    const membershipRows = plan.groupMembers.map(member => ({
      session_id: sessionId,
      group_id: groupIdByKey.get(member.groupKey),
      participant_id: participantByTeam.get(String(member.team_id))?.id
    }));
    if (membershipRows.length) await query("tournament_group_members", {}, { method: "POST", body: membershipRows });
    onStage("insert matches");
    const matchRows = plan.matches.map(({ key, ...match }) => ({ ...match, session_id: sessionId, group_id: match.group_id ? groupIdByKey.get(match.group_id) : null }));
    const savedMatches = matchRows.length ? await query("matches", {}, { method: "POST", body: matchRows }) : [];
    if (savedMatches.length !== matchRows.length || savedMatches.some(match => String(match.session_id) !== String(sessionId) || !match.id)) throw new Error("Bagan kompetisi tidak tersimpan lengkap.");
    const matchSignature = match => `${match.stage}:${match.round}:${match.match_number}:${match.group_id || ""}`;
    const savedMatchBySignature = new Map(savedMatches.map(match => [matchSignature(match), match]));
    const matchIdByKey = new Map(plan.matches.map(match => [
      match.key,
      savedMatchBySignature.get(matchSignature({ ...match, group_id: match.group_id ? groupIdByKey.get(match.group_id) : null }))?.id
    ]));
    onStage("insert outcome progression links");
    const progressionRows = plan.progressions.map(edge => ({
      session_id: sessionId,
      source_match_id: matchIdByKey.get(edge.sourceKey),
      source_outcome: edge.source_outcome,
      target_match_id: matchIdByKey.get(edge.targetKey),
      target_slot: edge.target_slot
    }));
    if (progressionRows.length) await query("match_progressions", {}, { method: "POST", body: progressionRows });
    // Preserve the legacy winner-only links for old clients while the app rolls out.
    onStage("write legacy winner links");
    const winnerEdges = progressionRows.filter(edge => edge.source_outcome === "winner");
    for (const edge of winnerEdges) await query("matches", { id: byId(edge.source_match_id) }, {
      method: "PATCH",
      body: { next_match_id: edge.target_match_id, next_slot: edge.target_slot }
    });
  }

  async function cleanupCompetition(sessionId) {
    const failures = [];
    for (const [table, column] of [["match_progressions", "session_id"], ["tournament_group_members", "session_id"], ["matches", "session_id"], ["tournament_groups", "session_id"], ["competition_participants", "session_id"], ["team_members", "session_id"], ["teams", "session_id"], ["players", "session_id"], ["sessions", "id"]]) {
      try { await query(table, { [column]: byId(sessionId) }, { method: "DELETE", prefer: "return=minimal" }); }
      catch (error) { failures.push({ table, error }); }
    }
    return failures;
  }

  async function applyMatchResult({ session_id, match_id, winner_team_id, score1, score2 }) {
    const competition = await getCompetition(session_id);
    const current = competition.matches.find(item => String(item.match_id) === String(match_id));
    if (!current) throw new Error("Pertandingan tidak ditemukan.");
    if (current.status === "bye") throw new Error("Pertandingan bye tidak dapat diubah.");
    const participant1Id = current.participant1_id;
    const participant2Id = current.participant2_id;
    if (!participant1Id || !participant2Id) throw new Error("Kedua peserta harus ditetapkan sebelum hasil dicatat.");

    let winner = winner_team_id;
    const includesScore = score1 !== undefined || score2 !== undefined;
    if (includesScore) {
      const validation = validateMatchScore({
        competition: { id: session_id, matches: [{ ...current, id: current.match_id, participant1Id, participant2Id }] },
        matchId: current.match_id,
        score1: Number(score1),
        score2: Number(score2)
      });
      if (!validation.valid) {
        const error = new Error(validation.error);
        error.code = "MATCH_VALIDATION";
        throw error;
      }
      winner = validation.winnerId;
    } else {
      const validation = validateMatchWinner({
        competition: { id: session_id, matches: [{ ...current, id: current.match_id, participant1Id, participant2Id }] },
        matchId: current.match_id,
        winnerId: winner_team_id
      });
      if (!validation.valid) {
        const error = new Error(validation.error);
        error.code = "MATCH_VALIDATION";
        throw error;
      }
      winner = validation.winnerId;
    }

    const progressionEdges = competition.progressions || [];
    const outgoing = progressionEdges.filter(edge => String(edge.source_match_id) === String(match_id));
    const descendants = [];
    const seen = new Set([String(match_id)]);
    const queue = outgoing.map(edge => String(edge.target_match_id));
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      descendants.push(id);
      progressionEdges.filter(edge => String(edge.source_match_id) === id).forEach(edge => queue.push(String(edge.target_match_id)));
    }
    const isGroupResult = competition.session.format === TOURNAMENT_FORMATS.GROUP_KNOCKOUT && current.stage === "group";
    const participantById = new Map(competition.participants.map(participant => [String(participant.participant_id), participant]));
    const winnerParticipant = participantById.get(String(winner));
    if (!winnerParticipant) throw new Error("Peserta pemenang tidak ditemukan dalam kompetisi.");
    const patchMatch = async (id, patch) => {
      try {
        await query("matches", { id: byId(id) }, { method: "PATCH", body: patch });
      } catch (cause) {
        const error = new Error("Match mutation may have been only partially saved.", { cause });
        error.code = "PARTIAL_MATCH_MUTATION";
        throw error;
      }
    };

    // Invalidate affected outcomes before recording a replacement result.
    const resetIds = isGroupResult
      ? competition.matches.filter(match => match.stage === "main").map(match => String(match.match_id))
      : descendants;
    for (const id of resetIds) {
      const match = competition.matches.find(item => String(item.match_id) === id);
      if (!match) continue;
      const reset = {
        winner_team_id: null,
        winner_participant_id: null,
        score1: null,
        score2: null,
        status: "pending"
      };
      // Clear slots fed by any invalidated source. Results in descendant matches
      // are reset because their participants or winner may no longer be valid.
      if (!isGroupResult) {
        progressionEdges.filter(edge => String(edge.target_match_id) === id && seen.has(String(edge.source_match_id))).forEach(edge => {
          if (Number(edge.target_slot) === 1) {
            reset.team1_id = null;
            reset.participant1_participant_id = null;
          } else {
            reset.team2_id = null;
            reset.participant2_participant_id = null;
          }
        });
      }
      await patchMatch(id, reset);
    }

    const currentPatch = {
      winner_team_id: winnerParticipant.source_type === "team" ? winnerParticipant.source_id : null,
      winner_participant_id: winner,
      status: "completed"
    };
    if (includesScore) {
      currentPatch.score1 = Number(score1);
      currentPatch.score2 = Number(score2);
    }
    await patchMatch(match_id, currentPatch);

    for (const edge of outgoing) {
      const slot = Number(edge.target_slot);
      const resultId = edge.source_outcome === "winner"
        ? winner
        : String(winner) === String(participant1Id) ? participant2Id : participant1Id;
      const resultParticipant = participantById.get(String(resultId));
      if (!resultParticipant) throw new Error("Peserta hasil pertandingan tidak ditemukan.");
      await patchMatch(edge.target_match_id, {
        [slot === 1 ? "team1_id" : "team2_id"]: resultParticipant.source_type === "team" ? resultParticipant.source_id : null,
        [slot === 1 ? "participant1_participant_id" : "participant2_participant_id"]: resultId
      });
    }

    if (isGroupResult) {
      const afterGroupResult = await getCompetition(session_id);
      const groupMatches = afterGroupResult.matches.filter(match => match.stage === "group");
      if (groupMatches.length && groupMatches.every(match => match.status === "completed")) {
        const firstRound = afterGroupResult.matches.filter(match => match.stage === "main").reduce((min, match) => Math.min(min, Number(match.round)), Infinity);
        const firstRoundMatches = afterGroupResult.matches.filter(match => match.stage === "main" && Number(match.round) === firstRound).sort((a, b) => Number(a.match_number) - Number(b.match_number));
        const groupOrder = [...afterGroupResult.groups].sort((a, b) => a.groupNumber - b.groupNumber);
        const qualifiers = groupOrder.map(group => getTournamentStandings({
          matches: afterGroupResult.matches,
          participants: afterGroupResult.participants,
          groups: afterGroupResult.groups,
          groupId: group.id
        }).slice(0, 2));
        const slots = [];
        for (let index = 0; index < groupOrder.length; index += 2) {
          slots.push(qualifiers[index]?.[0], qualifiers[index + 1]?.[1]);
          slots.push(qualifiers[index + 1]?.[0], qualifiers[index]?.[1]);
        }
        for (let index = 0; index < firstRoundMatches.length; index++) {
          const match = firstRoundMatches[index];
          const firstQualifier = slots[index * 2];
          const secondQualifier = slots[index * 2 + 1];
          for (const [slot, qualifier] of [[1, firstQualifier], [2, secondQualifier]]) {
            if (!qualifier) continue;
            const participant = participantById.get(String(qualifier.id));
            await patchMatch(match.match_id, {
              [slot === 1 ? "team1_id" : "team2_id"]: participant?.source_type === "team" ? participant.source_id : null,
              [slot === 1 ? "participant1_participant_id" : "participant2_participant_id"]: qualifier.id
            });
          }
        }
      }
    }

    let latestCompetition;
    try {
      latestCompetition = await getCompetition(session_id);
    } catch (cause) {
      const error = new Error("Match result was saved but competition refresh failed.", { cause });
      error.code = "MATCH_REFRESH_FAILED";
      throw error;
    }
    const { status } = getCompetitionProgress(latestCompetition.matches, {
      ...latestCompetition.session,
      participants: latestCompetition.participants,
      groups: latestCompetition.groups
    });
    let savedSessions;
    try {
      savedSessions = await query("sessions", { id: byId(session_id) }, { method: "PATCH", body: { status } });
    } catch (cause) {
      const error = new Error("Match mutation was saved but session status may be inconsistent.", { cause });
      error.code = "PARTIAL_MATCH_MUTATION";
      throw error;
    }
    if (!savedSessions.some(session => String(session.id) === String(session_id) && session.status === status)) {
      const error = new Error("Session status was not confirmed after match mutation.");
      error.code = "PARTIAL_MATCH_MUTATION";
      throw error;
    }
    try {
      return await getCompetition(session_id);
    } catch (cause) {
      const error = new Error("Match result was saved but competition refresh failed.", { cause });
      error.code = "MATCH_REFRESH_FAILED";
      throw error;
    }
  }

  async function updateWinner({ session_id, match_id, winner_team_id, score1, score2 }) {
    return applyMatchResult({ session_id, match_id, winner_team_id, score1, score2 });
  }

  async function recordMatchScore({ sessionId, matchId, score1, score2 }) {
    return applyMatchResult({ session_id: sessionId, match_id: matchId, score1, score2 });
  }

  async function recordMatchWinner({ sessionId, matchId, winnerId }) {
    return applyMatchResult({ session_id: sessionId, match_id: matchId, winner_team_id: winnerId });
  }

  return {
    listLeaderboardCompetitions,
    async listCompetitions() {
      return listLeaderboardCompetitions();
    },
    getCompetition,
    shuffleTeamPlayers,
    recordMatchScore,
    recordMatchWinner,
    async createCompetition(input) {
      const validation = validateCompetitionCreation(input);
      if (!validation.valid) {
        const error = new Error(validation.error);
        error.code = "COMPETITION_VALIDATION";
        throw error;
      }
      input = validation.value;
      const names = input.participants || [];
      const playerNames = names.flatMap(name => String(name).split(" & ").map(member => member.trim()));
      const normalizedNames = playerNames.map(name => name.toLocaleLowerCase("id-ID"));
      if (!names.length || names.some(name => String(name).split(" & ").length !== 2) || playerNames.some(name => !name) || new Set(normalizedNames).size !== normalizedNames.length) {
        throw new Error("Setiap tim harus memiliki dua pemain yang berbeda dan setiap pemain hanya dapat terdaftar satu kali.");
      }
      let inserted;
      let createStage = "session";
      try {
        inserted = (await query("sessions", {}, { method: "POST", body: { name: input.name, event_date: input.event_date || null, location: input.location || "", format: input.format, participant_mode: "team", status: "in_progress" } }))[0];
        if (!inserted?.id) throw new Error("Kompetisi tidak mengembalikan ID sesi.");
        createStage = "players";
        const people = playerNames.map(name => ({ session_id: inserted.id, name }));
        const playerRows = people.length ? await query("players", {}, { method: "POST", body: people }) : [];
        if (playerRows.length !== people.length || playerRows.some(player => String(player.session_id) !== String(inserted.id) || !player.id)) throw new Error("Data pemain yang tersimpan tidak cocok dengan sesi kompetisi.");
        createStage = "teams";
        const teamRows = names.length ? await query("teams", {}, { method: "POST", body: names.map((name, index) => ({ session_id: inserted.id, name, seed: index + 1 })) }) : [];
        if (teamRows.length !== names.length || teamRows.some(team => String(team.session_id) !== String(inserted.id) || !team.id)) throw new Error("Data tim yang tersimpan tidak cocok dengan sesi kompetisi.");
        createStage = "competition participants";
        const competitionParticipantRows = teamRows.map(team => ({ session_id: inserted.id, participant_mode: "team", team_id: team.id }));
        const savedCompetitionParticipants = await query("competition_participants", {}, { method: "POST", body: competitionParticipantRows });
        if (savedCompetitionParticipants.length !== teamRows.length || savedCompetitionParticipants.some(participant => String(participant.session_id) !== String(inserted.id) || !participant.id || !participant.team_id)) throw new Error("Identitas peserta kompetisi tidak tersimpan lengkap.");
        createStage = "team members";
        const membershipRows = teamRows.flatMap((team, index) => [1, 2].map(position => ({ session_id: inserted.id, team_id: team.id, player_id: playerRows[index * 2 + position - 1].id, position })));
        if (new Set(membershipRows.map(row => `${row.team_id}:${row.position}`)).size !== membershipRows.length || new Set(membershipRows.map(row => String(row.player_id))).size !== membershipRows.length) throw new Error("Keanggotaan tim memiliki pemain atau posisi duplikat.");
        const savedMemberships = await query("team_members", {}, { method: "POST", body: membershipRows });
        const savedMembershipKeys = new Set(savedMemberships.map(row => `${row.team_id}:${row.player_id}:${row.position}`));
        if (savedMemberships.length !== membershipRows.length || savedMemberships.some(row => String(row.session_id) !== String(inserted.id)) || membershipRows.some(row => !savedMembershipKeys.has(`${row.team_id}:${row.player_id}:${row.position}`))) throw new Error("Keanggotaan tim tidak tersimpan lengkap pada sesi kompetisi.");
        createStage = "bracket and progression";
        await persistBracket(inserted.id, teamRows, savedCompetitionParticipants, {
          format: validation.value.format,
          groupCount: validation.value.group_count,
          onStage: stage => { createStage = `bracket and progression: ${stage}`; }
        });
        createStage = "refreshing created competition";
        return await getCompetition(inserted.id);
      } catch (error) {
        error.creationStage = createStage;
        if (error.code === "23514" && (error.constraint === "sessions_format_check" || error.message.includes("sessions_format_check"))) {
          const validationError = new Error("Format kompetisi ditolak database. Pastikan constraint sessions.format di Supabase mengizinkan format ini.", { cause: error });
          validationError.code = "COMPETITION_VALIDATION";
          throw validationError;
        }
        if (inserted?.id) {
          const cleanupFailures = await cleanupCompetition(inserted.id);
          if (cleanupFailures.length) {
            error.code = "COMPETITION_CLEANUP_FAILED";
            error.cleanupFailures = cleanupFailures.map(({ table, error: failure }) => ({ table, message: failure.message, code: failure.code, details: failure.details, hint: failure.hint }));
            console.error("Pembersihan kompetisi yang gagal sebagian juga gagal.", error.cleanupFailures);
          }
        }
        console.error("Gagal membuat kompetisi melalui Supabase.", error);
        throw error;
      }
    },
    async addPlayer({ session_id, name }) {
      const current = await getCompetition(session_id);
      const validation = validateParticipantAddition({ competition: current, name });
      if (!validation.valid) {
        const error = new Error(validation.error);
        error.code = "PARTICIPANT_VALIDATION";
        throw error;
      }
      const player = (await query("players", {}, { method: "POST", body: { session_id, name: validation.name } }))[0];
      if (!player?.id) throw new Error("Data peserta tersimpan tanpa ID yang dapat dipakai.");
      try {
        await query("competition_participants", {}, {
          method: "POST",
          body: { session_id, participant_mode: "individual", player_id: player.id }
        });
      } catch (cause) {
        const error = new Error("Peserta tersimpan, tetapi identitas kompetisinya gagal dibuat.", { cause });
        error.code = "PARTICIPANT_REFRESH_FAILED";
        throw error;
      }
      try {
        return await getCompetition(session_id);
      } catch (cause) {
        const error = new Error("Peserta tersimpan, tetapi data kompetisi gagal dimuat ulang.", { cause });
        error.code = "PARTICIPANT_REFRESH_FAILED";
        throw error;
      }
    },
    recordWinner: updateWinner,
    recordScore: updateWinner
  };
}
