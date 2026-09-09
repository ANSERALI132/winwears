/* ==========================================================================
   Editable page copy.

   The words in this page's HTML are the real ones. This script only replaces
   them where somebody has actually edited that block in the admin — so with
   nothing edited, and with the API unreachable, the page reads exactly as it
   was written.

   Text only, always. Every replacement goes through textContent, so a heading
   cannot become markup no matter what was typed into the admin. That is the
   whole reason there is no rich-text editor behind this.
   ========================================================================== */
(function () {
  'use strict';

  /* Which page this is, from its filename. Nothing in the markup has to
     declare it, which is one less thing to keep in step. */
  function pageName() {
    var file = (location.pathname.split('/').pop() || '').toLowerCase();
    if (!file || file === 'index.html') return 'home';
    if (file === 'request-quote.html') return 'quote';
    return file.replace(/\.html$/, '');
  }

  function apply(blocks) {
    var nodes = document.querySelectorAll('[data-ww-content]');
    for (var i = 0; i < nodes.length; i += 1) {
      var key = nodes[i].getAttribute('data-ww-content');
      var text = blocks[key];
      /* Only a non-empty string replaces anything. An absent key, an empty
         one, or a value of the wrong type all leave the original alone. */
      if (typeof text === 'string' && text.trim()) nodes[i].textContent = text;
    }
  }

  function load() {
    if (!document.querySelector('[data-ww-content]')) return;

    /* Same shape as assets/js/api.js: the API is served from the same origin
       under /api, and nothing here needs a credential. */
    fetch('/api/content/' + encodeURIComponent(pageName()), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (body) {
        if (body && body.data && typeof body.data === 'object') apply(body.data);
      })
      .catch(function () {
        /* The page already says something sensible. A copy override that
           cannot be fetched is not worth a visible error. */
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
