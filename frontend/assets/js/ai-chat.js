/* ==========================================================================
   WIN WEARS — AI assistant widget

   Self-contained: it builds its own markup, so a page opts in with one link
   and one script tag and no extra HTML.

   Everything from the API is inserted with textContent or as an attribute on
   an element built here. Nothing is ever assigned through innerHTML — product
   copy is admin-editable, and admin-editable is still untrusted for this
   purpose.

   Asks the server whether it should exist at all before drawing anything: if
   no AI key is configured, the launcher never appears and the page is exactly
   as it was.
   ========================================================================== */
(function () {
  'use strict';

  var API = '/api/ai';
  var STORE_KEY = 'ww.ai.session';

  /* §10 — the openers a first-time visitor can tap instead of typing. */
  var QUICK = [
    'Which ball is right for me?',
    'I need custom footballs.',
    'I want a bulk order.',
    'Show me match balls.',
    'How does customization work?',
    'Talk to a WIN WEARS representative.'
  ];

  /* §31 — what a customer standing on a product page is most likely to want.
     These open the conversation about that specific ball. */
  var PRODUCT_QUICK = [
    'Tell me the specifications',
    'Is customization available?',
    'What quantity can I order?',
    'Request a quote'
  ];

  var state = {
    open: false,
    busy: false,
    started: false,
    sessionId: null,
    whatsappUrl: null,
    maxLength: 2000,
    lastFocus: null,
    /* Set when the widget is opened from a product page, so the welcome
       screen and the first question are about that ball. */
    product: null
  };

  var el = {};

  /* ---------------------------------------------------------------- util -- */

  function h(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /** Inline SVG rather than an icon font or a CDN script — the site loads no
   *  third-party JavaScript, and one chat widget is not a reason to start. */
  function icon(paths, size) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (size) { svg.setAttribute('width', size); svg.setAttribute('height', size); }
    paths.forEach(function (d) {
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  /** Only http(s) and same-origin paths become links. A product URL comes from
   *  our own database, but "javascript:" in an href is one admin typo away
   *  from a scripted link, and the check costs nothing. */
  function safeHref(url) {
    if (typeof url !== 'string' || !url) return null;
    if (url.charAt(0) === '/') return url;
    return /^https?:\/\//i.test(url) ? url : null;
  }

  function scrollDown() {
    if (el.log) el.log.scrollTop = el.log.scrollHeight;
  }

  /** Fire-and-forget. The server cannot see a WhatsApp click, and a failed
   *  analytics write must never interrupt one. */
  function track(event) {
    if (!state.sessionId) return;
    try {
      fetch(API + '/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId, event: event }),
        keepalive: true
      }).catch(function () {});
    } catch (err) { /* nothing to do */ }
  }

  /** Builds a WhatsApp link that reports its own click before following.
   *  The href is set normally, so it still works with JavaScript disabled
   *  and a middle-click opens the real destination. */
  function whatsappLink(label) {
    var a = h('a', 'aic-mini aic-mini--wa', label);
    a.href = state.whatsappUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.addEventListener('click', function () { track('WHATSAPP_CLICKED'); });
    return a;
  }

  function announce(text) {
    if (el.sr) el.sr.textContent = text;
  }

  /* --------------------------------------------------------------- build -- */

  function buildLauncher() {
    var btn = h('button', 'aic-launch');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Ask the WIN WEARS assistant');
    btn.appendChild(icon(['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z']));
    btn.appendChild(h('span', 'aic-launch__label', 'Ask WIN WEARS AI'));
    btn.addEventListener('click', open);
    return btn;
  }

  function buildPanel() {
    var panel = h('section', 'aic-panel');
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-labelledby', 'aic-title');

    /* head */
    var head = h('div', 'aic-head');
    head.appendChild(h('div', 'aic-head__mark', 'WW'));
    var ht = h('div', 'aic-head__text');
    var title = h('div', 'aic-head__title', 'WIN WEARS Assistant');
    title.id = 'aic-title';
    ht.appendChild(title);
    ht.appendChild(h('div', 'aic-head__sub', 'Football manufacturing'));
    head.appendChild(ht);

    var x = h('button', 'aic-x');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close the assistant');
    x.appendChild(icon(['M18 6 6 18', 'm6 6 12 12'], 16));
    x.addEventListener('click', close);
    head.appendChild(x);
    panel.appendChild(head);

    /* log */
    el.log = h('div', 'aic-log');
    el.log.setAttribute('role', 'log');
    el.log.setAttribute('aria-live', 'polite');
    el.log.setAttribute('aria-relevant', 'additions');
    panel.appendChild(el.log);

    /* composer */
    var form = h('form', 'aic-form');
    el.input = h('textarea', 'aic-input');
    el.input.rows = 1;
    el.input.placeholder = 'Ask about footballs, sizes or bulk orders…';
    el.input.setAttribute('aria-label', 'Your message');
    el.input.maxLength = state.maxLength;

    el.send = h('button', 'aic-send');
    el.send.type = 'submit';
    el.send.setAttribute('aria-label', 'Send');
    el.send.appendChild(icon(['M22 2 11 13', 'M22 2 15 22l-4-9-9-4z'], 18));

    form.appendChild(el.input);
    form.appendChild(el.send);
    form.addEventListener('submit', onSubmit);
    panel.appendChild(form);

    panel.appendChild(h('p', 'aic-foot', 'AI assistant — please confirm details with our team'));

    el.sr = h('div', 'aic-sr');
    el.sr.setAttribute('aria-live', 'polite');
    panel.appendChild(el.sr);

    /* Enter sends, Shift+Enter makes a new line. */
    el.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit(e);
      }
    });

    /* Grow with the message, up to the CSS max-height. */
    el.input.addEventListener('input', function () {
      el.input.style.height = 'auto';
      el.input.style.height = Math.min(el.input.scrollHeight, 120) + 'px';
    });

    return panel;
  }

  function buildWelcome() {
    var wrap = h('div', 'aic-welcome');
    var onProduct = state.product && state.product.name;

    /* The product greeting is written here rather than fetched. Opening the
       panel should cost nothing; the first paid call happens when the
       customer actually asks something. */
    if (onProduct) {
      wrap.appendChild(h('h2', 'aic-welcome__h', 'About the ' + state.product.name));
      wrap.appendChild(h('p', 'aic-welcome__p', 'I can help with this football. What would you like to know?'));
    } else {
      wrap.appendChild(h('h2', 'aic-welcome__h', 'How can we help?'));
      wrap.appendChild(h('p', 'aic-welcome__p', 'Ask about footballs, customization, bulk orders or request a quote.'));
    }

    var chips = h('div', 'aic-chips');
    (onProduct ? PRODUCT_QUICK : QUICK).forEach(function (text) {
      var chip = h('button', 'aic-chip', text);
      chip.type = 'button';
      chip.addEventListener('click', function () { submit(text); });
      chips.appendChild(chip);
    });
    wrap.appendChild(chips);
    return wrap;
  }

  /* ------------------------------------------------------------ messages -- */

  function addMessage(text, who) {
    var node = h('div', 'aic-msg aic-msg--' + who, text);
    el.log.appendChild(node);
    scrollDown();
    return node;
  }

  function addCards(products) {
    if (!products || !products.length) return;
    var wrap = h('div', 'aic-cards');

    products.forEach(function (p) {
      var card = h('div', 'aic-card');

      var img = document.createElement('img');
      img.className = 'aic-card__img';
      img.loading = 'lazy';
      img.src = safeHref(p.image) || '/assets/img/logo/win-wears-badge.png';
      /* Real alt text: a screen reader should hear which ball this is. */
      img.alt = p.name ? p.name + (p.description ? ' — ' + p.description : '') : 'WIN WEARS football';
      card.appendChild(img);

      var body = h('div', 'aic-card__body');
      body.appendChild(h('div', 'aic-card__name', p.name || 'Football'));

      var meta = [p.category, p.construction, p.size ? 'Size ' + p.size : null]
        .filter(Boolean).join(' · ');
      if (meta) body.appendChild(h('div', 'aic-card__meta', meta));

      var actions = h('div', 'aic-card__actions');

      var href = safeHref(p.url);
      if (href) {
        var view = h('a', 'aic-mini', 'View product');
        view.href = href;
        actions.appendChild(view);
      }

      var quote = h('button', 'aic-mini aic-mini--red', 'Request quote');
      quote.type = 'button';
      quote.addEventListener('click', function () {
        submit('I would like a quote for the ' + (p.name || 'football') + '.');
      });
      actions.appendChild(quote);

      if (state.whatsappUrl) actions.appendChild(whatsappLink('WhatsApp'));

      body.appendChild(actions);
      card.appendChild(body);
      wrap.appendChild(card);
    });

    el.log.appendChild(wrap);
    scrollDown();
  }

  /** The human-handoff block. Shown whenever the server says it cannot help,
   *  so a dead end always has a way out of it. */
  function addHandoff() {
    if (!state.whatsappUrl) return;
    var wrap = h('div', 'aic-cards');
    var row = h('div', 'aic-card__actions');

    row.appendChild(whatsappLink('WhatsApp WIN WEARS'));

    var rq = h('a', 'aic-mini', 'Request a quote');
    rq.href = '/request-quote.html';
    row.appendChild(rq);

    wrap.appendChild(row);
    el.log.appendChild(wrap);
    scrollDown();
  }

  function showTyping() {
    var node = h('div', 'aic-msg aic-msg--them aic-typing');
    node.appendChild(h('span'));
    node.appendChild(h('span'));
    node.appendChild(h('span'));
    el.log.appendChild(node);
    announce('Assistant is typing');
    scrollDown();
    return node;
  }

  /* ---------------------------------------------------------------- send -- */

  function setBusy(busy) {
    state.busy = busy;
    el.send.disabled = busy;
    el.input.disabled = busy;
  }

  function onSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    var text = el.input.value.trim();
    if (!text) return;
    el.input.value = '';
    el.input.style.height = 'auto';
    submit(text);
  }

  function submit(text) {
    if (state.busy) return;

    /* The welcome screen is replaced by the first real exchange. */
    if (!state.started) {
      state.started = true;
      el.log.textContent = '';
    }

    addMessage(text, 'me');
    setBusy(true);
    var typing = showTyping();

    var body = { message: text };
    if (state.sessionId) body.sessionId = state.sessionId;

    /* A product page tells the assistant what the customer is looking at, so
       "is this available in size 5" has a subject. */
    var slug = productSlug();
    if (slug) body.productSlug = slug;

    fetch(API + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        return res.json().then(function (payload) { return { ok: res.ok, status: res.status, payload: payload }; });
      })
      .then(function (r) {
        typing.remove();
        var d = (r.payload && r.payload.data) || {};

        if (d.sessionId) {
          state.sessionId = d.sessionId;
          try { sessionStorage.setItem(STORE_KEY, d.sessionId); } catch (err) { /* private mode */ }
        }
        if (d.whatsappUrl) state.whatsappUrl = d.whatsappUrl;

        if (d.reply) {
          addMessage(d.reply, r.ok ? 'them' : 'note');
          announce(d.reply);
        } else {
          addMessage(fallbackText(r.status), 'note');
        }

        addCards(d.products);
        if (d.escalate || !r.ok) addHandoff();
      })
      .catch(function () {
        typing.remove();
        addMessage('That message could not be sent. Please check your connection, or message us on WhatsApp.', 'note');
        addHandoff();
      })
      .then(function () {
        setBusy(false);
        el.input.focus();
      });
  }

  function fallbackText(status) {
    if (status === 429) return 'You have sent a lot of messages. Please wait a few minutes, or continue on WhatsApp.';
    return "Sorry, I'm temporarily unable to answer. You can contact the WIN WEARS team directly on WhatsApp.";
  }

  /** Which ball the customer is looking at, if any. An explicit open from a
   *  product page wins over the URL, since that is the more deliberate
   *  signal; otherwise the product page is one template driven by ?slug=. */
  function productSlug() {
    if (state.product && state.product.slug) return state.product.slug;
    if (!/\/product\.html$/.test(location.pathname)) return null;
    try {
      return new URLSearchParams(location.search).get('slug');
    } catch (err) {
      return null;
    }
  }

  /* ------------------------------------------------------- open and close -- */

  function open() {
    if (state.open) return;
    state.open = true;
    state.lastFocus = document.activeElement;

    el.panel.hidden = false;
    el.panel.classList.add('aic-panel--in');
    el.launch.hidden = true;

    if (!state.started && !el.log.childNodes.length) el.log.appendChild(buildWelcome());

    track('CHAT_OPENED');
    document.addEventListener('keydown', onKeydown);
    el.input.focus();
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    el.panel.hidden = true;
    el.panel.classList.remove('aic-panel--in');
    el.launch.hidden = false;
    document.removeEventListener('keydown', onKeydown);
    /* Focus goes back where it came from, not to the top of the document. */
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
    else el.launch.focus();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;

    /* Keep Tab inside the panel while it is open. */
    var focusable = el.panel.querySelectorAll('button, a[href], textarea, input, select');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------------------------------------------------------------- boot -- */

  function start(status) {
    /* Nothing is drawn when the assistant is off. A launcher that apologises
       is worse than no launcher. */
    if (!status || !status.enabled) return;

    state.whatsappUrl = status.whatsappUrl || null;
    if (status.maxLength) state.maxLength = status.maxLength;

    try { state.sessionId = sessionStorage.getItem(STORE_KEY); } catch (err) { /* private mode */ }

    el.launch = buildLauncher();
    el.panel = buildPanel();
    document.body.appendChild(el.launch);
    document.body.appendChild(el.panel);
  }

  /* --------------------------------------------------------------- api --- */

  /**
   * The small surface other page scripts use.
   *
   * `ready` resolves with whether the assistant exists at all, so a caller
   * can decide whether to render an "Ask AI" control without racing the
   * status request or having to know it happened.
   */
  var resolveReady;
  var WWChat = {
    ready: new Promise(function (resolve) { resolveReady = resolve; }),
    available: false,

    /** Opens the panel about one product, with that ball's quick prompts. */
    openForProduct: function (product) {
      if (!WWChat.available || !product || !product.slug) return;
      /* A different ball means a fresh welcome rather than the last one. */
      if (!state.product || state.product.slug !== product.slug) {
        state.product = { slug: product.slug, name: product.name || null };
        if (!state.started && el.log) el.log.textContent = '';
      }
      open();
    },

    /** Opens the panel and sends one message straight away. */
    ask: function (text) {
      if (!WWChat.available || !text) return;
      open();
      submit(String(text));
    }
  };

  window.WWChat = WWChat;

  function boot() {
    fetch(API + '/status')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (payload) {
        var data = payload && payload.data;
        start(data);
        WWChat.available = Boolean(data && data.enabled);
        resolveReady(WWChat.available);
      })
      .catch(function () {
        /* No API reachable: the site works without us. */
        resolveReady(false);
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
