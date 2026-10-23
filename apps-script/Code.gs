/**
 * Receives scouting forms from the app and appends them to the spreadsheet.
 *
 * Setup (once):
 * 1. Open the scouting spreadsheet > Extensions > Apps Script, and replace the code with this file.
 * 2. Deploy > Manage deployments > edit the existing web app > Version: New version > Deploy.
 *    (Keeping the same deployment keeps the URL that is in src/config.ts.)
 *    Execute as: Me. Who has access: Anyone.
 *
 * Each template goes to its own tab (created if missing). Columns are added as new
 * questions appear, existing columns are never moved, and a form that was already
 * saved (same submissionId) is skipped, so phones can safely resend after a dropped connection.
 */

/** Leave empty when this script is opened from the spreadsheet (Extensions > Apps Script). */
const SPREADSHEET_ID = '';

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
      saved.push(item.row.submissionId);
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

  const idColumn = headers.indexOf('submissionId');
  if (idColumn >= 0 && sheet.getLastRow() > 1) {
    const ids = sheet.getRange(2, idColumn + 1, sheet.getLastRow() - 1, 1).getValues().flat();
    if (ids.indexOf(item.row.submissionId) >= 0) return; // already saved
  }

  const wanted = item.columns.concat(Object.keys(item.row));
  const missing = wanted.filter((key, i) => wanted.indexOf(key) === i && headers.indexOf(key) === -1);
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
    sheet.setFrozenRows(1);
  }

  sheet.appendRow(headers.map((h) => safeCell(item.row[h])));
}

/** Keeps comments that start with "=" or "+" from being read as formulas. */
function safeCell(value) {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return /^[=+]/.test(text) ? "'" + text : text;
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
