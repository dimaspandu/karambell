/**
 * Karambell — Google Sheets + Apps Script API
 *
 * Required Script Property:
 * SPREADSHEET_ID = <your spreadsheet ID>
 *
 * GET:
 *   ?action=listSessions
 *   ?action=getSession&session_id=SES-...
 *
 * POST:
 *   createSession
 *   addParticipant
 *   updateMatchScore
 *   updateSessionStatus
 */

const SHEETS = {
  SESSIONS: 'Sessions',
  PARTICIPANTS: 'Participants',
  MATCHES: 'Matches',
};

const HEADERS = {
  Sessions: [
    'session_id',
    'name',
    'event_date',
    'location',
    'status',
    'format',
    'created_at',
    'updated_at',
  ],

  Participants: [
    'participant_id',
    'session_id',
    'name',
    'seed',
    'created_at',
  ],

  Matches: [
    'match_id',
    'session_id',
    'round',
    'match_number',
    'participant1_id',
    'participant2_id',
    'score1',
    'score2',
    'winner_id',
    'status',
    'next_match_id',
    'next_slot',
    'created_at',
    'updated_at',
  ],
};

/* =====================================================
   API ENTRY POINTS
===================================================== */

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = String(params.action || 'listSessions');

    let result;

    if (action === 'listSessions') {
      result = {
        sessions: listSessions_(),
      };
    } else if (action === 'getSession') {
      result = getSession_(
        required_(params.session_id, 'session_id')
      );
    } else {
      throw new Error('Unknown GET action: ' + action);
    }

    return json_({
      ok: true,
      data: result,
    });
  } catch (err) {
    return json_({
      ok: false,
      error: safeMessage_(err),
    });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    const raw = e &&
      e.postData &&
      e.postData.contents;

    if (!raw) {
      throw new Error('Request body is required.');
    }

    const payload = JSON.parse(raw);
    const action = String(payload.action || '');

    let result;

    lock.waitLock(15000);

    try {
      if (action === 'createSession') {
        result = createSession_(payload);
      } else if (action === 'addParticipant') {
        result = addParticipant_(payload);
      } else if (action === 'updateMatchScore') {
        result = updateMatchScore_(payload);
      } else if (action === 'updateSessionStatus') {
        result = updateSessionStatus_(payload);
      } else {
        throw new Error('Unknown POST action: ' + action);
      }
    } finally {
      lock.releaseLock();
    }

    return json_({
      ok: true,
      data: result,
    });
  } catch (err) {
    try {
      if (lock.hasLock()) {
        lock.releaseLock();
      }
    } catch (_) {}

    return json_({
      ok: false,
      error: safeMessage_(err),
    });
  }
}

/* =====================================================
   INITIAL SETUP
===================================================== */

/**
 * Jalankan fungsi ini satu kali secara manual
 * dari Apps Script Editor.
 *
 * Fungsi membuat tab dan header jika diperlukan.
 */
function setupSheets() {
  const ss = getSpreadsheet_();

  Object.keys(HEADERS).forEach(function(sheetName) {
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    const headers = HEADERS[sheetName];

    const existing = sheet
      .getRange(1, 1, 1, headers.length)
      .getValues()[0];

    const matches = headers.every(function(header, index) {
      return String(existing[index] || '').trim() === header;
    });

    if (!matches) {
      sheet
        .getRange(1, 1, 1, headers.length)
        .setValues([headers]);

      sheet.setFrozenRows(1);
    }
  });

  return 'Sheets are ready.';
}

/* =====================================================
   SESSION
===================================================== */

