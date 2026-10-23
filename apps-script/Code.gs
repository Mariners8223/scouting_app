/**
 * The scouting app's server: receives forms, stores the published form templates and finds saved forms by key.
 * It is deployed once and doesn't change between seasons: each template says which spreadsheet
 * and tab its answers go to, and new templates are published from the app's Form Editor.
 *
 * Setup (once):
 * 1. Open the existing Apps Script project (the one whose web app URL is in src/config.ts),
 *    and replace the code with this file.
 * 2. Deploy > Manage deployments > edit the existing web app > Version: New version > Deploy.
 *    (Keeping the same deployment keeps the URL that is in src/config.ts.)
 *    Execute as: Me. Who has access: Anyone.
 *    The account that deploys it needs edit access to every spreadsheet the templates write to.
 *
 * Actions (POST, JSON body with "action"):
 * - submit:    append forms. A template with a fixed column layout writes into the columns it names
 *              (the 2026 AppSheet table); other templates get one column per question.
 *              A form that was already saved (same key) is skipped, so phones can safely resend.
 * - templates: the published templates, for phones to download.
 * - publish:   store a template for all phones (needs the editor code).
 * - headers:   a tab's header row, for picking columns in the editor (needs the editor code).
 * - find:      a saved form by its key.
 *
 * Forms are only written to and read from spreadsheets that a published template points to
 * (or the home spreadsheet), so the public URL can't be used to reach other spreadsheets.
 */

/** Where the published templates are kept (tab below), and where forms go when a template names no spreadsheet. */
const HOME_SPREADSHEET_ID = '1YljG5_ezLNby8Q5_s2LO5AzavrguWDuhJ9ikbe-Y3-Y';
const TEMPLATES_TAB = 'App Templates';
/** SHA-256 of the editor code. The repo is public, so the code itself is not written here. */
const EDITOR_CODE_SHA256 = 'c198adee3b92e835eb4e852ec7e7ddbb0c4e2e296129e1ac5aeb24ad3cab73c1';
/** A cell holds at most 50,000 characters, so long templates are split over several cells. */
const CHUNK = 45000;

