/* ==========================================================================
   Admin — DOM helpers
   Everything is built with createElement and textContent. No innerHTML with a
   value that came from the database, a URL or an upload.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = (window.Admin = window.Admin || {});

  /**
   * h('div.card', { onclick: fn }, 'text', childNode)
   * Tag string accepts .class and #id shorthand.
   */
  function h(spec, props) {
    var parts = String(spec).split(/(?=[.#])/);
    var el = document.createElement(parts[0] || 'div');

    for (var i = 1; i < parts.length; i++) {
      var token = parts[i];
      if (token[0] === '.') el.classList.add(token.slice(1));
      else if (token[0] === '#') el.id = token.slice(1);
    }

    var start = 1;
    if (props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props)) {
      start = 2;
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key.indexOf('on') === 0 && typeof value === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'class') {
          String(value).split(/\s+/).filter(Boolean).forEach(function (c) { el.classList.add(c); });
        } else if (key === 'text') {
          el.textContent = String(value);
        } else if (key === 'html') {
          /* Only ever used with markup written in this file — never with data. */
          el.innerHTML = value;
        } else if (key === 'value') {
          el.value = value;
        } else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'hidden') {
          el[key] = Boolean(value);
        } else if (key === 'dataset') {
          Object.keys(value).forEach(function (d) { el.dataset[d] = value[d]; });
        } else {
          el.setAttribute(key, value === true ? '' : String(value));
        }
      });
    }

    for (var a = start; a < arguments.length; a++) append(el, arguments[a]);
    return el;
  }

  function append(parent, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) { append(parent, c); });
      return;
    }
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  /* ------------------------------------------------------------ toasts --- */

  function toastHost() {
    var host = document.querySelector('.toasts');
    if (!host) {
      host = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(message, kind) {
    var el = h('div.toast', { class: kind ? 'toast--' + kind : '', text: message });
    toastHost().appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 200);
    }, kind === 'error' ? 6000 : 3500);
  }

  /* ------------------------------------------------------------- modal --- */

  /** Resolves true on confirm, false on cancel/Escape/backdrop. */
  function modal(options) {
    return new Promise(function (resolve) {
      var settled = false;
      function done(value) {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(value);
      }

      function onKey(e) {
        if (e.key === 'Escape') done(false);
      }

      var confirmBtn = h(
        'button.btn',
        {
          type: 'button',
          class: options.danger ? 'btn--danger' : 'btn--primary',
          onclick: function () { done(true); },
        },
        options.confirmLabel || 'Confirm',
      );

      var overlay = h(
        'div.overlay',
        {
          role: 'dialog',
          'aria-modal': 'true',
          onclick: function (e) { if (e.target === overlay) done(false); },
        },
        h(
          'div.modal',
          h('div.modal__head', h('h2', { text: options.title || 'Are you sure?' })),
          h('div.modal__body', options.body || h('p', { text: options.message || '' })),
          h(
            'div.modal__foot',
            h('button.btn', { type: 'button', onclick: function () { done(false); } }, options.cancelLabel || 'Cancel'),
            confirmBtn,
          ),
        ),
      );

      document.addEventListener('keydown', onKey);
      document.body.appendChild(overlay);
      confirmBtn.focus();
    });
  }

  /** Delete confirmations: names the record, and says whether it is recoverable. */
  function confirmDelete(name, note) {
    return modal({
      title: 'Delete this record?',
      danger: true,
      confirmLabel: 'Delete',
      body: h(
        'div',
        h('p', { text: name }, ''),
        h('p.muted', { text: note || 'It will be archived and can be restored later.' }),
      ),
    });
  }

  /* ------------------------------------------------------------ states --- */

  function skeleton(rows) {
    var wrap = h('div');
    for (var i = 0; i < (rows || 5); i++) wrap.appendChild(h('div.skeleton.skeleton--row'));
    return wrap;
  }

  function empty(title, message, action) {
    return h('div.empty', h('h3', { text: title }), h('p', { text: message || '' }), action || null);
  }

  function errorState(err, retry) {
    return h(
      'div.empty',
      h('h3', { text: 'That did not load' }),
      h('p', { text: (err && err.message) || 'Something went wrong. Please try again.' }),
      retry ? h('button.btn', { type: 'button', onclick: retry }, 'Try again') : null,
    );
  }

  /* ------------------------------------------------------------ format --- */

  function date(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function dateTime(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function statusPill(status) {
    var map = {
      PUBLISHED: ['ok', 'Published'],
      DRAFT: ['draft', 'Draft'],
      ARCHIVED: ['archived', 'Archived'],
      NEW: ['new', 'New'],
      READ: ['info', 'Read'],
      REPLIED: ['ok', 'Replied'],
      CONTACTED: ['info', 'Contacted'],
      IN_PROGRESS: ['draft', 'In progress'],
      COMPLETED: ['ok', 'Completed'],
      /* Orders. Without these the pill would print the raw enum, underscores
         and all, at the one moment somebody is scanning a list for trouble. */
      CONFIRMED: ['new', 'Confirmed'],
      IN_PRODUCTION: ['info', 'In production'],
      QUALITY_CHECK: ['info', 'Quality check'],
      READY_TO_SHIP: ['info', 'Ready to ship'],
      SHIPPED: ['info', 'Shipped'],
      DELIVERED: ['ok', 'Delivered'],
      ON_HOLD: ['draft', 'On hold'],
      CANCELLED: ['archived', 'Cancelled'],
    };
    var hit = map[status] || ['', String(status || '—')];
    return h('span.pill', { class: hit[0] ? 'pill--' + hit[0] : '', text: hit[1] });
  }

  /** Shows Zod field errors next to their inputs; returns unmatched messages. */
  function applyFieldErrors(form, issues) {
    form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    form.querySelectorAll('.field__error').forEach(function (el) { el.remove(); });

    var unmatched = [];
    (issues || []).forEach(function (issue) {
      var field = issue.field || issue.path;
      var input = field ? form.querySelector('[name="' + String(field).replace(/"/g, '') + '"]') : null;
      if (!input) {
        unmatched.push(issue.message);
        return;
      }
      input.setAttribute('aria-invalid', 'true');
      var holder = input.closest('.field') || input.parentNode;
      holder.appendChild(h('p.field__error', { text: issue.message }));
    });
    return unmatched;
  }

  function notice(kind, message, list) {
    return h(
      'div.notice',
      { class: 'notice--' + kind },
      h('span', { text: message }),
      list && list.length
        ? h('ul', list.map(function (item) { return h('li', { text: item }); }))
        : null,
    );
  }

  /** Debounce, for search-as-you-type. */
  function debounce(fn, wait) {
    var timer;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait || 300);
    };
  }

  Admin.ui = {
    h: h,
    clear: clear,
    toast: toast,
    modal: modal,
    confirmDelete: confirmDelete,
    skeleton: skeleton,
    empty: empty,
    errorState: errorState,
    date: date,
    dateTime: dateTime,
    statusPill: statusPill,
    applyFieldErrors: applyFieldErrors,
    notice: notice,
    debounce: debounce,
  };
})();
