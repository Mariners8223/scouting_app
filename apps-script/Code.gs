/**
 * Receives scouting forms from the app and appends them to the spreadsheet.
 *
 * Setup (once):
 * 1. Open the existing Apps Script project (the one whose web app URL is in src/config.ts),
 *    and replace the code with this file.
 * 2. Deploy > Manage deployments > edit the existing web app > Version: New version > Deploy.
 *    (Keeping the same deployment keeps the URL that is in src/config.ts.)
 *    Execute as: Me. Who has access: Anyone.
 *    The account that deploys it needs edit access to the spreadsheet below.
 *
 * Each template goes to its own tab (created if missing). A template with a fixed column
 * layout (the 2026 form) writes into the same columns the AppSheet table used, so the
 * dashboards that read that table keep working. Other templates get one column per
 * question, added as new questions appear. Existing columns are never moved, and a form
 * that was already saved (same id) is skipped, so phones can safely resend after a dropped connection.
 */

/**
 * The spreadsheet that receives the forms: the 2026 AppSheet data, which the dashboard
 * spreadsheet reads with IMPORTRANGE. Leave empty to use the spreadsheet this script is opened from.
 */
const SPREADSHEET_ID = '1YljG5_ezLNby8Q5_s2LO5AzavrguWDuhJ9ikbe-Y3-Y';

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // several phones may sync at the same moment
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action !== 'submit') return json({ ok: false, error: 'Unknown action: ' + body.action });

    const spreadsheet = SPREADSHEET_ID
      ? SpreadsheetApp.openById(SPREADSHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
    const saved = [];
    for (const item of body.submissions || []) {
      appendSubmission(spreadsheet, item);
      saved.push(item.id);
    }
    return json({ ok: true, saved: saved });
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

function appendSubmission(spreadsheet, item) {
  const sheet = spreadsheet.getSheetByName(item.sheet) || spreadsheet.insertSheet(item.sheet);
  let headers = sheet.getLastColumn() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
  if (alreadySaved(sheet, item, headers)) return;

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

/** True when the sheet already has this form, found by id in the key column (or the "submissionId" header). */
function alreadySaved(sheet, item, headers) {
  const column = item.keyColumn ? columnIndex(item.keyColumn) : headers.indexOf('submissionId');
  if (column < 0 || sheet.getLastRow() < 2) return false;
  const ids = sheet.getRange(2, column + 1, sheet.getLastRow() - 1, 1).getValues().flat();
  return ids.indexOf(item.id) >= 0;
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

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
