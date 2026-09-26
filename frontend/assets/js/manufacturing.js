/* ==========================================================================
   WIN WEARS — The factory rail (manufacturing)
   --------------------------------------------------------------------------
   The eleven stages are held on screen while the page scrolls past them, and
   that scroll carries them sideways. The stage in the middle is the one being
   read: it comes up to full strength, the counter names it, and its film
   plays. The rest hold their poster, so eleven clips are never decoding at
   once.

   Pinned with position: sticky and moved with a transform. ScrollTrigger does
   the same thing and costs about 110 KB with GSAP behind it; the measurement
   here is the same one ball3d already makes for its own scroll drive.

   None of it applies below 901px, on a short window, or for anyone who asked
   for less motion — there the stages stay the vertical read they already are,
   which is how eleven of anything is best read anyway.
   ========================================================================== */
(function () {
  'use strict';

  function init() {
    var host = document.querySelector('[data-rail]');
    if (!host) return;

    var pin = host.querySelector('.rail__pin');
    var row = host.querySelector('.process');
    var steps = [].slice.call(host.querySelectorAll('.process__step'));
    var at = host.querySelector('[data-rail-count] .rail__at');
    if (!pin || !row || steps.length < 2) return;

    var still = window.matchMedia('(prefers-reduced-motion: reduce)');
    var wide = window.matchMedia('(min-width: 901px) and (min-height: 620px)');

    var shown = -1;
    var queued = false;

    /* How far the row has to travel for its last stage to reach the left
       edge. Measured from the laid-out row rather than assumed, because the
       stage width is a clamp and the gap is a vw. */
    function travel() {
      return Math.max(0, row.scrollWidth - pin.clientWidth);
    }

    function measure() {
      host.style.setProperty('--rail-travel', travel() + 'px');
    }

    function play(i) {
      steps.forEach(function (s, n) {
        var v = s.querySelector('video');
        if (!v) return;
        if (n === i) {
          /* preload="none" until it is wanted, so eleven clips are never
             fetched for a visitor who reads two stages and leaves. */
          var p = v.play();
          if (p && p.catch) p.catch(function () {});
        } else if (!v.paused) {
          v.pause();
        }
      });
    }

    function apply() {
      queued = false;

      if (still.matches || !wide.matches) {
        if (shown !== -1) {
          shown = -1;
          host.style.removeProperty('--p');
          steps.forEach(function (s) { s.removeAttribute('data-on'); });
        }
        return;
      }

      var box = host.getBoundingClientRect();
      var span = box.height - pin.offsetHeight;
      if (span <= 0) return;

      var p = Math.max(0, Math.min(1, -box.top / span));
      host.style.setProperty('--p', p.toFixed(4));

      var i = Math.min(steps.length - 1, Math.round(p * (steps.length - 1)));
      if (i !== shown) {
        shown = i;
        steps.forEach(function (s, n) {
          if (n === i) s.setAttribute('data-on', '');
          else s.removeAttribute('data-on');
        });
        if (at) at.textContent = String(i + 1).padStart(2, '0');
        play(i);
      }
    }

    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(apply);
    }

    /* Measured and driven only while the section is on screen. */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          measure();
          window.addEventListener('scroll', schedule, { passive: true });
          schedule();
        } else {
          window.removeEventListener('scroll', schedule);
          steps.forEach(function (s) {
            var v = s.querySelector('video');
            if (v && !v.paused) v.pause();
          });
        }
      }, { threshold: 0 }).observe(host);
    } else {
      window.addEventListener('scroll', schedule, { passive: true });
    }

    window.addEventListener('resize', function () { measure(); schedule(); });
    still.addEventListener('change', schedule);
    wide.addEventListener('change', function () { measure(); schedule(); });

    measure();
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
