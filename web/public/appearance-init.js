// Applies the light/dark choice saved on this device before the first paint,
// so the page never flashes in the wrong mode. An external file because the
// CSP forbids inline scripts. Keep in sync with src/lib/appearance.ts.
;(function () {
  var colors = { light: '#efefeb', dark: '#0f0f0e' }
  var appearance = 'system'
  try {
    var stored = localStorage.getItem('kumlod-appearance')
    if (stored === 'light' || stored === 'dark' || stored === 'system') appearance = stored
  } catch (e) {
    // Storage unavailable: follow the system.
  }
  var systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  var resolved = appearance === 'system' ? (systemDark ? 'dark' : 'light') : appearance
  if (resolved === 'dark') document.documentElement.classList.add('dark')
  if (appearance !== 'system') {
    var metas = document.querySelectorAll('meta[name="theme-color"]')
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', colors[resolved])
  }
})()
