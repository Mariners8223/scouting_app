# Mariners 8223 Scouting App: project notes

What has been built so far, the decisions behind it, and what is still open.
Read this first when picking the project up on another computer.

## What the app is

An FRC match-scouting app for team Mariners 8223, built with **Expo SDK 58 / React Native 0.88 / TypeScript / Expo Router**.

- **Offline-first.** Every form is saved on the phone. When there is internet (even a few seconds of cellular outside the venue), unsent forms go to Google Sheets automatically, where the strategy room reads them.
- **Editable forms.** Questions are not hard-coded. Each season has a form **template** (tabs + questions) that can be edited inside the app, in the same spirit as AppSheet.
- **Distribution: PWA.** The team decided against paying for an Apple Developer account. The app ships as a Progressive Web App on GitHub Pages: open it in Safari, then Share → Add to Home Screen, and it works with no internet afterwards. The Expo native setup is still there (an EAS Android build was started), but the PWA is the plan.

## Screens

| Tab | File | What it does |
| --- | --- | --- |
| Scout | `src/app/index.tsx` | Fills in the active template. Dynamic tabs, required-answer check, draft kept while filling, **Switch** button to change template (no code needed), sync status ("N waiting for internet · tap to send"). |
| Form Editor | `src/app/editor.tsx` | Locked behind an editor code. Lists templates by year; create, copy to a new year, delete, pick the one in use; edit tabs, questions, conditions and tab order. |

## How the code is organised

```
src/form/types.ts            FormSchema / Section / Question / Submission types
src/form/default-schema.ts   The built-in 2026 match form (from the scouting training slides)
src/form/logic.ts            Tab ordering, show-if conditions, validation, {placeholder} labels
src/form/edit.ts             Editor helpers (move, duplicate tab, ids from labels)
src/context/templates-context.tsx  Templates per year + saved submissions (AsyncStorage)
src/context/sync-context.tsx       Offline queue → Google Sheets
src/services/sheets-api.ts   POST to the Apps Script web app
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
- **Fixed column layout (optional, per template):** instead of one column per question id, each question can have a spreadsheet **column letter**, plus a column for the form id and fixed values (e.g. `C=Mariners`). Set in the editor: template → "Spreadsheet columns", and the column field in each question. Questions without a letter still get their own column (named by id) after the fixed ones.
- **Tabs** can also be conditional (in 2026, everything except Info/General is hidden when "Robot didn't show up" = Y).
- **Templates per year:** "Copy to new year" duplicates a template as the starting point for the next season. Each saved form records its template id and version.

### The 2026 default form

Built from the "הכשרות סקאוטינג יבש 2026" training slides (AppSheet screenshots):
Info (scouter, event, match, team, alliance, no-show), Auto (start position, collection, shot zones 1–9, end zone, tower position/success, did his alliance win Auto), Active / Active 2 (roles, cycles, defense on him, fight or flight, his defense, serving + rolled from/to), Inactive / Inactive 2 (roles, his defense, zone, description), Endgame (climb time, level, position, success), General (collection quality, shoot while collecting, fall, wobble, stuck on bump, disabled, stuck on fuel, comments in Hebrew, cycle description, serving / defense / defense-on-him comments).
Role is several choices, like in AppSheet. The Info fields alliance and no-show were guessed (the slides don't show them).

**It writes in the AppSheet layout.** The 2026 dashboards ("scouting master frontend for new scouting app 2026") read the AppSheet match table (`Table` tab of spreadsheet `1YljG5…`) through `IMPORTRANGE` into "Table Regular", and every formula there uses fixed column letters. So the 2026 template has a fixed column layout: each question goes to the AppSheet column with the same meaning (team → E, start position → I, active role → W, cycles → X, climb level → BH, fall/wobble/bump/disable → BN–BQ, collection → CD, …; the letters are in `default-schema.ts`), the form id goes to A (Key) and `Mariners` to C (From). Values are written the way AppSheet wrote them: text stays text (team "8223" too), numbers stay numbers, Y/N becomes TRUE/FALSE, several choices are joined with `" , "`. Alliance, no-show and the active-shift defense zone have no AppSheet column, so they go after column CD (with `submittedAt`), outside the range the dashboard imports.

A built-in template that was never saved in the editor (version 1) is replaced by the app's newest version when the app starts, so test phones pick up these changes. A template edited on a phone keeps its own copy.

## Editor code

The Form Editor asks for a code. The repo is public, so only the code's **SHA-256 hash** is stored (`EDITOR_CODE_SHA256` in `src/config.ts`). The plain code is not written anywhere in the repo. To change it, run the command in the comment in `src/config.ts` and paste the new hash. This stops accidental edits; it is not strong security.

## Sync to Google Sheets

- All unsent forms go in **one request**. It retries when the network comes back, when the app is reopened, after every save and every 30 s, while the app is open (iOS does not let it run in the background).
- Each template writes to its own tab (default: template name, can be changed in the editor; the 2026 template writes to `Table`). A form that was already saved (same id, in the Key column or the `submissionId` column) is skipped, so resending after a dropped connection doesn't duplicate rows. Text is written with a leading `'` so Sheets keeps it as text (and a comment starting with `=` is never a formula).
- `apps-script/Code.gs` writes to the spreadsheet in `SPREADSHEET_ID` (the AppSheet data spreadsheet `1YljG5…`).
- **Not done yet:** `Code.gs` must be pasted into the existing Apps Script project and deployed as a **new version of the existing web app deployment**, so the URL in `src/config.ts` stays the same. The account that deploys it needs edit access to `1YljG5…`. The current deployment is still the old brightness test, so **real syncing has not been tested against Google**. Tested so far: the app in a browser with the request captured (every answer in the right column), and `Code.gs` in Node against a fake sheet seeded with the real AppSheet header (values land in the right columns with the same types AppSheet used; resending doesn't duplicate).

## PWA / deployment

- `npm run build:web` → `expo export -p web` + Workbox service worker + `404.html`. Output in `dist/` (gitignored).
- Hosted under the base path `/scouting_app` (`experiments.baseUrl` in `app.json`) → **https://mariners8223.github.io/scouting_app/**
- **One-time setup still needed:** GitHub repo → Settings → Pages → Source: **GitHub Actions**. After that, every push to `master` deploys.
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

- **Templates are per device.** Editing a template on one phone does not update the other phones. Next step: publish templates to the spreadsheet (or a JSON file in the repo/site) and let phones download the current one.
- Deploy and test `apps-script/Code.gs` against the real spreadsheet (send one test form, check the row in `Table` and that it shows up in the Team Dashboard).
- A few dashboard formulas look for values AppSheet never wrote, so they show nothing with either AppSheet's or the app's data: climb level as `1`/`2` (both write `L1`/`L2`), "Did he defend" (AB/AT, no question fills it), active2 "How did he manage?" counted as `Non` (the app writes `No Defense`, like active 1). Fix those in the dashboard if they matter.
- Once AppSheet stops being used, it may complain that the table has new columns (CE onward); that's expected.
- Anyone who reads the public repo can find the Apps Script URL and post rows. Add a shared secret that the script checks.
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
