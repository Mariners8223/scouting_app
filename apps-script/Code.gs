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
 * - submit:      append forms. Each answer goes to the column the sheet names after its question id
 *                (a named range, else a header), or a new column; see appendSubmission.
 *                A form that was already saved (same key) is skipped, so phones can safely resend.
 * - templates:   the published templates, for phones to download.
 * - publish:     store a template for all phones (needs the editor code).
 * - sheetInfo:   a tab's headers and named ranges, for checking a template in the editor (needs the editor code).
 * - nameColumns: give columns of a tab named ranges (needs the editor code).
 * - find:        a saved form by its key.
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

const ACTIONS = {
  submit: submit,
  templates: templates,
  publish: publish,
  sheetInfo: sheetInfo,
  nameColumns: nameColumns,
  find: find,
};

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

/**
 * Each value has a name (the question id, or key / submittedAt / a fixed value's name) and goes to:
 * 1. the column of a named range with that name on this tab (Data > Named ranges), so the sheet decides where;
 * 2. else the column whose header (row 1) is that name;
 * 3. else a new column at the end, with that header and a named range of the same name, so dashboards
 *    and other tabs can use it in formulas, e.g. =COUNTIF(team, B1).
 * Older templates may still send fixed column letters ("cells"); those go exactly where they say.
 */
function appendSubmission(spreadsheet, item) {
  const sheet = spreadsheet.getSheetByName(item.sheet) || spreadsheet.insertSheet(item.sheet);
  const layout = sheetLayout(spreadsheet, sheet);
  if (findRow(sheet, keyColumnOf(item, layout), item.id)) return; // already saved

  const cells = item.cells || {};
  const named = item.named || {};
  const placed = {}; // column index -> value
  Object.keys(cells).forEach((letter) => (placed[columnIndex(letter)] = cells[letter]));

  // New columns go after everything already in use, so they never land in a named or fixed column.
  let next = Math.max(layout.headers.length, layout.end, ...Object.keys(placed).map((c) => Number(c) + 1));
  const ordered = (item.columns || []).filter((name) => name in named);
  const names = ordered.concat(Object.keys(named).filter((name) => ordered.indexOf(name) === -1));
  for (const name of names) {
    let column = columnOf(name, layout);
    if (column < 0) {
      column = next++;
      sheet.getRange(1, column + 1).setValue(name);
      layout.headers[column] = name;
      nameColumn(spreadsheet, sheet, name, column, layout);
      sheet.setFrozenRows(1);
    }
    placed[column] = named[name];
  }

  const width = Math.max(0, ...Object.keys(placed).map((c) => Number(c) + 1));
  const values = new Array(width).fill('');
  Object.keys(placed).forEach((column) => (values[column] = cellValue(placed[column])));
  sheet.appendRow(values);
}

/** The tab's header row and named ranges: { headers, names: {name(lowercase): column}, taken: {name: true} for every tab, end }. */
function sheetLayout(spreadsheet, sheet) {
  const names = {};
  const taken = {};
  let end = 0;
  spreadsheet.getNamedRanges().forEach((named) => {
    const name = named.getName().toLowerCase();
    taken[name] = true;
    const range = named.getRange();
    // Named ranges on other tabs (a dashboard's input cell, a chart's data) are never written to.
    if (range.getSheet().getSheetId() !== sheet.getSheetId()) return;
    names[name] = range.getColumn() - 1;
    end = Math.max(end, range.getColumn());
  });
  return { headers: headerRow(sheet).map(String), names: names, taken: taken, end: end };
}

function columnOf(name, layout) {
  const named = layout.names[String(name).toLowerCase()];
  return named !== undefined ? named : layout.headers.indexOf(name);
}

/** Column holding the form id: a fixed letter (older templates), the "key" name, or the "submissionId" header. */
function keyColumnOf(item, layout) {
  if (item.keyColumn) return columnIndex(item.keyColumn);
  const column = columnOf(item.keyName || 'key', layout);
  return column >= 0 ? column : layout.headers.indexOf('submissionId');
}

