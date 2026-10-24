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
 * - unnameColumns, copyValues: maintenance, used to move the data into the home spreadsheet (need the editor code).
 * - find:        a saved form by its key.
 *
 * Everything happens in ONE spreadsheet, the home spreadsheet below: forms are written there and
 * read from there, whatever spreadsheet a form or template names (a form saved for one of the old
 * files goes to the home tab that replaced it, see MOVED; any other file id is ignored). Templates
 * that name another spreadsheet can't be published. No other file is ever written to.
 */

/**
 * The team's scouting spreadsheet: all forms write into it, the dashboards are in it, and the
 * published templates are kept in its tab below. Forms go here when a template names no spreadsheet.
 */
const HOME_SPREADSHEET_ID = '1zo34EcLqcVrL0khhelGs_KYZyS1D0BhZFjctMLwE9tk';

/**
 * Spreadsheets the forms used to write to, and the tab of the home spreadsheet that replaced each of
 * their tabs. A form a phone saved before the move still lands in the right place, and nothing is
 * ever written to the old files again.
 */
const MOVED = {
  '1YljG5_ezLNby8Q5_s2LO5AzavrguWDuhJ9ikbe-Y3-Y': { Table: 'Table Regular' }, // AppSheet match data
  '1zN89brA_5Wdeb5xyZ1ldXJNQjAXhTzBs8Tawr4UunRE': { Sheet1: 'Table Fuel' },
  '1t_jD43xrGKPzMrIcdRK8We3n5VlJBjIa8MlTsCBfIe0': { Sheet1: 'Table Pit' },
  '1NFWKbsYDfSc_JtdXi6JPjKjxGnNny67JAUUFVN0cyWU': { wetscouting: 'wetscouting' }, // the dashboard file before the copy
};
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
  unnameColumns: unnameColumns,
  copyValues: copyValues,
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
  const home = SpreadsheetApp.openById(HOME_SPREADSHEET_ID);
  const saved = [];
  const errors = [];
  for (const item of body.submissions || []) {
    try {
      item.sheet = homeTab(item.spreadsheetId, item.sheet);
      appendSubmission(home, item);
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
  const prefix = tabPrefix(sheet).toLowerCase();
  const names = {};
  const taken = {};
  let end = 0;
  spreadsheet.getNamedRanges().forEach((named) => {
    const name = named.getName().toLowerCase();
    taken[name] = true;
    const range = named.getRange();
    // Named ranges on other tabs (a dashboard's input cell, a chart's data) are never written to.
    if (range.getSheet().getSheetId() !== sheet.getSheetId()) return;
    const column = range.getColumn() - 1;
    // "Table_Fuel_team" on the tab "Table Fuel" is that tab's "team" (see nameColumn).
    const local = name.indexOf(prefix) === 0 ? name.slice(prefix.length) : name;
    if (names[local] === undefined || local === name) names[local] = column;
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

/** "Table Fuel" -> "Table_Fuel_": names a tab's column when its plain name is already used elsewhere in the file. */
function tabPrefix(sheet) {
  return sheet.getName().replace(/\W+/g, '_').replace(/^_+|_+$/g, '') + '_';
}

/**
 * Gives a whole column a named range: the plain name, or, when another tab already uses it (several
 * forms in one spreadsheet all have "team"), the name with the tab in front ("Table_Fuel_team").
 * Returns the name used, or '' when neither is possible (e.g. "q1" looks like a cell).
 */
function nameColumn(spreadsheet, sheet, name, column, layout) {
  const letter = columnLetter(column);
  for (const candidate of [String(name), tabPrefix(sheet) + name]) {
    const lower = candidate.toLowerCase();
    if (layout.taken[lower]) continue;
    try {
      spreadsheet.setNamedRange(candidate, sheet.getRange(letter + ':' + letter));
      layout.taken[lower] = true;
      layout.names[String(name).toLowerCase()] = column;
      return candidate;
    } catch (err) {
      // not allowed as a name: try the next one
    }
  }
  return '';
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
  if (template.spreadsheetId && template.spreadsheetId !== HOME_SPREADSHEET_ID) {
    throw new Error('Forms can only go to the team spreadsheet. Clear the template\'s spreadsheet link and publish again.');
  }

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
  onlyHome(body.spreadsheetId);
  const spreadsheet = SpreadsheetApp.openById(HOME_SPREADSHEET_ID);
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
    const letter = body.columns[name];
    // Already named on this tab: move that name to this column.
    const own = [name, tabPrefix(tab.sheet) + name].filter((n) => ownsName(tab, n))[0];
    if (own) {
      tab.spreadsheet.setNamedRange(own, tab.sheet.getRange(letter + ':' + letter));
      return named.push(own);
    }
    const used = nameColumn(tab.spreadsheet, tab.sheet, name, columnIndex(letter), layout);
    if (used) named.push(used);
    else skipped.push(name);
  });
  return { ok: true, named: named, skipped: skipped };
}

/** True when the named range with this name is on this tab. */
function ownsName(tab, name) {
  const range = tab.spreadsheet.getRangeByName(name);
  return !!range && range.getSheet().getSheetId() === tab.sheet.getSheetId();
}

/** Removes named ranges by name (e.g. to free a name for another tab). */
function unnameColumns(body) {
  checkCode(body.code);
  onlyHome(body.spreadsheetId);
  const spreadsheet = SpreadsheetApp.openById(HOME_SPREADSHEET_ID);
  const removed = [];
  (body.names || []).forEach((name) => {
    if (spreadsheet.getRangeByName(name)) {
      spreadsheet.removeNamedRange(name);
      removed.push(name);
    }
  });
  return { ok: true, removed: removed };
}

/**
 * Copies a whole tab's values into a tab of the home spreadsheet, starting at a cell, after clearing
 * that cell (e.g. the IMPORTRANGE formula that used to bring the data in, and everything it spilled).
 * Text stays text.
 */
function copyValues(body) {
  checkCode(body.code);
  // Reads only the home spreadsheet or one of the old files (to bring their data in); writes only home.
  if (body.from.spreadsheetId !== HOME_SPREADSHEET_ID && !MOVED[body.from.spreadsheetId]) throw new Error('Unknown source spreadsheet');
  const from = SpreadsheetApp.openById(body.from.spreadsheetId).getSheetByName(body.from.sheet);
  const to = SpreadsheetApp.openById(HOME_SPREADSHEET_ID).getSheetByName(body.to.sheet);
  if (!from || !to) throw new Error('Tab not found');
  const rows = from.getLastRow();
  const columns = from.getLastColumn();
  const values = rows && columns ? from.getRange(1, 1, rows, columns).getValues() : [];
  const start = to.getRange(body.to.cell);
  start.clearContent();
  if (values.length) {
    to.getRange(start.getRow(), start.getColumn(), values.length, columns).setValues(values.map((r) => r.map(asText)));
  }
  return { ok: true, rows: values.length, columns: columns };
}

/**
 * Looks for the key in each target (spreadsheet + tab) and returns the first matching row, with
 * the values of named columns by name, so the app can read the answers back however the sheet is laid out.
 */
function find(body) {
  const key = String(body.key || '').trim().toLowerCase();
  if (!key) throw new Error('No key');
  const home = SpreadsheetApp.openById(HOME_SPREADSHEET_ID);
  const targets = body.targets || [];
  for (let t = 0; t < targets.length; t++) {
    const target = Object.assign({}, targets[t], { sheet: homeTab(targets[t].spreadsheetId, targets[t].sheet) });
    const spreadsheet = home;
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

/**
 * The home tab a form for this spreadsheet + tab goes to. The spreadsheet id never decides where
 * anything is written: a moved file's tab maps to its replacement, and anything else uses the same
 * tab name in the home spreadsheet. So a look-alike file, even one with the same tab names, is never touched.
 */
function homeTab(spreadsheetId, sheet) {
  const moved = MOVED[spreadsheetId];
  return moved && moved[sheet] ? moved[sheet] : sheet;
}


/** Maintenance actions work on the home spreadsheet only. */
function onlyHome(spreadsheetId) {
  if (spreadsheetId && spreadsheetId !== HOME_SPREADSHEET_ID) throw new Error('Only the team spreadsheet can be changed');
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
