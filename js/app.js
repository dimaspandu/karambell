import { dataService } from "./data/service.js";
import { getCompetitionProgress } from "./data/competition-progress.js";

(() => {
  "use strict";

  // The service owns provider selection; UI and tournament rendering stay provider agnostic.

  const state = {
    sessions: [],
    activeSessionId: null,
    activeTab: "bracket",
    listRouteName: "home",
    toastTimer: null,
    toastHideTimer: null,
    loading: false,
    routeRequest: 0
  };
  const loadedSessionIds = new Set();
  const LAST_SESSION_KEY = "karambell:last-session-id";
  const TEAM_PAIRING_DRAFT_KEY = "karambell:team-pairing-draft";
  const TEAM_SESSION_IDS_KEY = "karambell:team-session-ids";
  let generatedTeamPreview = null;
  let bracketResizeObserver = null;
  let bracketConnectorFrame = 0;
  let bracketResizeFallbackBound = false;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
  const formatDate = (date) => {
    if (!date) return "Tanggal belum ditentukan";
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(parsed);
  };
  const currentSession = () => state.sessions.find(session => session.id === state.activeSessionId);
  const matchRoundName = (round, totalRounds) => {
    if (round === totalRounds) return "Final";
    if (round === totalRounds - 1) return "Semifinal";
    if (round === totalRounds - 2) return "Perempat final";
    return `Babak ${round}`;
  };
  const nextPowerOfTwo = (number) => {
    let power = 1;
    while (power < number) power *= 2;
    return power;
  };

  function isLocallyKnownTeamSession(sessionId) {
    try {
      const ids = JSON.parse(window.localStorage.getItem(TEAM_SESSION_IDS_KEY) || "[]");
      return Array.isArray(ids) && ids.includes(String(sessionId));
    } catch { return false; }
  }

  function rememberTeamSession(sessionId) {
    try {
      const stored = JSON.parse(window.localStorage.getItem(TEAM_SESSION_IDS_KEY) || "[]");
      const ids = Array.isArray(stored) ? stored.map(String) : [];
      if (!ids.includes(String(sessionId))) ids.push(String(sessionId));
      window.localStorage.setItem(TEAM_SESSION_IDS_KEY, JSON.stringify(ids));
    } catch { /* The persisted session format remains the cross-device source. */ }
  }

  function normalizeSession(payload) {
    const raw = payload.session || {};
    const participants = (payload.participants || []).map(participant => ({
      id: String(participant.participant_id),
      name: String(participant.name || ""),
      seed: Number(participant.seed || 0)
    }));
    const matches = (payload.matches || []).map(match => ({
      id: String(match.match_id),
      round: Number(match.round),
      index: Number(match.match_number) - 1,
      participant1Id: match.participant1_id ? String(match.participant1_id) : null,
      participant2Id: match.participant2_id ? String(match.participant2_id) : null,
      score1: match.score1 === "" || match.score1 === null || match.score1 === undefined ? null : Number(match.score1),
      score2: match.score2 === "" || match.score2 === null || match.score2 === undefined ? null : Number(match.score2),
      winnerId: match.winner_id ? String(match.winner_id) : null,
      status: String(match.status || "pending"),
      nextMatchId: match.next_match_id ? String(match.next_match_id) : null,
      nextSlot: match.next_slot || null
    }));
    const totalRounds = matches.reduce((max, match) => Math.max(max, match.round), 0);
    return {
      id: String(raw.session_id),
      name: String(raw.name || "Kompetisi tanpa nama"),
      date: raw.event_date ? String(raw.event_date).slice(0, 10) : "",
      location: String(raw.location || ""),
      format: raw.format === "single_elimination" ? "single" : String(raw.format || "single"),
      isTeamCompetition: ["team_single_elimination", "team"].includes(String(raw.format || "").toLowerCase()) || isLocallyKnownTeamSession(raw.session_id),
      status: String(raw.status || "draft"),
      participants,
      matches,
      totalRounds,
      createdAt: raw.created_at || "",
      updatedAt: raw.updated_at || ""
    };
  }

  function saveSessionInState(session) {
    const index = state.sessions.findIndex(item => item.id === session.id);
    if (index >= 0) state.sessions[index] = session;
    else state.sessions.unshift(session);
    loadedSessionIds.add(session.id);
    return session;
  }

  async function fetchSession(sessionId) {
    const payload = await dataService.getCompetition(sessionId);
    const session = normalizeSession(payload);
    loadedSessionIds.add(session.id);
    return session;
  }

  function handleRoute(route) {
    const requestId = ++state.routeRequest;
    if (route.error) showToast(route.error);
    if (!route.sessionId) {
      if (["participants", "bracket", "matches"].includes(route.name)) {
        let lastSessionId = null;
        try { lastSessionId = window.localStorage.getItem(LAST_SESSION_KEY); }
        catch { /* Storage may be disabled; the competition picker still works. */ }
        const lastSession = state.sessions.find(session => session.id === lastSessionId);
        const session = lastSession || state.sessions[0] || null;
        if (session) {
          window.KarambellRouter.navigate(route.name, { sessionId: session.id }, { replace: true });
          return;
        }
      }
      state.activeSessionId = null;
      state.listRouteName = route.name;
      showView("sessions");
      renderSessions();
      return;
    }
    state.listRouteName = null;
    void openSession(route.sessionId, { tab: route.tab || "bracket", requestId });
  }

  async function loadSessions() {
    state.loading = true;
    renderSessions();
    try {
      const sessions = (await dataService.listCompetitions()).map(normalizeSession);
      state.sessions = sessions;
      renderSessions();
      if (state.activeSessionId) {
        const active = state.sessions.find(session => session.id === state.activeSessionId);
        if (active) renderDetails();
      }
    } catch (error) {
      renderSessions();
      reportOperationFailure("Gagal memuat data kompetisi. Silakan coba lagi.", error);
    } finally {
      state.loading = false;
      renderSessions();
    }
  }

  function buildBracket(session) {
    const participants = session.participants;
    const size = nextPowerOfTwo(participants.length);
    const totalRounds = Math.log2(size);
    // Give the first seeds a bye, then pair the remaining entrants in the opening round.
    const byeCount = size - participants.length;
    const byeParticipants = participants.slice(0, byeCount);
    const openingRoundParticipants = participants.slice(byeCount);
    const matches = [];
    for (let round = 1; round <= totalRounds; round++) {
      const count = size / (2 ** round);
      for (let index = 0; index < count; index++) {
        matches.push({
          id: `M${matches.length + 1}`,
          round,
          index,
          participant1Id: null,
          participant2Id: null,
          score1: null,
          score2: null,
          winnerId: null,
          status: "pending"
        });
      }
    }
    const getMatch = (round, index) => matches.find(match => match.round === round && match.index === index);
    for (let i = 0; i < size / 2; i++) {
      const match = getMatch(1, i);
      if (i < byeParticipants.length) {
        match.participant1Id = byeParticipants[i].id;
        match.participant2Id = null;
        match.winnerId = byeParticipants[i].id;
        match.status = "bye";
      } else {
        const offset = (i - byeParticipants.length) * 2;
        match.participant1Id = openingRoundParticipants[offset]?.id || null;
        match.participant2Id = openingRoundParticipants[offset + 1]?.id || null;
        if (!match.participant1Id && !match.participant2Id) match.status = "bye";
      }
    }
    for (let round = 2; round <= totalRounds; round++) {
      const count = size / (2 ** round);
      for (let index = 0; index < count; index++) {
        const previous1 = getMatch(round - 1, index * 2);
        const previous2 = getMatch(round - 1, index * 2 + 1);
        const match = getMatch(round, index);
        match.participant1Id = previous1?.winnerId || null;
        match.participant2Id = previous2?.winnerId || null;
      }
    }
    session.matches = matches;
    session.totalRounds = totalRounds;
  }

  function propagateWinners(session) {
    const matches = session.matches;
    const getMatch = (round, index) => matches.find(match => match.round === round && match.index === index);
    for (let round = 2; round <= session.totalRounds; round++) {
      const count = nextPowerOfTwo(session.participants.length) / (2 ** round);
      for (let index = 0; index < count; index++) {
        const match = getMatch(round, index);
        const previous1 = getMatch(round - 1, index * 2);
        const previous2 = getMatch(round - 1, index * 2 + 1);
        match.participant1Id = previous1?.winnerId || null;
        match.participant2Id = previous2?.winnerId || null;
        // A downstream result is invalid if its incoming participants changed.
        if (match.winnerId && ![match.participant1Id, match.participant2Id].includes(match.winnerId)) {
          match.winnerId = null;
          match.score1 = null;
          match.score2 = null;
          match.status = "pending";
        }
      }
    }
    session.status = getCompetitionProgress(session.matches).status;
  }

  function getParticipant(session, id) {
    return session.participants.find(participant => participant.id === id) || null;
  }

  function competitorInitials(session, participant) {
    if (!participant) return "";
    if (!session.isTeamCompetition) return initials(participant.name);
    return participant.name.split(" & ").map(name => initials(name)).join("&");
  }

  function getRoundMatches(session, round) {
    return session.matches.filter(match => match.round === round).sort((a, b) => a.index - b.index);
  }

  function completedCount(session) {
    return getCompetitionProgress(session.matches).completedMatches;
  }

  function competitorCountLabel(session) {
    return session.isTeamCompetition ? `${session.participants.length} tim` : `${session.participants.length} peserta`;
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    clearTimeout(state.toastTimer);
    clearTimeout(state.toastHideTimer);
    if (typeof toast.showPopover === "function" && !toast.matches(":popover-open")) toast.showPopover();
    toast.classList.add("toast--visible");
    state.toastTimer = setTimeout(() => {
      toast.classList.remove("toast--visible");
      state.toastHideTimer = setTimeout(() => {
        if (typeof toast.hidePopover === "function" && toast.matches(":popover-open")) toast.hidePopover();
      }, 220);
    }, 2600);
  }

  function reportOperationFailure(message, error) {
    console.error(message, error);
    showToast(message);
  }

  function showView(view) {
    $$(".view").forEach(section => section.classList.toggle("view--active", section.id === `${view}-view`));
    const activeRoute = view === "detail"
      ? state.activeTab === "matches" ? "bracket" : state.activeTab
      : ["participants", "bracket", "matches"].includes(state.listRouteName) ? state.listRouteName === "matches" ? "bracket" : state.listRouteName : "competitions";
    $$(".nav__item").forEach(link => link.classList.toggle("nav__item--active", link.dataset.route === activeRoute));
    $("#page-title").textContent = view === "detail"
      ? state.activeTab === "participants" ? "Peserta Kompetisi" : state.activeTab === "matches" ? "Daftar Pertandingan" : "Bagan Pertandingan"
      : ["participants", "bracket", "matches"].includes(state.listRouteName) ? "Pilih Kompetisi" : "Sesi Kompetisi";
  }

  function renderSessions() {
    $("#session-count").textContent = `${state.sessions.length} sesi`;
    const list = $("#session-list");
    if (!state.sessions.length) {
      const title = state.loading ? "Menghubungkan ke layanan data…" : "Belum ada sesi kompetisi";
      const description = state.loading ? "Mengambil data sesi yang tersimpan." : "Buat sesi pertamamu untuk mulai menyusun bagan.";
      list.innerHTML = `<div class="empty-state"><h3>${title}</h3><p>${description}</p>${state.loading ? "" : `<button class="button button--primary" data-action="create">＋ Buat Sesi</button>`}</div>`;
      return;
    }
    list.innerHTML = state.sessions.map(session => {
      const summary = getCompetitionProgress(session.matches);
      const { completedMatches: done, totalMatches: total, progress } = summary;
      const champion = summary.championId ? getParticipant(session, summary.championId)?.name : null;
      return `<button class="session-card" data-open-session="${escapeHTML(session.id)}">
        <div class="session-card__top"><span class="session-card__emblem">✦</span><span class="session-card__arrow">↗</span></div>
        <h3>${escapeHTML(session.name)}</h3>
        <p class="session-card__meta">${escapeHTML(formatDate(session.date))}${session.location ? ` · ${escapeHTML(session.location)}` : ""}</p>
        <div class="session-card__bottom"><span>${competitorCountLabel(session)}</span><span>${summary.isComplete ? "Selesai" : "Berlangsung"}</span></div>
        <div class="progress" aria-label="Progres ${progress}%"><span style="width:${progress}%"></span></div>
        <div class="session-card__bottom"><span>${done} dari ${total} pertandingan selesai</span><span>${champion ? `Juara: ${escapeHTML(champion)}` : `${progress}%`}</span></div>
      </button>`;
    }).join("");
  }

  function renderDetails() {
    const session = currentSession();
    if (!session) return;
    const summary = getCompetitionProgress(session.matches);
    const done = summary.completedMatches;
    const total = session.matches.length;
    const champion = summary.championId ? getParticipant(session, summary.championId)?.name : null;
    $("#detail-title").textContent = session.name;
    $("#detail-meta").textContent = `${session.isTeamCompetition ? `${session.participants.length * 2} pemain · ${session.participants.length} tim` : `${session.participants.length} peserta`} · ${formatDate(session.date)}${session.location ? ` · ${session.location}` : ""}`;
    $("#detail-status").textContent = summary.isComplete ? "Selesai" : "Berlangsung";
    $("#detail-format").textContent = session.isTeamCompetition ? "Tim · Single elimination" : "Single elimination";
    $("#stat-participants-label").textContent = session.isTeamCompetition ? "Tim" : "Peserta";
    $("#stat-participants").textContent = session.participants.length;
    $("#stat-matches").textContent = total;
    $("#stat-completed").textContent = `${done} / ${total}`;
    $("#stat-champion").textContent = champion || "Belum ada";
    $("#participant-tab-count").textContent = session.participants.length;
    $("#participant-tab-label").textContent = session.isTeamCompetition ? "Tim" : "Peserta";
    $("#participant-list-title").textContent = session.isTeamCompetition ? "Daftar tim" : "Daftar peserta";
    $("#participant-list-description").textContent = session.isTeamCompetition ? "Setiap tim terdiri dari dua pemain. Komposisi tersimpan bersama kompetisi." : "Peserta yang terdaftar dalam sesi ini.";
    $("#match-list-description").textContent = session.isTeamCompetition ? "Pilih tim yang menang. Hasil disimpan dan pemenang maju otomatis." : "Perbarui skor atau periksa status setiap pertandingan.";
    $("#bracket-help").textContent = session.isTeamCompetition ? "Pilih Menang pada tim pemenang; tim lainnya otomatis tercatat Kalah." : "Tekan kartu pertandingan untuk memasukkan atau memperbarui skor.";
    $("#match-participants-heading").textContent = session.isTeamCompetition ? "Tim" : "Pemain";
    $("#match-result-heading").textContent = session.isTeamCompetition ? "Hasil" : "Skor";
    $("#add-participant-open").hidden = session.isTeamCompetition;
    $("#team-pairing-locked").hidden = !session.isTeamCompetition;
    renderBracket(session);
    renderParticipants(session);
    renderMatchTable(session);
  }

  function matchCardHTML(session, match, round) {
    const player1 = getParticipant(session, match.participant1Id);
    const player2 = getParticipant(session, match.participant2Id);
    const canEdit = Boolean(player1 && player2);
    const playerHTML = (player, score, side) => {
      const isWinner = Boolean(player && match.winnerId === player.id);
      const isLoser = Boolean(player && match.winnerId && !isWinner);
      const result = session.isTeamCompetition
        ? match.status === "bye" ? (isWinner ? "Menang" : player ? "" : "Bye") : match.winnerId ? (isWinner ? "Menang" : "Kalah") : ""
        : score === null || score === undefined ? "–" : score;
      return `<div class="match-player ${isWinner ? "match-player--winner" : ""} ${isLoser ? "match-player--loser" : ""} ${!player ? "match-player--empty" : ""}">
        <span class="match-player__avatar">${player ? escapeHTML(competitorInitials(session, player)) : "—"}</span>
        <span class="match-player__name">${player ? escapeHTML(player.name) : (match.status === "bye" ? "Bye" : "Menunggu")}</span>
        <span class="match-player__score ${session.isTeamCompetition && result ? "match-player__result" : ""}">${result}</span>
        ${isWinner ? `<span class="match-player__win" aria-label="Pemenang">✓</span>` : ""}
      </div>`;
    };
    const statusLabel = match.status === "completed" ? "Selesai" : match.status === "bye" ? "Bye" : canEdit ? "Belum dimainkan" : "Menunggu";
    const editAttribute = !session.isTeamCompetition && canEdit ? `data-edit-match="${escapeHTML(match.id)}" tabindex="0" role="button" aria-label="Update skor ${escapeHTML(match.id)}"` : "";
    const teamActions = session.isTeamCompetition && canEdit ? `<div class="team-result-actions"><button type="button" data-team-match="${escapeHTML(match.id)}">${match.winnerId ? "Ubah pemenang" : "Tentukan pemenang"}</button></div>` : "";
    return `<article class="match-card ${session.isTeamCompetition ? "match-card--teams" : ""} ${!session.isTeamCompetition && canEdit ? "match-card--clickable" : ""}" data-bracket-round="${round}" data-bracket-index="${match.index}" ${editAttribute}>
      <div class="match-card__head"><span>${escapeHTML(match.id)} · ${escapeHTML(matchRoundName(round, session.totalRounds))}</span><span>${statusLabel}</span></div>
      ${playerHTML(player1, match.score1, 1)}
      ${playerHTML(player2, match.score2, 2)}
      ${session.isTeamCompetition ? teamActions : canEdit ? `<button class="match-card__edit" type="button" data-edit-match="${escapeHTML(match.id)}">${match.status === "completed" ? "✎ Ubah skor" : "＋ Input skor"}</button>` : ""}
    </article>`;
  }

  function renderBracket(session) {
    const container = $("#bracket");
    const rounds = [];
    for (let round = 1; round <= session.totalRounds; round++) rounds.push(round);
    const roundNames = rounds.map(round => matchRoundName(round, session.totalRounds));
    const columns = rounds.map((round, index) => {
      const matches = getRoundMatches(session, round);
      const roundClass = round === 1 ? "r1" : round === session.totalRounds ? "r3" : "r2";
      return `<section class="bracket__round bracket__round--${roundClass}" aria-label="${escapeHTML(roundNames[index])}">
        <h4 class="bracket__round-title">${escapeHTML(roundNames[index])}</h4>
        ${matches.map(match => matchCardHTML(session, match, round)).join("")}
      </section>`;
    }).join("");
    const finalMatch = session.matches.find(match => match.round === session.totalRounds);
    const champion = finalMatch?.winnerId ? getParticipant(session, finalMatch.winnerId) : null;
    const championColumn = `<section class="bracket__round bracket__round--champion"><h4 class="bracket__round-title">Juara</h4><div class="champion-card"><div class="champion-card__crown">♛</div><div class="champion-card__avatar">${champion ? escapeHTML(competitorInitials(session, champion)) : "?"}</div><strong>${champion ? escapeHTML(champion.name) : "Belum ada"}</strong><p>${champion ? "Juara kompetisi" : "Menunggu final"}</p></div></section>`;
    container.innerHTML = columns + championColumn;
    observeBracketForConnectors(container);
  }

  function scheduleBracketConnectorUpdate() {
    if (bracketConnectorFrame) cancelAnimationFrame(bracketConnectorFrame);
    bracketConnectorFrame = requestAnimationFrame(() => {
      bracketConnectorFrame = 0;
      updateBracketConnectors();
    });
  }

  function observeBracketForConnectors(container) {
    if (window.ResizeObserver) {
      if (!bracketResizeObserver) bracketResizeObserver = new ResizeObserver(scheduleBracketConnectorUpdate);
      bracketResizeObserver.disconnect();
      bracketResizeObserver.observe(container);
      container.querySelectorAll(".match-card, .champion-card").forEach(card => bracketResizeObserver.observe(card));
    } else if (!bracketResizeFallbackBound) {
      window.addEventListener("resize", scheduleBracketConnectorUpdate, { passive: true });
      bracketResizeFallbackBound = true;
    }
    scheduleBracketConnectorUpdate();
  }

  function updateBracketConnectors() {
    const container = $("#bracket");
    if (!container) return;
    const rootRect = container.getBoundingClientRect();
    const width = container.scrollWidth;
    const height = container.scrollHeight;
    if (!width || !height || !rootRect.width || !rootRect.height) return;

    let svg = container.querySelector(".bracket__connectors");
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("bracket__connectors");
      svg.setAttribute("aria-hidden", "true");
      container.prepend(svg);
    }
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const cards = [...container.querySelectorAll(".match-card[data-bracket-round]")];
    const byRoundAndIndex = new Map(cards.map(card => [`${card.dataset.bracketRound}:${card.dataset.bracketIndex}`, card]));
    const finalRound = Math.max(0, ...cards.map(card => Number(card.dataset.bracketRound)));
    const point = (element, side) => {
      const rect = element.getBoundingClientRect();
      return {
        x: (side === "right" ? rect.right : rect.left) - rootRect.left,
        y: rect.top - rootRect.top + rect.height / 2
      };
    };
    const paths = [];
    cards.forEach(card => {
      const round = Number(card.dataset.bracketRound);
      const index = Number(card.dataset.bracketIndex);
      const next = byRoundAndIndex.get(`${round + 1}:${Math.floor(index / 2)}`);
      const championCard = round === finalRound
        ? container.querySelector(".champion-card")
        : null;
      const target = next || championCard;
      if (!target) return;

      const start = point(card, "right");
      const end = point(target, "left");
      const middleX = start.x + (end.x - start.x) / 2;
      paths.push(`<path d="M ${start.x} ${start.y} H ${middleX} V ${end.y} H ${end.x}"/>`);
    });
    svg.innerHTML = paths.join("");
  }

  function renderParticipants(session) {
    $("#participant-list").innerHTML = session.participants.map((participant, index) => `<div class="participant-row"><span class="participant-row__number">${String(index + 1).padStart(2, "0")}</span><span class="participant-row__avatar">${escapeHTML(competitorInitials(session, participant))}</span><span class="participant-row__name">${escapeHTML(participant.name)}</span><span class="participant-row__status">${session.isTeamCompetition ? `Tim ${String(index + 1).padStart(2, "0")}` : "Terdaftar"}</span></div>`).join("");
  }

  function renderMatchTable(session) {
    $("#match-table-body").innerHTML = session.matches.map(match => {
      const p1 = getParticipant(session, match.participant1Id);
      const p2 = getParticipant(session, match.participant2Id);
      const winnerIsFirst = match.winnerId && match.winnerId === match.participant1Id;
      const score = session.isTeamCompetition
        ? match.status === "bye" ? "Bye" : winnerIsFirst ? "Menang — Kalah" : match.winnerId ? "Kalah — Menang" : "Belum dimainkan"
        : match.score1 === null ? "–" : `${match.score1} — ${match.score2}`;
      const status = match.status === "completed" ? "Selesai" : match.status === "bye" ? "Bye" : p1 && p2 ? "Belum dimainkan" : "Menunggu";
      const action = p1 && p2
        ? session.isTeamCompetition
          ? `<button class="table-action" data-team-match="${escapeHTML(match.id)}">${match.winnerId ? "Ubah pemenang" : "Tentukan pemenang"}</button>`
          : `<button class="table-action" data-edit-match="${escapeHTML(match.id)}">${match.status === "completed" ? "Ubah skor" : "Input skor"}</button>`
        : "";
      return `<tr><td><strong>${escapeHTML(match.id)}</strong></td><td>${escapeHTML(matchRoundName(match.round, session.totalRounds))}</td><td>${p1 ? escapeHTML(p1.name) : "—"} vs ${p2 ? escapeHTML(p2.name) : "—"}</td><td>${score}</td><td><span class="status-pill ${match.status === "completed" ? "status-pill--done" : ""}">${status}</span></td><td>${action}</td></tr>`;
    }).join("");
  }

  async function openSession(id, { tab = "bracket", requestId } = {}) {
    state.activeSessionId = id;
    state.activeTab = tab;
    showView("detail");
    setTab(tab);
    try {
      let session = state.sessions.find(item => item.id === id);
      if (!loadedSessionIds.has(id)) session = await fetchSession(id);
      if (requestId !== state.routeRequest || window.KarambellRouter.resolve().sessionId !== id) return;
      if (!session || session.id !== id) throw new Error("Kompetisi tidak ditemukan.");
      saveSessionInState(session);
      try { window.localStorage.setItem(LAST_SESSION_KEY, id); }
      catch { /* Routing remains functional when storage is unavailable. */ }
    } catch (error) {
      if (requestId !== state.routeRequest || window.KarambellRouter.resolve().sessionId !== id) return;
      state.activeSessionId = null;
      state.listRouteName = "competitions";
      showView("sessions");
      renderSessions();
      reportOperationFailure("Gagal memuat data kompetisi. Silakan coba lagi.", error);
      window.KarambellRouter.navigate("competitions", {}, { replace: true });
      return;
    }
    if (requestId !== state.routeRequest || window.KarambellRouter.resolve().sessionId !== id) return;
    renderDetails();
    renderSessions();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setTab(tab) {
    state.activeTab = tab;
    $$(".tab").forEach(button => {
      const active = button.dataset.route === tab;
      button.classList.toggle("tab--active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $$(".tab-panel").forEach(panel => panel.classList.toggle("tab-panel--active", panel.id === `${tab}-panel`));
    $$(".nav__item").forEach(link => link.classList.toggle("nav__item--active", link.dataset.route === (tab === "matches" ? "bracket" : tab)));
  }

  function parseParticipantInput(value) {
    const names = String(value || "").split(/[\n,;]+/).map(name => name.trim()).filter(Boolean);
    const seen = new Set();
    const duplicates = [];
    names.forEach(name => {
      const key = name.toLocaleLowerCase("id-ID");
      if (seen.has(key)) duplicates.push(name);
      else seen.add(key);
    });
    return { names, duplicates };
  }

  function updatePairingControls() {
    const input = $("#create-session-form").elements.participants;
    const { names, duplicates } = parseParticipantInput(input.value);
    const generateButton = $("#generate-teams");
    const submitButton = $("#create-session-submit");
    const summary = $("#pairing-summary");
    const preview = $("#team-preview");
    const validCount = names.length >= 4 && names.length % 2 === 0;
    generateButton.disabled = !validCount || duplicates.length > 0;
    const previewNames = generatedTeamPreview?.flatMap(team => team.members).map(name => name.toLocaleLowerCase("id-ID")).sort() || [];
    const inputNames = names.map(name => name.toLocaleLowerCase("id-ID")).sort();
    const previewStillMatches = generatedTeamPreview && previewNames.length === names.length
      && previewNames.join("\u0000") === inputNames.join("\u0000");
    submitButton.disabled = !previewStillMatches || duplicates.length > 0;

    if (duplicates.length) summary.textContent = `Nama duplikat: ${[...new Set(duplicates)].join(", ")}. Hapus duplikat sebelum mengacak tim.`;
    else if (names.length % 2) summary.textContent = `${names.length} pemain — jumlah ganjil. Tambah atau hapus satu pemain sebelum mengacak tim.`;
    else if (names.length < 4) summary.textContent = `${names.length} pemain — minimal 4 pemain diperlukan untuk membuat dua tim.`;
    else summary.textContent = `${names.length} pemain · ${names.length / 2} tim${generatedTeamPreview ? " · pasangan siap disimpan" : " · acak pasangan untuk melanjutkan"}`;

    if (generatedTeamPreview) {
      preview.innerHTML = generatedTeamPreview.map((team, index) => `<div class="team-preview__item"><span>Tim ${String(index + 1).padStart(2, "0")}</span><strong>${escapeHTML(team.members[0])} &amp; ${escapeHTML(team.members[1])}</strong></div>`).join("");
    } else {
      preview.replaceChildren();
    }
  }

  function generateRandomTeams() {
    const input = $("#create-session-form").elements.participants;
    const { names, duplicates } = parseParticipantInput(input.value);
    if (duplicates.length || names.length < 4 || names.length % 2) {
      updatePairingControls();
      return;
    }
    const shuffled = [...names];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    generatedTeamPreview = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      generatedTeamPreview.push({ id: `draft-team-${i / 2 + 1}`, members: shuffled.slice(i, i + 2) });
    }
    try {
      window.localStorage.setItem(TEAM_PAIRING_DRAFT_KEY, JSON.stringify({ participants: names, teams: generatedTeamPreview }));
    } catch { /* Sheets remains the persistent source after the session is created. */ }
    updatePairingControls();
  }

  function restoreTeamPairingDraft() {
    let draft;
    try { draft = JSON.parse(window.localStorage.getItem(TEAM_PAIRING_DRAFT_KEY) || "null"); }
    catch { draft = null; }
    if (!draft || !Array.isArray(draft.participants) || !Array.isArray(draft.teams)) return;
    const draftMembers = draft.teams.flatMap(team => Array.isArray(team.members) ? team.members : []);
    const expected = draft.participants.map(name => String(name).toLocaleLowerCase("id-ID")).sort();
    const actual = draftMembers.map(name => String(name).toLocaleLowerCase("id-ID")).sort();
    if (draft.teams.some(team => !Array.isArray(team.members) || team.members.length !== 2) || expected.length < 4 || expected.length % 2 || new Set(expected).size !== expected.length || expected.join("\u0000") !== actual.join("\u0000")) {
      try { window.localStorage.removeItem(TEAM_PAIRING_DRAFT_KEY); } catch { /* Ignore unavailable storage. */ }
      return;
    }
    const form = $("#create-session-form");
    form.elements.participants.value = draft.participants.join(", ");
    generatedTeamPreview = draft.teams.map((team, index) => ({ id: `draft-team-${index + 1}`, members: team.members.map(String) }));
    updatePairingControls();
  }

  function openScoreModal(matchId) {
    const session = currentSession();
    const match = session?.matches.find(item => item.id === matchId);
    if (!match) return;
    const p1 = getParticipant(session, match.participant1Id);
    const p2 = getParticipant(session, match.participant2Id);
    if (!p1 || !p2) return;
    const form = $("#score-form");
    form.elements.matchId.value = match.id;
    form.elements.score1.value = match.score1 ?? 0;
    form.elements.score2.value = match.score2 ?? 0;
    $("#score-match-label").textContent = `PERTANDINGAN ${match.id}`;
    $("#score-round-label").textContent = `${matchRoundName(match.round, session.totalRounds)} · Masukkan skor akhir pemain.`;
    $("#score-player-1").textContent = p1.name;
    $("#score-player-2").textContent = p2.name;
    $("#score-avatar-1").textContent = initials(p1.name);
    $("#score-avatar-2").textContent = initials(p2.name);
    $("#score-modal").showModal();
  }

  function openTeamWinnerModal(matchId) {
    const session = currentSession();
    const match = session?.matches.find(item => item.id === matchId);
    if (!session?.isTeamCompetition || !match) return;
    const team1 = getParticipant(session, match.participant1Id);
    const team2 = getParticipant(session, match.participant2Id);
    if (!team1 || !team2) return;

    $("#team-winner-match-label").textContent = `${match.id} · ${matchRoundName(match.round, session.totalRounds)}`;
    $("#team-winner-match-id").value = match.id;
    $("#team-winner-options").innerHTML = [team1, team2].map(team => `
      <label class="team-winner-option ${match.winnerId === team.id ? "team-winner-option--selected" : ""}">
        <input type="radio" name="winnerId" value="${escapeHTML(team.id)}" ${match.winnerId === team.id ? "checked" : ""} required>
        <span><strong>${escapeHTML(team.name)}</strong><small>${match.winnerId === team.id ? "Pemenang saat ini" : "Pilih sebagai pemenang"}</small></span>
      </label>`).join("");
    $("#team-winner-modal").showModal();
  }

  async function chooseTeamWinner(matchId, winnerId) {
    const session = currentSession();
    const match = session?.matches.find(item => item.id === matchId);
    if (!session?.isTeamCompetition || !match || ![match.participant1Id, match.participant2Id].includes(winnerId)) return;
    if (match.winnerId === winnerId) return true;
    if (match.winnerId) {
      const previousWinner = getParticipant(session, match.winnerId)?.name || "tim sebelumnya";
      const nextWinner = getParticipant(session, winnerId)?.name || "tim yang dipilih";
      if (!window.confirm(`Hasil sudah tercatat: ${previousWinner} menang. Ganti hasil menjadi ${nextWinner} menang? Hasil babak berikutnya yang bergantung pada pertandingan ini juga dapat berubah.`)) return false;
    }

    const score1 = winnerId === match.participant1Id ? 1 : 0;
    const score2 = winnerId === match.participant2Id ? 1 : 0;
    try {
      const result = await dataService.recordWinner({ session_id: session.id, match_id: match.id, score1, score2 });
      const updated = normalizeSession(result);
      updated.isTeamCompetition = true;
      updated.format = session.format;
      saveSessionInState(updated);
      renderDetails();
      renderSessions();
      showToast("Hasil Menang/Kalah tersimpan dan bagan diperbarui.");
      return true;
    } catch (error) {
      reportOperationFailure("Gagal menyimpan perubahan. Silakan coba lagi.", error);
      return false;
    }
  }

  async function createSession(formData) {
    const { names, duplicates } = parseParticipantInput(formData.get("participants"));
    const previewNames = generatedTeamPreview?.flatMap(team => team.members).map(name => name.toLocaleLowerCase("id-ID")).sort() || [];
    const inputNames = names.map(name => name.toLocaleLowerCase("id-ID")).sort();
    if (duplicates.length || names.length < 4 || names.length % 2 || !generatedTeamPreview || previewNames.join("\u0000") !== inputNames.join("\u0000")) {
      updatePairingControls();
      showToast("Periksa jumlah dan nama pemain, lalu acak pasangan sebelum membuat sesi.");
      return false;
    }
    const teamNames = generatedTeamPreview.map(team => team.members.join(" & "));
    const submitButton = $("#create-session-form button[type=submit]");
    submitButton.disabled = true;
    submitButton.textContent = "Menyimpan…";
    try {
      const result = await dataService.createCompetition({
          name: String(formData.get("name") || "").trim(),
          event_date: String(formData.get("date") || ""),
          location: String(formData.get("location") || "").trim(),
          format: String(formData.get("format") || "single_elimination"),
          isTeamCompetition: true,
          participants: teamNames
      });
      const session = normalizeSession(result);
      session.isTeamCompetition = true;
      session.format = "team_single_elimination";
      rememberTeamSession(session.id);
      saveSessionInState(session);
      generatedTeamPreview = null;
      try { window.localStorage.removeItem(TEAM_PAIRING_DRAFT_KEY); } catch { /* Ignore unavailable storage. */ }
      renderSessions();
      $("#create-session-modal").close();
      window.KarambellRouter.navigate("bracket", { sessionId: session.id });
      showToast("Sesi tersimpan dan bagan dibuat.");
      return true;
    } catch (error) {
      reportOperationFailure("Gagal membuat kompetisi. Silakan coba lagi.", error);
      return false;
    } finally {
      submitButton.textContent = "Buat Sesi";
      updatePairingControls();
    }
  }

  function exportPlaybook() {
    const session = currentSession();
    if (!session) return;
    // Print stylesheet/browser PDF flow keeps the prototype dependency-free.
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      showToast("Izinkan pop-up untuk membuat Playbook PDF.");
      return;
    }
    const matchRows = session.matches.map(match => {
      const p1 = getParticipant(session, match.participant1Id);
      const p2 = getParticipant(session, match.participant2Id);
      const winner = getParticipant(session, match.winnerId);
      const result = session.isTeamCompetition
        ? winner ? `${escapeHTML(winner.name)} menang` : match.status === "bye" ? "Bye" : "Belum dimainkan"
        : `${match.score1 ?? "–"} — ${match.score2 ?? "–"}`;
      return `<tr><td>${escapeHTML(match.id)}</td><td>${escapeHTML(matchRoundName(match.round, session.totalRounds))}</td><td>${escapeHTML(p1?.name || "Bye")} vs ${escapeHTML(p2?.name || "Bye")}</td><td>${result}</td><td>${escapeHTML(winner?.name || "Belum selesai")}</td></tr>`;
    }).join("");
    printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Playbook - ${escapeHTML(session.name)}</title><style>
      body{font:14px Arial,sans-serif;color:#25352b;margin:32px}h1{font-size:26px;margin-bottom:5px}h2{font-size:18px;margin-top:28px;border-bottom:2px solid #d9e5d4;padding-bottom:8px}.meta{color:#637367}ul{columns:2;line-height:1.8}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #dce3d8;padding:9px;text-align:left}th{background:#edf2e9}.note{padding:12px;background:#f2f5ed;border-radius:8px;line-height:1.6}@media print{body{margin:16mm}button{display:none}}
    </style></head><body><h1>${escapeHTML(session.name)}</h1><p class="meta">${escapeHTML(formatDate(session.date))}${session.location ? ` · ${escapeHTML(session.location)}` : ""} · ${session.isTeamCompetition ? "Tim · Single elimination" : "Single elimination"}</p><h2>${session.isTeamCompetition ? "Daftar Tim" : "Daftar Peserta"} (${session.participants.length})</h2><ul>${session.participants.map(p => `<li>${escapeHTML(p.name)}</li>`).join("")}</ul><h2>Bagan dan Hasil Pertandingan</h2><table><thead><tr><th>ID</th><th>Babak</th><th>Pertandingan</th><th>${session.isTeamCompetition ? "Hasil" : "Skor"}</th><th>Pemenang</th></tr></thead><tbody>${matchRows}</tbody></table><h2>Aturan Singkat</h2><div class="note">${session.isTeamCompetition ? "Pilih tim pemenang pada setiap pertandingan. Pemenang maju ke babak berikutnya." : "Catat skor akhir setiap pertandingan dan tetapkan pemenang. Pemenang maju ke babak berikutnya."} Playbook ini dibuat dari data sesi saat tombol ditekan.</div><p class="meta">Karambol Gamebell · Playbook kompetisi</p><script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
  }

  // Event delegation
  document.addEventListener("click", event => {
    const openButton = event.target.closest("[data-open-session]");
    if (openButton) {
      const targetRoute = ["participants", "bracket", "matches"].includes(state.listRouteName)
        ? state.listRouteName
        : "competition-detail";
      return window.KarambellRouter.navigate(targetRoute, { sessionId: openButton.dataset.openSession });
    }
    const teamMatchButton = event.target.closest("[data-team-match]");
    if (teamMatchButton) return openTeamWinnerModal(teamMatchButton.dataset.teamMatch);
    const editButton = event.target.closest("[data-edit-match]");
    if (editButton) return openScoreModal(editButton.dataset.editMatch);
    const closeButton = event.target.closest("[data-close]");
    if (closeButton) return $(`#${closeButton.dataset.close}`).close();
    const createButton = event.target.closest('[data-action="create"]');
    if (createButton) $("#create-session-modal").showModal();
  });

  $("#create-session-open").addEventListener("click", () => $("#create-session-modal").showModal());
  $("#welcome-create").addEventListener("click", () => $("#create-session-modal").showModal());
  $("#back-to-sessions").addEventListener("click", () => window.KarambellRouter.navigate("competitions", {}, { replace: true }));
  $("#add-participant-open").addEventListener("click", () => $("#participant-modal").showModal());
  $("#download-playbook").addEventListener("click", exportPlaybook);

  $$(".tab").forEach(button => button.addEventListener("click", () => {
    const session = currentSession();
    if (session) window.KarambellRouter.navigate(button.dataset.route, { sessionId: session.id });
  }));
  $$('a[data-route]').forEach(link => link.addEventListener("click", event => {
    event.preventDefault();
    const route = link.dataset.route;
    const session = currentSession();
    if (route === "home" || route === "competitions") return window.KarambellRouter.navigate(route);
    return window.KarambellRouter.navigate(route, session ? { sessionId: session.id } : {});
  }));

  $("#create-session-form").addEventListener("submit", async event => {
    event.preventDefault();
    await createSession(new FormData(event.currentTarget));
  });
  $("#create-session-form").elements.participants.addEventListener("input", () => {
    generatedTeamPreview = null;
    try { window.localStorage.removeItem(TEAM_PAIRING_DRAFT_KEY); } catch { /* Ignore unavailable storage. */ }
    updatePairingControls();
  });
  $("#generate-teams").addEventListener("click", generateRandomTeams);
  restoreTeamPairingDraft();
  updatePairingControls();

  $("#score-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const session = currentSession();
    const match = session?.matches.find(item => item.id === form.elements.matchId.value);
    if (!match) return;
    const score1 = Number(form.elements.score1.value);
    const score2 = Number(form.elements.score2.value);
    if (!Number.isFinite(score1) || !Number.isFinite(score2) || score1 < 0 || score2 < 0) {
      showToast("Skor harus berupa angka nol atau lebih.");
      return;
    }
    if (score1 === score2) {
      showToast("Skor seri belum bisa menentukan pemenang.");
      return;
    }
    const submitButton = $("#score-form button[type=submit]");
    submitButton.disabled = true;
    submitButton.textContent = "Menyimpan…";
    try {
      const result = await dataService.recordScore({
          session_id: session.id,
          match_id: match.id,
          score1,
          score2
      });
      saveSessionInState(normalizeSession(result));
      renderDetails();
      renderSessions();
      $("#score-modal").close();
      showToast("Skor tersimpan dan bagan diperbarui.");
    } catch (error) {
      reportOperationFailure("Gagal menyimpan perubahan. Silakan coba lagi.", error);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Simpan Skor";
    }
  });

  $("#team-winner-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const winnerId = new FormData(form).get("winnerId");
    if (!winnerId) return;
    submitButton.disabled = true;
    submitButton.textContent = "Menyimpan…";
    try {
      if (await chooseTeamWinner(form.elements.matchId.value, winnerId)) $("#team-winner-modal").close();
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Simpan pemenang";
    }
  });

  $("#participant-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") || "").trim();
    const session = currentSession();
    if (!session || !name) return;
    if (session.participants.some(participant => participant.name.toLocaleLowerCase("id-ID") === name.toLocaleLowerCase("id-ID"))) {
      showToast("Nama peserta sudah ada.");
      return;
    }
    const submitButton = $("#participant-form button[type=submit]");
    submitButton.disabled = true;
    submitButton.textContent = "Menyimpan…";
    try {
      const result = await dataService.addPlayer({ session_id: session.id, name });
      saveSessionInState(normalizeSession(result));
      renderDetails();
      renderSessions();
      $("#participant-modal").close();
      form.reset();
      showToast("Peserta tersimpan dan bagan diperbarui.");
    } catch (error) {
      reportOperationFailure("Gagal menyimpan perubahan. Silakan coba lagi.", error);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Tambah";
    }
  });

  // Keyboard support for clickable match cards.
  document.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-edit-match][role='button']")) {
      event.preventDefault();
      openScoreModal(event.target.dataset.editMatch);
    }
  });

  renderSessions();
  loadSessions().then(() => window.KarambellRouter.start(handleRoute));
})();