function createSession_(input) {
  const name = required_(input.name, 'name');
  const eventDate = String(input.event_date || '').trim();
  const location = String(input.location || '').trim();
  const format = String(input.format || 'single_elimination').trim();

  if (format !== 'single_elimination' && format !== 'team_single_elimination') {
    throw new Error('Unsupported session format.');
  }

  const names = Array.isArray(input.participants)
    ? input.participants
    : [];

  const cleanNames = names
    .map(function(value) {
      return String(value || '').trim();
    })
    .filter(function(value) {
      return value.length > 0;
    });

  if (cleanNames.length < 2) {
    throw new Error('At least 2 participants are required.');
  }

  if (cleanNames.length > 64) {
    throw new Error('A maximum of 64 participants is supported.');
  }

  const normalizedNames = cleanNames.map(function(value) {
    return value.toLocaleLowerCase();
  });

  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new Error(
      'Participant names must be unique within a session.'
    );
  }

  const now = now_();
  const sessionId = id_('SES');

  const session = {
    session_id: sessionId,
    name: name,
    event_date: eventDate,
    location: location,
    status: 'in_progress',
    format: format,
    created_at: now,
    updated_at: now,
  };

  appendObject_(SHEETS.SESSIONS, session);

  const participants = cleanNames.map(function(participantName, index) {
    return {
      participant_id: id_('PAR'),
      session_id: sessionId,
      name: participantName,
      seed: index + 1,
      created_at: now,
    };
  });

  appendObjects_(SHEETS.PARTICIPANTS, participants);

  const matches = buildBracket_(
    sessionId,
    participants,
    now
  );

  appendObjects_(SHEETS.MATCHES, matches);

  return getSession_(sessionId);
}

function addParticipant_(input) {
  const sessionId = required_(input.session_id, 'session_id');
  const name = required_(input.name, 'name');

  const session = findObject_(
    SHEETS.SESSIONS,
    'session_id',
    sessionId
  );

  if (!session) {
    throw new Error('Session not found.');
  }

  if (session.status === 'completed') {
    throw new Error(
      'Cannot add participants to a completed session.'
    );
  }

  const existingParticipants = readObjects_(SHEETS.PARTICIPANTS)
    .filter(function(participant) {
      return participant.session_id === sessionId;
    });

  const duplicate = existingParticipants.some(function(participant) {
    return participant.name.toLocaleLowerCase() ===
      name.toLocaleLowerCase();
  });

  if (duplicate) {
    throw new Error(
      'That participant is already in this session.'
    );
  }

  if (existingParticipants.length >= 64) {
    throw new Error('A maximum of 64 participants is supported.');
  }

  const existingMatches = readObjects_(SHEETS.MATCHES)
    .filter(function(match) {
      return match.session_id === sessionId;
    });

  const started = existingMatches.some(function(match) {
    return (
      match.score1 !== '' ||
      match.score2 !== '' ||
      match.status === 'in_progress' ||
      match.status === 'completed'
    );
  });

  if (started) {
    throw new Error(
      'Participants can only be added before any match has started.'
    );
  }

  const now = now_();

  const participant = {
    participant_id: id_('PAR'),
    session_id: sessionId,
    name: name,
    seed: existingParticipants.length + 1,
    created_at: now,
  };

  appendObject_(SHEETS.PARTICIPANTS, participant);

  // Hapus bracket lama untuk sesi ini saja.
  deleteRowsByValue_(
    SHEETS.MATCHES,
    'session_id',
    sessionId
  );

  const updatedParticipants = existingParticipants.concat([
    participant,
  ]);

  const matches = buildBracket_(
    sessionId,
    updatedParticipants,
    now
  );

  appendObjects_(SHEETS.MATCHES, matches);

  updateObject_(
    SHEETS.SESSIONS,
    'session_id',
    sessionId,
    {
      updated_at: now,
    }
  );

  return getSession_(sessionId);
}

/* =====================================================
   MATCH SCORE
===================================================== */

