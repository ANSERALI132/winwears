/* ==========================================================================
   WIN WEARS — Homepage experience
   --------------------------------------------------------------------------
   Three pieces of motion that belong to the homepage's storytelling rather
   than to the site chrome in site.js:

     · the spatial product deck — every category as a card standing in depth,
       turned by where it sits in its own rail;
     · "select your game" — one category held on a stage, swapped by tabs;
     · the card tilt that follows a fine pointer.

   All three read WW.CATEGORIES, so what they show is whatever the admin has
   set: no product, count or blurb is written here. Each is silent on a page
   that has no markup for it, so the file can be loaded anywhere.

   Nothing here runs for a visitor who has asked their system for reduced
   motion beyond the plain, still version of each layout.
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

  /* Categories that hold products of their own — a group holds none, its
     types do, so a group would be an empty card on the deck. */
  function leaves() {
    if (!WW.CATEGORIES) return [];
    return WW.CATEGORIES.filter(function (c) { return !c.childCount; });
  }

  function countOf(c) {
    var n = c.productCount || 0;
    return n + ' model' + (n === 1 ? '' : 's');
  }

  /* ------------------------------------------------------- The deck ------ */
  /* A rail the visitor scrolls, drags or arrows through. Depth comes from how
     far each card sits from the middle of the rail, so the card being looked
     at stands forward and its neighbours fall away behind it. */
  function bootDeck() {
    var rail = doc.getElementById('deck-rail');
    if (!rail) return;

    var items = leaves();
    if (!items.length) {
      var section = rail.closest('section');
      if (section) section.hidden = true;
      return;
    }

    rail.innerHTML = items.map(function (c) {
      return '<a class="deck__card" href="' + esc(c.page) + '">' +
        '<span class="deck__media">' +
          (c.image ? '<img src="' + esc(c.image) + '" alt="' + esc(c.name) + '" loading="lazy" decoding="async">' : '') +
        '</span>' +
        '<span class="deck__body">' +
          '<span class="deck__count">' + esc(countOf(c)) + '</span>' +
          '<span class="deck__title">' + esc(c.name) + '</span>' +
          '<span class="deck__desc">' + esc(c.blurb) + '</span>' +
          '<span class="deck__go">Explore<i></i></span>' +
        '</span>' +
      '</a>';
    }).join('');

    var cards = [].slice.call(rail.children);
    if (reduced) return;                 /* a plain, still rail is enough */

    var raf = null;
    function paint() {
      raf = null;
      var mid = rail.scrollLeft + rail.clientWidth / 2;
      var span = rail.clientWidth || 1;
      cards.forEach(function (card) {
        var centre = card.offsetLeft + card.offsetWidth / 2;
        var away = (centre - mid) / span;            /* −1 … 1 across the rail */
        var far = Math.min(1, Math.abs(away));
        card.style.transform =
          'rotateY(' + (away * -20) + 'deg) translateZ(' + (far * -190) + 'px) scale(' + (1 - far * 0.07) + ')';
        card.style.opacity = String(1 - far * 0.42);
        card.style.zIndex = String(100 - Math.round(far * 100));
      });
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(paint); }

    rail.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    /* Covers a card whose picture arrives after the first paint and changes
       the rail's measurements under us. */
    [].forEach.call(rail.querySelectorAll('img'), function (img) {
      img.addEventListener('load', schedule);
    });
    paint();

    /* Drag the rail with a mouse the way a touch screen already allows. A
       drag past a few pixels swallows the click so it does not open a page
       the visitor was only sliding past. */
    if (finePointer) {
      var from = 0, at = 0, dragging = false, moved = 0;
      rail.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        dragging = true; moved = 0;
        from = e.clientX; at = rail.scrollLeft;
        rail.setAttribute('data-dragging', '');
      });
      window.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - from;
        moved = Math.max(moved, Math.abs(dx));
        rail.scrollLeft = at - dx;
      });
      window.addEventListener('mouseup', function () {
        if (!dragging) return;
        dragging = false;
        rail.removeAttribute('data-dragging');
      });
      rail.addEventListener('click', function (e) {
        if (moved > 6) { e.preventDefault(); moved = 0; }
      }, true);
    }
  }

  /* --------------------------------------------------- Select your game -- */
  /* One category at a time on a stage: the picture, what it is and where it
     goes all come from the same record, so a tab can never disagree with the
     page it opens. */
  function bootShowcase() {
    var host = doc.querySelector('[data-showcase]');
    if (!host) return;

    var items = leaves();
    var tabs = host.querySelector('[data-showcase-tabs]');
    var media = host.querySelector('[data-showcase-media]');
    var body = host.querySelector('[data-showcase-body]');
    if (!tabs || !media || !body || !items.length) {
      var section = host.closest('section');
      if (section) section.hidden = true;
      return;
    }

    tabs.innerHTML = items.map(function (c, i) {
      return '<button class="showcase__tab" type="button" role="tab" id="game-tab-' + i + '"' +
        ' aria-selected="' + (i ? 'false' : 'true') + '" aria-controls="game-panel"' +
        ' tabindex="' + (i ? '-1' : '0') + '">' + esc(c.name) + '</button>';
    }).join('');
    var buttons = [].slice.call(tabs.children);

    var shown = -1;
    function show(n) {
      if (n === shown) return;
      var c = items[n];
      shown = n;
      buttons.forEach(function (b, i) {
        b.setAttribute('aria-selected', i === n ? 'true' : 'false');
        b.tabIndex = i === n ? 0 : -1;
      });

      media.innerHTML = c.image
        ? '<img src="' + esc(c.image) + '" alt="' + esc(c.name) + ' by WIN WEARS" loading="lazy" decoding="async">'
        : '';
      body.innerHTML =
        '<p class="showcase__count">' + esc(countOf(c)) + '</p>' +
        '<h3 class="showcase__title">' + esc(c.name) + '</h3>' +
        '<p class="showcase__desc">' + esc(c.blurb) + '</p>' +
        '<div class="cluster showcase__actions">' +
          '<a class="btn btn--accent" href="' + esc(c.page) + '" data-magnetic>Explore ' + esc(c.name) + '</a>' +
          '<a class="btn btn--ghost" href="request-quote.html" data-magnetic>Request a quote</a>' +
        '</div>';

      /* The stage re-enters rather than cutting: the same easing the rest of
         the page uses for a section arriving. */
      if (!reduced) {
        host.setAttribute('data-swapping', '');
        window.setTimeout(function () { host.removeAttribute('data-swapping'); }, 30);
      }
      if (WW.bootMagnetic) WW.bootMagnetic(body);
    }

    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) show(buttons.indexOf(b));
    });
    /* Arrow keys move between tabs, as a tablist is expected to. */
    tabs.addEventListener('keydown', function (e) {
      var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      var next = (shown + step + buttons.length) % buttons.length;
      show(next);
      buttons[next].focus();
    });

    show(0);
  }

  /* ------------------------------------------------------------ Tilt ----- */
  /* A card leans towards a fine pointer. Touch and reduced motion get the
     flat card, which is the same card. */
  function bootTilt(ctx) {
    if (!finePointer || reduced) return;
    var cards = (ctx || doc).querySelectorAll('[data-tilt]:not([data-tilt-on])');
    [].forEach.call(cards, function (card) {
      card.setAttribute('data-tilt-on', '');
      var raf = null, rx = 0, ry = 0, on = false;

      function move(e) {
        var r = card.getBoundingClientRect();
        ry = ((e.clientX - r.left) / r.width - 0.5) * 9;
        rx = ((e.clientY - r.top) / r.height - 0.5) * -7;
        on = true;
        if (!raf) raf = requestAnimationFrame(apply);
      }
      function apply() {
        raf = null;
        card.style.transform = on
          ? 'perspective(900px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateY(-4px)'
          : '';
      }
      function leave() { on = false; if (!raf) raf = requestAnimationFrame(apply); }

      card.addEventListener('mousemove', move);
      card.addEventListener('mouseleave', leave);
      card.addEventListener('blur', leave, true);
    });
  }
  WW.bootTilt = bootTilt;

  function init() {
    bootDeck();
    bootShowcase();
    bootTilt(doc);
    if (WW.wireWhatsApp) WW.wireWhatsApp(doc);
  }

  if (WW.ready) WW.ready.then(init, init);
  else init();
})();
