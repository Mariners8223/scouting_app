# Mariners 8223 Scouting App: project notes

What has been built so far, the decisions behind it, and what is still open.
Read this first when picking the project up on another computer. AI assistants: also read `docs/AI_TEMPLATES_AND_SHEETS.md` before touching templates or the Sheets side.

## What the app is

An FRC match-scouting app for team Mariners 8223, built with **Expo SDK 58 / React Native 0.88 / TypeScript / Expo Router**.

- **Offline-first.** Every form is saved on the phone. When there is internet (even a few seconds of cellular outside the venue), unsent forms go to Google Sheets automatically, where the strategy room reads them.
- **Editable forms.** Questions are not hard-coded. Each season has a form **template** (tabs + questions) that can be edited inside the app, in the same spirit as AppSheet.
- **Distribution: PWA.** The team decided against paying for an Apple Developer account. The app ships as a Progressive Web App on GitHub Pages: open it in Safari, then Share → Add to Home Screen, and it works with no internet afterwards. The Expo native setup is still there (an EAS Android build was started), but the PWA is the plan.

## Screens

| Tab | File | What it does |
| --- | --- | --- |
| Scout | `src/app/index.tsx` | Fills in the active template. **Update** (no code) downloads the newest published forms, sends waiting forms and checks for a new app version (offers a restart; the form in progress is kept). Dynamic tabs, required-answer check, draft kept while filling, **Switch** button (always shown) or a tap on the form name to change template (no code needed; a manual choice sticks until the next template is marked in use), sync status ("N waiting for internet · tap to send", plus the reason when the sheet refused a form). After saving it shows the form's **key**; **Open** shows any saved form by key (see below). |
| Guide | `src/app/guide.tsx` | The template + new-sheet guide (`docs/template-guide.md`, copied in by `scripts/build-guide.js` before each web build; `npm run guide` after editing it), shown right to left. No code needed. |
| Form Editor | `src/app/editor.tsx` | Locked behind an editor code. Lists templates by year; create, copy to a new year, delete, pick the one in use; edit tabs, questions, conditions, tab order, the tab it writes to and its columns. **Publish** (asks for the editor code again) sends a template to all phones. |

## A new season without code changes

1. Everything stays in the team spreadsheet (the copy of "scouting master frontend"); a new season only needs a new tab, created by the first form.
2. Form Editor → the last template → **Copy to new year**, then edit the questions.
3. In the template: set the tab. Answers find their column **by name** (the question id), see below; for a sheet whose columns are already laid out, give those columns named ranges. **Check the sheet** shows where every answer will go.
4. **Save**, then **Publish** with the editor code and "All phones scout with this form" on. Every phone downloads it the next time it is online and switches to it once.

The step-by-step guide for the team (in Hebrew), including dashboard formulas: [`docs/template-guide.md`](docs/template-guide.md).

Nothing in the code or in `Code.gs` changes. The built-in 2026 form in `default-schema.ts` is only what a brand-new phone starts with before its first download.

## How the code is organised

```
src/form/types.ts            FormSchema / Section / Question / Submission types
src/form/default-schema.ts   The built-in 2026 match form (from the scouting training slides)
src/form/logic.ts            Tab ordering, show-if conditions, validation, {placeholder} labels
src/form/edit.ts             Editor helpers (move, duplicate tab, ids from labels)
src/form/sheet-row.ts        Saved form -> spreadsheet row (values by name) and back (for Open)
src/context/templates-context.tsx  Templates per year + saved submissions (AsyncStorage), applies published templates
src/context/sync-context.tsx       Offline queue → Google Sheets, downloads published templates
src/services/sheets-api.ts   Calls to the Apps Script web app (submit, templates, publish, headers, find)
src/services/editor-code.ts  Editor code check + spreadsheet id from a link
src/components/form/open-form.tsx  Open a saved form by key (this phone first, then the spreadsheet)
src/services/storage.ts      AsyncStorage JSON wrapper (+ persistent storage request on web)
src/services/dialogs(.web).ts  Alerts/confirms (RN Alert does nothing on web)
src/components/form/question-field.tsx  Renders any question type
src/components/editor/*      Templates list, template/tab/question editors, condition + tab-order editors, lock screen
src/components/ui/controls.tsx  Shared buttons, choice buttons, inputs, cards
src/config.ts                Apps Script URL + SHA-256 of the editor code
apps-script/Code.gs          Google Apps Script that receives the forms (must be deployed by hand, see below)
public/                      PWA: index.html (manifest + service worker registration), manifest.json, icons
workbox-config.js            Service worker that precaches the whole web build
.github/workflows/deploy-web.yml  Builds and deploys the PWA to GitHub Pages on push to master
```

