/* ==========================================================================
   WIN WEARS — 3D product gallery
   --------------------------------------------------------------------------
   One gallery, every page. Products float in a ring around whichever one is
   active; the active one stands forward, larger and lit, and carries its own
   name, category, quote link and WhatsApp message.

   A page asks for it in markup and names nothing else:

     <section data-gallery3d
              data-category="hybrid-pro-match-ball"   a category or a group
              data-featured="true"                    featured products only
              data-exclude="some-slug"                leave this one out
              data-title="Football Collection"
              data-sub="Explore every ball from a new perspective."
              data-mode="orbit|carousel"></section>

   Everything inside is drawn from the same /products the grids use, so the
   gallery can never show a product the catalogue does not, and no product
   name, image or count is written here.

   What it costs: only the active product and the ring around it are in the
   DOM at all — four on a phone, eight on a desktop — however many products
   the category holds. Images load lazily, the loop stops when the gallery is
   off-screen or the tab is hidden, and a visitor who has asked for reduced
   motion gets the same gallery standing still.
   ========================================================================== */
(function () {
  'use strict';

  var WW = window.WW || (window.WW = {});
  var doc = document;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* How many stand around the active one. A phone holds fewer because each
     needs room to read as a separate object rather than a smudge, and a weak
     device is given the phone's count whatever its screen. */
  function ringFor(width) {
    if (!finePointer && width < 700) return 4;
    if (width < 700) return 4;
    if (width < 1100) return 6;
    return 8;
  }

  /* A rough guess at what the device can carry. Deliberately narrow: plenty
     of capable desktops report four cores, and cutting their ring in half for
     that alone would cost every one of them half the gallery. Only a small
     memory or a genuinely thin processor counts as modest. */
  function modest() {
    var mem = navigator.deviceMemory;
    var cores = navigator.hardwareConcurrency;
    return (mem && mem <= 4) || (cores && cores <= 2);
  }

  var ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">'
            + '<path d="M2 8h12M9 3l5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var WA_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22c5.46 0 9.92-4.45 9.92-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 15.7a8.2 8.2 0 0 1-5.8 2.4 8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.25-4.36c0-4.53 3.7-8.22 8.23-8.22a8.19 8.19 0 0 1 8.22 8.23c0 2.2-.86 4.26-2.43 5.81z"/><path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.48-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35z"/></svg>';

  /* --------------------------------------------------------- One gallery -- */

  function build(host, list, opts) {
    var n = list.length;
    var base = doc.documentElement.getAttribute('data-base') || '';
    var mode = opts.mode === 'carousel' ? 'carousel' : 'orbit';
    var title = opts.title || 'Explore the collection';
    var sub = opts.sub || 'Step into the WIN WEARS product universe.';

    host.classList.add('g3d');
    host.innerHTML =
      '<div class="wrap">' +
        '<div class="sec-head sec-head--split g3d__head">' +
          '<div class="stack">' +
            '<p class="eyebrow">' + esc(opts.eyebrow || 'In three dimensions') + '</p>' +
            '<h2 class="sec-head__title">' + esc(title) + '</h2>' +
          '</div>' +
          '<p class="lead">' + esc(sub) + '</p>' +
        '</div>' +
      '</div>' +

      '<div class="g3d__stage" tabindex="0" role="group"' +
        ' aria-roledescription="3D product gallery"' +
        ' aria-label="' + esc(title) + ' — use the arrow keys to move between products">' +
        '<span class="g3d__grid" aria-hidden="true"></span>' +
        '<span class="g3d__glow" aria-hidden="true"></span>' +
        '<div class="g3d__space"></div>' +
      '</div>' +

      '<div class="wrap">' +
        '<div class="g3d__panel" aria-live="polite"></div>' +
        '<div class="g3d__ctl">' +
          '<button class="g3d__btn" type="button" data-go="-1" aria-label="Previous product">' +
            '<span class="g3d__btn-ico g3d__btn-ico--back" aria-hidden="true">' + ARROW + '</span> Prev</button>' +
          '<p class="g3d__count"><span data-at>01</span> <i>/</i> <span data-of>' + n + '</span></p>' +
          '<button class="g3d__btn" type="button" data-go="1" aria-label="Next product">' +
            'Next <span class="g3d__btn-ico" aria-hidden="true">' + ARROW + '</span></button>' +
          '<button class="g3d__btn g3d__btn--quiet" type="button" data-auto aria-pressed="false">Auto rotate</button>' +
        '</div>' +
      '</div>';

    var stage = host.querySelector('.g3d__stage');
    var space = host.querySelector('.g3d__space');
    var panel = host.querySelector('.g3d__panel');
    var at = host.querySelector('[data-at]');
    var ofEl = host.querySelector('[data-of]');
    if (ofEl) ofEl.textContent = String(n);

    var ring = Math.min(ringFor(window.innerWidth), n - 1);
    if (modest()) ring = Math.min(ring, 4);

    /* Only the active product and its ring exist in the page. A category of a
       hundred products costs the same as a category of nine. */
    var slots = [];
    for (var s = 0; s <= ring; s++) {
      var a = doc.createElement('a');
      a.className = 'g3d__item';
      a.innerHTML =
        '<span class="g3d__float">' +
          '<span class="g3d__media"><img alt="" loading="lazy" decoding="async"></span>' +
          '<span class="g3d__cap">' +
            '<span class="g3d__cap-name"></span>' +
            '<span class="g3d__cap-cat"></span>' +
          '</span>' +
        '</span>';
      /* Different timings so the ring breathes rather than pulsing as one. */
      var f = a.querySelector('.g3d__float');
      f.style.setProperty('--dur', (7 + (s % 4) * 1.7).toFixed(1) + 's');
      f.style.setProperty('--delay', (-(s * 1.3)).toFixed(1) + 's');
      space.appendChild(a);
      slots.push(a);
    }

    var active = 0;
    var auto = false, autoTimer = null;
    var tiltX = 0, tiltY = 0, curX = 0, curY = 0;
    var raf = null, onScreen = false;

    /* ---- where each product stands ----------------------------------- */
    function geometry() {
      var w = stage.clientWidth || 1;
      var h = stage.clientHeight || 1;
      return { rx: w * (mode === 'carousel' ? 0.34 : 0.30), ry: h * 0.30 };
    }

    function place(el, offset, g) {
      if (offset === 0) {
        el.style.transform = 'translate3d(0,0,80px) scale(1)';
        el.style.opacity = '1';
        el.style.zIndex = '30';
        el.setAttribute('data-active', '');
        return;
      }
      el.removeAttribute('data-active');

      var x, y, z, scale, fade;
      if (mode === 'carousel') {
        /* A line running back into the distance on both sides. */
        var side = offset <= ring / 2 ? 1 : -1;
        var step = side > 0 ? offset : ring + 1 - offset;
        x = side * g.rx * (0.55 + step * 0.42);
        y = step * 6;
        z = -150 - step * 130;
        scale = Math.max(0.34, 0.72 - step * 0.12);
        fade = Math.max(0.2, 0.7 - step * 0.14);
      } else {
        /* A ring: the next product at the top, going round clockwise. */
        var ang = (-90 + (offset - 1) * (360 / ring)) * Math.PI / 180;
        x = Math.cos(ang) * g.rx;
        y = Math.sin(ang) * g.ry;
        z = -210 - (offset % 3) * 45;
        scale = 0.46;
        fade = 0.62;
      }
      /* A slight turn towards the middle, so a card on the left is seen at an
         angle rather than flat on. */
      var turn = -(x / (g.rx || 1)) * 13;
      el.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,' + Math.round(z) + 'px)'
        + ' rotateY(' + turn.toFixed(1) + 'deg) scale(' + scale.toFixed(3) + ')';
      el.style.opacity = String(fade);
      el.style.zIndex = String(20 - Math.min(19, offset));
    }

    /* ---- what each slot is showing ----------------------------------- */
    function paint() {
      var g = geometry();
      for (var k = 0; k <= ring; k++) {
        var i = (active + k) % n;
        var p = list[i];
        var el = slots[k];
        var img = el.querySelector('img');
        var src = (WW.images(p)[0]) || '';
        var alts = WW.imageAlts(p);

        if (img.getAttribute('src') !== src) {
          if (src) { img.src = src; img.removeAttribute('hidden'); }
          else { img.removeAttribute('src'); img.setAttribute('hidden', ''); }
        }
        img.alt = k === 0 ? (alts[0] || p.productName) : '';
        el.href = WW.productHref(p);
        el.querySelector('.g3d__cap-name').textContent = p.productName;
        /* What tells this one from the next. Within a range the names repeat
           and the colourway is the difference, so that is the more useful
           second line; the category is only worth saying across ranges. */
        el.querySelector('.g3d__cap-cat').textContent =
          p.shortDescription || (p.category && p.category.name) || '';
        el.setAttribute('data-slug', p.slug || p.id);
        /* The ring is reachable by pointer and by tap; the reader is told
           what each one is and that the active one is the active one. */
        el.setAttribute('aria-label', p.productName + (k === 0 ? ' — the product shown, open it' : ' — show this product'));
        el.setAttribute('aria-current', k === 0 ? 'true' : 'false');
        place(el, k, g);
      }
      describe(list[active]);
      if (at) at.textContent = String(active + 1).padStart(2, '0');
    }

    /* The active product's own words and its own buttons. The WhatsApp line
       names the product, as the product cards already do. */
    function describe(p) {
      var href = WW.productHref(p);
      var wa = p.whatsappMessage
        || ('Hello WIN WEARS, I am interested in ' + p.productName
            + (p.sku ? ' (' + p.sku + ')' : '') + '. Please send me details and quotation.');
      var custom = p.details ? p.details.customizationAvailable : p.customizationAvailable;

      panel.innerHTML =
        '<p class="g3d__panel-cat">' + esc((p.category && p.category.name) || '') + '</p>' +
        '<h3 class="g3d__panel-name"><a href="' + esc(href) + '">' + esc(p.productName) + '</a></h3>' +
        (p.shortDescription ? '<p class="g3d__panel-desc">' + esc(p.shortDescription) + '</p>' : '') +
        (custom ? '<p class="g3d__badge">Customization available</p>' : '') +
        '<div class="cluster g3d__panel-actions">' +
          '<a class="btn btn--light btn--sm" href="' + esc(href) + '">View product ' + ARROW + '</a>' +
          '<a class="btn btn--accent btn--sm" href="' + base + 'request-quote.html?product='
            + encodeURIComponent(p.slug || p.id) + '">Request a quote</a>' +
          '<a class="btn btn--whatsapp btn--sm" data-wa="' + esc(wa) + '"'
            + ' aria-label="Ask about ' + esc(p.productName) + ' on WhatsApp">' + WA_ICON + ' WhatsApp</a>' +
        '</div>';
      if (WW.wireWhatsApp) WW.wireWhatsApp(panel);
    }

    function go(step) {
      active = ((active + step) % n + n) % n;
      paint();
    }
    function selectSlug(slug) {
      for (var i = 0; i < n; i++) {
        if (String(list[i].slug || list[i].id) === slug) { active = i; paint(); return true; }
      }
      return false;
    }

    /* ---- moving through it -------------------------------------------- */
    host.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-go]');
      if (b) { stopAuto(); go(parseInt(b.getAttribute('data-go'), 10)); return; }
      var t = e.target.closest('button[data-auto]');
      if (t) { auto ? stopAuto() : startAuto(); t.setAttribute('aria-pressed', auto ? 'true' : 'false'); return; }

      /* A product that is not the active one is brought to the middle; the
         active one is a plain link to its page, so it opens. */
      var item = e.target.closest('.g3d__item');
      if (item && !item.hasAttribute('data-active')) {
        e.preventDefault();
        stopAuto();
        selectSlug(item.getAttribute('data-slug'));
      }
    });

    stage.addEventListener('keydown', function (e) {
      var step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (step) { e.preventDefault(); stopAuto(); go(step); return; }
      if (e.key === 'Home') { e.preventDefault(); stopAuto(); active = 0; paint(); }
      if (e.key === 'End') { e.preventDefault(); stopAuto(); active = n - 1; paint(); }
      if (e.key === 'Escape') stopAuto();
    });

    /* Drag with a mouse, swipe with a thumb. A sideways gesture moves the
       gallery; anything closer to vertical is left to the page to scroll. */
    var from = null, fromY = 0, moved = false;
    stage.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      from = e.clientX; fromY = e.clientY; moved = false;
    });
    stage.addEventListener('pointermove', function (e) {
      if (from === null) return;
      var dx = e.clientX - from, dy = e.clientY - fromY;
      if (Math.abs(dx) < 46 || Math.abs(dx) < Math.abs(dy)) return;
      stopAuto();
      go(dx < 0 ? 1 : -1);
      from = e.clientX; fromY = e.clientY; moved = true;
    });
    function release(e) {
      if (from !== null && moved && e && e.target.closest('.g3d__item')) {
        /* A drag that landed on a card should not also open it. */
        var swallow = function (ev) { ev.preventDefault(); ev.stopPropagation(); };
        stage.addEventListener('click', swallow, { capture: true, once: true });
      }
      from = null;
    }
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
    stage.addEventListener('pointerleave', release);

    /* ---- the room it stands in ---------------------------------------- */
    /* The gallery leans towards the pointer, and a soft light follows it. */
    function onMove(e) {
      var r = stage.getBoundingClientRect();
      var nx = (e.clientX - r.left) / (r.width || 1) - 0.5;
      var ny = (e.clientY - r.top) / (r.height || 1) - 0.5;
      tiltY = nx * 9;
      tiltX = ny * -6;
      stage.style.setProperty('--lx', (nx * 100 + 50).toFixed(1) + '%');
      stage.style.setProperty('--ly', (ny * 100 + 50).toFixed(1) + '%');
    }
    function offMove() { tiltX = 0; tiltY = 0; }
    if (finePointer && !reduced) {
      stage.addEventListener('mousemove', onMove);
      stage.addEventListener('mouseleave', offMove);
    }

    function loop() {
      if (!onScreen || doc.hidden) { raf = null; return; }
      raf = requestAnimationFrame(loop);
      curX += (tiltX - curX) * 0.06;
      curY += (tiltY - curY) * 0.06;
      space.style.transform = 'rotateX(' + curX.toFixed(2) + 'deg) rotateY(' + curY.toFixed(2) + 'deg)';
    }
    function wake() { if (!raf && onScreen && !reduced) loop(); }

    function startAuto() {
      if (reduced) return;
      auto = true;
      clearInterval(autoTimer);
      autoTimer = setInterval(function () {
        if (onScreen && !doc.hidden) go(1);
      }, 3600);
    }
    function stopAuto() { auto = false; clearInterval(autoTimer); autoTimer = null; }

    /* Nothing runs while the gallery is not being looked at. */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        if (onScreen) { host.setAttribute('data-in', ''); wake(); }
        else if (raf) { cancelAnimationFrame(raf); raf = null; }
      }, { threshold: 0.08 }).observe(host);
    } else {
      onScreen = true;
      host.setAttribute('data-in', '');
      wake();
    }
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) wake(); });

    var resizing = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizing);
      resizing = setTimeout(function () {
        var next = Math.min(ringFor(window.innerWidth), n - 1);
        if (modest()) next = Math.min(next, 4);
        /* A changed ring size means different slots, which means rebuilding —
           rare enough to be worth the simplicity. */
        if (next !== ring) { build(host, list, opts); return; }
        paint();
      }, 200);
    });

    paint();
    if (opts.start) selectSlug(opts.start);
    wake();

    return { go: go, select: selectSlug };
  }

  /* ------------------------------------------------------ Markup boot ---- */

  function start(host) {
    if (host.hasAttribute('data-gallery-on')) return;
    host.setAttribute('data-gallery-on', '');

    var params = { page: 1, perPage: parseInt(host.getAttribute('data-limit'), 10) || 24, sort: 'order' };
    if (host.getAttribute('data-category')) params.category = host.getAttribute('data-category');
    var wantsFeatured = host.getAttribute('data-featured') === 'true';
    if (wantsFeatured) params.featured = 'yes';

    function fetched(res) {
      return (res.items || []).filter(function (p) {
        return String(p.slug || p.id) !== host.getAttribute('data-exclude');
      });
    }

    WW.loadProducts(params).then(function (res) {
      var list = fetched(res);
      /* Nothing ticked as featured yet is a normal state, not a broken one —
         the gallery then shows the collection rather than disappearing. It
         narrows to the featured products the moment any are ticked. */
      if (list.length < 3 && wantsFeatured) {
        delete params.featured;
        return WW.loadProducts(params).then(fetched);
      }
      return list;
    }).then(function (list) {
      /* Two products cannot make a ring, and an empty gallery is worse than
         none — the page keeps its grid either way. */
      if (list.length < 3) { host.remove(); return; }

      build(host, list, {
        mode: host.getAttribute('data-mode'),
        title: host.getAttribute('data-title'),
        sub: host.getAttribute('data-sub'),
        eyebrow: host.getAttribute('data-eyebrow'),
        start: host.getAttribute('data-start')
      });
    }).catch(function () {
      /* The grid below is the real catalogue; this is presentation. */
      host.remove();
    });
  }

  WW.bootGalleries = function (root) {
    [].forEach.call((root || doc).querySelectorAll('[data-gallery3d]:not([data-gallery-on])'), start);
  };

  if (WW.ready) WW.ready.then(function () { WW.bootGalleries(); }, function () {});
})();
