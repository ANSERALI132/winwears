/* ==========================================================================
   WIN WEARS — 3D product gallery
   --------------------------------------------------------------------------
   One gallery, every page. The products are spread over a ball that turns,
   each one square to the viewer so it stays readable wherever it has been
   carried to; whichever is chosen is named underneath with its own quote and
   WhatsApp buttons.

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

   What it costs: only the products on the ball are in the DOM at all —
   eleven on a phone, nineteen on a desktop — however many the category
   holds. Images load lazily, the loop stops when the gallery is
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

  /* How many products the ball carries. Enough to cover it — too few and the
     shape reads as a scatter rather than a ball — but every one is a card in
     the page, so a phone carries fewer. */
  function ringFor(width) {
    if (width < 700) return 11;
    if (width < 1100) return 15;
    return 19;
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
        /* The ball turns around the collection's name: what is in the middle
           is the idea, and the products are what carry it round. */
        '<div class="g3d__centre" aria-hidden="true">' +
          '<span class="g3d__centre-title">' + esc(title) + '</span>' +
        '</div>' +
      '</div>' +

      /* No buttons under the stage by choice. It turns on its own, a swipe or
         a drag moves it, the arrow keys move it, and tapping a product brings
         it to the front — so a row of controls would only be repeating what
         the gallery already does. */
      '<div class="wrap">' +
        '<div class="g3d__panel" aria-live="polite"></div>' +
      '</div>';

    var stage = host.querySelector('.g3d__stage');
    var space = host.querySelector('.g3d__space');
    var panel = host.querySelector('.g3d__panel');

    var ring = Math.min(ringFor(window.innerWidth), n - 1);
    if (modest()) ring = Math.min(ring, 11);

    /* Only the active product and its ring exist in the page. A category of a
       hundred products costs the same as a category of nine. */
    var slots = [];
    for (var s = 0; s <= ring; s++) {
      var a = doc.createElement('a');
      a.className = 'g3d__item';
      /* The picture alone. A name written across a product hides the product,
         and the one being shown is named in full underneath the stage; the
         link's own label carries it for anyone not looking at the picture. */
      a.innerHTML =
        '<span class="g3d__float">' +
          '<span class="g3d__media"><img alt="" loading="lazy" decoding="async"></span>' +
        '</span>';
      /* Different timings so the ball breathes rather than pulsing as one. */
      var f = a.querySelector('.g3d__float');
      f.style.setProperty('--dur', (7 + (s % 4) * 1.7).toFixed(1) + 's');
      f.style.setProperty('--delay', (-(s * 1.3)).toFixed(1) + 's');
      space.appendChild(a);
      slots.push(a);
    }

    var active = 0;
    var auto = false;
    var raf = null, onScreen = false;

    /* ---- where each product sits on the ball -------------------------- */
    /* One radius, because a ball is as deep as it is wide. Held in far enough
       that a card riding the widest part of it is still whole on the stage. */
    function geometry() {
      var w = stage.clientWidth || 1;
      var h = stage.clientHeight || 1;
      var card = slots[0].offsetWidth || 150;
      var tall = card * 1.25;                 /* the media is 4 / 5 */
      return {
        r: Math.max(
          card * 0.8,
          Math.min(w / 2 - card / 2 - 8, (h - tall) / 2 - 4, w * 0.30)
        )
      };
    }

    /* Every card hangs from the middle of the stage, so each one is centred on
       its own slot before it is moved to it. */
    var MIDDLE = 'translate(-50%, -50%) ';

    /* Every product rides one hoop hung at an angle through the middle of the
       stage. Going round it, a card swings out to the side, down towards the
       viewer, across the front and away behind again — so the ring turns like
       a ball rather than a wheel painted flat on the glass. Depth does the
       work: the near side of the hoop is simply closer, so it is larger and
       brighter without being told to be.

       The product being shown sits at the near point of the hoop, which is
       where it is biggest — so "active" and "at the front" are the same
       thing, and nothing has to be lifted out of the ring to be the focus. */
    /* Where each product sits on the ball.
       Points are spread by the golden angle, the way a sunflower packs seeds:
       it leaves no bands and no bald patches, unlike rings of latitude, which
       crowd at the poles. That is what gives the arrangement its round,
       evenly-covered shape.

       The cards are never turned. Each one's place on the ball is worked out
       here, frame by frame, and written as a position only — so a product on
       the far side is smaller and dimmer but still square to the viewer and
       still readable. Turning them to lie along the surface would panel the
       ball properly but would also show half the range edge-on or from
       behind, and a gallery is for looking at products. */
    var GOLDEN = Math.PI * (3 - Math.sqrt(5));
    var points = [];

    function layout() {
      var total = slots.length;
      points = [];
      for (var i = 0; i < total; i++) {
        var y = total === 1 ? 0 : 1 - (i / (total - 1)) * 2;
        var band = Math.sqrt(Math.max(0, 1 - y * y));
        var theta = GOLDEN * i;
        points.push({ x: Math.cos(theta) * band, y: y, z: Math.sin(theta) * band });
      }
    }

    /* Turns the ball and lays every card out at its new place. One pass, and
       the only thing written per card is a transform and an opacity. */
    function orient(spinDeg, tiltDeg, r) {
      var sy = Math.sin(spinDeg * Math.PI / 180), cy = Math.cos(spinDeg * Math.PI / 180);
      var sx = Math.sin(tiltDeg * Math.PI / 180), cx = Math.cos(tiltDeg * Math.PI / 180);

      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        /* Spin about the upright axis, then lean the whole ball towards us. */
        var x1 = p.x * cy + p.z * sy;
        var z1 = -p.x * sy + p.z * cy;
        var y2 = p.y * cx - z1 * sx;
        var z2 = p.y * sx + z1 * cx;          /* −1 at the back, 1 at the front */

        var near = (z2 + 1) / 2;
        var el = slots[i];
        el.style.transform = MIDDLE
          + 'translate3d(' + (x1 * r).toFixed(1) + 'px,' + (y2 * r).toFixed(1) + 'px,'
          + (z2 * r).toFixed(1) + 'px)'
          + ' scale(' + (0.62 + near * 0.38).toFixed(3) + ')';
        el.style.opacity = (0.26 + near * 0.74).toFixed(3);
        el.style.zIndex = String(Math.round(near * 60));
      }
    }

    /* ---- what each slot is showing ----------------------------------- */
    function paint() {
      if (!points.length) layout();
      /* Lay the ball out here rather than leaving it to the turning loop.
         Someone who has asked for reduced motion never starts that loop, and
         without this every card would sit unplaced on top of the next in the
         middle of the stage. They get the ball standing still. */
      orient(spin, lean, geometry().r);
      /* A product keeps its place on the ball. Choosing another one changes
         which is described below, not which picture is where — pictures
         swapping under the visitor as the ball turned would be unreadable. */
      for (var k = 0; k <= ring; k++) {
        var i = k % n;
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
        el.setAttribute('data-slug', p.slug || p.id);
        /* Every product on the ball is reachable by pointer and by tap; the
           reader is told what each one is, and which one is being shown. */
        el.setAttribute('aria-label', p.productName + (k === active ? ' — the product shown, open it' : ' — show this product'));
        el.setAttribute('aria-current', k === active ? 'true' : 'false');
        if (k === active) el.setAttribute('data-active', '');
        else el.removeAttribute('data-active');
      }
      describe(list[active]);
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

    /* `active` is the product being described underneath, not a position on
       the ball — the ball keeps turning either way. */
    var shown = Math.min(ring, n - 1);
    function go(step) {
      active = ((active + step) % (shown + 1) + (shown + 1)) % (shown + 1);
      paint();
    }
    function selectSlug(slug) {
      for (var k = 0; k <= shown; k++) {
        if (String(list[k % n].slug || list[k % n].id) === slug) { active = k; paint(); return true; }
      }
      return false;
    }

    /* ---- moving through it -------------------------------------------- */
    host.addEventListener('click', function (e) {
      /* Reaching for a product describes it below; reaching for the one
         already described opens its page, because it is a plain link. */
      var item = e.target.closest('.g3d__item');
      if (item && !item.hasAttribute('data-active')) {
        e.preventDefault();
        selectSlug(item.getAttribute('data-slug'));
      }
    });

    stage.addEventListener('keydown', function (e) {
      var step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (step) { e.preventDefault(); go(step); return; }
      if (e.key === 'Home') { e.preventDefault(); active = 0; paint(); }
      if (e.key === 'End') { e.preventDefault(); active = shown; paint(); }
      /* Escape stops it turning, for anyone who finds the motion distracting
         but has not turned motion down system-wide. */
      if (e.key === 'Escape') stopAuto();
    });

    /* Drag with a mouse, swipe with a thumb: the ball turns under the hand,
       degree for pixel, the way a globe does. A gesture closer to vertical is
       left alone so the page can still be scrolled through the gallery. */
    var from = null, fromY = 0, moved = false, held = false;
    stage.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      from = e.clientX; fromY = e.clientY; moved = false; held = false;
    });
    stage.addEventListener('pointermove', function (e) {
      if (from === null) return;
      var dx = e.clientX - from, dy = e.clientY - fromY;
      if (!held && (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy))) return;
      held = true;
      /* Their hand beats the drift, and keeps it once they let go. */
      stopAuto();
      spin = (spin + dx * 0.45) % 360;
      leanWanted = Math.max(-40, Math.min(24, leanWanted + dy * 0.12));
      from = e.clientX; fromY = e.clientY; moved = true;
      wake();
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

    /* ---- turning the ball --------------------------------------------- */
    /* How far round it has been carried, and how far it leans. The spin is
       kept as one running angle rather than a step count, so the ball drifts
       rather than clicking from product to product. */
    var spin = 0, lean = -12, leanWanted = -12;
    var DRIFT = 0.16;                 /* degrees a frame — a turn every ~37s */
    var drift = 0;

    /* The lean follows the pointer a little, which is what makes it read as a
       ball being looked at rather than a picture of one. */
    function onMove(e) {
      var r = stage.getBoundingClientRect();
      var nx = (e.clientX - r.left) / (r.width || 1) - 0.5;
      var ny = (e.clientY - r.top) / (r.height || 1) - 0.5;
      leanWanted = -12 + ny * -16;
      stage.style.setProperty('--lx', (nx * 100 + 50).toFixed(1) + '%');
      stage.style.setProperty('--ly', (ny * 100 + 50).toFixed(1) + '%');
    }
    function offMove() { leanWanted = -12; }
    if (finePointer && !reduced) {
      stage.addEventListener('mousemove', onMove);
      stage.addEventListener('mouseleave', offMove);
    }

    function loop() {
      if (!onScreen || doc.hidden) { raf = null; return; }
      raf = requestAnimationFrame(loop);
      spin = (spin + drift) % 360;
      lean += (leanWanted - lean) * 0.06;
      orient(spin, lean, geometry().r);
    }
    function wake() { if (!raf && onScreen && !reduced) loop(); }

    /* It turns by itself as soon as the visitor reaches it, so the whole
       range comes round without them touching anything. */
    function startAuto() {
      if (reduced) return;
      auto = true;
      drift = DRIFT;
      wake();
    }
    function stopAuto() {
      auto = false;
      drift = 0;
    }

    /* Nothing runs while the gallery is not being looked at — and the moment
       it is, it starts turning on its own. Only the first arrival starts it:
       once the visitor has taken hold of it, scrolling back should not wrest
       it off them again. */
    var everSeen = false;
    function arrived() {
      host.setAttribute('data-in', '');
      wake();
      if (!everSeen) { everSeen = true; startAuto(); }
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        if (onScreen) arrived();
        else if (raf) { cancelAnimationFrame(raf); raf = null; }
      }, { threshold: 0.08 }).observe(host);
    } else {
      onScreen = true;
      arrived();
    }
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) wake(); });

    var resizing = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizing);
      resizing = setTimeout(function () {
        var next = Math.min(ringFor(window.innerWidth), n - 1);
        if (modest()) next = Math.min(next, 11);
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

    /* A group holds several categories, and the API hands them back in order —
       which on Team Wears means every uniform before the first tracksuit, so a
       ring of nine would have shown uniforms alone. Dealing them out one
       category at a time puts the whole group in view from the first turn. */
    function interleave(items) {
      var order = [], byCat = {};
      items.forEach(function (p) {
        var key = (p.category && p.category.slug) || '';
        if (!byCat[key]) { byCat[key] = []; order.push(key); }
        byCat[key].push(p);
      });
      if (order.length < 2) return items;

      var out = [], taken = true;
      for (var round = 0; taken; round++) {
        taken = false;
        for (var i = 0; i < order.length; i++) {
          var pile = byCat[order[i]];
          if (round < pile.length) { out.push(pile[round]); taken = true; }
        }
      }
      return out;
    }

    function fetched(res) {
      return interleave((res.items || []).filter(function (p) {
        return String(p.slug || p.id) !== host.getAttribute('data-exclude');
      }));
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
