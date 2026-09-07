/* ==========================================================================
   WIN WEARS — Ball customiser
   Six-step configurator with a live 3D preview. Frontend only: the chosen
   specification is carried into the quote form (and the WhatsApp message) via
   sessionStorage + query string. No file ever leaves the browser here.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var steps = $$('.cx-step');
  if (!steps.length) return;

  /* ------------------------------------------------------------ options -- */
  var CONSTRUCTIONS = [
    { id: 'hybrid',   t: 'Hybrid',          d: 'Machine bonded with hand-finished seams.' },
    { id: 'handmade', t: 'Hand Stitched',   d: 'Stitched panel by panel for seam strength.' },
    { id: 'thermal',  t: 'Thermal Bonded',  d: 'Seamless — no stitch channels.' },
    { id: 'tpu',      t: 'TPU Moulded',     d: 'Hard-wearing, built for training volume.' }
  ];

  var BRANDING = [
    { id: 'logo',     t: 'Logo Print',        d: 'Your mark on specified panels.' },
    { id: 'crest',    t: 'Club Crest',        d: 'Team or federation identity.' },
    { id: 'full',     t: 'Full Panel Artwork', d: 'Graphic across the whole ball.' },
    { id: 'private',  t: 'Private Label',     d: 'Your brand only — no WIN WEARS marks.' },
    { id: 'packaging', t: 'Custom Packaging', d: 'Printed boxes, nets and hang tags.' }
  ];

  var COLOURS = [
    { name: 'White',     hex: '#FFFFFF' },
    { name: 'Navy',      hex: '#16264F' },
    { name: 'Crimson',   hex: '#E1132C' },
    { name: 'Black',     hex: '#101215' },
    { name: 'Royal',     hex: '#1D4ED8' },
    { name: 'Volt',      hex: '#D8F32B' },
    { name: 'Orange',    hex: '#F4620E' },
    { name: 'Emerald',   hex: '#0E9F6E' },
    { name: 'Gold',      hex: '#D6A420' },
    { name: 'Sky',       hex: '#38BDF8' },
    { name: 'Violet',    hex: '#7C3AED' },
    { name: 'Silver',    hex: '#C9CED6' }
  ];

  /* -------------------------------------------------------------- state -- */
  var state = {
    type: '', typeLabel: '',
    construction: '', constructionLabel: '',
    base: '#FFFFFF', baseName: 'White',
    accent: '#16264F', accentName: 'Navy',
    branding: [],
    files: { logo: [], artwork: [] }
  };

  var ball = null;

  /* ------------------------------------------------------------ preview -- */
  function boot3D() {
    var stage = $('#cx-stage');
    if (!stage || !WW.ball3d) return;
    ball = WW.ball3d(stage, {
      base: state.base, accent: state.accent, seam: '#0C1226',
      markColour: '#0C1226', zoom: 1.2, interactive: true, parallax: false
    });
  }

  var recolourTimer = null;
  function repaint() {
    if (!ball || !ball.setColours) return;
    /* Rebuilding the panel map is heavy — coalesce rapid clicks. */
    clearTimeout(recolourTimer);
    recolourTimer = setTimeout(function () {
      ball.setColours({
        base: state.base,
        accent: state.accent,
        markColour: contrast(state.base)
      });
    }, 90);
  }

  function contrast(hex) {
    var h = hex.replace('#', '');
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0C1226' : '#FFFFFF';
  }

  /* ------------------------------------------------------------ summary -- */
  function updateSummary() {
    set('type', state.typeLabel || 'Not chosen');
    set('construction', state.constructionLabel || 'Not chosen');
    var n = state.files.logo.length + state.files.artwork.length;
    set('artwork', n ? n + ' file' + (n === 1 ? '' : 's') + ' attached' : 'None uploaded');
    set('colours', state.baseName + ' / ' + state.accentName);
    set('branding', state.branding.length
      ? state.branding.map(function (b) { return b.t; }).join(', ')
      : 'Not chosen');

    function set(k, v) {
      var el = $('[data-sum="' + k + '"]');
      if (el) el.textContent = v;
    }

    /* swatch chips on the stage */
    var sw = $('#cx-swatches');
    if (sw) sw.innerHTML = '<i style="background:' + state.base + '"></i><i style="background:' + state.accent + '"></i>';

    /* progress */
    var done = [
      !!state.type, !!state.construction,
      state.files.logo.length + state.files.artwork.length > 0,
      true, state.branding.length > 0, false
    ];
    $$('#cx-progress i').forEach(function (i, idx) { i.setAttribute('data-done', String(!!done[idx])); });

    /* step summaries */
    stepValue(0, state.typeLabel || 'Select a range');
    stepValue(1, state.constructionLabel || 'Select a construction');
    stepValue(2, n ? n + ' file' + (n === 1 ? '' : 's') + ' ready' : 'Optional');
    stepValue(3, state.baseName + ' / ' + state.accentName);
    stepValue(4, state.branding.length ? state.branding.map(function (b) { return b.t; }).join(', ') : 'Select branding');

    persist();
  }

  function stepValue(i, text) {
    var s = steps[i];
    if (!s) return;
    var el = $('[data-step-value]', s);
    if (el) el.textContent = text;
  }

  /* Carry the spec to the quote page + WhatsApp. */
  function specLines() {
    var out = [];
    if (state.typeLabel) out.push('Ball type: ' + state.typeLabel);
    if (state.constructionLabel) out.push('Construction: ' + state.constructionLabel);
    out.push('Colours: ' + state.baseName + ' / ' + state.accentName);
    if (state.branding.length) out.push('Branding: ' + state.branding.map(function (b) { return b.t; }).join(', '));
    var names = state.files.logo.concat(state.files.artwork).map(function (f) { return f.name; });
    if (names.length) out.push('Files ready to send: ' + names.join(', '));
    return out;
  }

  function persist() {
    var spec = specLines().join('\n');
    try { sessionStorage.setItem('ww-custom-spec', spec); } catch (e) { /* private mode */ }

    var wa = 'Hello WIN WEARS, I would like a custom football.\n' + spec + '\nPlease send me details and quotation.';
    ['#cx-wa'].forEach(function (sel) {
      var el = $(sel);
      if (el) { el.setAttribute('data-wa', wa); if (WW.wireWhatsApp) WW.wireWhatsApp(el.parentNode); }
    });

    var q = $('#cx-quote');
    if (q) {
      var params = new URLSearchParams();
      params.set('custom', '1');
      if (state.type) params.set('category', state.type);
      q.href = 'request-quote.html?' + params.toString();
    }
  }

  /* -------------------------------------------------------------- steps -- */
  function openStep(i) {
    steps.forEach(function (s, idx) {
      var on = idx === i;
      s.setAttribute('data-active', String(on));
      var head = $('[data-step-head]', s);
      if (head) head.setAttribute('aria-expanded', String(on));
    });
  }
  function completeStep(i) {
    if (steps[i]) steps[i].setAttribute('data-done', 'true');
  }

  steps.forEach(function (s, i) {
    var head = $('[data-step-head]', s);
    if (head) head.addEventListener('click', function () {
      openStep(s.getAttribute('data-active') === 'true' ? -1 : i);
    });
  });

  /* ------------------------------------------------------------ builders -- */
  function optButton(o, pressed) {
    return '<button class="opt" type="button" data-id="' + esc(o.id) + '" aria-pressed="' + (pressed ? 'true' : 'false') + '">'
      + '<span class="opt__t">' + esc(o.t) + '</span>'
      + '<span class="opt__d">' + esc(o.d) + '</span></button>';
  }

  function buildTypes() {
    var host = $('#cx-type');
    if (!host) return;
    host.innerHTML = WW.CATEGORIES.map(function (c) {
      var blurb = (c.blurb || c.shortDescription || '').split('.')[0];
      return optButton({ id: c.key, t: c.name, d: blurb ? blurb + '.' : '' }, false);
    }).join('');
    $$('.opt', host).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.opt', host).forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        state.type = b.getAttribute('data-id');
        var c = WW.catBy(state.type);
        state.typeLabel = c ? c.name : '';
        /* A ball type implies its construction — preselect, still editable. */
        var match = CONSTRUCTIONS.filter(function (x) { return x.id === state.type; })[0];
        if (match) selectConstruction(match);
        completeStep(0);
        updateSummary();
        openStep(1);
      });
    });
  }

  function buildConstructions() {
    var host = $('#cx-construction');
    if (!host) return;
    host.innerHTML = CONSTRUCTIONS.map(function (o) { return optButton(o, false); }).join('');
    $$('.opt', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var o = CONSTRUCTIONS.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
        selectConstruction(o);
        completeStep(1);
        updateSummary();
        openStep(2);
      });
    });
  }

  function selectConstruction(o) {
    if (!o) return;
    state.construction = o.id;
    state.constructionLabel = o.t;
    $$('#cx-construction .opt').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-id') === o.id));
    });
  }

  function buildBranding() {
    var host = $('#cx-branding');
    if (!host) return;
    host.innerHTML = BRANDING.map(function (o) { return optButton(o, false); }).join('');
    $$('.opt', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-id');
        var o = BRANDING.filter(function (x) { return x.id === id; })[0];
        var idx = state.branding.map(function (x) { return x.id; }).indexOf(id);
        if (idx > -1) { state.branding.splice(idx, 1); b.setAttribute('aria-pressed', 'false'); }
        else { state.branding.push(o); b.setAttribute('aria-pressed', 'true'); }
        if (state.branding.length) completeStep(4);
        updateSummary();
      });
    });
  }

  function buildSwatches(hostSel, key, nameKey) {
    var host = $(hostSel);
    if (!host) return;
    host.innerHTML = COLOURS.map(function (c) {
      return '<button class="swatch" type="button" title="' + esc(c.name) + '" aria-label="' + esc(c.name) + '"'
        + ' data-hex="' + c.hex + '" data-name="' + esc(c.name) + '"'
        + ' aria-pressed="' + (state[key] === c.hex ? 'true' : 'false') + '"'
        + ' style="background:' + c.hex + '"></button>';
    }).join('');
    $$('.swatch', host).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.swatch', host).forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        state[key] = b.getAttribute('data-hex');
        state[nameKey] = b.getAttribute('data-name');
        completeStep(3);
        repaint();
        updateSummary();
      });
    });
  }

  /* ------------------------------------------------------------ uploads -- */
  function buildUploads() {
    $$('[data-upload]').forEach(function (zone) {
      var kind = zone.getAttribute('data-upload');
      var input = $('[data-upload-input]', zone);
      var list = $('[data-upload-list]', zone);

      function paint() {
        list.innerHTML = state.files[kind].map(function (f, i) {
          return '<span class="upload__file"><span>' + esc(f.name) + '</span>'
            + '<button type="button" data-rm="' + i + '">Remove</button></span>';
        }).join('');
        $$('[data-rm]', list).forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            var i = +btn.getAttribute('data-rm');
            var removed = state.files[kind].splice(i, 1)[0];
            if (removed && removed.url) URL.revokeObjectURL(removed.url);
            paint();
            if (kind === 'logo') showLogo();
            if (state.files.logo.length + state.files.artwork.length) completeStep(2);
            updateSummary();
          });
        });
      }

      function add(fileList) {
        Array.prototype.slice.call(fileList).forEach(function (f) {
          if (f.size > 12 * 1024 * 1024) return;   /* keep the preview sane */
          var entry = { name: f.name, type: f.type, url: null };
          if (/^image\/(png|jpeg|svg\+xml)$/.test(f.type)) entry.url = URL.createObjectURL(f);
          state.files[kind].push(entry);
        });
        paint();
        if (kind === 'logo') showLogo();
        completeStep(2);
        updateSummary();
      }

      input.addEventListener('change', function () { add(input.files); input.value = ''; });

      ['dragenter', 'dragover'].forEach(function (ev) {
        zone.addEventListener(ev, function (e) { e.preventDefault(); zone.setAttribute('data-drag', 'true'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        zone.addEventListener(ev, function (e) { e.preventDefault(); zone.setAttribute('data-drag', 'false'); });
      });
      zone.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files) add(e.dataTransfer.files);
      });
    });
  }

  /* The preview image is created on demand — an empty <img> in the markup
     would fire a stray request and count as a broken image. */
  function showLogo() {
    var layer = $('#cx-logo');
    if (!layer) return;
    var first = state.files.logo.filter(function (f) { return f.url; })[0];
    if (!first) { layer.hidden = true; layer.innerHTML = ''; return; }
    var img = layer.querySelector('img');
    if (!img) {
      img = doc.createElement('img');
      img.alt = 'Your uploaded logo, previewed on the ball';
      layer.appendChild(img);
    }
    img.src = first.url;
    layer.hidden = false;
  }

  /* --------------------------------------------------------------- init -- */
  function init() {
    buildTypes();
    buildConstructions();
    buildBranding();
    buildSwatches('#cx-base', 'base', 'baseName');
    buildSwatches('#cx-accent', 'accent', 'accentName');
    buildUploads();
    boot3D();

    /* Deep link from a category or product page: ?ball=thermal */
    var pre = new URLSearchParams(location.search).get('ball');
    if (pre) {
      var btn = $('#cx-type .opt[data-id="' + pre + '"]');
      if (btn) btn.click();
    }

    updateSummary();
    if (WW.wireWhatsApp) WW.wireWhatsApp(doc);
  }

  /* The ball-type buttons are built from the categories in the database. */
  WW.ready.then(init).catch(function () { boot3D(); });
})();
