/* ==========================================================================
   WIN WEARS — Site behaviour
   Navigation, mobile menu, scroll progress, reveals, accordions, counters,
   magnetic buttons, cursor, parallax, WhatsApp deep links, videos that play
   while on screen, pictures kept out of the save menu.
   Plain script: no modules, no build step.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var BASE = root.getAttribute('data-base') || '';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  /* ---------------------------------------------------------------- URLs -- */
  WW.url = function (path) { return BASE + path; };

  /** Build a wa.me link with a pre-filled message. */
  WW.wa = function (message) {
    /* The number lives in the database now, so it is not there on the very
       first paint. Callers re-run wireWhatsApp once WW.ready resolves. */
    var base = WW.CONTACT && WW.CONTACT.whatsapp;
    if (!base) return '';
    return message ? base + '?text=' + encodeURIComponent(message) : base;
  };

  /* Wire any [data-wa] element to WhatsApp with an optional message. */
  function wireWhatsApp(ctx) {
    $$('[data-wa]', ctx).forEach(function (el) {
      var msg = el.getAttribute('data-wa');
      el.setAttribute('href', WW.wa(msg || ''));
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    });
  }
  WW.wireWhatsApp = wireWhatsApp;

  /* ----------------------------------------------------------- Preloader -- */
  function bootPreloader() {
    var pre = $('.preloader');
    if (!pre) { doc.body.classList.add('is-loaded'); return; }
    var fill = $('.preloader__fill', pre);
    var pct = 0;
    var tick = setInterval(function () {
      pct = Math.min(92, pct + Math.random() * 18);
      if (fill) fill.style.width = pct + '%';
    }, 120);

    function done() {
      clearInterval(tick);
      if (fill) fill.style.width = '100%';
      setTimeout(function () { doc.body.classList.add('is-loaded'); }, 240);
    }
    if (doc.readyState === 'complete') done();
    else window.addEventListener('load', done);
    /* Never let a slow image hold the page hostage. */
    setTimeout(done, 3500);
  }

  /* ---------------------------------------------------------------- Nav --- */
  function bootNav() {
    var nav = $('.site-nav');
    if (!nav) return;
    var hero = $('[data-nav-watch]');
    var lastY = window.scrollY;
    var threshold = hero ? Math.max(80, hero.offsetHeight - 120) : 40;

    function apply() {
      var y = window.scrollY;
      var solid = y > threshold;
      nav.classList.toggle('nav--solid', solid);
      nav.classList.toggle('nav--over', !solid && !!hero);
      if (!hero && !solid) { nav.classList.add('nav--solid'); nav.classList.remove('nav--over'); }

      /* Hide going down, reveal going up — only well past the fold. */
      var goingDown = y > lastY && y > threshold + 220;
      if (!doc.body.classList.contains('menu-open')) {
        nav.classList.toggle('nav--hidden', goingDown);
      }
      lastY = y;
    }
    apply();
    window.addEventListener('scroll', apply, { passive: true });
    window.addEventListener('resize', function () {
      threshold = hero ? Math.max(80, hero.offsetHeight - 120) : 40;
      apply();
    });
  }

  /* -------------------------------------------------------- Mobile menu --- */
  function bootMenu() {
    var burger = $('.nav__burger');
    var menu = $('.mobile-menu');
    if (!burger || !menu) return;
    var lastFocus = null;

    function open() {
      lastFocus = doc.activeElement;
      menu.setAttribute('data-open', 'true');
      burger.setAttribute('aria-expanded', 'true');
      doc.body.classList.add('menu-open');
      $('.site-nav').classList.remove('nav--hidden');
      var first = menu.querySelector('a, button');
      if (first) setTimeout(function () { first.focus(); }, 320);
    }
    function close() {
      menu.setAttribute('data-open', 'false');
      burger.setAttribute('aria-expanded', 'false');
      doc.body.classList.remove('menu-open');
      if (lastFocus) lastFocus.focus();
    }
    function toggle() {
      menu.getAttribute('data-open') === 'true' ? close() : open();
    }

    burger.addEventListener('click', toggle);
    $$('a', menu).forEach(function (a) { a.addEventListener('click', close); });

    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.getAttribute('data-open') === 'true') close();
      if (e.key !== 'Tab' || menu.getAttribute('data-open') !== 'true') return;
      var f = $$('a[href], button:not([disabled])', menu);
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 1080 && menu.getAttribute('data-open') === 'true') close();
    });
  }

  /* ---------------------------------------------------- Scroll progress --- */
  function bootProgress() {
    var bar = $('.scroll-progress');
    if (!bar) return;
    function update() {
      var h = doc.documentElement.scrollHeight - window.innerHeight;
      var p = h > 0 ? window.scrollY / h : 0;
      bar.style.transform = 'scaleX(' + Math.min(1, Math.max(0, p)) + ')';
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }

  /* -------------------------------------------------------- Reveal ------- */
  function bootReveal(ctx) {
    var items = $$('.reveal:not(.is-in)', ctx);
    if (!items.length) return;
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  }
  WW.bootReveal = bootReveal;

  /* ------------------------------------------------------- Counters ------ */
  function bootCounters() {
    var nodes = $$('[data-count]');
    if (!nodes.length) return;
    function run(el) {
      var target = parseFloat(el.getAttribute('data-count'));
      var suffix = el.getAttribute('data-count-suffix') || '';
      if (reduced) { el.textContent = target + suffix; return; }
      var t0 = null, dur = 1400;
      function step(ts) {
        if (!t0) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
    if (!('IntersectionObserver' in window)) { nodes.forEach(run); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { run(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 0.5 });
    nodes.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------ Accordions ----- */
  /* Works for .tech__item, .faq__item and any [data-accordion] group. */
  function bootAccordions(ctx) {
    $$('[data-accordion]', ctx).forEach(function (group) {
      var single = group.getAttribute('data-accordion') === 'single';
      var items = $$('[data-acc-item]', group);
      items.forEach(function (item) {
        var btn = $('[data-acc-btn]', item);
        var panel = $('[data-acc-panel]', item);
        if (!btn || !panel) return;
        if (!panel.id) panel.id = 'acc-' + Math.random().toString(36).slice(2, 8);
        btn.setAttribute('aria-controls', panel.id);
        btn.setAttribute('aria-expanded', item.getAttribute('aria-expanded') === 'true' ? 'true' : 'false');

        btn.addEventListener('click', function () {
          var open = item.getAttribute('aria-expanded') === 'true';
          if (single) {
            items.forEach(function (o) {
              o.setAttribute('aria-expanded', 'false');
              var b = $('[data-acc-btn]', o); if (b) b.setAttribute('aria-expanded', 'false');
            });
          }
          item.setAttribute('aria-expanded', open ? 'false' : 'true');
          btn.setAttribute('aria-expanded', open ? 'false' : 'true');
          group.dispatchEvent(new CustomEvent('acc:change', { detail: { item: item, open: !open } }));
        });
      });
    });
  }
  WW.bootAccordions = bootAccordions;

  /* --------------------------------------------------- Magnetic buttons -- */
  function bootMagnetic() {
    if (!finePointer || reduced) return;
    $$('[data-magnetic]').forEach(function (el) {
      var raf = null, tx = 0, ty = 0;
      function move(e) {
        var r = el.getBoundingClientRect();
        var mx = e.clientX - (r.left + r.width / 2);
        var my = e.clientY - (r.top + r.height / 2);
        tx = mx * 0.22; ty = my * 0.30;
        if (!raf) raf = requestAnimationFrame(apply);
      }
      function apply() { raf = null; el.style.transform = 'translate(' + tx + 'px,' + ty + 'px)'; }
      function reset() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        el.style.transform = '';
      }
      el.addEventListener('mousemove', move);
      el.addEventListener('mouseleave', reset);
      el.addEventListener('blur', reset);
    });
  }

  /* -------------------------------------------------------- Cursor ------- */
  function bootCursor() {
    if (!finePointer || reduced) return;
    var c = doc.createElement('div');
    c.className = 'cursor';
    c.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(c);
    var x = 0, y = 0, cx = 0, cy = 0, on = false;

    doc.addEventListener('mousemove', function (e) {
      x = e.clientX; y = e.clientY;
      if (!on) { on = true; c.setAttribute('data-on', 'true'); cx = x; cy = y; }
    });
    doc.addEventListener('mouseleave', function () { on = false; c.setAttribute('data-on', 'false'); });

    (function loop() {
      cx += (x - cx) * 0.16;
      cy += (y - cy) * 0.16;
      c.style.transform = 'translate3d(' + (cx - 14) + 'px,' + (cy - 14) + 'px,0)';
      requestAnimationFrame(loop);
    })();

    doc.addEventListener('mouseover', function (e) {
      var hot = e.target.closest && e.target.closest('a, button, .p-card, .cat-card, .hotspot, .swatch, .opt');
      c.setAttribute('data-hot', hot ? 'true' : 'false');
    });
  }

  /* ------------------------------------------------------- Parallax ------ */
  function bootParallax() {
    if (reduced) return;
    var bands = $$('.media-band--parallax');
    if (!bands.length) return;
    function update() {
      bands.forEach(function (band) {
        var img = $('.media-band__img', band);
        if (!img) return;
        var r = band.getBoundingClientRect();
        if (r.bottom < -200 || r.top > window.innerHeight + 200) return;
        var progress = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
        img.style.transform = 'translate3d(0,' + (progress * -34) + 'px,0) scale(1.12)';
      });
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }

  /* --------------------------------------------------- Current nav item -- */
  /* Marks the nav link for the page you are on, including product sub-pages
     (a product detail page lights up "Products"). */
  function bootCurrent() {
    var here = location.pathname.split('/').pop() || 'index.html';
    var section = /^products/.test(here) || location.pathname.indexOf('/products/') > -1
      ? 'products.html'
      : here;
    $$('.nav__link, .mobile-menu__link').forEach(function (a) {
      var target = (a.getAttribute('href') || '').split('/').pop();
      if (target === section) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  /* --------------------------------------------------------- Footer ------ */
  function bootFooter() {
    $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
  }

  /**
   * Contact details and social links now come from the database, so any
   * element that displays one is filled in once the settings arrive.
   *
   *   <a data-contact="email">      href and text become the email address
   *   <a data-contact="phone">      tel: link
   *   <a data-social="instagram">   href becomes the stored profile URL
   *   <span data-contact-text="brand">
   */
  function bootContactDetails() {
    var c = WW.CONTACT;
    if (!c) return;

    $$('[data-contact]').forEach(function (el) {
      var kind = el.getAttribute('data-contact');
      if (kind === 'email' && c.email) {
        el.setAttribute('href', 'mailto:' + c.email);
        if (!el.getAttribute('data-keep-text')) el.textContent = c.email;
      } else if (kind === 'phone' && c.phoneDisplay) {
        el.setAttribute('href', 'tel:' + c.phoneDisplay.replace(/[^\d+]/g, ''));
        if (!el.getAttribute('data-keep-text')) el.textContent = c.phoneDisplay;
      }
    });

    $$('[data-social]').forEach(function (el) {
      var url = c.social && c.social[el.getAttribute('data-social')];
      if (!url) return;
      el.setAttribute('href', url);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    });

    $$('[data-contact-text]').forEach(function (el) {
      var value = c[el.getAttribute('data-contact-text')];
      if (value) el.textContent = value;
    });
  }

  /* ----------------------------------------------------------- Boot ------ */
  /* Videos marked data-inview play by themselves, muted — the only way a
     browser lets a video start on its own — with no controls: the
     manufacturing clips. Each starts just before it scrolls into view and
     pauses once well away, so every clip a visitor sees is playing without
     the page fetching all of them at once. data-playlist plays several clips
     in turn in one player. The browser's save menu is turned off on them.
     For anyone who asked their system for reduced motion they stay still. */
  function bootInviewVideos() {
    var vids = $$('video[data-inview]');
    if (!vids.length) return;

    vids.forEach(function (v) {
      var list = (v.getAttribute('data-playlist') || '').split(/\s+/).filter(Boolean);
      if (list.length > 1) {
        var at = 0;
        v.addEventListener('ended', function () {
          at = (at + 1) % list.length;
          v.src = list[at];
          v.play().catch(function () { /* the poster stays */ });
        });
      }
    });

    if (reduced || !('IntersectionObserver' in window)) return;
    var watch = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) {
          if (v.paused) v.play().catch(function () { /* the poster stays */ });
        } else if (!v.paused) {
          v.pause();
        }
      });
    }, { rootMargin: '150px 0px' });
    vids.forEach(function (v) { watch.observe(v); });
  }

  /* A long press on a phone, or a right click, offers Download image and
     Copy image for any picture. Turning the menu off on pictures and clips
     takes those away, and dragging one out of the page is stopped too.
     Neither hides the file itself — its url is public either way — so this
     deters the casual save rather than preventing it. Menus on text, links
     and form fields are left alone. */
  function bootPictureGuard() {
    doc.addEventListener('contextmenu', function (e) {
      var el = e.target;
      if (el && (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'PICTURE')) e.preventDefault();
    });
    doc.addEventListener('dragstart', function (e) {
      if (e.target && e.target.tagName === 'IMG') e.preventDefault();
    });
  }

  function init() {
    bootPreloader();
    bootNav();
    bootMenu();
    bootProgress();
    bootReveal(doc);
    bootCounters();
    bootAccordions(doc);
    bootMagnetic();
    bootCursor();
    bootParallax();
    bootInviewVideos();
    bootPictureGuard();
    bootCurrent();
    bootFooter();

    /* Everything above is chrome and motion — it needs no data and must not
       wait on the network. Anything that prints a phone number, an email or a
       social link does, because those values live in the database. */
    if (WW.ready) {
      WW.ready.then(function () {
        bootContactDetails();
        wireWhatsApp(doc);
      }).catch(function () { /* Links stay as authored in the markup. */ });
    }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
