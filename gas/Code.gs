// gas/Code.gs — Hover Attack online leaderboard backend (Google Apps Script).
// Deploy as a Web App (execute as: me, access: anyone). See gas-setup.md.
// NOTE: Plain JS only (function declarations, no import/export). Google globals
// (SpreadsheetApp, LockService, ContentService) are referenced inside functions
// only, so the pure helpers can be unit-tested under Node via node:vm.

var SCORES_SHEET = 'Scores';
var FAME_SHEET = 'Fame';
var MAX_RANKING = 20;
var FAME_TOP = 3;
var MIN_SCORE = 10000;       // score must exceed this to be recorded (matches client)
var SCORE_CAP = 100000000;   // reject absurd scores
var RATE_LIMIT_MS = 10000;   // reject same-name resubmit within 10s

// ---------- Pure helpers (unit-tested in Node) ----------

function isoWeekId(date) {
  var d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  var dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  var isoYear = d.getUTCFullYear();
  var firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  var firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  var week = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  return isoYear + '-W' + (week < 10 ? '0' + week : '' + week);
}

function previousWeekId(date) {
  return isoWeekId(new Date(date.getTime() - 7 * 24 * 3600 * 1000));
}

function sanitizeName(raw) {
  var s = (raw == null ? '' : String(raw));
  s = s.replace(/[\x00-\x1F\x7F]/g, '');
  s = s.toUpperCase().substring(0, 10).trim();
  return s.length ? s : 'AAA';
}

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') return { ok: false, reason: 'bad-body' };
  var score = Number(entry.score);
  if (!isFinite(score) || Math.floor(score) !== score) return { ok: false, reason: 'bad-score' };
  if (score <= MIN_SCORE || score > SCORE_CAP) return { ok: false, reason: 'score-range' };
  var mission = Math.min(7, Math.max(1, Math.floor(Number(entry.mission) || 1)));
  var clearTime = (typeof entry.clearTime === 'string' && entry.clearTime) ? entry.clearTime : null;
  return { ok: true, value: { name: sanitizeName(entry.name), score: score, mission: mission, clearTime: clearTime } };
}

function topNForWeek(rows, weekId, n) {
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]) === weekId) {
      out.push({ name: rows[i][2], score: Number(rows[i][3]), mission: Number(rows[i][4]), clearTime: rows[i][5] || null });
    }
  }
  out.sort(function (a, b) { return b.score - a.score; });
  return out.slice(0, n);
}

function groupFame(fameRows) {
  var byWeek = {};
  var order = [];
  for (var i = 0; i < fameRows.length; i++) {
    var wk = String(fameRows[i][0]);
    if (!byWeek[wk]) { byWeek[wk] = []; order.push(wk); }
    byWeek[wk].push({ name: fameRows[i][2], score: Number(fameRows[i][3]), mission: Number(fameRows[i][4]), clearTime: fameRows[i][5] || null });
  }
  var out = [];
  for (var j = order.length - 1; j >= 0; j--) {
    var w = order[j];
    byWeek[w].sort(function (a, b) { return b.score - a.score; });
    out.push({ weekId: w, entries: byWeek[w] });
  }
  return out;
}

// ---------- Spreadsheet glue (not unit-tested) ----------

function getSheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function readRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 6).getValues();
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var weekId = isoWeekId(new Date());
  var scores = readRows_(getSheet_(SCORES_SHEET));
  var fame = readRows_(getSheet_(FAME_SHEET));
  return jsonOut_({ ok: true, weekId: weekId, ranking: topNForWeek(scores, weekId, MAX_RANKING), fame: groupFame(fame) });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return jsonOut_({ ok: false, reason: 'busy' });
  try {
    var body;
    try { body = JSON.parse(e.postData.contents); } catch (err) { return jsonOut_({ ok: false, reason: 'bad-json' }); }
    var v = validateEntry(body);
    if (!v.ok) return jsonOut_({ ok: false, reason: v.reason });
    var entry = v.value;
    var sheet = getSheet_(SCORES_SHEET);
    var rows = readRows_(sheet);
    var now = new Date();
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i][2] === entry.name) {
        if (now.getTime() - new Date(rows[i][0]).getTime() < RATE_LIMIT_MS) {
          return jsonOut_({ ok: false, reason: 'rate-limited' });
        }
        break;
      }
    }
    var weekId = isoWeekId(now);
    var row = [now, weekId, entry.name, entry.score, entry.mission, entry.clearTime || ''];
    sheet.appendRow(row);
    rows.push(row);
    var top = topNForWeek(rows, weekId, MAX_RANKING);
    var rank = -1;
    for (var k = 0; k < top.length; k++) {
      if (top[k].name === entry.name && top[k].score === entry.score) { rank = k; break; }
    }
    return jsonOut_({ ok: true, rank: rank, weekId: weekId });
  } finally {
    lock.releaseLock();
  }
}

function weeklySnapshot() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    var prev = previousWeekId(new Date());
    var fameSheet = getSheet_(FAME_SHEET);
    var fameRows = readRows_(fameSheet);
    for (var i = 0; i < fameRows.length; i++) {
      if (String(fameRows[i][0]) === prev) return; // already archived
    }
    var top = topNForWeek(readRows_(getSheet_(SCORES_SHEET)), prev, FAME_TOP);
    for (var r = 0; r < top.length; r++) {
      fameSheet.appendRow([prev, r + 1, top[r].name, top[r].score, top[r].mission, top[r].clearTime || '']);
    }
  } finally {
    lock.releaseLock();
  }
}