function updateMatchScore_(input) {
  const sessionId = required_(input.session_id, 'session_id');
  const matchId = required_(input.match_id, 'match_id');

  const score1 = parseScore_(input.score1, 'score1');
  const score2 = parseScore_(input.score2, 'score2');

  if (score1 === score2) {
    throw new Error(
      'A completed match cannot end in a tie.'
    );
  }

  const matches = readObjects_(SHEETS.MATCHES)
    .filter(function(match) {
      return match.session_id === sessionId;
    });

  const match = matches.find(function(item) {
    return item.match_id === matchId;
  });

  if (!match) {
    throw new Error('Match not found in this session.');
  }

  if (match.status === 'bye') {
    throw new Error('A bye match does not accept scores.');
  }

  if (!match.participant1_id || !match.participant2_id) {
    throw new Error(
      'Both participants must be assigned before entering a score.'
    );
  }

  const winnerId = score1 > score2
    ? match.participant1_id
    : match.participant2_id;

  const now = now_();

  // Jika skor pertandingan diubah, kosongkan hasil
  // pertandingan berikutnya yang bergantung pada pemenang ini.
  clearDownstream_(matches, matchId, now);

  updateObject_(
    SHEETS.MATCHES,
    'match_id',
    matchId,
    {
      score1: score1,
      score2: score2,
      winner_id: winnerId,
      status: 'completed',
      updated_at: now,
    }
  );

  // Teruskan pemenang ke slot yang sesuai.
  if (match.next_match_id) {
    const nextMatch = matches.find(function(item) {
      return item.match_id === match.next_match_id;
    });

    if (nextMatch) {
      const patch = {
        updated_at: now,
      };

      if (match.next_slot === 'participant1') {
        patch.participant1_id = winnerId;
      } else if (match.next_slot === 'participant2') {
        patch.participant2_id = winnerId;
      }

      updateObject_(
        SHEETS.MATCHES,
        'match_id',
        nextMatch.match_id,
        patch
      );
    }
  }

  // Periksa apakah pertandingan final sudah selesai.
  const updatedMatches = readObjects_(SHEETS.MATCHES)
    .filter(function(item) {
      return item.session_id === sessionId;
    });

  const finalRound = Math.max.apply(
    null,
    updatedMatches.map(function(item) {
      return Number(item.round);
    })
  );

  const finalMatch = updatedMatches.find(function(item) {
    return Number(item.round) === finalRound;
  });

  const sessionPatch = {
    updated_at: now,
    status: (
      finalMatch &&
      finalMatch.winner_id &&
      finalMatch.status === 'completed'
    )
      ? 'completed'
      : 'in_progress',
  };

  updateObject_(
    SHEETS.SESSIONS,
    'session_id',
    sessionId,
    sessionPatch
  );

  return getSession_(sessionId);
}

function updateSessionStatus_(input) {
  const sessionId = required_(input.session_id, 'session_id');
  const status = required_(input.status, 'status');

  if (status !== 'in_progress' && status !== 'completed') {
    throw new Error('Session status must be in_progress or completed.');
  }

  const session = findObject_(SHEETS.SESSIONS, 'session_id', sessionId);
  if (!session) {
    throw new Error('Session not found.');
  }

  updateObject_(SHEETS.SESSIONS, 'session_id', sessionId, {
    status: status,
    updated_at: now_(),
  });

  return getSession_(sessionId);
}

/**
 * Mengosongkan slot dan hasil pertandingan downstream
 * ketika skor pertandingan sebelumnya diubah.
 */
function clearDownstream_(matches, matchId, timestamp) {
  const source = matches.find(function(match) {
    return match.match_id === matchId;
  });

  if (!source || !source.next_match_id) {
    return;
  }

  const next = matches.find(function(match) {
    return match.match_id === source.next_match_id;
  });

  if (!next) {
    return;
  }

  const patch = {
    winner_id: '',
    score1: '',
    score2: '',
    status: 'pending',
    updated_at: timestamp,
  };

  if (source.next_slot === 'participant1') {
    patch.participant1_id = '';
  } else {
    patch.participant2_id = '';
  }

  updateObject_(
    SHEETS.MATCHES,
    'match_id',
    next.match_id,
    patch
  );

  clearDownstream_(
    matches,
    next.match_id,
    timestamp
  );
}

/**
 * Fungsi ini sengaja tidak memajukan peserta secara otomatis
 * pada babak berikutnya hanya karena slot lawan masih kosong.
 *
 * Slot lawan mungkin masih menunggu hasil pertandingan lain.
 * Bye awal sudah ditangani oleh buildBracket_().
 */
function refreshByeStates_(sessionId, timestamp) {
  const matches = readObjects_(SHEETS.MATCHES)
    .filter(function(match) {
      return match.session_id === sessionId;
    });

  matches.forEach(function(match) {
    if (match.status === 'bye') {
      return;
    }

    if (
      match.participant1_id &&
      match.participant2_id
    ) {
      return;
    }

    // Tidak mengubah status pertandingan yang masih menunggu
    // hasil dari feeder match.
  });

  return true;
}

/* =====================================================
   BRACKET GENERATION
===================================================== */

