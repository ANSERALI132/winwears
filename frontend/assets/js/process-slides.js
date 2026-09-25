/* ==========================================================================
   WIN WEARS — The process, one stage at a time
   --------------------------------------------------------------------------
   Eleven clips from our own floor, shown as a slide rather than a wall: the
   stage's name, a line about it, and the footage playing.

   Markup: [data-pslides] with data-interval in milliseconds, and one
   [data-pslide] per stage, the first marked data-on.

   It starts when the visitor reaches it and stops when they leave, so nothing
   plays to an empty screen and no clip is downloaded for a section nobody
   scrolled to. Only the slide being shown and the one after it are loaded;
   the rest carry their address in data-src until their turn comes.

   Every clip is muted and carries no controls, which is what lets it play
   without being asked. Anyone who has asked their system for reduced motion
   gets the stages as a list they can read, not a slideshow.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function start(host) {
    if (host.hasAttribute('data-pslides-on')) return;
    var slides = [].slice.call(host.querySelectorAll('[data-pslide]'));
    if (slides.length < 2) return;
    host.setAttribute('data-pslides-on', '');

    var wait = parseInt(host.getAttribute('data-interval'), 10) || 1500;
    var at = 0, timer = null, onScreen = false;

    /* A clip is only fetched when its slide is next in line. */
    function load(i) {
      var v = slides[i] && slides[i].querySelector('video');
      if (!v) return null;
      var src = v.getAttribute('data-src');
      if (src) { v.src = src; v.removeAttribute('data-src'); }
      return v;
    }

    function play(v) {
      if (!v) return;
      /* Muted autoplay is allowed; a rejected promise is not worth reporting
         — the poster stays and the slideshow carries on. */
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    }

    function show(next) {
      var from = slides[at];
      at = (next + slides.length) % slides.length;
      var to = slides[at];

      if (from && from !== to) {
        from.removeAttribute('data-on');
        var fv = from.querySelector('video');
        if (fv) { fv.pause(); }
      }
      to.setAttribute('data-on', '');
      if (counter) counter.textContent = String(at + 1).padStart(2, '0');
      play(load(at));
      load((at + 1) % slides.length);      /* the next one, ready in advance */
    }

    /* Once the visitor has taken hold of it — stepped with the buttons, swiped,
       or rested a pointer on the film — it stops moving on by itself so the
       clip can be watched to the end. It is their gallery from that point. */
    var taken = false;

    function tick() {
      clearTimeout(timer);
      if (!onScreen || doc.hidden || reduced || taken) return;
      timer = setTimeout(function () { show(at + 1); tick(); }, wait);
    }

    function take() {
      taken = true;
      clearTimeout(timer);
      host.setAttribute('data-taken', '');
    }

    /* Stepping by hand, and the count that says where you are. */
    var counter = doc.querySelector('[data-pslide-at]');
    function step(by) {
      take();
      show(at + by);
    }
    [].forEach.call(doc.querySelectorAll('[data-pslide-go]'), function (b) {
      b.addEventListener('click', function () {
        step(parseInt(b.getAttribute('data-pslide-go'), 10) || 1);
      });
    });

    /* A pointer resting on the film means they are watching it. */
    host.addEventListener('mouseenter', function () { clearTimeout(timer); });
    host.addEventListener('mouseleave', function () { if (!taken) tick(); });

    function enter() {
      onScreen = true;
      play(load(at));
      load((at + 1) % slides.length);
      tick();
    }
    function leave() {
      onScreen = false;
      clearTimeout(timer);
      slides.forEach(function (s) {
        var v = s.querySelector('video');
        if (v) v.pause();
      });
    }

    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) { clearTimeout(timer); } else if (onScreen) { play(load(at)); tick(); }
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) enter(); else leave();
      }, { threshold: 0.35 }).observe(host);
    } else {
      enter();
    }

    /* A tap or a swipe moves it on; the stages are worth stepping through at
       your own pace. */
    var from = null;
    host.addEventListener('touchstart', function (e) { from = e.touches[0].clientX; }, { passive: true });
    host.addEventListener('touchend', function (e) {
      if (from === null) return;
      var dx = e.changedTouches[0].clientX - from;
      from = null;
      if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function boot() { [].forEach.call(doc.querySelectorAll('[data-pslides]'), start); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
