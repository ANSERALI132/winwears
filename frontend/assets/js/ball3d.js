/* ==========================================================================
   WIN WEARS — 3D football
   --------------------------------------------------------------------------
   The ball is the WIN WEARS 14-panel match ball model in red, assets/models/
   WIN-WEARS-14-Panel-Ball-Red.glb — its own panels, artwork and materials. Phones
   and low-power devices load WIN-WEARS-14-Panel-Ball-Red.mobile.glb instead: the
   same model with 2048 artwork, no tangents and quantized geometry.
   It is downloaded once per page however many balls the page shows.

   Every ball on the site uses it, the customizer included. The model's
   colours are its artwork, so setColours() changes nothing on it; the
   customer's colour choice is still recorded with their specification.
   { procedural: true } still builds the old generated, recolourable ball.

   Usage:  var ball = WW.ball3d(el, { zoom: 1.2, interactive: true });
           var ball = WW.ball3d(el, { procedural: true, base:'#fff', accent:'#16264F' });
           ball.setColours({ base:'#E1132C' });   // procedural ball only
           ball.destroy();

   Degrades: fewer rings and no environment map on weaker devices, and if
   WebGL or the CDN is unavailable the container keeps its fallback markup.
   ========================================================================== */
(function () {
  'use strict';

  var THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var scripts = {};

  function loadScript(src) {
    if (scripts[src]) return scripts[src];
    scripts[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error(src + ' failed to load')); };
      document.head.appendChild(s);
    });
    return scripts[src];
  }

  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    return loadScript(THREE_URL).then(function () {
      if (!window.THREE) throw new Error('three missing');
      return window.THREE;
    });
  }

  /* ======================================================================
     The match ball model
     GLTFLoader is the r128 build from three's own npm package, served from
     this site — the same version as three itself, and no second outside host.
     ====================================================================== */
  var models = {};

  function loadModel(THREE, url) {
    if (models[url]) return models[url];
    var base = document.documentElement.getAttribute('data-base') || '';
    models[url] = (THREE.GLTFLoader ? Promise.resolve() : loadScript(base + 'assets/js/vendor/GLTFLoader.js'))
      .then(function () {
        return new Promise(function (resolve, reject) {
          new THREE.GLTFLoader().load(url, resolve, undefined, reject);
        });
      });
    return models[url];
  }

  /**
   * The model's true centre and radius, measured from its vertices. A bounding
   * box built from rotated nodes overstates a sphere — for the 14-panel ball by
   * about a fifth — which would shrink it. Measured once per model and kept on
   * it, however many balls the page shows.
   */
  function normalizedScale(attr) {
    var a = attr.isInterleavedBufferAttribute ? attr.data.array : attr.array;
    if (a instanceof Int8Array) return 1 / 127;
    if (a instanceof Uint8Array) return 1 / 255;
    if (a instanceof Int16Array) return 1 / 32767;
    if (a instanceof Uint16Array) return 1 / 65535;
    return 1;
  }

  function fitOf(THREE, gltf) {
    if (gltf.wwFit) return gltf.wwFit;
    gltf.scene.updateMatrixWorld(true);
    var box = new THREE.Box3();
    var v = new THREE.Vector3();
    gltf.scene.traverse(function (o) {
      if (!o.isMesh) return;
      var pos = o.geometry.attributes.position;
      /* A quantized position arrives as its raw integer; r128 does not scale
         it back when read, so the fit has to. */
      var k = pos.normalized ? normalizedScale(pos) : 1;
      for (var i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).multiplyScalar(k).applyMatrix4(o.matrixWorld));
    });
    var size = box.getSize(new THREE.Vector3());
    gltf.wwFit = { center: box.getCenter(new THREE.Vector3()), radius: Math.max(size.x, size.y, size.z) / 2 || 1 };
    return gltf.wwFit;
  }

  /**
   * Which of a material's maps the file puts on its second UV set. The r128
   * GLTFLoader reads every map through the first set and only warns, so the
   * answer has to come from the file itself.
   */
  function secondUvMaps(gltf, material) {
    var parser = gltf.parser;
    var ref = parser && parser.associations && parser.associations.get(material);
    var def = ref && ref.type === 'materials' && parser.json.materials && parser.json.materials[ref.index];
    if (!def) return null;
    var pbr = def.pbrMetallicRoughness || {};
    var onSecond = function (t) { return !!t && t.texCoord === 1; };
    var maps = { normal: onSecond(def.normalTexture), roughness: onSecond(pbr.metallicRoughnessTexture) };
    return maps.normal || maps.roughness ? maps : null;
  }

  /**
   * Samples those maps with the second UV set. The 14-panel ball keeps its PU
   * grain there, tiling across each panel; read through the first set — the
   * artwork's layout — the grain is stretched about twelvefold. GLTFLoader
   * already loads that set as `uv2`; only the lookups in the shader change.
   */
  function sampleSecondUv(THREE, material, maps) {
    if (!maps) return;
    /* three declares uv2 itself only for an AO or light map; reuse it then. */
    var declare = !material.aoMap && !material.lightMap;
    var uv = declare ? 'vDetailUv' : 'vUv2';
    var swap = function (chunk) { return THREE.ShaderChunk[chunk].replace(/\bvUv\b/g, uv); };

    material.onBeforeCompile = function (shader) {
      if (declare) {
        shader.vertexShader = 'attribute vec2 uv2;\nvarying vec2 vDetailUv;\n'
          + shader.vertexShader.replace('#include <uv2_vertex>', '#include <uv2_vertex>\n\tvDetailUv = uv2;');
        shader.fragmentShader = 'varying vec2 vDetailUv;\n' + shader.fragmentShader;
      }
      if (maps.normal) {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <normalmap_pars_fragment>', swap('normalmap_pars_fragment'))
          .replace('#include <normal_fragment_maps>', swap('normal_fragment_maps'));
      }
      if (maps.roughness) {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <roughnessmap_fragment>', swap('roughnessmap_fragment'))
          .replace('#include <metalnessmap_fragment>', swap('metalnessmap_fragment'));
      }
    };
    /* The closure differs by map, so the compiled program must too. */
    var key = 'ww-uv2-' + (maps.normal ? 'n' : '') + (maps.roughness ? 'r' : '') + '-' + uv;
    material.customProgramCacheKey = function () { return key; };
    material.needsUpdate = true;
  }

  /**
   * One ball's copy of the model, centred on its own middle and scaled to
   * radius R, so it sits exactly where the generated ball did under the same
   * camera and turns about its centre rather than the file's origin.
   *
   * Materials are cloned because the studio reflection is a texture that
   * belongs to one renderer, and the home page has two. The artwork textures
   * inside those materials are still shared.
   */
  function modelBall(THREE, gltf, R, env) {
    var root = gltf.scene.clone(true);
    /* m is the loader's own material, which is what the file's settings are
       recorded against; the clone is what this ball draws with. */
    function own(m, geometry) {
      var c = m.clone();
      if (env) {
        c.envMap = env;
        c.envMapIntensity = 0.55;
      }
      if (geometry.attributes.uv2) sampleSecondUv(THREE, c, secondUvMaps(gltf, m));
      return c;
    }
    root.traverse(function (o) {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material)
        ? o.material.map(function (m) { return own(m, o.geometry); })
        : own(o.material, o.geometry);
    });

    var fit = fitOf(THREE, gltf);
    var s = R / fit.radius;
    root.scale.setScalar(s);
    root.position.copy(fit.center).multiplyScalar(-s);

    var pivot = new THREE.Group();
    pivot.add(root);
    return pivot;
  }

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  function tier() {
    var mem = navigator.deviceMemory || 4;
    var cores = navigator.hardwareConcurrency || 4;
    if (!hasWebGL()) return 'none';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'still';
    if (mem <= 2 || cores <= 2) return 'low';
    if (window.innerWidth < 700) return 'low';
    return 'high';
  }

  /* ======================================================================
     Vector helpers (plain arrays — no THREE needed until we build meshes)
     ====================================================================== */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function norm(v) {
    var l = Math.sqrt(dot(v, v)) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function dist2(a, b) { var d = sub(a, b); return dot(d, d); }
  /** Great-circle interpolation, so points stay on the sphere. */
  function slerp(a, b, t) { return norm(add(scale(a, 1 - t), scale(b, t))); }

  /* ======================================================================
     Truncated icosahedron topology
     Truncating an icosahedron 1/3 along each edge gives 60 vertices,
     12 pentagons (one per original vertex) and 20 hexagons (one per face).
     ====================================================================== */
  function buildPanels() {
    var t = (1 + Math.sqrt(5)) / 2;
    var V = [
      [0, 1, t], [0, -1, t], [0, 1, -t], [0, -1, -t],
      [1, t, 0], [-1, t, 0], [1, -t, 0], [-1, -t, 0],
      [t, 0, 1], [-t, 0, 1], [t, 0, -1], [-t, 0, -1]
    ].map(norm);

    var EDGE2 = dist2(V[0], V[1]) * 1.05;   /* adjacency threshold */

    var neighbours = [];
    for (var i = 0; i < 12; i++) {
      neighbours[i] = [];
      for (var j = 0; j < 12; j++) {
        if (i !== j && dist2(V[i], V[j]) < EDGE2) neighbours[i].push(j);
      }
    }

    var faces = [];
    for (var a = 0; a < 12; a++) {
      for (var b = a + 1; b < 12; b++) {
        if (dist2(V[a], V[b]) > EDGE2) continue;
        for (var c = b + 1; c < 12; c++) {
          if (dist2(V[b], V[c]) < EDGE2 && dist2(V[a], V[c]) < EDGE2) faces.push([a, b, c]);
        }
      }
    }

    /* Truncation point one third of the way from p toward q. */
    function cut(p, q) { return slerp(V[p], V[q], 1 / 3); }

    var panels = [];

    /* 12 pentagons — one around each original vertex */
    for (var v = 0; v < 12; v++) {
      var pts = neighbours[v].map(function (n) { return cut(v, n); });
      panels.push({ pts: order(pts), kind: 'pent' });
    }

    /* 20 hexagons — one per original face */
    faces.forEach(function (f) {
      var pts = [];
      [[0, 1], [1, 2], [2, 0]].forEach(function (e) {
        pts.push(cut(f[e[0]], f[e[1]]));
        pts.push(cut(f[e[1]], f[e[0]]));
      });
      panels.push({ pts: order(pts), kind: 'hex' });
    });

    return panels;
  }

  /** Sort a panel's corners into winding order around its own centre. */
  function order(pts) {
    var c = norm(pts.reduce(add, [0, 0, 0]));
    var up = Math.abs(c[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    var u = norm(cross(up, c));
    var w = cross(c, u);
    return pts.slice().sort(function (p, q) {
      return Math.atan2(dot(p, w), dot(p, u)) - Math.atan2(dot(q, w), dot(q, u));
    });
  }

  /* ======================================================================
     Panel geometry
     Concentric rings from the rolled-down edge up to the domed crown.
     ====================================================================== */
  var PROFILE_HI = [
    /* inset toward centre, radius multiplier */
    [0.000, 0.962],   /* edge, tucked below the surface → the seam groove */
    [0.085, 1.000],   /* shoulder, back at full radius                    */
    [0.330, 1.012],
    [0.640, 1.018]
  ];
  var PROFILE_LO = [[0.000, 0.962], [0.100, 1.000], [0.520, 1.015]];

  function panelGeometry(THREE, panel, R, gap, rings) {
    var pts = panel.pts;
    var n = pts.length;
    var centre = norm(pts.reduce(add, [0, 0, 0]));

    /* Local tangent basis, used for planar UVs */
    var up = Math.abs(centre[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    var bu = norm(cross(up, centre));
    var bv = cross(centre, bu);

    var pos = [], uv = [], idx = [];
    var uvs = [];

    /* Extent of the panel in the tangent plane, for normalising UVs */
    var maxR = 0;
    pts.forEach(function (p) {
      var d = sub(p, centre);
      maxR = Math.max(maxR, Math.hypot(dot(d, bu), dot(d, bv)));
    });
    maxR = maxR || 1;

    function push(p3) {
      pos.push(p3[0], p3[1], p3[2]);
      var d = sub(norm(p3), centre);
      uvs.push(0.5 + dot(d, bu) / (maxR * 2.15), 0.5 + dot(d, bv) / (maxR * 2.15));
    }

    /* Rings */
    rings.forEach(function (ring) {
      var inset = gap + (1 - gap) * ring[0];
      pts.forEach(function (p) {
        push(scale(slerp(p, centre, inset), R * ring[1]));
      });
    });

    /* Crown */
    var crownIndex = rings.length * n;
    push(scale(centre, R * (rings[rings.length - 1][1] + 0.005)));

    /* Strips between consecutive rings.
       Corners are wound anticlockwise seen from outside, and each ring sits
       further in, so the quad cycle is outer_i → outer_i+1 → inner_i+1 → inner_i
       to keep every face pointing outward. */
    for (var r = 0; r < rings.length - 1; r++) {
      for (var i = 0; i < n; i++) {
        var i2 = (i + 1) % n;
        var a = r * n + i, b = r * n + i2;
        var c = (r + 1) * n + i, d = (r + 1) * n + i2;
        idx.push(a, b, d, a, d, c);
      }
    }
    /* Fan from the innermost ring up to the crown */
    var last = (rings.length - 1) * n;
    for (var k = 0; k < n; k++) {
      idx.push(last + k, last + ((k + 1) % n), crownIndex);
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** Concatenate several geometries into one buffer (avoids a utils import). */
  function mergeGeometries(THREE, list) {
    var pos = [], nor = [], uv = [], idx = [], offset = 0;
    list.forEach(function (g) {
      var p = g.attributes.position.array;
      var nm = g.attributes.normal.array;
      var t = g.attributes.uv.array;
      var ix = g.index.array;
      for (var i = 0; i < p.length; i++) pos.push(p[i]);
      for (var j = 0; j < nm.length; j++) nor.push(nm[j]);
      for (var k = 0; k < t.length; k++) uv.push(t[k]);
      for (var m = 0; m < ix.length; m++) idx.push(ix[m] + offset);
      offset += p.length / 3;
      g.dispose();
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.setIndex(idx);
    return out;
  }

  /* ======================================================================
     Surface maps
     ====================================================================== */
  /** Pebbled grain, the texture you feel on a match ball. */
  function grainMap(THREE, size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var x = c.getContext('2d');
    x.fillStyle = '#808080';
    x.fillRect(0, 0, size, size);
    var step = size / 26;
    for (var gy = 0; gy < 27; gy++) {
      for (var gx = 0; gx < 27; gx++) {
        var ox = (gy % 2) * step * 0.5;
        var cx = gx * step + ox, cy = gy * step;
        var rad = step * 0.38;
        var grd = x.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, 0, cx, cy, rad);
        grd.addColorStop(0, '#ffffff');
        grd.addColorStop(1, '#5a5a5a');
        x.fillStyle = grd;
        x.beginPath();
        x.arc(cx, cy, rad, 0, Math.PI * 2);
        x.fill();
      }
    }
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
  }

  /* --- the supplied badge, printed onto a panel ------------------------- */
  /* Loaded once and shared by every ball on the page. */
  var logoImg = null, logoPromise = null;

  function loadLogo(url) {
    if (logoPromise) return logoPromise;
    logoPromise = new Promise(function (resolve) {
      /* A file:// page taints the canvas, and WebGL then refuses the upload —
         so on disk we fall back to the wordmark and skip the badge. */
      if (location.protocol === 'file:') return resolve(null);
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { logoImg = img; resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
    return logoPromise;
  }

  /**
   * The WIN WEARS badge on a panel. The artwork itself is never altered —
   * it is only clipped to its own circular edge so the white corners of the
   * JPEG do not print as a white square on a coloured panel.
   */
  function badgeMap(THREE, colour, img) {
    var S = 512;
    var c = document.createElement('canvas');
    c.width = c.height = S;
    var x = c.getContext('2d');
    x.fillStyle = colour;
    x.fillRect(0, 0, S, S);
    if (img) {
      var d = S * 0.58;
      x.save();
      x.beginPath();
      x.arc(S / 2, S / 2, d / 2, 0, Math.PI * 2);
      x.clip();
      x.drawImage(img, (S - d) / 2, (S - d) / 2, d, d);
      x.restore();
    }
    return new THREE.CanvasTexture(c);
  }

  /** The WIN WEARS wordmark, sized to sit inside one hexagon panel. */
  function markMap(THREE, colour, ink) {
    var S = 512;
    var c = document.createElement('canvas');
    c.width = c.height = S;
    var x = c.getContext('2d');
    x.fillStyle = colour;
    x.fillRect(0, 0, S, S);
    x.fillStyle = ink;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = '800 ' + Math.round(S * 0.115) + 'px Archivo, Arial, sans-serif';
    x.letterSpacing = '2px';
    x.fillText('WIN WEARS', S / 2, S / 2 - S * 0.02);
    x.fillStyle = ink;
    x.globalAlpha = 0.55;
    x.font = '600 ' + Math.round(S * 0.045) + 'px Archivo, Arial, sans-serif';
    x.fillText('PREMIUM MATCH BALL', S / 2, S / 2 + S * 0.085);
    return new THREE.CanvasTexture(c);
  }

  /** A small studio environment so the PU catches a believable sheen. */
  function studioEnv(THREE, renderer) {
    var S = 256;
    var c = document.createElement('canvas');
    c.width = S; c.height = S / 2;
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, S / 2);
    g.addColorStop(0.00, '#ffffff');
    g.addColorStop(0.35, '#c9d4e6');
    g.addColorStop(0.55, '#4d5a72');
    g.addColorStop(1.00, '#0b1020');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S / 2);
    /* two soft key panels, as in a photo studio */
    [[S * 0.24, '#ffffff'], [S * 0.74, '#dfe7f5']].forEach(function (k) {
      var rg = x.createRadialGradient(k[0], S * 0.14, 0, k[0], S * 0.14, S * 0.16);
      rg.addColorStop(0, k[1]);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = rg;
      x.fillRect(0, 0, S, S / 2);
    });

    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    try {
      var pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      var rt = pmrem.fromEquirectangular(tex);
      tex.dispose();
      pmrem.dispose();
      return rt.texture;
    } catch (e) {
      return tex;   /* older builds still get a usable reflection */
    }
  }

  /* ======================================================================
     Main
     ====================================================================== */
  WW.ball3d = function (el, opts) {
    if (!el) return null;
    opts = opts || {};
    var mode = tier();
    if (mode === 'none') return null;

    var colours = {
      base: opts.base || '#FFFFFF',
      accent: opts.accent || '#16264F',
      seam: opts.seam || '#0C1226',
      markColour: opts.markColour || '#0C1226',
      wordmark: opts.wordmark !== false
    };

    var api = { ready: false, setColours: function () {}, destroy: function () {} };
    var destroyed = false;

    /* The full model is 34 MB with an 8192 texture — more memory than many
       phones have for it. They get the lighter copy of the same ball. */
    var light = mode === 'low' || window.innerWidth < 700;
    var modelUrl = opts.procedural ? null
      : opts.model || (document.documentElement.getAttribute('data-base') || '') + 'assets/models/'
        + (light ? 'WIN-WEARS-14-Panel-Ball-Red.mobile.glb' : 'WIN-WEARS-14-Panel-Ball-Red.glb');
    var gltf = null;

    loadThree().then(function (THREE) {
      if (!modelUrl) return THREE;
      return loadModel(THREE, modelUrl).then(function (g) { gltf = g; return THREE; });
    }).then(function (THREE) {
      if (destroyed) return;

      var w = el.clientWidth || 600;
      var h = el.clientHeight || 600;
      var R = 1.32;
      var FOV = 34;

      var renderer = new THREE.WebGLRenderer({
        antialias: mode !== 'low', alpha: true, powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mode === 'high' ? 2 : 1.4));
      renderer.setSize(w, h);
      renderer.outputEncoding = THREE.sRGBEncoding;
      el.appendChild(renderer.domElement);

      /* r128 predates automatic colour management: brand colours are authored
         in sRGB and must be taken to linear by hand, or crimson renders pink. */
      function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(FOV, w / h, 0.1, 100);

      function fitDistance() {
        var vFov = FOV * Math.PI / 180;
        var hFov = 2 * Math.atan(Math.tan(vFov / 2) * (camera.aspect || 1));
        return (R / Math.sin(Math.min(vFov, hFov) / 2)) * (opts.zoom || 1.18);
      }
      camera.position.set(0, 0, opts.distance || fitDistance());

      /* ---- the ball ---------------------------------------------------- */
      var env = mode === 'high' ? studioEnv(THREE, renderer) : null;
      var ball, grain = null, seamMat = null;
      var matHex = null, matPent = null, matBrand = null, matLogo = null;

      if (gltf) {
        ball = modelBall(THREE, gltf, R, env);
      } else {
        var rings = mode === 'low' ? PROFILE_LO : PROFILE_HI;
        var gap = 0.055;
        var panels = buildPanels();

        /* Two hexagons are printed — the wordmark on one, the badge on another
           on the far side, so one of them is always facing you as it turns.
           Everything else merges into two meshes by panel type. */
        function pickHex(towards, exclude) {
          var best = -2, at = -1;
          panels.forEach(function (p, i) {
            if (p.kind !== 'hex' || i === exclude) return;
            var facing = dot(norm(p.pts.reduce(add, [0, 0, 0])), norm(towards));
            if (facing > best) { best = facing; at = i; }
          });
          return at;
        }
        var brandIdx = colours.wordmark ? pickHex([0.15, 0.12, 1]) : -1;
        var logoIdx = colours.wordmark ? pickHex([-0.9, 0.22, -0.35], brandIdx) : -1;

        var pentGeos = [], hexGeos = [], brandGeo = null, logoGeo = null;
        panels.forEach(function (p, i) {
          var g = panelGeometry(THREE, p, R, gap, rings);
          if (i === brandIdx) brandGeo = g;
          else if (i === logoIdx) logoGeo = g;
          else if (p.kind === 'pent') pentGeos.push(g);
          else hexGeos.push(g);
        });

        grain = grainMap(THREE, mode === 'high' ? 512 : 256);

        function panelMaterial(hex, map) {
          if (map) map.encoding = THREE.sRGBEncoding;
          return new THREE.MeshStandardMaterial({
            color: col(hex),
            map: map || null,
            roughness: 0.46,
            metalness: 0.02,
            bumpMap: grain,
            bumpScale: 0.007,
            envMap: env,
            envMapIntensity: env ? 0.55 : 0
          });
        }

        matHex = panelMaterial(colours.base);
        matPent = panelMaterial(colours.accent);
        matBrand = brandGeo ? panelMaterial('#ffffff', markMap(THREE, colours.base, colours.markColour)) : null;
        matLogo = logoGeo ? panelMaterial('#ffffff', badgeMap(THREE, colours.base, logoImg)) : null;

        ball = new THREE.Group();
        ball.add(new THREE.Mesh(mergeGeometries(THREE, hexGeos), matHex));
        ball.add(new THREE.Mesh(mergeGeometries(THREE, pentGeos), matPent));
        if (brandGeo) ball.add(new THREE.Mesh(brandGeo, matBrand));
        if (logoGeo) ball.add(new THREE.Mesh(logoGeo, matLogo));

        /* The badge arrives asynchronously — repaint that one panel on arrival. */
        if (matLogo) {
          loadLogo(opts.logoUrl || (document.documentElement.getAttribute('data-base') || '') + 'assets/img/logo/win-wears-logo.jpeg')
            .then(function (img) {
              if (destroyed || !img) return;
              var old = matLogo.map;
              var fresh = badgeMap(THREE, colours.base, img);
              fresh.encoding = THREE.sRGBEncoding;
              matLogo.map = fresh;
              matLogo.needsUpdate = true;
              if (old) old.dispose();
              if (mode === 'still' || !raf) renderer.render(scene, camera);
            });
        }

        /* The body under the panels — what you see down in the seam grooves. */
        seamMat = new THREE.MeshStandardMaterial({
          color: col(colours.seam), roughness: 0.85, metalness: 0
        });
        ball.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.938, 48, 32), seamMat));
      }

      ball.rotation.z = 0.30;
      ball.rotation.x = -0.12;

      var group = new THREE.Group();
      group.add(ball);
      scene.add(group);

      /* ---- lighting ---------------------------------------------------- */
      scene.add(new THREE.AmbientLight(0xffffff, env ? 0.30 : 0.55));
      var key = new THREE.DirectionalLight(0xffffff, env ? 0.95 : 1.25);
      key.position.set(3.2, 4.2, 4.6); scene.add(key);
      var fill = new THREE.DirectionalLight(0xd6e2ff, 0.30);
      fill.position.set(-4, -0.6, 2.2); scene.add(fill);
      var rim = new THREE.DirectionalLight(0x9ab4ff, 0.55);
      rim.position.set(-2.4, 1.6, -4); scene.add(rim);

      /* ---- interaction ------------------------------------------------- */
      var velY = opts.spin === false ? 0 : 0.0022;
      var velX = 0.0005;
      var dragging = false, lastX = 0, lastY = 0;

      function down(e) {
        dragging = true;
        lastX = e.touches ? e.touches[0].clientX : e.clientX;
        lastY = e.touches ? e.touches[0].clientY : e.clientY;
        el.style.cursor = 'grabbing';
      }
      function move(e) {
        if (!dragging) return;
        var cx = e.touches ? e.touches[0].clientX : e.clientX;
        var cy = e.touches ? e.touches[0].clientY : e.clientY;
        velY = (cx - lastX) * 0.0006;
        velX = (cy - lastY) * 0.0005;
        lastX = cx; lastY = cy;
      }
      function up() { dragging = false; el.style.cursor = 'grab'; }

      if (opts.interactive !== false) {
        el.style.cursor = 'grab';
        el.addEventListener('mousedown', down);
        el.addEventListener('touchstart', down, { passive: true });
        window.addEventListener('mousemove', move);
        window.addEventListener('touchmove', move, { passive: true });
        window.addEventListener('mouseup', up);
        window.addEventListener('touchend', up);
      }

      var tiltX = 0, tiltY = 0;
      function onPointer(e) {
        tiltY = (e.clientX / window.innerWidth - 0.5) * 0.26;
        tiltX = (e.clientY / window.innerHeight - 0.5) * 0.20;
      }
      if (opts.parallax !== false && mode === 'high') window.addEventListener('mousemove', onPointer);

      /* ---- loop -------------------------------------------------------- */
      var visible = true, raf = null;
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          visible = entries[0].isIntersecting;
          if (visible && !raf && mode !== 'still') loop();
        }, { threshold: 0.02 }).observe(el);
      }

      function loop() {
        if (destroyed) return;
        if (!visible || document.hidden) { raf = null; return; }
        raf = requestAnimationFrame(loop);
        if (!dragging) {
          velY += (0.0022 - velY) * 0.02;
          velX += (0.0005 - velX) * 0.02;
        }
        ball.rotation.y += velY;
        ball.rotation.x += velX;
        group.rotation.y += (tiltY - group.rotation.y) * 0.05;
        group.rotation.x += (tiltX - group.rotation.x) * 0.05;
        renderer.render(scene, camera);
      }

      if (mode === 'still') renderer.render(scene, camera);
      else loop();

      function resize() {
        if (destroyed) return;
        var nw = el.clientWidth || w, nh = el.clientHeight || h;
        camera.aspect = nw / nh;
        if (!opts.distance) camera.position.z = fitDistance();
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
        if (mode === 'still' || !raf) renderer.render(scene, camera);
      }
      window.addEventListener('resize', resize);

      el.setAttribute('data-ball', 'ready');
      api.ready = true;

      /* Recolouring only touches materials — the geometry never rebuilds. */
      api.setColours = function (next) {
        Object.keys(next || {}).forEach(function (k) { colours[k] = next[k]; });
        if (!matHex) return;   /* the model's colours are its artwork */
        matHex.color.copy(col(colours.base));
        matPent.color.copy(col(colours.accent));
        seamMat.color.copy(col(colours.seam));
        if (matBrand) {
          var old = matBrand.map;
          var fresh = markMap(THREE, colours.base, colours.markColour);
          fresh.encoding = THREE.sRGBEncoding;
          matBrand.map = fresh;
          matBrand.needsUpdate = true;
          if (old) old.dispose();
        }
        if (matLogo) {
          var oldB = matLogo.map;
          var freshB = badgeMap(THREE, colours.base, logoImg);
          freshB.encoding = THREE.sRGBEncoding;
          matLogo.map = freshB;
          matLogo.needsUpdate = true;
          if (oldB) oldB.dispose();
        }
        if (mode === 'still' || !raf) renderer.render(scene, camera);
      };

      api.destroy = function () {
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        window.removeEventListener('mousemove', onPointer);
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
        if (grain) grain.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      };
    }).catch(function () {
      el.setAttribute('data-ball', 'fallback');
    });

    return api;
  };
})();