## Form engine

- **Question types:** `enum` (one choice), `enumList` (several), `yesNo`, `number` (counter with min/max/step), `text`, `longText`, `header` (title only).
- **Per question:** id (also the spreadsheet column name), label, description, required, options, **show only if** (another question equals / doesn't equal a value), and **keep for next match** (scouter name stays; match number goes up by one after saving).
- **Labels can include answers:** `Defense on {team}` shows the team number that was entered.
- **Tab order rule:** the order of the tabs can depend on an answer. In 2026: if the robot's alliance **won Auto** ("Did his alliance win Auto?" = Y), the order is Inactive → Active → Inactive 2 → Active 2; if it lost, Active comes first.
- **Where answers go (by name):** every value is sent with a name: the question id, plus `key` (the form's key), `submittedAt`, `template`, `formVersion` and the template's fixed values ("Same value in every row", e.g. `from=Mariners`). The script puts each name in the column of the **named range** with that name on the form's tab (Data → Named ranges), else the column whose **header** is the name, else a **new column** at the end, which also gets a named range so dashboards can use it (`=COUNTIF(team, B1)`). Named ranges on other tabs (dashboard cells) are never written to; such a name only gets a header column. Inserting a column moves the named ranges with it, so nothing breaks. Values: numbers as numbers, yes/no as TRUE/FALSE, several choices joined with `" , "` (as AppSheet wrote them). The editor's **Sheet connection** card shows where each answer will go (**Check the sheet**).
- **Older templates** (published before this) have fixed column letters (`columnLayout` + `column` per question). They keep writing by letter until **Switch to named ranges** in the Sheet connection card names those columns and removes the letters.
- **Tabs** can also be conditional (in 2026, everything except Info/General is hidden when "Robot didn't show up" = Y).
- **Templates per year:** "Copy to new year" duplicates a template as the starting point for the next season. Each saved form records its template id and version.

### The 2026 default form

Built from the "הכשרות סקאוטינג יבש 2026" training slides (AppSheet screenshots):
Info (scouter, event, match, team, alliance, no-show), Auto (start position, collection, shot zones 1–9, end zone, tower position/success, did his alliance win Auto), Active / Active 2 (roles, cycles, defense on him, fight or flight, his defense, serving + rolled from/to), Inactive / Inactive 2 (roles, his defense, zone, description), Endgame (climb time, level, position, success), General (collection quality, shoot while collecting, fall, wobble, stuck on bump, disabled, stuck on fuel, comments in Hebrew, cycle description, serving / defense / defense-on-him comments).
Role is several choices, like in AppSheet. The Info fields alliance and no-show were guessed (the slides don't show them).

**It writes into `Table Regular` of the team spreadsheet.** The 2026 dashboards read that tab, and every formula there uses fixed column letters. Its columns have **named ranges** after the question ids (58: `key` → A, `from` → C, `scouter` → D, `team` → E, `event` → F, `match` → G, start position → I, active role → W, cycles → X, climb level → BH, fall/wobble/bump/disable → BN–BQ, collection → CD, and the app's extra columns `submittedAt`, `template`, `formVersion`, `alliance`, `noShow` after CD), so each answer lands in the column AppSheet used, with the same answer texts.

A built-in template that was never saved in the editor (version 1) is replaced by the app's newest version when the app starts. After that, **every publish replaces each phone's copy**: a phone takes a published template whenever its version differs from `downloadedVersion`, the published version the copy really is (`publishedVersion` alone isn't enough: older app versions also set it on copies they kept), even if the copy was edited on the phone; edits made after a phone got a version stay only until the next publish. (Before 2026-10-24 a newer local copy won, which left one phone with an emptied Match form; the Match form was republished as v50.) A downloaded template that fails the editor's checks is ignored, so a broken publish never replaces a working form.

The four shift tabs of the match form are numbered by their place in the current order (`numberedAs: 'Shift'` on the tab, set in the tab editor as "Number as"): won Auto → Shift 1 · Inactive, Shift 2 · Active, Shift 3 · Inactive, Shift 4 · Active; lost Auto → the reverse. Their ids (and so the columns) are unchanged.

## Where the 2026 data lives (checked 2026-10-24)

**Everything is in one spreadsheet**, the team's copy of "scouting master frontend for new scouting app 2026" (`1zo34EcLqcVrL0khhelGs_KYZyS1D0BhZFjctMLwE9tk`, `HOME_SPREADSHEET_ID` in `Code.gs`). On 2026-10-24 the data its tabs used to import (AppSheet match table, Fuel and Pit files) was copied in as values and the imports removed, so it links to no other file. Data is entered in only four of its tabs, one per form; every other tab is formulas, charts or hand-typed lists (Teams Numbers, OPR Data, groups), and the app never writes there. The old files (AppSheet `1YljG5…`, Fuel `1zN89…`, Pit `1t_jD…`, the original dashboard `1NFWKbs…`) are never written to again: `MOVED` in `Code.gs` sends forms that phones saved for them to the matching tab here.

| Form (template id) | Writes to (tab) | Read by |
| --- | --- | --- |
| Match Scouting 2026 (`match-2026`, built in) | `Table Regular` (plain names) | Sum Dashboard, Team Dashboard, graph helpers, pick lists |
| Fuel Scouting 2026 (`fuel-2026`) | `Table Fuel` (names `Table_Fuel_…` where taken) | Pick list data |
| Pit Scouting 2026 (`pit-2026`) | `Table Pit` (`Table_Pit_…`) | no formula uses it yet |
| Wet Scouting 2026 (`wet-2026`) | `wetscouting` (`wetscouting_…`) | Team Dashboard (notes) |

Fuel, Pit and Wet were made on 2026-10-24 from those tabs' existing headers, their columns got named ranges after the question ids, and they were published (not "in use"). Their question types were guessed from the headers (the tabs were empty); change them in the Form Editor if needed. The script account (ironih.frc@gmail.com) has edit access to all four files.

## Published templates

- **Publish** stores the template in the `App Templates` tab of the home spreadsheet (`HOME_SPREADSHEET_ID` in `Code.gs`, the team spreadsheet): one row per template, with the JSON split over cells (a cell holds 50,000 characters). One template can be marked **in use**; phones switch to it once each time that changes, so a scouter can still pick another one afterwards.
- Phones download the published templates when the app opens, when the internet comes back and at most every 5 minutes while open.
- The template list shows each template's state: "only on this phone", "published", or "published vN, not this version".

## Keys and opening a form

- Every saved form gets an **8-letter key** (no 0/o/1/l/i), shown after saving and written to the key column (A in the 2026 table). Older forms keep their longer `sub_…` ids.
- Scout → **Open**: type a key (any case), or tap one of the last 15 forms saved on the phone. Forms on the phone open without internet; otherwise the script looks for the key in the spreadsheet of every template on the phone and the answers are read back from the row (read-only view, tab by tab).

## Editor code

The Form Editor asks for a code, and **publishing and loading columns ask for it again**. The repo is public, so only the code's **SHA-256 hash** is stored (`EDITOR_CODE_SHA256` in `src/config.ts`, and the same hash in `Code.gs`). The plain code is not written anywhere in the repo. To change it, run the command in the comment in `src/config.ts` and paste the new hash in both files. In the app the code only stops accidental edits; for publishing and loading headers the **script checks it too**, so it can't be skipped by calling the URL directly.

## Sync to Google Sheets

- All unsent forms go in **one request**. It retries when the network comes back, when the app is reopened, after every save and every 30 s, while the app is open (iOS does not let it run in the background).
- Each template writes to its own tab (default: template name, can be changed in the editor; the 2026 template writes to `Table`). A form that was already saved (same id, in the Key column or the `submissionId` column) is skipped, so resending after a dropped connection doesn't duplicate rows. Text is written with a leading `'` so Sheets keeps it as text (and a comment starting with `=` is never a formula).
- **Only the team spreadsheet is ever written to or read** (`HOME_SPREADSHEET_ID` in `Code.gs`). The spreadsheet id a form or template carries never decides where anything goes: a form for one of the old files goes to the home tab that replaced it (`MOVED`), and any other id is ignored (same tab name, in the home spreadsheet), so a look-alike file with the same tab names is never touched. Publishing a template that names another spreadsheet is refused, maintenance actions (`sheetInfo`, `nameColumns`, `unnameColumns`) refuse other ids, and `copyValues` reads only the home or an old file. The editor has no spreadsheet-link field; publishing drops a leftover link. One refused form doesn't block the others.
- **Deployed** (2026-10-23, version 3 of the web app deployment `AKfycbxfA8…`, in the Apps Script project owned by ironih.frc@gmail.com; it used to be the brightness test, backed up outside the repo in `Downloads\scouting_app_backups`). To update it after changing `Code.gs`, from `apps-script/` (which has `.clasp.json` + `appsscript.json`):
  ```
  $env:NODE_OPTIONS='--use-system-ca'   # this PC's network filter needs Windows' certificates
  clasp.cmd push --force
  clasp.cmd update-deployment AKfycbxfA8ZqY-I_bwsIrxuvhZ58LgjIjc5ZZm7SqyCpWtwHgY2B_Kzmo4Bp_r8SVsoOs44
  ```
  (`npm install -g @google/clasp`, `clasp.cmd login` once; use `clasp.cmd` because PowerShell blocks `clasp.ps1`.) The account that deploys it needs edit access to the team spreadsheet (`1zo34Ec…`) and any other spreadsheet a template is pointed at. A browser GET of the URL can show an old cached reply for a minute after deploying.
- Checked live: the script answers the app, publishing works (a "2027 test" template was published from a phone), the 2026 table's named ranges are in place and an existing row reads back by key. Tested in Node against fake spreadsheets (`apps-script` tests live outside the repo): every 2026 answer lands in its old AppSheet column through the named ranges, resend skipped, a column inserted in the middle is followed, a new spreadsheet with dashboard tabs (dashboards untouched, a name used by a dashboard cell falls back to a header column, `q1` header-only), later questions appended, read-back by name, older letter-based templates, allow-list, publish codes, a 100,000-character template.

## PWA / deployment

- `npm run build:web` → `expo export -p web` + Workbox service worker + `404.html`. Output in `dist/` (gitignored).
- Hosted under the base path `/scouting_app` (`experiments.baseUrl` in `app.json`) → **https://mariners8223.github.io/scouting_app/**
- The repo is public and Pages is set to GitHub Actions, so every push to `master` deploys to the live app.
- **New versions on phones:** each build writes an id into the app (`src/content/build-id.ts`) and into `version.json` on the site (`scripts/build-id.js`; the committed files say `dev`). When the app opens, and on **Update**, it compares the two; if the site is newer it lets the service worker store the new version and offers a restart (the form in progress is kept). `version.json` is excluded from the service worker's cache.
- Calls to the script are retried up to 3 times when the connection drops or Google returns an HTML error page (it does that now and then).
- Tested locally: with the server shut down, the app and the editor still load from the service worker cache.
- Things to tell scouters: open the site once **with internet** and add it to the home screen. Deleting the home-screen icon deletes unsent forms. New versions arrive the next time the app opens with internet.

## Native builds (on hold)

`eas.json` has `preview` (Android APK) and `production` (TestFlight) profiles. App id: `com.mariners8223.scouting`. The project is linked to Expo (`owner: mariners8223`, projectId in `app.json`), and a first Android preview build was started on EAS. iOS would need a paid Apple Developer account, which the team decided against for now.

## Setting up on a new computer (Windows)

1. Install Node.js LTS (e.g. `winget install OpenJS.NodeJS.LTS`), then open a **new** terminal.
2. `git clone https://github.com/Mariners8223/scouting_app` → `cd scouting_app` → `npm install`
3. Run the web version: `npx expo start --web`. Phone through Expo Go: `npx expo start` (Expo Go must be ≥ 58.0.5 and signed in to the **same** Expo account).
4. Expo login: the Expo account was created with GitHub, so it has **no password**, and `npx expo login` in the browser crashes on Windows. Use an **access token** (expo.dev → Account settings → Access tokens) instead: `$env:EXPO_TOKEN = '<token>'; npx expo start`. Never commit the token.
5. Checks before finishing a change: `npx tsc --noEmit` and `npx eslint .`. (`npx expo lint` refuses because of an ESLint version check, so call eslint directly.)
6. Install packages with `npx expo install <pkg>` (see `AGENTS.md`).

## Known issues / ideas for next steps

- Deploy and test `apps-script/Code.gs` against the real spreadsheet: send one test form, check the row in `Table` and that it shows up in the Team Dashboard, publish the template once, open the test form by key, then delete the test row.
- Opening a form is read-only; correcting a form isn't possible yet.
- A few dashboard formulas look for values AppSheet never wrote, so they show nothing with either AppSheet's or the app's data: climb level as `1`/`2` (both write `L1`/`L2`), "Did he defend" (AB/AT, no question fills it), active2 "How did he manage?" counted as `Non` (the app writes `No Defense`, like active 1). Fix those in the dashboard if they matter.
- Once AppSheet stops being used, it may complain that the table has new columns (CE onward); that's expected.
- Anyone who reads the public repo can find the Apps Script URL and post rows to the allowed spreadsheets, or read a form if they know its key. A shared secret wouldn't help much (it would be in the public app too).
- No export/backup of local forms other than the sync (e.g. "share as CSV" or a QR code to pass data to another phone).
- `src/hooks/use-color-scheme.web.ts` has one lint error (`set-state-in-effect`). It came from the Expo starter template and was left as is.
- Optional: field-map images in questions (the AppSheet form shows the zone map next to "Where did he throw from").

## Commit history of this work

- `d114756` Editable form engine with per-year templates
- `aad52f2` Lock the Form Editor behind an editor code
- `e009f8b` Switch template without the code (+ fixes: remember active template, open new template in editor)
- `1f2ab44` Sync saved forms to Google Sheets + `apps-script/Code.gs`
- `3a7b03c` EAS build setup (app name, ids, eas.json)
- `86ef16a` Offline PWA on GitHub Pages

## App icon

The team logo (`assets/images/mariners-logo-source.png`, 225x225) is the source of every icon: `public/icons/*` (iPhone home screen, PWA, maskable), `assets/images/icon.png`, `favicon.png`, `splash-icon.png` and the Android adaptive icon. The source is small, so the 512/1024 icons are upscaled and a little soft; a bigger logo file can be dropped in and the icons regenerated (PIL script: logo centred on white, 92% of the size, 78% for the maskable icon).
