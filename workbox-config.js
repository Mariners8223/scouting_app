// Service worker for the PWA: stores every file of the web build on the phone so the
// app opens with no internet. Generated into dist/ by `npm run build:web`.
module.exports = {
  globDirectory: 'dist/',
  globPatterns: ['**/*.{html,js,css,json,png,jpg,svg,ico,ttf,woff,woff2}'],
  globIgnores: ['sw.js', 'workbox-*.js', '404.html'],
  swDest: 'dist/sw.js',
  // The JS bundle is a few MB; the default 2 MB limit would leave it out.
  maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
  // Any page (e.g. /scouting_app/editor) opens the cached app shell when offline.
  navigateFallback: '/scouting_app/index.html',
  // A new version takes over on the next launch instead of waiting for every tab to close.
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
};