function buildBracket_(sessionId, participants, timestamp) {
  const count = participants.length;
  const size = nextPowerOfTwo_(count);
  const rounds = Math.log(size) / Math.log(2);
  const firstRoundMatchCount = size / 2;
  const byeCount = size - count;

  const firstRoundSlots = [];

  // Peserta awal mendapatkan bye sesuai urutan seed.
  for (let i = 0; i < byeCount; i++) {
    firstRoundSlots.push([
      participants[i],
      null,
    ]);
  }

  const remaining = participants.slice(byeCount);

  // Peserta lainnya dipasangkan.
  for (let i = 0; i < remaining.length; i += 2) {
    firstRoundSlots.push([
      remaining[i] || null,
      remaining[i + 1] || null,
    ]);
  }

  while (firstRoundSlots.length < firstRoundMatchCount) {
    firstRoundSlots.push([null, null]);
  }

  const matches = [];
  const idsByRound = {};

  // Buat seluruh pertandingan terlebih dahulu.
  for (let round = 1; round <= rounds; round++) {
    const matchCount = size / Math.pow(2, round);

    idsByRound[round] = [];

    for (let number = 1; number <= matchCount; number++) {
      const matchId = id_('MAT');

      idsByRound[round].push(matchId);

      matches.push({
        match_id: matchId,
        session_id: sessionId,
        round: round,
        match_number: number,
        participant1_id: '',
        participant2_id: '',
        score1: '',
        score2: '',
        winner_id: '',
        status: 'pending',
        next_match_id: '',
        next_slot: '',
        created_at: timestamp,
        updated_at: timestamp,
      });
    }
  }

  const matchesById = {};

  matches.forEach(function(match) {
    matchesById[match.match_id] = match;
  });

  // Hubungkan setiap pertandingan dengan pertandingan berikutnya.
  matches.forEach(function(match) {
    const round = Number(match.round);
    const number = Number(match.match_number);

    if (round < rounds) {
      match.next_match_id =
        idsByRound[round + 1][Math.ceil(number / 2) - 1];

      match.next_slot = number % 2 === 1
        ? 'participant1'
        : 'participant2';
    }
  });

  // Isi peserta di babak pertama.
  firstRoundSlots.forEach(function(pair, index) {
    const match = matchesById[idsByRound[1][index]];

    match.participant1_id = pair[0]
      ? pair[0].participant_id
      : '';

    match.participant2_id = pair[1]
      ? pair[1].participant_id
      : '';

    // Bye hanya diberikan jika satu peserta memang sudah
    // mendapatkan slot dan tidak memiliki lawan pada babak awal.
    if (pair[0] && !pair[1]) {
      match.winner_id = pair[0].participant_id;
      match.status = 'bye';
    } else if (!pair[0] && pair[1]) {
      match.winner_id = pair[1].participant_id;
      match.status = 'bye';
    }
  });

  // Teruskan pemenang bye babak pertama ke babak berikutnya.
  // Tidak menandai babak selanjutnya sebagai bye hanya karena
  // slot lawan belum terisi.
  matches
    .filter(function(match) {
      return Number(match.round) === 1 &&
        match.status === 'bye' &&
        match.winner_id;
    })
    .forEach(function(match) {
      if (!match.next_match_id) {
        return;
      }

      const next = matchesById[match.next_match_id];

      if (match.next_slot === 'participant1') {
        next.participant1_id = match.winner_id;
      } else {
        next.participant2_id = match.winner_id;
      }
    });

  return matches;
}

/* =====================================================
   SESSION DATA
===================================================== */

function getSession_(sessionId) {
  const session = findObject_(
    SHEETS.SESSIONS,
    'session_id',
    sessionId
  );

  if (!session) {
    throw new Error('Session not found.');
  }

  const participants = readObjects_(SHEETS.PARTICIPANTS)
    .filter(function(participant) {
      return participant.session_id === sessionId;
    })
    .sort(function(a, b) {
      return Number(a.seed) - Number(b.seed);
    });

  const participantMap = {};

  participants.forEach(function(participant) {
    participantMap[participant.participant_id] = participant;
  });

  const matches = readObjects_(SHEETS.MATCHES)
    .filter(function(match) {
      return match.session_id === sessionId;
    })
    .sort(function(a, b) {
      return (
        Number(a.round) - Number(b.round) ||
        Number(a.match_number) - Number(b.match_number)
      );
    })
    .map(function(match) {
      return Object.assign({}, match, {
        participant1: participantMap[match.participant1_id] || null,
        participant2: participantMap[match.participant2_id] || null,
        winner: participantMap[match.winner_id] || null,
      });
    });

  return {
    session: session,
    participants: participants,
    matches: matches,
  };
}