/** Gives a whole column a named range, unless the name is taken (anywhere) or isn't allowed (e.g. "q1" looks like a cell). */
function nameColumn(spreadsheet, sheet, name, column, layout) {
  const lower = String(name).toLowerCase();
  if (layout.taken[lower]) return false;
  try {
    const letter = columnLetter(column);
    spreadsheet.setNamedRange(name, sheet.getRange(letter + ':' + letter));
    layout.taken[lower] = true;
    layout.names[lower] = column;
    return true;
  } catch (err) {
    return false;
  }
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

// ---------- sheet info / naming columns / find ----------

function openTab(body) {
  const spreadsheet = SpreadsheetApp.openById(body.spreadsheetId || HOME_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(body.sheet);
  return { spreadsheet: spreadsheet, sheet: sheet };
}

/**
 * What the editor shows when checking a template against its tab: the header row, which names
 * point at which column of this tab, and names used on other tabs (a question with such an id
 * can't get its own named range). A tab that doesn't exist yet is fine: it is created on the first form.
 */
function sheetInfo(body) {
  checkCode(body.code);
  const tab = openTab(body);
  if (!tab.sheet) return { ok: true, exists: false, headers: [], named: {}, elsewhere: [] };
  const layout = sheetLayout(tab.spreadsheet, tab.sheet);
  const named = {};
  Object.keys(layout.names).forEach((name) => (named[name] = columnLetter(layout.names[name])));
  const elsewhere = Object.keys(layout.taken).filter((name) => layout.names[name] === undefined);
  return { ok: true, exists: true, headers: layout.headers, named: named, elsewhere: elsewhere };
}

/**
 * Gives columns of a tab named ranges, e.g. { team: 'E', climbLevel: 'BH' }, so forms go there
 * by name. Used once to connect an existing sheet; a name already used on another tab is skipped.
 */
function nameColumns(body) {
  checkCode(body.code);
  const tab = openTab(body);
  if (!tab.sheet) throw new Error('No tab named "' + body.sheet + '" in that spreadsheet');
  const layout = sheetLayout(tab.spreadsheet, tab.sheet);
  const named = [];
  const skipped = [];
  Object.keys(body.columns || {}).forEach((name) => {
    const lower = name.toLowerCase();
    if (layout.taken[lower] && layout.names[lower] === undefined) return skipped.push(name + ' (used on another tab)');
    try {
      const letter = body.columns[name];
      tab.spreadsheet.setNamedRange(name, tab.sheet.getRange(letter + ':' + letter)); // replaces one on this tab
      named.push(name);
    } catch (err) {
      skipped.push(name + ' (' + err.message + ')');
    }
  });
  return { ok: true, named: named, skipped: skipped };
}

/**
 * Looks for the key in each target (spreadsheet + tab) and returns the first matching row, with
 * the values of named columns by name, so the app can read the answers back however the sheet is laid out.
 */
function find(body) {
  const key = String(body.key || '').trim().toLowerCase();
  if (!key) throw new Error('No key');
  const allowed = allowedSpreadsheets();
  const targets = body.targets || [];
  for (let t = 0; t < targets.length; t++) {
    const target = targets[t];
    if (!allowed[target.spreadsheetId || HOME_SPREADSHEET_ID]) continue;
    const spreadsheet = openAllowed(target.spreadsheetId, allowed);
    const sheet = spreadsheet.getSheetByName(target.sheet);
    if (!sheet) continue;
    const layout = sheetLayout(spreadsheet, sheet);
    const row = findRow(sheet, keyColumnOf(target, layout), key);
    if (row) {
      const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
      const named = {};
      Object.keys(layout.names).forEach((name) => (named[name] = values[layout.names[name]]));
      return { ok: true, found: true, target: t, headers: layout.headers, values: values, named: named };
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

/** Row number (2+) whose key column (index) holds this key, or 0. */
function findRow(sheet, column, key) {
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

/** 0 -> "A", 26 -> "AA". */
function columnLetter(index) {
  return (index >= 26 ? columnLetter(Math.floor(index / 26) - 1) : '') + String.fromCharCode(65 + (index % 26));
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
