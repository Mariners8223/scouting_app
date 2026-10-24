# For AI assistants: connecting form templates to Google Sheets

Read this before changing anything about templates, the sync, or the Google Sheets side. It explains how the pieces fit, the rules that keep the team's dashboards working, and exact recipes for the usual tasks. The human-facing version (Hebrew, in the app's Guide tab) is `docs/template-guide.md`; project history and setup details are in `PROJECT_NOTES.md`.

## The model in one paragraph

A **template** (`FormSchema`, `src/form/types.ts`) is plain JSON: tabs (`sections`) of questions. A saved form is sent to the Apps Script web app (`apps-script/Code.gs`, URL in `src/config.ts`) as a list of **name → value** pairs: every question's `id`, plus `key` (the form's 8-letter key), `submittedAt`, `template`, `formVersion` and the template's `constants`. The script appends one row to the template's spreadsheet (`spreadsheetId`) and tab (`sheetName`) and puts each name in the column that has a **named range** with that name on that tab, else the column whose **row-1 header** equals the name, else a **new last column** (which also gets a named range). Dashboards are formulas that read those tabs; nothing ever writes to them. Templates reach phones by being **published**: stored in the `App Templates` tab of the home spreadsheet and downloaded by every phone.

## Where the 2026 data lives

| Template id | Writes to (spreadsheet → tab) | Read by |
| --- | --- | --- |
| `match-2026` (built into the app, `src/form/default-schema.ts`) | AppSheet file `1YljG5_ezLNby8Q5_s2LO5AzavrguWDuhJ9ikbe-Y3-Y` → `Table` | dashboard file's `Table Regular` (IMPORTRANGE `Table!A:CD`) → Sum Dashboard, Team Dashboard, graph helpers, pick lists |
| `fuel-2026` | `1zN89brA_5Wdeb5xyZ1ldXJNQjAXhTzBs8Tawr4UunRE` → `Sheet1` | `Table Fuel` → `Pick list data` |
| `pit-2026` | `1t_jD43xrGKPzMrIcdRK8We3n5VlJBjIa8MlTsCBfIe0` → `Sheet1` | `Table Pit` (unused) |
| `wet-2026` | dashboard file `1NFWKbsYDfSc_JtdXi6JPjKjxGnNny67JAUUFVN0cyWU` → `wetscouting` | Team Dashboard notes |

The dashboard file ("scouting master frontend for new scouting app 2026") has ~25 tabs; only `wetscouting` is entered data. Everything else there is formulas, charts or hand-typed lists (Teams Numbers, OPR Data). The home spreadsheet (`HOME_SPREADSHEET_ID` in `Code.gs`) is the AppSheet file; it also holds `App Templates`.

