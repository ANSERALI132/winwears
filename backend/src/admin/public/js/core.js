/* ==========================================================================
   Admin — namespace and route registry
   Loaded first. The view files register themselves against this at parse
   time; app.js reads the registry once the session is confirmed.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = (window.Admin = window.Admin || {});

  Admin.state = { user: null, counts: { quotes: 0, messages: 0 } };
  Admin.routes = {};

  /**
   * Registers a view.
   *   path     '/products' or '/products/:id/edit'
   *   def      { title, subtitle, render(mount, params, ctx) }
   * `render` may return a promise; a rejection becomes the error state.
   */
  Admin.route = function (path, def) {
    Admin.routes[path] = def;
  };
})();
