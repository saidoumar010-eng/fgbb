/* =========================================================================
   FGBB — Bandeau d'information « cookies »
   Le site et l'application web n'utilisent QUE du stockage strictement
   nécessaire : session de connexion (Supabase), préférence de thème et
   mémorisation de ce bandeau. Aucun traceur publicitaire, aucune mesure
   d'audience tierce. Le stockage nécessaire n'exige pas de consentement
   préalable : ce bandeau informe et se ferme d'un clic.
   Script autonome, sans dépendance. À inclure sur chaque page :
     <script src="cookies.js" defer></script>
   ========================================================================= */
(function () {
  'use strict';

  var KEY = 'fgbb-cookie-consent';
  var VERSION = '1';

  function readConsent() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function saveConsent() {
    try { localStorage.setItem(KEY, VERSION); } catch (e) {}
  }

  function buildBar() {
    var bar = document.createElement('div');
    bar.className = 'cookie-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Information sur les cookies et le stockage local');
    bar.innerHTML =
      '<div class="cookie-bar-inner">' +
        '<p class="cookie-bar-txt">' +
          'Ce site n’utilise que des cookies et du stockage ' +
          '<strong>strictement nécessaires</strong> au fonctionnement ' +
          '(rester connecté, mémoriser votre thème). ' +
          'Aucun traceur publicitaire ni mesure d’audience tierce. ' +
          '<a class="cookie-bar-link" href="cookies.html">En savoir plus</a>.' +
        '</p>' +
        '<div class="cookie-bar-actions">' +
          '<button type="button" class="btn sm" data-cookie-accept>J’ai compris</button>' +
        '</div>' +
      '</div>';
    return bar;
  }

  function show() {
    if (document.querySelector('.cookie-bar')) return;
    var bar = buildBar();
    (document.body || document.documentElement).appendChild(bar);
    // Déclenche l'animation d'entrée. On combine requestAnimationFrame (fluide)
    // et un setTimeout de secours : rAF peut être suspendu quand l'onglet n'est
    // pas au premier plan / composité — le setTimeout garantit l'affichage.
    var reveal = function () { bar.classList.add('show'); };
    if (window.requestAnimationFrame) { requestAnimationFrame(reveal); }
    setTimeout(reveal, 40);
    var btn = bar.querySelector('[data-cookie-accept]');
    if (btn) btn.addEventListener('click', function () { saveConsent(); hide(); });
  }

  function hide() {
    var bar = document.querySelector('.cookie-bar');
    if (!bar) return;
    bar.classList.remove('show');
    setTimeout(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 320);
  }

  /* Exposé pour la page « cookies.html » : rouvre le bandeau et réinitialise
     le choix (bouton « Gérer mon choix »). */
  window.fgbbCookieSettings = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    show();
  };

  function init() { if (!readConsent()) show(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