All four spreadsheets can be read without signing in through `https://docs.google.com/spreadsheets/d/<id>/export?format=xlsx` (they're shared by link). Read them with openpyxl to see headers, formulas and which tabs depend on which.

## Rules that keep things working

1. **A question's `id` is its column name.** Never rename an id that already has data; the column stays under the old name and new answers start a new column. Changing a label is fine.
2. **Ids must be valid range names**: start with a letter; letters, digits and `_`; not cell-like (`q1`, `A1`, `AB12` are rejected by Sheets) and not `TRUE`/`FALSE`. An invalid name still works through a header column, but gets no named range. The editor's fallback id is `question1`, `question2`… for this reason.
3. **Named ranges are unique per spreadsheet** (case-insensitive). If a dashboard cell already uses a name, the data column can't have it and falls back to a header column. Prefer distinct names for dashboard cells (`selectedTeam`).
4. **Existing tables are connected by naming their columns**, never by moving columns or changing headers. Dashboards there use fixed letters (`Table Regular!E:E`); named ranges don't change letters.
5. **Value formats are fixed** (`sheetValue` in `src/form/sheet-row.ts`): numbers stay numbers, yes/no is `TRUE`/`FALSE`, multiple choice is joined with `" , "`, text is written as text (a leading `'`, so `8223` stays the string AppSheet wrote and `=…` is never a formula). Dashboard formulas count on this (`COUNTIF(..., TRUE)`, `"*Defense*"`).
6. **Only allowed spreadsheets are touched**: the home spreadsheet plus those of published templates. A form for an unpublished spreadsheet stays queued on the phone ("Publish the template first"). The script account (ironih.frc@gmail.com) needs **Editor** access to each spreadsheet.
7. **Publishing replaces every phone's copy.** A phone takes a published template whenever its version differs from the one it last got (`publishedVersion`), whatever was edited locally. Bump `version` on every republish; versions only need to differ, but keep them increasing. `inUse: true` makes every phone switch to it once.
8. **The editor code is never written in the repo** (public). Only its SHA-256 is stored (`src/config.ts`, `Code.gs`). Ask the user for the code; pass it through an environment variable, never into a committed file or a log.

## Template JSON essentials

```ts
FormSchema {
  id, name, year, version, updatedAt,
  spreadsheetId?,          // empty = home spreadsheet
  sheetName?,              // tab; defaults to name; created on the first form if missing
  constants?: { [name]: value },   // same value in every row, e.g. { from: 'Mariners' }
  sections: Section[],     // tabs of the form
  orderRule?: { questionId, variants: { [answer]: sectionId[] } },  // tab order by an answer
  columnLayout?, Question.column?  // OLDER templates only (fixed letters); don't use for new ones
}
Section { id, title, questions, showIf?: Condition, numberedAs?: string }  // numberedAs: "Shift" -> "Shift 2 · Active"
Question { id, type: enum|enumList|yesNo|number|text|longText|header, label, description?, required?,
           options?, min?, max?, step?, showIf?: { questionId, op: equals|notEquals, value }, keepAfterSubmit? }
```

`schemaProblems()` in `src/form/logic.ts` must return `[]` before publishing (phones ignore templates that fail it). Conditions are single (no AND): a tab's `showIf` and a question's `showIf` are separate, which is how "only if he played" + "only if he defended" combine.

The 2026 match form uses `orderRule` on `autoWon`: the alliance that won Auto is inactive in shifts 1 and 3 and active in 2 and 4. The four shift tabs (`active1`, `inactive1`, `active2`, `inactive2`) have `numberedAs: 'Shift'`, so the scouter sees "Shift 1 · Inactive, Shift 2 · Active…" in the right order while the question ids (and columns) stay the same.

## Script API (POST, `Content-Type: text/plain`, JSON body)

| action | body | needs code | returns |
| --- | --- | --- | --- |
| `submit` | `{ submissions: SheetRow[] }` (see `toSheetRow`) | no | `{ saved: ids[], errors: [{id, error}] }` |
| `templates` | `{}` | no | `{ templates: FormSchema[], inUseId }` |
| `publish` | `{ code, template, inUse }` | yes | `{ ok }` |
| `sheetInfo` | `{ code, spreadsheetId?, sheet }` | yes | `{ exists, headers, named: {name: letter}, elsewhere: names[] }` |
| `nameColumns` | `{ code, spreadsheetId?, sheet, columns: {name: letter} }` | yes | `{ named: [], skipped: [] }` |
| `find` | `{ key, targets: [{ spreadsheetId?, sheet, keyName: 'key' }] }` | no | `{ found, target, headers, values, named }` |

Every reply has `ok`; a reply without it (or HTML) means an old deployment or a transient Google error: retry once. `GET` returns `{"ok":true,"message":"Scouting sync is running"}` (may be cached for a minute after a deploy). Don't name a JS variable `URL` in Node scripts that call `fetch`.

## Recipes

**Inspect a tab before connecting it**
`sheetInfo` with the code → headers, named columns, names used elsewhere. Or download the xlsx and read it.

**Connect a new form to an existing tab** (the way Fuel/Pit/Wet were done)
1. Write the template JSON, with ids for the questions, `spreadsheetId`, `sheetName`, and `constants` for fixed columns (e.g. `from`).
2. Build a map `{ id: columnLetter }` from the tab's headers, including `key` (the column holding the form key) and each constant.
3. Check `schemaProblems(template)` is `[]`. Test it against a fake copy of the tab (below).
4. `nameColumns` with the map, then check `skipped` is empty.
5. `publish` (`inUse: false` unless the user says it should be the form every phone uses).
6. Verify: `templates` lists it; on the live site, **Update** → **Switch** shows it.

**Connect a form to a brand-new, empty spreadsheet**
Share it with the script account as Editor, set `spreadsheetId` + `sheetName`, publish. The first form creates the tab, one column per name, each with a named range. Nothing else is needed.

**Change a published form**
Edit it in the app (Form Editor), or edit the JSON and republish with a higher `version`. New questions become new last columns automatically. Don't rename ids that have data.

**Calling the script from Node** (pattern used so far)
```js
const ENDPOINT = 'https://script.google.com/macros/s/<deployment>/exec'; // from src/config.ts
const post = async (body) => JSON.parse(await (await fetch(ENDPOINT, {
  method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body),
})).text());
await post({ action: 'publish', code: process.env.EDITOR_CODE, template, inUse: false });
```
To get a template object from TypeScript sources, compile `src/form/*.ts` to CommonJS in a temp folder:
`npx tsc src/form/sheet-row.ts src/form/default-schema.ts --ignoreConfig --outDir <tmp> --module commonjs --target es2022 --skipLibCheck`.

**Testing without touching real data**
Run `Code.gs` in Node's `vm` with fake `SpreadsheetApp` (sheets with `getRange`/`appendRow`/`getLastRow`/`getLastColumn`, A1 `"E:E"` ranges, `getNamedRanges`/`setNamedRange` that reject cell-like names), `LockService`, `Utilities.computeDigest` and `ContentService`. Seed the fake tab with the real header row, submit a `toSheetRow(...)` of a fully answered form, and assert every answer is in its column, resend is skipped, and `answersFromRow(template, headers, values, named)` returns the same answers. Writing a test row to a real sheet needs the user's OK (use team `9999`, delete it after).

**Deploying `Code.gs`** (only when the script itself changes)
From `apps-script/` with clasp logged in (see `PROJECT_NOTES.md`):
`NODE_OPTIONS=--use-system-ca clasp.cmd push --force` then `clasp.cmd update-deployment <deployment id from src/config.ts>`. Keep the same deployment so the app's URL doesn't change.

## Code map

- `src/form/types.ts`: template and submission types.
- `src/form/sheet-row.ts`: `toSheetRow` (form → name/value row), `answersFromRow` (row → answers, for Open by key), `KEY_NAME`.
- `src/form/logic.ts`: conditions, tab order, `sectionTitles` (numbered tabs), `schemaProblems`.
- `src/form/default-schema.ts`: the built-in 2026 match form.
- `src/context/templates-context.tsx`: local templates, `applyPublished` (download rules), submissions.
- `src/context/sync-context.tsx`: offline queue, sending, downloading published templates.
- `src/components/editor/sheet-connection.tsx`: "Check the sheet" and converting older letter-based templates.
- `apps-script/Code.gs`: the server (placement rules in `appendSubmission`, `sheetLayout`, `nameColumn`).
