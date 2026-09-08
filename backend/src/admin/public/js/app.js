/* ==========================================================================
   Admin — shell, routing and the session gate
   ========================================================================== */
(function () {
  'use strict';

  var Admin = (window.Admin = window.Admin || {});
  var ui = Admin.ui;
  var h = ui.h;
  var api = Admin.api;

  /* Admin.state and Admin.route come from core.js, which loads first so the
     view files can register before this one runs. */

  /* ----------------------------------------------------------- icons ---- */

  var ICONS = {
    overview: 'M3 12h4l3 8 4-16 3 8h4',
    products: 'M12 2 3 7v10l9 5 9-5V7Zm0 0v20M3 7l9 5 9-5',
    categories: 'M3 5h18M3 12h18M3 19h18',
    quotes: 'M4 4h16v12H7l-3 3Z',
    messages: 'M3 6h18v12H3Zm0 0 9 7 9-7',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 12H2m20 0h-2M12 4V2m0 20v-2',
    users: 'M16 19v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    activity: 'M3 12h4l2-7 4 14 2-7h6',
  };

  function icon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name] || ICONS.overview);
    svg.appendChild(path);
    return svg;
  }
  Admin.icon = icon;

  /* ------------------------------------------------------------ nav ----- */

  var NAV = [
    { group: 'Catalogue', items: [
      { path: '/', label: 'Overview', icon: 'overview' },
      { path: '/products', label: 'Products', icon: 'products' },
      { path: '/categories', label: 'Categories', icon: 'categories' },
    ] },
    { group: 'Enquiries', items: [
      { path: '/quotes', label: 'Quote Requests', icon: 'quotes', count: 'quotes' },
      { path: '/messages', label: 'Contact Messages', icon: 'messages', count: 'messages' },
    ] },
    { group: 'AI Assistant', items: [
      { path: '/ai', label: 'Overview', icon: 'overview' },
      { path: '/ai/conversations', label: 'Conversations', icon: 'messages' },
      { path: '/ai/knowledge', label: 'Knowledge', icon: 'settings' },
    ] },
    { group: 'Site', items: [
      { path: '/settings', label: 'Settings', icon: 'settings' },
      { path: '/users', label: 'Admin Users', icon: 'users', adminOnly: true },
      { path: '/activity', label: 'Activity Log', icon: 'activity' },
    ] },
  ];

  function buildNav() {
    var nav = h('nav.nav', { 'aria-label': 'Sections' });

    NAV.forEach(function (group) {
      var items = group.items.filter(function (item) {
        return !item.adminOnly || (Admin.state.user && Admin.state.user.role === 'ADMIN');
      });
      if (!items.length) return;

      var wrap = h('div.nav__group', h('p.nav__label', { text: group.group }));
      items.forEach(function (item) {
        var link = h(
          'a.nav__link',
          { href: '#' + item.path, dataset: { path: item.path } },
          icon(item.icon),
          h('span', { text: item.label }),
        );
        if (item.count) link.appendChild(h('span.nav__count', { dataset: { count: item.count }, hidden: true }));
        wrap.appendChild(link);
      });
      nav.appendChild(wrap);
    });

    return nav;
  }

  function initials(name) {
    return String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (w) { return w[0]; })
      .join('')
      .toUpperCase();
  }

  function buildShell() {
    var user = Admin.state.user;

    var sidebar = h(
      'aside.sidebar',
      { id: 'sidebar' },
      h(
        'div.sidebar__brand',
        h('div.sidebar__mark', { text: 'WW' }),
        h('div', h('div.sidebar__name', { text: 'WIN WEARS' }), h('div.sidebar__sub', { text: 'Admin' })),
      ),
      buildNav(),
      h(
        'div.sidebar__foot',
        h(
          'div.who',
          h('div.who__avatar', { text: initials(user.name) }),
          h('div', h('div.who__name', { text: user.name }), h('div.who__role', { text: user.role })),
        ),
        h('button.btn.btn--sm', { type: 'button', style: 'width:100%', onclick: signOut }, 'Sign out'),
      ),
    );

    var burger = h(
      'button.burger',
      { type: 'button', 'aria-label': 'Open navigation', onclick: toggleSidebar },
      h('span', { html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>' }),
    );

    var main = h(
      'div.main',
      h(
        'header.topbar',
        burger,
        h('div.topbar__title', h('h1', { id: 'view-title', text: 'Overview' }), h('p', { id: 'view-sub' })),
        h('div', { id: 'view-actions', style: 'display:flex;gap:8px;flex-wrap:wrap' }),
      ),
      h('main.view', { id: 'view' }),
    );

    return h('div.shell', sidebar, main);
  }

  function toggleSidebar() {
    var sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    var open = sidebar.classList.toggle('is-open');

    var scrim = document.querySelector('.scrim');
    if (open && !scrim) {
      document.body.appendChild(h('div.scrim', { onclick: toggleSidebar }));
    } else if (!open && scrim) {
      scrim.remove();
    }
  }

  function closeSidebar() {
    var sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('is-open')) toggleSidebar();
  }

  /* --------------------------------------------------------- routing ---- */

  function currentPath() {
    var hash = location.hash.replace(/^#/, '') || '/';
    return hash.split('?')[0];
  }

  function currentQuery() {
    var hash = location.hash.replace(/^#/, '');
    var at = hash.indexOf('?');
    var out = {};
    if (at === -1) return out;
    new URLSearchParams(hash.slice(at + 1)).forEach(function (v, k) { out[k] = v; });
    return out;
  }
  Admin.query = currentQuery;

  Admin.go = function (path) {
    location.hash = path;
  };

  /** Matches '/products/:id/edit' against a concrete path. */
  function match(pattern, path) {
    var a = pattern.split('/').filter(Boolean);
    var b = path.split('/').filter(Boolean);
    if (a.length !== b.length) return null;
    var params = {};
    for (var i = 0; i < a.length; i++) {
      if (a[i][0] === ':') params[a[i].slice(1)] = decodeURIComponent(b[i]);
      else if (a[i] !== b[i]) return null;
    }
    return params;
  }

  function resolve(path) {
    if (Admin.routes[path]) return { def: Admin.routes[path], params: {} };
    var keys = Object.keys(Admin.routes);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf(':') === -1) continue;
      var params = match(keys[i], path);
      if (params) return { def: Admin.routes[keys[i]], params: params };
    }
    return null;
  }

  function markCurrent(path) {
    document.querySelectorAll('.nav__link').forEach(function (link) {
      var target = link.dataset.path;
      var active = target === '/' ? path === '/' : path.indexOf(target) === 0;
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  var renderToken = 0;

  function render() {
    var path = currentPath();
    var mount = document.getElementById('view');
    if (!mount) return;

    closeSidebar();
    markCurrent(path);

    var hit = resolve(path);
    var title = document.getElementById('view-title');
    var sub = document.getElementById('view-sub');
    var actions = document.getElementById('view-actions');
    ui.clear(actions);

    if (!hit) {
      title.textContent = 'Not found';
      sub.textContent = '';
      ui.clear(mount).appendChild(
        ui.empty('That page does not exist', 'Pick a section from the menu.', h('a.btn', { href: '#/' }, 'Go to overview')),
      );
      return;
    }

    title.textContent = hit.def.title || '';
    sub.textContent = hit.def.subtitle || '';

    ui.clear(mount).appendChild(ui.skeleton(6));
    window.scrollTo(0, 0);

    var token = ++renderToken;
    Promise.resolve()
      .then(function () {
        return hit.def.render(mount, hit.params, { actions: actions, setSubtitle: function (t) { sub.textContent = t; } });
      })
      .catch(function (err) {
        /* A stale view must not overwrite the one the operator is now on. */
        if (token !== renderToken) return;
        ui.clear(mount).appendChild(ui.errorState(err, render));
      });
  }

  Admin.refresh = render;

  /* ----------------------------------------------------------- counts --- */

  function refreshCounts() {
    return api
      .get('/api/admin/stats')
      .then(function (res) {
        var d = res.data;
        Admin.state.counts = { quotes: d.quotes.new, messages: d.messages.new };
        document.querySelectorAll('[data-count]').forEach(function (badge) {
          var n = Admin.state.counts[badge.dataset.count] || 0;
          badge.textContent = String(n);
          badge.hidden = n === 0;
        });
        return d;
      })
      .catch(function () { /* The badge is a nicety; never block on it. */ });
  }
  Admin.refreshCounts = refreshCounts;

  /* ------------------------------------------------------------ auth ---- */

  function signOut() {
    api.post('/api/auth/logout', {}).catch(function () {}).then(function () {
      Admin.state.user = null;
      api.setCsrf(null);
      location.hash = '#/login';
      location.reload();
    });
  }

  Admin.onSessionLost = function () {
    Admin.state.user = null;
    api.setCsrf(null);
    ui.toast('Your session ended. Please sign in again.', 'error');
    setTimeout(function () { location.reload(); }, 900);
  };

  function boot() {
    var root = document.getElementById('root');

    api
      .get('/api/auth/me')
      .then(function (res) {
        Admin.state.user = res.data.user;
        api.setCsrf(res.data.csrfToken);

        ui.clear(root).appendChild(buildShell());
        if (currentPath() === '/login') location.hash = '#/';

        window.addEventListener('hashchange', render);
        render();
        refreshCounts();
        /* Keeps the unread badges honest while the tab is left open. */
        setInterval(refreshCounts, 60000);
      })
      .catch(function () {
        ui.clear(root).appendChild(Admin.loginView());
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
