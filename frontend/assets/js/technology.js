/* ==========================================================================
   WIN WEARS — Technology page
   Boots the interactive ball on the technology stage.

   This lived inline at the bottom of technology.html. It moved out here so
   the Content-Security-Policy can forbid inline scripts outright rather than
   allowing 'unsafe-inline' for one block.
   ========================================================================== */
(function () {
  'use strict';

  function init() {
    var stage = document.getElementById('tech-ball');
    if (!stage || !window.WW || !WW.ball3d) return;

    var ball = WW.ball3d(stage, {
      base: '#FFFFFF',
      accent: '#E1132C',
      seam: '#0C1226',
      markColour: '#16264F',
      zoom: 1.22,
      interactive: true,
      parallax: false
    });

    cutaway(ball);
  }

  /**
   * The pinned cutaway: scrolling through the section's track opens the ball
   * and lights each layer in turn.
   *
   * Progress is read from the track rather than from a library. The section is
   * pinned with position: sticky, so how far the track's top has travelled past
   * the pin point is exactly how far through it the visitor is.
   */
  function cutaway(ball) {
    var host = document.querySelector('[data-cutaway]');
    if (!host || !ball) return;

    var pin = host.querySelector('.cutaway__pin');
    var layers = [].slice.call(host.querySelectorAll('.layer'));
    if (!pin || !layers.length) return;

    var still = window.matchMedia('(prefers-reduced-motion: reduce)');
    /* Phones get the cutaway too — the layout changes rather than the
       section being withheld. Only a screen too short to hold a pinned
       viewport is left as an ordinary block. */
    var wide = window.matchMedia('(min-height: 560px)');

    var at = -1;
    var queued = false;

    function apply() {
      queued = false;

      /* Unpinned — a narrow or short screen, or a visitor who asked for less
         motion. The ball stays whole and every layer reads at full strength. */
      if (still.matches || !wide.matches) {
        if (at !== -1) {
          at = -1;
          host.style.removeProperty('--p');
          layers.forEach(function (l) { l.removeAttribute('data-on'); });
          if (ball.cutaway) ball.cutaway(0);
        }
        return;
      }

      var box = host.getBoundingClientRect();
      var travel = box.height - pin.offsetHeight;
      if (travel <= 0) return;

      var p = Math.max(0, Math.min(1, -box.top / travel));
      host.style.setProperty('--p', p.toFixed(3));

      /* Which layer is being shown. The last one holds to the end rather than
         falling off it, so the bladder is still lit at the bottom. */
      var n = Math.min(layers.length - 1, Math.floor(p * layers.length));
      if (n !== at) {
        at = n;
        layers.forEach(function (l, i) {
          if (i === n) l.setAttribute('data-on', '');
          else l.removeAttribute('data-on');
        });
      }

      if (ball.cutaway) ball.cutaway(p);
    }

    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(apply);
    }

    /* Only while the section is on screen: off it, there is nothing to drive
       and no reason to measure on every scroll. */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          window.addEventListener('scroll', schedule, { passive: true });
          schedule();
        } else {
          window.removeEventListener('scroll', schedule);
        }
      }, { threshold: 0 }).observe(host);
    } else {
      window.addEventListener('scroll', schedule, { passive: true });
    }

    window.addEventListener('resize', schedule);
    still.addEventListener('change', schedule);
    wide.addEventListener('change', schedule);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