const ACTIONS = { submit: submit, templates: templates, publish: publish, headers: headers, find: find };

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // several phones may sync at the same moment
  try {
    const body = JSON.parse(e.postData.contents);
    const action = ACTIONS[body.action];
    if (!action) return json({ ok: false, error: 'Unknown action: ' + body.action });
    return json(action(body));
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Open the web app URL in a browser to check that it is deployed. */
function doGet() {
  return json({ ok: true, message: 'Scouting sync is running' });
}

// ---------- submit ----------

function submit(body) {
  const allowed = allowedSpreadsheets();
  const saved = [];
  const errors = [];
  for (const item of body.submissions || []) {
    try {
      appendSubmission(openAllowed(item.spreadsheetId, allowed), item);
      saved.push(item.id);
    } catch (err) {
      // One bad form (e.g. a template that isn't published yet) doesn't block the others.
      errors.push({ id: item.id, error: String(err) });
    }
  }
  return { ok: true, saved: saved, errors: errors };
}

function appendSubmission(spreadsheet, item) {
  const sheet = spreadsheet.getSheetByName(item.sheet) || spreadsheet.insertSheet(item.sheet);
  let headers = headerRow(sheet);
  if (findRow(sheet, headers, item.keyColumn, item.id)) return; // already saved

  const cells = item.cells || {};
  const named = item.named || {};
  const fixedEnd = Object.keys(cells).reduce((end, letter) => Math.max(end, columnIndex(letter) + 1), 0);

  // New headers go after the existing headers and the fixed columns, so they never land in a fixed column.
  const wanted = item.columns.concat(Object.keys(named));
  const missing = wanted.filter((key, i) => wanted.indexOf(key) === i && headers.indexOf(key) === -1);
  if (missing.length) {
    const start = Math.max(headers.length, fixedEnd);
    sheet.getRange(1, start + 1, 1, missing.length).setValues([missing]);
    while (headers.length < start) headers.push('');
    headers = headers.concat(missing);
    sheet.setFrozenRows(1);
  }

  const values = new Array(Math.max(headers.length, fixedEnd)).fill('');
  Object.keys(cells).forEach((letter) => (values[columnIndex(letter)] = cellValue(cells[letter])));
  Object.keys(named).forEach((name) => (values[headers.indexOf(name)] = cellValue(named[name])));
  sheet.appendRow(values);
}

// ---------- templates ----------

/** One row per published template: id, year, name, version, published at, in use, spreadsheet, JSON (split over cells). */
function templatesSheet() {
  const home = SpreadsheetApp.openById(HOME_SPREADSHEET_ID);
  let sheet = home.getSheetByName(TEMPLATES_TAB);
  if (!sheet) {
    sheet = home.insertSheet(TEMPLATES_TAB);
    sheet.appendRow(['Id', 'Year', 'Name', 'Version', 'Published at', 'In use', 'Spreadsheet', 'Template JSON']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function publishedRows() {
  const sheet = templatesSheet();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

function templates() {
  const rows = publishedRows();
  const inUse = rows.filter((r) => r[5] === 'Y')[0];
  return {
    ok: true,
    templates: rows.map((r) => JSON.parse(r.slice(7).join(''))),
    inUseId: inUse ? String(inUse[0]) : null,
  };
}

function publish(body) {
  checkCode(body.code);
  const template = body.template;
  if (!template || !template.id || !Array.isArray(template.sections)) throw new Error('Not a form template');
  if (template.spreadsheetId) SpreadsheetApp.openById(template.spreadsheetId); // fails now if the script can't open it

  const sheet = templatesSheet();
  const text = JSON.stringify(template);
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));
  const row = [template.id, template.year, template.name, template.version, new Date(), body.inUse ? 'Y' : '', template.spreadsheetId || ''].concat(chunks);

  const ids = publishedRows().map((r) => String(r[0]));
  if (body.inUse && ids.length) sheet.getRange(2, 6, ids.length, 1).setValue(''); // only one template is in use
  const at = ids.indexOf(template.id);
  if (at >= 0) {
    // Clear leftover chunks from a longer earlier version, then write the new one.
    sheet.getRange(at + 2, 1, 1, Math.max(sheet.getLastColumn(), row.length)).clearContent();
    sheet.getRange(at + 2, 1, 1, row.length).setValues([row.map(asText)]);
  } else {
    sheet.appendRow(row.map(asText));
  }
  return { ok: true };
}

// ---------- headers / find ----------

function headers(body) {
  checkCode(body.code);
  const sheet = SpreadsheetApp.openById(body.spreadsheetId || HOME_SPREADSHEET_ID).getSheetByName(body.sheet);
  if (!sheet) throw new Error('No tab named "' + body.sheet + '" in that spreadsheet');
  return { ok: true, headers: headerRow(sheet).map(String) };
}

/** Looks for the key in each target (spreadsheet + tab + key column) and returns the first matching row. */
function find(body) {
  const key = String(body.key || '').trim().toLowerCase();
  if (!key) throw new Error('No key');
  const allowed = allowedSpreadsheets();
  const targets = body.targets || [];
  for (let t = 0; t < targets.length; t++) {
    const target = targets[t];
    if (!allowed[target.spreadsheetId || HOME_SPREADSHEET_ID]) continue;
    const sheet = openAllowed(target.spreadsheetId, allowed).getSheetByName(target.sheet);
    if (!sheet) continue;
    const head = headerRow(sheet);
    const row = findRow(sheet, head, target.keyColumn, key);
    if (row) {
      return { ok: true, found: true, target: t, headers: head.map(String), values: sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0] };
    }
  }
  return { ok: true, found: false };
}

// ---------- helpers ----------

/** Spreadsheets forms may go to: the home one and every published template's. */
function allowedSpreadsheets() {
  const allowed = {};
  allowed[HOME_SPREADSHEET_ID] = true;
  publishedRows().forEach((r) => {
    if (r[6]) allowed[String(r[6])] = true;
  });
  return allowed;
}

function openAllowed(id, allowed) {
  const spreadsheetId = id || HOME_SPREADSHEET_ID;
  if (!allowed[spreadsheetId]) throw new Error('This spreadsheet is not used by a published template. Publish the template first.');
  return SpreadsheetApp.openById(spreadsheetId);
}

function checkCode(code) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(code || ''), Utilities.Charset.UTF_8);
  const hex = bytes.map((b) => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
  if (hex !== EDITOR_CODE_SHA256) throw new Error('Wrong code');
}

function headerRow(sheet) {
  return sheet.getLastColumn() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
}

/** Row number (2+) whose key column holds this key, or 0. The key column is a letter, or else the "submissionId" header. */
function findRow(sheet, headers, keyColumn, key) {
  const column = keyColumn ? columnIndex(keyColumn) : headers.indexOf('submissionId');
  if (column < 0 || sheet.getLastRow() < 2) return 0;
  const ids = sheet.getRange(2, column + 1, sheet.getLastRow() - 1, 1).getValues();
  const wanted = String(key).toLowerCase();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]).toLowerCase() === wanted) return i + 2;
  return 0;
}

/** "A" -> 0, "AA" -> 26. */
function columnIndex(letter) {
  let index = 0;
  for (const ch of letter) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

/**
 * Text is stored as text, like AppSheet wrote it: "1577" stays the string the dashboards
 * look up, and a comment that starts with "=" is never read as a formula.
 * Numbers and TRUE/FALSE keep their type.
 */
function cellValue(value) {
  if (value === undefined || value === null || value === '') return '';
  return typeof value === 'string' ? "'" + value : value;
}

/** Template cells: text as text (the JSON must never be read as a number or formula), dates as dates. */
function asText(value) {
  return value instanceof Date ? value : cellValue(value);
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