function listSessions_() {
  return readObjects_(SHEETS.SESSIONS)
    .sort(function(a, b) {
      return String(b.created_at)
        .localeCompare(String(a.created_at));
    });
}

/* =====================================================
   SPREADSHEET HELPERS
===================================================== */

/**
 * PENTING:
 * getProperty() harus berisi nama properti,
 * bukan ID spreadsheet.
 */
function getSpreadsheet_() {
  const id = PropertiesService
    .getScriptProperties()
    .getProperty('SPREADSHEET_ID');

  if (!id) {
    throw new Error(
      'Set Script Property SPREADSHEET_ID before using the API.'
    );
  }

  return SpreadsheetApp.openById(id);
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);

  if (!sheet) {
    throw new Error(
      'Sheet "' + name + '" not found. Run setupSheets() first.'
    );
  }

  return sheet;
}

function readObjects_(sheetName) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(String);

  return values
    .slice(1)
    .filter(function(row) {
      return row.some(function(cell) {
        return cell !== '';
      });
    })
    .map(function(row) {
      const object = {};

      headers.forEach(function(header, index) {
        let value = row[index];

        if (value instanceof Date) {
          value = Utilities.formatDate(
            value,
            'UTC',
            "yyyy-MM-dd'T'HH:mm:ss'Z'"
          );
        }

        object[header] = value === null ? '' : value;
      });

      return object;
    });
}

function appendObject_(sheetName, object) {
  appendObjects_(sheetName, [object]);
}

function appendObjects_(sheetName, objects) {
  if (!objects || objects.length === 0) {
    return;
  }

  const sheet = getSheet_(sheetName);
  const headers = HEADERS[sheetName];

  const rows = objects.map(function(object) {
    return headers.map(function(header) {
      return object[header] === undefined ||
        object[header] === null
        ? ''
        : object[header];
    });
  });

  sheet
    .getRange(
      sheet.getLastRow() + 1,
      1,
      rows.length,
      headers.length
    )
    .setValues(rows);
}

function findObject_(sheetName, key, value) {
  return readObjects_(sheetName).find(function(object) {
    return String(object[key]) === String(value);
  }) || null;
}

function updateObject_(sheetName, key, value, patch) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error('No data found in ' + sheetName + '.');
  }

  const headers = values[0].map(String);
  const keyIndex = headers.indexOf(key);

  if (keyIndex < 0) {
    throw new Error('Key column "' + key + '" not found.');
  }

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    if (String(values[rowIndex][keyIndex]) !== String(value)) {
      continue;
    }

    Object.keys(patch).forEach(function(field) {
      const columnIndex = headers.indexOf(field);

      if (columnIndex < 0) {
        throw new Error('Column "' + field + '" not found.');
      }

      values[rowIndex][columnIndex] = patch[field];
    });

    sheet
      .getRange(rowIndex + 1, 1, 1, headers.length)
      .setValues([values[rowIndex]]);

    return;
  }

  throw new Error(
    'Record not found: ' + key + '=' + value
  );
}

function deleteRowsByValue_(sheetName, key, value) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return;
  }

  const headers = values[0].map(String);
  const keyIndex = headers.indexOf(key);

  if (keyIndex < 0) {
    throw new Error('Key column "' + key + '" not found.');
  }

  for (let rowIndex = values.length - 1; rowIndex >= 1; rowIndex--) {
    if (String(values[rowIndex][keyIndex]) === String(value)) {
      sheet.deleteRow(rowIndex + 1);
    }
  }
}

/* =====================================================
   UTILITIES
===================================================== */

function json_(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

function required_(value, field) {
  const result = String(
    value === undefined || value === null ? '' : value
  ).trim();

  if (!result) {
    throw new Error(field + ' is required.');
  }

  return result;
}

function parseScore_(value, field) {
  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    throw new Error(field + ' is required.');
  }

  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number < 0 ||
    number > 999
  ) {
    throw new Error(
      field + ' must be an integer from 0 to 999.'
    );
  }

  return number;
}

function nextPowerOfTwo_(number) {
  let result = 1;

  while (result < number) {
    result *= 2;
  }

  return result;
}

function id_(prefix) {
  return prefix + '-' +
    Utilities.getUuid()
      .replace(/-/g, '')
      .slice(0, 12)
      .toUpperCase();
}

function now_() {
  return new Date().toISOString();
}

function safeMessage_(err) {
  return err && err.message
    ? err.message
    : String(err);
}
