(() => {
  "use strict";

  const state = {
    sessions: [],
    activeSessionId: null,
    activeTab: "bracket",
    toastTimer: null,
    loading: false
  };

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

  async function apiRequest(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error(`Respons server tidak valid (HTTP ${response.status}).`); }
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `Request gagal (HTTP ${response.status}).`);
    }
    return payload.data;
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
    return session;
  }

  async function fetchSession(sessionId) {
    const payload = await apiRequest(`/api/session?session_id=${encodeURIComponent(sessionId)}`);
    return normalizeSession(payload);
  }

  async function loadSessions() {
    state.loading = true;
    renderSessions();
    try {
      const result = await apiRequest("/api/sessions");
      const rows = Array.isArray(result.sessions) ? result.sessions : [];
      const sessions = await Promise.all(rows.map(async row => {
        try { return await fetchSession(row.session_id); }
        catch (error) {
          console.error(`Failed to load session ${row.session_id}:`, error);
          return normalizeSession({ session: row, participants: [], matches: [] });
        }
      }));
      state.sessions = sessions;
      renderSessions();
      if (state.activeSessionId) {
        const active = state.sessions.find(session => session.id === state.activeSessionId);
        if (active) renderDetails();
      }
    } catch (error) {
      renderSessions();
      showToast(`Gagal memuat Google Sheets: ${error.message}`);
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
    session.status = session.matches.every(match => match.status === "completed" || match.status === "bye") ? "completed" : "in_progress";
  }

  function getParticipant(session, id) {
    return session.participants.find(participant => participant.id === id) || null;
  }

  function getRoundMatches(session, round) {
    return session.matches.filter(match => match.round === round).sort((a, b) => a.index - b.index);
  }

  function completedCount(session) {
    return session.matches.filter(match => match.status === "completed").length;
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("toast--visible");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove("toast--visible"), 2600);
  }

  function showView(view) {
    $$(".view").forEach(section => section.classList.toggle("view--active", section.id === `${view}-view`));
    $$(".nav__item").forEach(link => link.classList.toggle("nav__item--active", link.dataset.view === (view === "detail" ? state.activeTab === "participants" ? "participants" : state.activeTab === "bracket" ? "bracket" : "sessions" : "sessions")));
    $("#page-title").textContent = view === "detail" ? "Detail Kompetisi" : "Sesi Kompetisi";
  }

  function renderSessions() {
    $("#session-count").textContent = `${state.sessions.length} sesi`;
    const list = $("#session-list");
    if (!state.sessions.length) {
      const title = state.loading ? "Menghubungkan ke Google Sheets…" : "Belum ada sesi kompetisi";
      const description = state.loading ? "Mengambil data sesi yang tersimpan." : "Buat sesi pertamamu untuk mulai menyusun bagan.";
      list.innerHTML = `<div class="empty-state"><h3>${title}</h3><p>${description}</p>${state.loading ? "" : `<button class="button button--primary" data-action="create">＋ Buat Sesi</button>`}</div>`;
      return;
    }
    list.innerHTML = state.sessions.map(session => {
      const done = completedCount(session);
      const total = session.matches.length;
      const progress = total ? Math.round(done / total * 100) : 0;
      const championMatch = session.matches.find(match => match.round === session.totalRounds);
      const champion = championMatch?.winnerId ? getParticipant(session, championMatch.winnerId)?.name : null;
      return `<button class="session-card" data-open-session="${escapeHTML(session.id)}">
        <div class="session-card__top"><span class="session-card__emblem">✦</span><span class="session-card__arrow">↗</span></div>
        <h3>${escapeHTML(session.name)}</h3>
        <p class="session-card__meta">${escapeHTML(formatDate(session.date))}${session.location ? ` · ${escapeHTML(session.location)}` : ""}</p>
        <div class="session-card__bottom"><span>${session.participants.length} peserta</span><span>${session.status === "completed" ? "Selesai" : "Berlangsung"}</span></div>
        <div class="progress" aria-label="Progres ${progress}%"><span style="width:${progress}%"></span></div>
        <div class="session-card__bottom"><span>${done} dari ${total} pertandingan selesai</span><span>${champion ? `Juara: ${escapeHTML(champion)}` : `${progress}%`}</span></div>
      </button>`;
    }).join("");
  }

  function renderDetails() {
    const session = currentSession();
    if (!session) return;
    const done = completedCount(session);
    const total = session.matches.length;
    const finalMatch = session.matches.find(match => match.round === session.totalRounds);
    const champion = finalMatch?.winnerId ? getParticipant(session, finalMatch.winnerId)?.name : null;
    $("#detail-title").textContent = session.name;
    $("#detail-meta").textContent = `${session.participants.length} peserta · ${formatDate(session.date)}${session.location ? ` · ${session.location}` : ""}`;
    $("#detail-status").textContent = session.status === "completed" ? "Selesai" : "Berlangsung";
    $("#stat-participants").textContent = session.participants.length;
    $("#stat-matches").textContent = total;
    $("#stat-completed").textContent = `${done} / ${total}`;
    $("#stat-champion").textContent = champion || "Belum ada";
    $("#participant-tab-count").textContent = session.participants.length;
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
      return `<div class="match-player ${isWinner ? "match-player--winner" : ""} ${isLoser ? "match-player--loser" : ""} ${!player ? "match-player--empty" : ""}">
        <span class="match-player__avatar">${player ? escapeHTML(initials(player.name)) : "—"}</span>
        <span class="match-player__name">${player ? escapeHTML(player.name) : (match.status === "bye" ? "Bye" : "Menunggu")}</span>
        <span class="match-player__score">${score === null || score === undefined ? "–" : score}</span>
        ${isWinner ? `<span class="match-player__win" aria-label="Pemenang">✓</span>` : ""}
      </div>`;
    };
    const statusLabel = match.status === "completed" ? "Selesai" : match.status === "bye" ? "Bye" : canEdit ? "Belum dimainkan" : "Menunggu";
    return `<article class="match-card ${canEdit ? "match-card--clickable" : ""}" ${canEdit ? `data-edit-match="${escapeHTML(match.id)}" tabindex="0" role="button" aria-label="Update skor ${escapeHTML(match.id)}"` : ""}>
      <div class="match-card__head"><span>${escapeHTML(match.id)} · ${escapeHTML(matchRoundName(round, session.totalRounds))}</span><span>${statusLabel}</span></div>
      ${playerHTML(player1, match.score1, 1)}
      ${playerHTML(player2, match.score2, 2)}
      ${canEdit ? `<button class="match-card__edit" type="button" data-edit-match="${escapeHTML(match.id)}">${match.status === "completed" ? "✎ Ubah skor" : "＋ Input skor"}</button>` : ""}
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
    const championColumn = `<section class="bracket__round bracket__round--champion"><h4 class="bracket__round-title">Juara</h4><div class="champion-card"><div class="champion-card__crown">♛</div><div class="champion-card__avatar">${champion ? escapeHTML(initials(champion.name)) : "?"}</div><strong>${champion ? escapeHTML(champion.name) : "Belum ada"}</strong><p>${champion ? "Juara kompetisi" : "Menunggu final"}</p></div></section>`;
    container.innerHTML = columns + championColumn;
  }

  function renderParticipants(session) {
    $("#participant-list").innerHTML = session.participants.map((participant, index) => `<div class="participant-row"><span class="participant-row__number">${String(index + 1).padStart(2, "0")}</span><span class="participant-row__avatar">${escapeHTML(initials(participant.name))}</span><span class="participant-row__name">${escapeHTML(participant.name)}</span><span class="participant-row__status">Terdaftar</span></div>`).join("");
  }

  function renderMatchTable(session) {
    $("#match-table-body").innerHTML = session.matches.map(match => {
      const p1 = getParticipant(session, match.participant1Id);
      const p2 = getParticipant(session, match.participant2Id);
      const score = match.score1 === null ? "–" : `${match.score1} — ${match.score2}`;
      const status = match.status === "completed" ? "Selesai" : match.status === "bye" ? "Bye" : p1 && p2 ? "Belum dimainkan" : "Menunggu";
      return `<tr><td><strong>${escapeHTML(match.id)}</strong></td><td>${escapeHTML(matchRoundName(match.round, session.totalRounds))}</td><td>${p1 ? escapeHTML(p1.name) : "—"} vs ${p2 ? escapeHTML(p2.name) : "—"}</td><td>${score}</td><td><span class="status-pill ${match.status === "completed" ? "status-pill--done" : ""}">${status}</span></td><td>${p1 && p2 ? `<button class="table-action" data-edit-match="${escapeHTML(match.id)}">${match.status === "completed" ? "Ubah skor" : "Input skor"}</button>` : ""}</td></tr>`;
    }).join("");
  }

  async function openSession(id) {
    state.activeSessionId = id;
    state.activeTab = "bracket";
    setTab("bracket");
    showView("detail");
    try {
      saveSessionInState(await fetchSession(id));
    } catch (error) {
      showToast(`Gagal memuat detail sesi: ${error.message}`);
    }
    renderDetails();
    renderSessions();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setTab(tab) {
    state.activeTab = tab;
    $$(".tab").forEach(button => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("tab--active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $$(".tab-panel").forEach(panel => panel.classList.toggle("tab-panel--active", panel.id === `${tab}-panel`));
    $$(".nav__item").forEach(link => link.classList.toggle("nav__item--active", (tab === "participants" && link.dataset.view === "participants") || (tab === "bracket" && link.dataset.view === "bracket") || (tab === "matches" && link.dataset.view === "bracket")));
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

  async function createSession(formData) {
    const names = String(formData.get("participants") || "").split(/[\n,;]+/).map(name => name.trim()).filter(Boolean);
    const uniqueNames = [...new Map(names.map(name => [name.toLocaleLowerCase("id-ID"), name])).values()];
    if (uniqueNames.length < 2) {
      showToast("Tambahkan minimal 2 peserta.");
      return false;
    }
    const submitButton = $("#create-session-form button[type=submit]");
    submitButton.disabled = true;
    submitButton.textContent = "Menyimpan…";
    try {
      const result = await apiRequest("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          name: String(formData.get("name") || "").trim(),
          event_date: String(formData.get("date") || ""),
          location: String(formData.get("location") || "").trim(),
          participants: uniqueNames
        })
      });
      const session = normalizeSession(result);
      saveSessionInState(session);
      renderSessions();
      $("#create-session-modal").close();
      await openSession(session.id);
      showToast("Sesi tersimpan di Google Sheets.");
      return true;
    } catch (error) {
      showToast(`Gagal membuat sesi: ${error.message}`);
      return false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Buat Sesi";
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
      return `<tr><td>${escapeHTML(match.id)}</td><td>${escapeHTML(matchRoundName(match.round, session.totalRounds))}</td><td>${escapeHTML(p1?.name || "Bye")} vs ${escapeHTML(p2?.name || "Bye")}</td><td>${match.score1 ?? "–"} — ${match.score2 ?? "–"}</td><td>${escapeHTML(winner?.name || "Belum selesai")}</td></tr>`;
    }).join("");
    printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Playbook - ${escapeHTML(session.name)}</title><style>
      body{font:14px Arial,sans-serif;color:#25352b;margin:32px}h1{font-size:26px;margin-bottom:5px}h2{font-size:18px;margin-top:28px;border-bottom:2px solid #d9e5d4;padding-bottom:8px}.meta{color:#637367}ul{columns:2;line-height:1.8}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #dce3d8;padding:9px;text-align:left}th{background:#edf2e9}.note{padding:12px;background:#f2f5ed;border-radius:8px;line-height:1.6}@media print{body{margin:16mm}button{display:none}}
    </style></head><body><h1>${escapeHTML(session.name)}</h1><p class="meta">${escapeHTML(formatDate(session.date))}${session.location ? ` · ${escapeHTML(session.location)}` : ""} · Single elimination</p><h2>Daftar Peserta (${session.participants.length})</h2><ul>${session.participants.map(p => `<li>${escapeHTML(p.name)}</li>`).join("")}</ul><h2>Bagan dan Hasil Pertandingan</h2><table><thead><tr><th>ID</th><th>Babak</th><th>Pertandingan</th><th>Skor</th><th>Pemenang</th></tr></thead><tbody>${matchRows}</tbody></table><h2>Aturan Singkat</h2><div class="note">Catat skor akhir setiap pertandingan dan tetapkan pemenang. Pemenang maju ke babak berikutnya. Playbook ini dibuat dari data sesi saat tombol ditekan.</div><p class="meta">Karambol Gamebell · Playbook kompetisi</p><script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
  }

  // Event delegation
  document.addEventListener("click", event => {
    const openButton = event.target.closest("[data-open-session]");
    if (openButton) return openSession(openButton.dataset.openSession);
    const editButton = event.target.closest("[data-edit-match]");
    if (editButton) return openScoreModal(editButton.dataset.editMatch);
    const closeButton = event.target.closest("[data-close]");
    if (closeButton) return $(`#${closeButton.dataset.close}`).close();
    const createButton = event.target.closest('[data-action="create"]');
    if (createButton) $("#create-session-modal").showModal();
  });

  $("#create-session-open").addEventListener("click", () => $("#create-session-modal").showModal());
  $("#welcome-create").addEventListener("click", () => $("#create-session-modal").showModal());
  $("#back-to-sessions").addEventListener("click", () => { showView("sessions"); renderSessions(); });
  $("#add-participant-open").addEventListener("click", () => $("#participant-modal").showModal());
  $("#download-playbook").addEventListener("click", exportPlaybook);

  $$(".tab").forEach(button => button.addEventListener("click", () => setTab(button.dataset.tab)));
  $$(".nav__item").forEach(link => link.addEventListener("click", event => {
    event.preventDefault();
    if (!currentSession() || link.dataset.view === "sessions") {
      showView("sessions");
      renderSessions();
      return;
    }
    const view = link.dataset.view;
    if (view === "participants") setTab("participants");
    else if (view === "bracket") setTab("bracket");
    showView("detail");
  }));

  $("#create-session-form").addEventListener("submit", async event => {
    event.preventDefault();
    await createSession(new FormData(event.currentTarget));
  });

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
      const result = await apiRequest("/api/matches/score", {
        method: "POST",
        body: JSON.stringify({
          session_id: session.id,
          match_id: match.id,
          score1,
          score2
        })
      });
      saveSessionInState(normalizeSession(result));
      renderDetails();
      renderSessions();
      $("#score-modal").close();
      showToast("Skor tersimpan di Google Sheets dan bagan diperbarui.");
    } catch (error) {
      showToast(`Gagal menyimpan skor: ${error.message}`);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Simpan Skor";
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
      const result = await apiRequest("/api/participants", {
        method: "POST",
        body: JSON.stringify({ session_id: session.id, name })
      });
      saveSessionInState(normalizeSession(result));
      renderDetails();
      renderSessions();
      $("#participant-modal").close();
      form.reset();
      showToast("Peserta tersimpan di Google Sheets dan bagan diperbarui.");
    } catch (error) {
      showToast(`Gagal menambahkan peserta: ${error.message}`);
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
  loadSessions();
})();
