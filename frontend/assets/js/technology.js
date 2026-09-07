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

    WW.ball3d(stage, {
      base: '#FFFFFF',
      accent: '#E1132C',
      seam: '#0C1226',
      markColour: '#16264F',
      zoom: 1.22,
      interactive: true,
      parallax: false
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
