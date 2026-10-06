/* ═══════════════════════════════════════════════════
   INDORE — Interactive Presentation Logic  (v3 FIXED)
   Removed: GSAP slide transitions (broke navigation)
   Added:   robust lazy init, proper resize handling
   ═══════════════════════════════════════════════════ */

/* ── Loading screen ─────────────────────────────── */
window.addEventListener('load', () => {
  setTimeout(() => document.getElementById('loader').classList.add('hide'), 500);
});
// Fallback: never let loader stick for more than 4s
setTimeout(() => document.getElementById('loader')?.classList.add('hide'), 4000);

/* ═══════════════════════════════════════════════
   PARTICLES background
   ═══════════════════════════════════════════════ */
(function initParticles() {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H;
  const particles = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  class P {
    constructor() { this.reset(true); }
    reset(init) {
      this.x = Math.random() * W;
      this.y = init ? Math.random() * H : H + 10;
      this.r = Math.random() * 2 + 0.5;
      this.vy = -Math.random() * 0.4 - 0.1;
      this.vx = (Math.random() - 0.5) * 0.2;
      this.a = Math.random() * 0.5 + 0.2;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.y < -10) this.reset(false);
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(245,166,35,${this.a})`;
      ctx.fill();
    }
  }
  for (let i = 0; i < 80; i++) particles.push(new P());

  (function loop() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(loop);
  })();
})();

/* ═══════════════════════════════════════════════
   GLOBE — Three.js  (v2 robust)
   - Waits for container to have real dimensions
   - Falls back to CSS-animated globe if WebGL fails
   - Logs diagnostics to console
   ═══════════════════════════════════════════════ */
let globeRenderer = null;
let globeRunning = false;
let globeInitAttempts = 0;
let globeCamera = null;          // ← ADD
let globePin = null;             // ← ADD
let globeZoomed = false;         // ← ADD (freezes rotation while zoomed)
const GLOBE_DEFAULT_Z = 3.2;  

function initGlobe() {
  if (globeRenderer) return;
  const container = document.getElementById('globe-container');
  if (!container) { console.warn('[globe] container not found'); return; }

  const w = container.clientWidth;
  const h = container.clientHeight;

  // Retry up to 20 times if container has no size yet (Reveal still laying out)
  if ((w < 10 || h < 10) && globeInitAttempts < 20) {
    globeInitAttempts++;
    console.log(`[globe] container ${w}x${h}, retrying (${globeInitAttempts}/20)...`);
    setTimeout(initGlobe, 150);
    return;
  }

  console.log(`[globe] initializing at ${w}x${h}`);

  // Try WebGL — fall back to CSS if it fails
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    console.error('[globe] WebGL not available:', e);
    cssGlobeFallback(container);
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.position = 'relative';
  renderer.domElement.style.zIndex = '2';
  container.appendChild(renderer.domElement);
  globeRenderer = renderer;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  camera.position.z = 3.2;

  // ─── Earth mesh (starts as solid blue; texture loads async) ───
  const material = new THREE.MeshPhongMaterial({
    color: 0x2E5496,
    shininess: 12,
    specular: new THREE.Color(0x333333),
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), material);
  scene.add(earth);

  // Try textures in order; keep blue if all fail
  const texLoader = new THREE.TextureLoader();
  texLoader.setCrossOrigin('anonymous');
  const texURLs = [
    'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/r128/examples/textures/planets/earth_atmos_2048.jpg',
  ];
  (function tryTex(i = 0) {
    if (i >= texURLs.length) { console.warn('[globe] no texture loaded, using solid blue'); return; }
    texLoader.load(
      texURLs[i],
      tex => {
        console.log('[globe] texture loaded:', texURLs[i]);
        material.map = tex;
        material.color.set(0xffffff);
        material.needsUpdate = true;
      },
      undefined,
      () => { console.warn('[globe] texture failed:', texURLs[i]); tryTex(i + 1); }
    );
  })();

  // Atmosphere glow
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xF5A623, transparent: true, opacity: 0.08, side: THREE.BackSide })
  ));

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 1);
  dir.position.set(5, 3, 5);
  scene.add(dir);

  // Pin at Indore (22.72°N, 75.86°E)
  const phi   = (90 - 22.72) * (Math.PI / 180);
  const theta = (75.86 + 180) * (Math.PI / 180);
  const pinPos = new THREE.Vector3(
    -1.02 * Math.sin(phi) * Math.cos(theta),
     1.02 * Math.cos(phi),
     1.02 * Math.sin(phi) * Math.sin(theta)
  );

  const pin = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xF5A623 })
  );
  pin.position.copy(pinPos);
  earth.add(pin);
  globeCamera = camera;
  globePin = pin;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.045, 0.07, 32),
    new THREE.MeshBasicMaterial({ color: 0xF5A623, transparent: true, side: THREE.DoubleSide })
  );
  ring.position.copy(pinPos);
  ring.lookAt(0, 0, 0);
  earth.add(ring);

  earth.rotation.y = Math.atan2(-pinPos.x, pinPos.z);

  // ─── Animation loop ───
  let t = 0;
  globeRunning = true;
  (function animate() {
    if (!globeRunning) return;
    requestAnimationFrame(animate);
    t += 0.01;
    if (!globeZoomed) earth.rotation.y += 0.0008;
    const s = 1 + Math.sin(t * 2) * 0.3;
    ring.scale.set(s, s, 1);
    ring.material.opacity = 1 - (s - 1) / 0.3 * 0.7;
    try { globeRenderer.render(scene, camera); } catch (e) { /* silent */ }
  })();

  // ─── Resize ───
  window.addEventListener('resize', () => {
    const W = container.clientWidth, H = container.clientHeight;
    if (W > 0 && H > 0) {
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      globeRenderer.setSize(W, H);
    }
  });

  console.log('[globe] ready ✅');
}
/* ═══════════════════════════════════════════════
   GLOBE ZOOM — camera flies to Indore
   ═══════════════════════════════════════════════ */

function zoomToIndore() {
  if (!globeCamera || !globePin) return;
  globeZoomed = true;

  // Fresh world position of the pin (it moves as earth rotates)
  const pinWorld = new THREE.Vector3();
  globePin.getWorldPosition(pinWorld);

  // Target camera: slightly outside the earth's surface, aligned with pin
  const camEnd = pinWorld.clone().normalize().multiplyScalar(1.55);
  const camStart = globeCamera.position.clone();

  const proxy = { t: 0 };
  gsap.to(proxy, {
    t: 1,
    duration: 1.6,
    ease: 'power3.inOut',
    onUpdate: () => {
      globeCamera.position.lerpVectors(camStart, camEnd, proxy.t);
      globeCamera.lookAt(pinWorld);
    },
  });
}

function zoomOutFromIndore() {
  if (!globeCamera) return;
  globeZoomed = false;

  const camStart = globeCamera.position.clone();
  const camEnd = new THREE.Vector3(0, 0, GLOBE_DEFAULT_Z);

  const proxy = { t: 0 };
  gsap.to(proxy, {
    t: 1,
    duration: 1.3,
    ease: 'power3.out',
    onUpdate: () => {
      globeCamera.position.lerpVectors(camStart, camEnd, proxy.t);
      globeCamera.lookAt(0, 0, 0);
    },
  });
}

/* CSS fallback — shown if WebGL totally fails */
function cssGlobeFallback(container) {
  console.log('[globe] using CSS fallback');
  container.innerHTML = `
    <div class="css-globe">
      <div class="css-globe-sphere"></div>
      <div class="css-globe-ring"></div>
    </div>
  `;
}
/* ═══════════════════════════════════════════════
   3D MAP — MapLibre + OSM raster (reliable)
   ═══════════════════════════════════════════════ */
let map3D = null;
function init3DMap() {
  const el = document.getElementById('map-3d');
  if (!el || map3D) return;
  if (el.clientWidth === 0 || el.clientHeight === 0) return; // retry later

  const osmRasterStyle = {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap',
        maxzoom: 19,
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  };

  map3D = new maplibregl.Map({
    container: 'map-3d',
    style: osmRasterStyle,
    center: [75.8577, 22.7196],
    zoom: 11.5,
    pitch: 55,
    bearing: -20,
    antialias: true,
    attributionControl: false,
  });

  map3D.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map3D.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

  map3D.on('load', () => {
    new maplibregl.Marker({ color: '#F5A623' })
      .setLngLat([75.8577, 22.7196])
      .setPopup(new maplibregl.Popup({ offset: 25, closeButton: false })
        .setHTML('<strong style="color:#F5A623">Indore</strong><br>19.94 L population<br>85 IMC wards'))
      .addTo(map3D);
  });

  map3D.on('error', (e) => console.warn('Map tile error (non-fatal):', e?.error?.message));
}

/* ═══════════════════════════════════════════════
   CHARTS — Plotly
   ═══════════════════════════════════════════════ */
const plotlyLayoutBase = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'Inter, sans-serif', color: '#E8ECF5', size: 14 },
  margin: { l: 60, r: 30, t: 30, b: 60 },
  hoverlabel: {
    bgcolor: 'rgba(10,14,39,0.95)',
    bordercolor: '#F5A623',
    font: { color: '#fff', family: 'Inter' },
  },
};

function initPopChart() {
  const el = document.getElementById('pop-chart-3d');
  if (!el || el.dataset.done || el.clientWidth === 0) return;
  el.dataset.done = '1';
  Plotly.newPlot(el, [{
    type: 'bar',
    x: ['Indore City', 'Indore District', 'Madhya Pradesh'],
    y: [1.994, 3.277, 72.627],
    text: ['19.94 L', '32.77 L', '726.27 L'],
    textposition: 'outside',
    textfont: { color: '#F5A623', size: 16, family: 'JetBrains Mono' },
    marker: { color: ['#F5A623', '#00A9A5', '#2E5496'], line: { color: '#fff', width: 1 } },
    hovertemplate: '<b>%{x}</b><br>%{text}<extra></extra>',
  }], {
    ...plotlyLayoutBase,
    xaxis: { gridcolor: 'rgba(255,255,255,0.06)', tickfont: { size: 14 } },
    yaxis: { title: 'Population (millions)', gridcolor: 'rgba(255,255,255,0.06)', type: 'log' },
    bargap: 0.35,
  }, { displayModeBar: false, responsive: true });
}

function initAgeChart() {
  const el = document.getElementById('age-chart');
  if (!el || el.dataset.done || el.clientWidth === 0) return;
  el.dataset.done = '1';
  Plotly.newPlot(el, [{
    type: 'pie', hole: 0.55,
    labels: ['0–14 yrs', '15–59 yrs (Working)', '60+ yrs (Elderly)'],
    values: [22.7, 65.07, 12.23],
    marker: { colors: ['#F5A623', '#00A9A5', '#FF6B35'], line: { color: '#0a0e27', width: 3 } },
    textinfo: 'label+percent',
    textfont: { color: '#fff', size: 14 },
    pull: [0.02, 0.05, 0.02],
    rotation: -30,
  }], {
    ...plotlyLayoutBase,
    showlegend: false,
    margin: { l: 20, r: 20, t: 20, b: 20 },
  }, { displayModeBar: false, responsive: true });
}

function initLitChart() {
  const el = document.getElementById('lit-chart');
  if (!el || el.dataset.done || el.clientWidth === 0) return;
  el.dataset.done = '1';
  Plotly.newPlot(el, [
    { type: 'bar', name: 'Male',
      x: ['City', 'District', 'State'], y: [89.79, 88.14, 78.73],
      marker: { color: '#2E5496' }, text: [89.79, 88.14, 78.73],
      textposition: 'outside', textfont: { color: '#fff', size: 13 } },
    { type: 'bar', name: 'Female',
      x: ['City', 'District', 'State'], y: [80.28, 72.99, 59.24],
      marker: { color: '#F5A623' }, text: [80.28, 72.99, 59.24],
      textposition: 'outside', textfont: { color: '#fff', size: 13 } },
  ], {
    ...plotlyLayoutBase,
    barmode: 'group', bargap: 0.3, bargroupgap: 0.1,
    xaxis: { gridcolor: 'rgba(255,255,255,0.05)' },
    yaxis: { range: [0, 105], gridcolor: 'rgba(255,255,255,0.05)', title: 'Literacy Rate (%)' },
    legend: { orientation: 'h', y: -0.15, font: { color: '#fff' } },
  }, { displayModeBar: false, responsive: true });
}

function initWasteChart() {
  const el = document.getElementById('waste-chart');
  if (!el || el.dataset.done || el.clientWidth === 0) return;
  el.dataset.done = '1';
  Plotly.newPlot(el, [{
    type: 'pie', hole: 0.4,
    labels: ['Organic (Wet)', 'Dry (Recyclable)', 'Hazardous / Sanitary'],
    values: [58.25, 41.25, 0.5],
    marker: { colors: ['#27AE60', '#F5A623', '#E74C3C'], line: { color: '#0a0e27', width: 3 } },
    textinfo: 'label+percent',
    textfont: { color: '#fff', size: 14 },
    rotation: 45,
  }], {
    ...plotlyLayoutBase,
    showlegend: true,
    legend: { orientation: 'h', y: -0.1, font: { color: '#fff' } },
  }, { displayModeBar: false, responsive: true });
}

/* ═══════════════════════════════════════════════
   ANIMATED COUNTERS
   ═══════════════════════════════════════════════ */
function animateCounter(el) {
  const target = parseFloat(el.dataset.count);
  const suffix = el.dataset.suffix || '';
  const isDecimal = target % 1 !== 0;
  const duration = 1800;
  const start = performance.now();

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const current = target * eased;

    if (target >= 1000000)      el.textContent = (current / 100000).toFixed(2) + ' L' + suffix;
    else if (target >= 1000)    el.textContent = Math.round(current).toLocaleString('en-IN') + suffix;
    else if (isDecimal)         el.textContent = current.toFixed(2) + suffix;
    else                        el.textContent = Math.round(current) + suffix;

    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function animateTimeline() {
  document.querySelectorAll('.tl-item').forEach((item, i) => {
    setTimeout(() => item.classList.add('visible'), i * 180);
  });
}

/* ═══════════════════════════════════════════════
   REVEAL.JS INITIALIZATION  (must come first)
   ═══════════════════════════════════════════════ */
Reveal.initialize({
  width: 1920,       // ← was 1280 (modern 16:9 canvas)
  height: 1080,      // ← was 720
  margin: 0.04,
  minScale: 0.2,
  maxScale: 1.0,     // ← KEY FIX: never zoom above 100%
  hash: true,
  controls: true,
  progress: true,
  center: true,
  transition: 'zoom',
  transitionSpeed: 'default',
  backgroundTransition: 'fade',
  slideNumber: 'c/t',
  keyboard: true,
  overview: true,
  touch: true,
  fragments: true,
  autoAnimateDuration: 0.5,
});

/* ═══════════════════════════════════════════════
   SLIDE CHANGE HANDLER  (no GSAP — uses Reveal)
   ═══════════════════════════════════════════════ */
Reveal.on('ready', () => {
  Reveal.layout();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      initGlobe();
    });
  });

  // ─── Inject name footer immediately (appears on every slide) ───
  const el = document.createElement('div');
  el.className = 'custom-footer';
  el.textContent = 'Adwit Tiwari  ·  250004004';
  document.querySelector('.reveal').appendChild(el);
});
let prevIdx = -1;

Reveal.on('slidechanged', (e) => {
  const idx = e.indexh;

  // ─── GLOBE: zoom in when leaving, zoom out when returning ───
  if (prevIdx === 0 && idx !== 0) zoomToIndore();
  if (prevIdx !== 0 && idx === 0) {
    // reset camera immediately, then animate out
    if (globeCamera && globeCamera.position.z < 1) {
      globeCamera.position.set(0, 0, GLOBE_DEFAULT_Z);
    }
    zoomOutFromIndore();
  }

  // ─── Globe slide: ensure it's running ───
  if (idx === 0) {
    globeRunning = true;
    initGlobe();
    setTimeout(() => {
      if (globeRenderer) {
        const c = document.getElementById('globe-container');
        if (c && c.clientWidth > 0 && c.clientHeight > 0) {
          globeRenderer.setSize(c.clientWidth, c.clientHeight);
        }
      }
    }, 200);
  } else if (prevIdx === 0) {
    // Just left slide 0 — keep globe running for zoom-out to finish
    setTimeout(() => { globeRunning = false; }, 1700);
  }

  // ─── Map slide ───
  // ─── Map slide (idx 3) ───
  if (idx === 3) {
    setTimeout(() => { init3DMap(); if (map3D) map3D.resize(); }, 250);
  } else if (map3D) {
    map3D.stop();
  }

  // ─── Charts / counters (all shifted +1 from original) ───
  if (idx === 5) setTimeout(initPopChart, 250);          // Population chart
  if (idx === 6) document.querySelectorAll('.stat-number').forEach(el => {
    if (!el.dataset.counted) { el.dataset.counted = '1'; animateCounter(el); }
  });
  if (idx === 7) setTimeout(initAgeChart, 250);          // Age donut
  if (idx === 8) setTimeout(initLitChart, 250);          // Literacy bars
  if (idx === 9) setTimeout(initWasteChart, 250);        // Waste pie
  if (idx === 10) animateTimeline();                      // Timeline items

  // Resize any Plotly charts
  setTimeout(() => {
    document.querySelectorAll('.js-plotly-plot').forEach(el => {
      try { Plotly.Plots.resize(el); } catch(e) {}
    });
  }, 350);

  prevIdx = idx;
});
/* ═══════════════════════════════════════════════
   KEYBOARD: F = fullscreen
   ═══════════════════════════════════════════════ */
document.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }
});