#!/usr/bin/env node

/**
 * Stamps a web build with an id, so a phone can tell that the site has a newer version than the
 * one it is running (src/services/app-update.web.ts). Writes the same id into the app
 * (src/content/build-id.ts) and next to it on the site (public/version.json, never cached by the
 * service worker). Runs before every web build; the committed files say "dev", which never asks to update.
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd(); // npm runs scripts from the project folder
const id = (process.env.GITHUB_SHA || String(Date.now())).slice(0, 12);

fs.writeFileSync(
  path.join(root, 'src', 'content', 'build-id.ts'),
  `// Written by scripts/build-id.js for each web build. "dev" means a local build that never asks to update.\n` +
    `export const BUILD_ID = '${id}';\n`,
);
fs.writeFileSync(path.join(root, 'public', 'version.json'), JSON.stringify({ build: id }) + '\n');
console.log(`Build id ${id}`);
