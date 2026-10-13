import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';
import { groups, ambientImageUrls } from './data.js';

/* ------------------------------------------------------------------ *
 * CONFIG
 * ------------------------------------------------------------------ */
const CFG = {
  radius: 10,
  baseScale: 0.75,        // world size of a particle on the sphere
  expandedScale: 1.25,    // world size inside the expanded cluster
  gap: 0.12,              // cluster cell gap
  clusterLift: 1.05,      // cluster sits slightly above the surface so it reads on top
  cell: 128,              // atlas cell px
  hoverPadPx: 40,         // forgiveness around the cluster before collapsing
};

const MINI_PX = 10;
const TRIGGER_MIN_HIT_PX = 13;   // hit area for triggers while tiny

function pxToWorld() {
  return (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / innerHeight;
}
function startIntro() {
  // All particles rest in their smaller form by default
}

/* ------------------------------------------------------------------ *
 * BOILERPLATE: renderer / scene / camera / controls
 * ------------------------------------------------------------------ */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 0, 30);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 18;
controls.maxDistance = 45;

/* ------------------------------------------------------------------ *
 * THEMATIC PRIMARY IMAGE COLOR PALETTES
 * ------------------------------------------------------------------ */
const GROUP_PALETTES = [
  // 0: Neon Nocturnes (electric cyan, neon magenta, amber, deep purple)
  ['#00e5ff', '#ff007f', '#ffaa00', '#7b1fa2', '#00b0ff', '#ff3d00'],
  // 1: Salt & Stone (coastal slate, mineral teal, sea salt, driftwood)
  ['#455a64', '#78909c', '#90a4ae', '#546e7a', '#37474f', '#607d8b'],
  // 2: Quiet Machines (industrial steel, titanium, warm iron)
  ['#37474f', '#546e7a', '#78909c', '#263238', '#455a64', '#607d8b'],
  // 3: Bloom Theory (saturated rose, floral magenta, botanical gold)
  ['#e91e63', '#ff4081', '#f06292', '#c2185b', '#ff80ab', '#ad1457'],
  // 4: Concrete Poems (brutalist monochrome, graphite, ash)
  ['#424242', '#616161', '#757575', '#9e9e9e', '#303030', '#505050'],
  // 5: Desert Signals (terracotta, warm sand, amber dusk)
  ['#f4511e', '#ff7043', '#d84315', '#ff8a65', '#e64a19', '#bf360c'],
  // 6: Portraits in Blue (blue hour cobalt, dusk indigo, lapis)
  ['#1565c0', '#1976d2', '#1e88e5', '#0d47a1', '#2196f3', '#002171'],
  // 7: Winter Archive (glacial cyan, alpine ice, frosty mist)
  ['#00bcd4', '#26c6da', '#4dd0e1', '#80deea', '#0097a7', '#00838f'],
  // 8: Analog Dreams (kodachrome sepia, warm amber, film leak red)
  ['#fb8c00', '#ffa726', '#f57c00', '#ffb74d', '#e65100', '#ef6c00'],
  // 9: Urban Geometry (architectural ochre, traffic yellow, charcoal)
  ['#fbc02d', '#f9a825', '#fdd835', '#f57f17', '#ffee58', '#e65100'],
  // 10: Wild Interiors (lush botanical emerald, deep forest moss)
  ['#2e7d32', '#388e3c', '#43a047', '#1b5e20', '#4caf50', '#004d40'],
  // 11: Ocean Memory (marine deep navy, aqua turquoise, seafoam)
  ['#00796b', '#00897b', '#00695c', '#004d40', '#26a69a', '#009688'],
];

const AMBIENT_PALETTE = [
  '#00e5ff', '#ff007f', '#ffaa00', '#607d8b', '#e91e63', '#9e9e9e',
  '#ff7043', '#1e88e5', '#26c6da', '#ffa726', '#fbc02d', '#43a047', '#00897b'
];

let sphereRevealed = false;

/* ------------------------------------------------------------------ *
 * DATA → flat instance list
 * Each instance: { groupIndex (-1 = ambient), isTrigger, url, home, state, color, loaded }
 * ------------------------------------------------------------------ */
const instances = [];
groups.forEach((g, gi) => {
  g.instanceIds = [];
  g.imageUrls.forEach((url, i) => {
    g.instanceIds.push(instances.length);
    if (i === g.triggerIndex) g.triggerId = instances.length;
    const p = GROUP_PALETTES[gi];
    const hex = p[i % p.length];
    instances.push({
      groupIndex: gi,
      instanceInGroup: i,
      isTrigger: i === g.triggerIndex,
      url,
      color: new THREE.Color(hex),
      loaded: 0.0,
      imageReady: false,
    });
  });
});
ambientImageUrls.forEach((url, i) => {
  const hex = AMBIENT_PALETTE[i % AMBIENT_PALETTE.length];
  instances.push({
    groupIndex: -1,
    instanceInGroup: i,
    isTrigger: false,
    url,
    color: new THREE.Color(hex),
    loaded: 0.0,
    imageReady: false,
  });
});

const COUNT = instances.length;
const GRID = Math.ceil(Math.sqrt(COUNT));

// Fibonacci spherical distribution
const fib = fibonacciSphere(COUNT, CFG.radius);
const order = [...Array(COUNT).keys()].sort(() => Math.random() - 0.5);
instances.forEach((inst, i) => {
  inst.home = fib[order[i]];
  inst.seed = Math.random();
  inst.restScale = CFG.baseScale * (inst.isTrigger ? 1.5 : 1);
  inst.state = { t: 0, scale: inst.restScale, dim: 0, focus: 0 };
  inst.target = new THREE.Vector3();

  // Precomputed organic scatter displacement for the cosmic explosion
  const norm = inst.home.clone().normalize();
  const rand = new THREE.Vector3(
    Math.sin(i * 12.9898 + 1.2),
    Math.sin(i * 78.233 + 3.4),
    Math.sin(i * 45.164 + 5.6)
  ).normalize();
  const side = new THREE.Vector3().crossVectors(norm, rand).normalize();
  const radialPush = 8.0 + inst.seed * 12.0;
  const lateralSpread = (inst.seed - 0.5) * 16.0;
  inst.scatter = norm.clone().multiplyScalar(radialPush).addScaledVector(side, lateralSpread);
});

function fibonacciSphere(n, r) {
  const pts = [], phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, rad = Math.sqrt(1 - y * y), th = phi * i;
    pts.push(new THREE.Vector3(Math.cos(th) * rad * r, y * r, Math.sin(th) * rad * r));
  }
  return pts;
}

/* ------------------------------------------------------------------ *
 * COLOR EXTRACTION: Extracts the primary dominant color of an image
 * ------------------------------------------------------------------ */
function extractPrimaryColor(img) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 24;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 24, 24);
    const data = ctx.getImageData(0, 0, 24, 24).data;

    const buckets = {};
    let totalR = 0, totalG = 0, totalB = 0, totalWeight = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 128) continue;

      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = (max + min) / 510;

      // Filter extreme pitch-black shadows (<10%) or blown-out white highlights (>92%)
      const isExtreme = lum < 0.10 || lum > 0.92;
      const weight = isExtreme ? 0.2 : (1.0 + sat * 1.8);

      const qr = Math.floor(r / 24);
      const qg = Math.floor(g / 24);
      const qb = Math.floor(b / 24);
      const key = `${qr},${qg},${qb}`;

      if (!buckets[key]) {
        buckets[key] = { r: 0, g: 0, b: 0, weight: 0 };
      }
      buckets[key].r += r * weight;
      buckets[key].g += g * weight;
      buckets[key].b += b * weight;
      buckets[key].weight += weight;

      totalR += r;
      totalG += g;
      totalB += b;
      totalWeight++;
    }

    let topBucket = null;
    let maxBucketWeight = -1;
    for (const key in buckets) {
      if (buckets[key].weight > maxBucketWeight) {
        maxBucketWeight = buckets[key].weight;
        topBucket = buckets[key];
      }
    }

    if (topBucket && topBucket.weight > 0) {
      const r = Math.round(topBucket.r / topBucket.weight);
      const g = Math.round(topBucket.g / topBucket.weight);
      const b = Math.round(topBucket.b / topBucket.weight);
      return `rgb(${r}, ${g}, ${b})`;
    }

    if (totalWeight > 0) {
      const r = Math.round(totalR / totalWeight);
      const g = Math.round(totalG / totalWeight);
      const b = Math.round(totalB / totalWeight);
      return `rgb(${r}, ${g}, ${b})`;
    }
  } catch (err) {
    // Canvas tainted or unavailable
  }
  return null;
}

function setIndicatorItemColor(groupIndex, color) {
  const container = document.getElementById('array-indicator');
  if (!container) return;
  const btn = container.querySelector(`.array-indicator__item[data-group-index="${groupIndex}"]`);
  if (btn) btn.style.setProperty('--item-color', color);
}

/* ------------------------------------------------------------------ *
 * TEXTURE ATLAS (one draw call for all images)
 * Procedural primary image colour tiles painted first.
 * ------------------------------------------------------------------ */
const atlas = document.createElement('canvas');
atlas.width = atlas.height = GRID * CFG.cell;
const actx = atlas.getContext('2d');
const atlasTex = new THREE.CanvasTexture(atlas);
atlasTex.colorSpace = THREE.SRGBColorSpace;
atlasTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

function cellXY(i) { return [(i % GRID) * CFG.cell, Math.floor(i / GRID) * CFG.cell]; }

// Fill atlas cells initially with each artwork's primary palette colour
instances.forEach((inst, i) => {
  const [x, y] = cellXY(i);
  actx.fillStyle = inst.color.getStyle();
  actx.fillRect(x, y, CFG.cell, CFG.cell);
});

let loaded = 0, dirty = false;
const pctEl = document.getElementById('loader-pct');
instances.forEach((inst, i) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const [x, y] = cellXY(i);
    actx.drawImage(img, x, y, CFG.cell, CFG.cell);
    dirty = true;
    inst.imageReady = true;

    // Extract primary color for trigger images and apply to nav indicator
    if (inst.isTrigger && inst.groupIndex >= 0) {
      const g = groups[inst.groupIndex];
      if (!g.extractedColor) {
        const extracted = extractPrimaryColor(img);
        if (extracted) {
          g.extractedColor = extracted;
          setIndicatorItemColor(inst.groupIndex, extracted);
        }
      }
    }

    progress();
    // If sphere is already showing, smoothly fade this artwork from its primary colour
    if (sphereRevealed && inst.appear > 0) {
      gsap.to(inst, {
        loaded: 1,
        duration: 0.35,
        ease: 'power2.out',
        onUpdate: () => {
          aLoaded.setX(i, inst.loaded);
          aLoaded.needsUpdate = true;
        }
      });
    }
  };
  img.onerror = progress;
  img.src = inst.url;
});

function progress() {
  loaded++;
  if (pctEl) pctEl.textContent = `${Math.round((loaded / COUNT) * 100)}%`;
}

/* ------------------------------------------------------------------ *
 * INSTANCED GEOMETRY + SHADER (camera-facing billboards)
 * ------------------------------------------------------------------ */
const geo = new THREE.InstancedBufferGeometry();
geo.copy(new THREE.PlaneGeometry(1, 1));
geo.instanceCount = COUNT;

const aOffset = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3).setUsage(THREE.DynamicDrawUsage);
const aScale  = new THREE.InstancedBufferAttribute(new Float32Array(COUNT), 1).setUsage(THREE.DynamicDrawUsage);
const aDim    = new THREE.InstancedBufferAttribute(new Float32Array(COUNT), 1).setUsage(THREE.DynamicDrawUsage);
const aFocus  = new THREE.InstancedBufferAttribute(new Float32Array(COUNT), 1).setUsage(THREE.DynamicDrawUsage);
const aCell   = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 2), 2);
const aSeed   = new THREE.InstancedBufferAttribute(new Float32Array(COUNT), 1);
const aTrig   = new THREE.InstancedBufferAttribute(new Float32Array(COUNT), 1);
const aColor  = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);
const aLoaded = new THREE.InstancedBufferAttribute(new Float32Array(COUNT), 1).setUsage(THREE.DynamicDrawUsage);
const aAppear = new THREE.InstancedBufferAttribute(new Float32Array(COUNT), 1).setUsage(THREE.DynamicDrawUsage);

instances.forEach((inst, i) => {
  inst.appear = 0.0;
  aCell.setXY(i, i % GRID, GRID - 1 - Math.floor(i / GRID)); // flipY
  aSeed.setX(i, inst.seed);
  aTrig.setX(i, inst.isTrigger ? 1 : 0);
  aColor.setXYZ(i, inst.color.r, inst.color.g, inst.color.b);
  aLoaded.setX(i, 0.0); // Initially 0: particles render their primary image colour
  aAppear.setX(i, 0.0); // Initially 0: hidden until staggered reveal
});

Object.entries({ aOffset, aScale, aDim, aFocus, aCell, aSeed, aTrig, aColor, aLoaded, aAppear })
  .forEach(([k, v]) => geo.setAttribute(k, v));

const material = new THREE.ShaderMaterial({
  uniforms: {
    uMap: { value: atlasTex }, uGrid: { value: GRID }, uTime: { value: 0 },
    uPxToWorld: { value: pxToWorld() },
    uFocusActive: { value: 0 },
  },
  vertexShader: /* glsl */`
    attribute vec3 aOffset; attribute float aScale, aDim, aFocus, aSeed, aTrig, aLoaded, aAppear; attribute vec2 aCell; attribute vec3 aColor;
    uniform float uGrid, uTime, uPxToWorld, uFocusActive;
    varying vec2 vUv, vLocal; varying float vTrig, vFocus, vLoaded, vAppear; varying vec3 vColor;
    void main() {
      vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
      // Floating ambient particles stay delicate and recede slightly when array opens
      float baseMini = mix(0.18, 0.25, aTrig);
      float miniWorld = baseMini * mix(1.0, 0.72, uFocusActive);
      // Smooth breathing animation for trigger images (default status -> grow 15% -> default -> grow 15%)
      float breatheCycle = 0.5 - 0.5 * cos(uTime * 2.4);
      float breathe = 1.0 + 0.15 * breatheCycle * aTrig * (1.0 - aFocus);
      float size = mix(miniWorld, aScale, aFocus) * breathe * aAppear;
      mv.xy += position.xy * size;
      gl_Position = projectionMatrix * mv;
      vUv = (aCell + uv) / uGrid;
      vLocal = uv; vTrig = aTrig; vFocus = aFocus; vLoaded = aLoaded; vAppear = aAppear; vColor = aColor;
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D uMap; uniform float uTime;
    varying vec2 vUv, vLocal; varying float vTrig, vFocus, vLoaded, vAppear; varying vec3 vColor;
    float rbox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.)) + min(max(q.x,q.y),0.) - r; }
    void main() {
      if (vAppear < 0.001) discard;
      vec2 p = vLocal - 0.5;
      float d = rbox(p, vec2(0.5), 0.0); // sharp square corners
      if (d > 0.0) discard;
      vec3 texCol = texture2D(uMap, vUv).rgb;
      // Smoothly blend from primary image colour to loaded photographic artwork
      vec3 col = mix(vColor, texCol, vLoaded);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
  transparent: true,
  depthWrite: true,
});

const mesh = new THREE.Mesh(geo, material);
mesh.frustumCulled = false;
mesh.visible = false; // Kept hidden until spinning key images intro finishes
scene.add(mesh);

/* ------------------------------------------------------------------ *
 * INTRO: KEY TRIGGER IMAGES SPINNING CIRCLE & SPHERE REVEAL
 * ------------------------------------------------------------------ */
let orbitTween = null;

function revealSphere() {
  if (sphereRevealed) return;
  sphereRevealed = true;
  if (orbitTween) orbitTween.kill();

  const introLoader = document.getElementById('intro-loader');
  if (introLoader) {
    introLoader.classList.add('is-hidden');
    setTimeout(() => { introLoader.style.display = 'none'; }, 950);
  }

  // Reveal the sphere in 3D
  mesh.visible = true;
  gsap.fromTo(mesh.scale, { x: 0.88, y: 0.88, z: 0.88 }, {
    x: 1, y: 1, z: 1,
    duration: 1.2,
    ease: 'power2.out'
  });
  gsap.to(rotation, {
    speed: 0.04,
    duration: 2.0,
    ease: 'power2.out'
  });

  // Random stagger: particles appear in completely randomized order across the sphere
  const shuffled = [...Array(COUNT).keys()].sort(() => Math.random() - 0.5);
  shuffled.forEach((idx, order) => {
    const inst = instances[idx];
    // Organic, randomized stagger delay across ~0.65s
    const appearDelay = (order / COUNT) * 0.65 + (Math.random() - 0.5) * 0.07;
    const d = Math.max(0, appearDelay);

    // 1. Particle blooms organically into view showing its primary image colour
    gsap.to(inst, {
      appear: 1,
      duration: 0.35,
      delay: d,
      ease: 'back.out(1.5)',
      onUpdate: () => {
        aAppear.setX(idx, inst.appear);
        aAppear.needsUpdate = true;
      }
    });

    // 2. Quick colour state detail: after only ~100ms, swiftly cross-fades into the photo
    gsap.to(inst, {
      loaded: 1,
      duration: 0.32,
      delay: d + 0.10,
      ease: 'power2.out',
      onUpdate: () => {
        aLoaded.setX(idx, inst.loaded);
        aLoaded.needsUpdate = true;
      }
    });
  });
}

function initIntroLoader() {
  const introLoader = document.getElementById('intro-loader');
  const introRing = document.getElementById('intro-ring');
  const introStatus = document.getElementById('intro-status');
  if (!introLoader || !introRing) {
    revealSphere();
    return;
  }

  const ringRadius = 175;
  const keyItems = [];

  // Position key trigger images around the circular ring (upright, 0° angle)
  groups.forEach((g, gi) => {
    const baseAngle = (gi / groups.length) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(baseAngle) * ringRadius;
    const y = Math.sin(baseAngle) * ringRadius;

    const item = document.createElement('div');
    item.className = 'intro-loader__item';
    item.style.left = `calc(50% + ${x}px)`;
    item.style.top = `calc(50% + ${y}px)`;

    const img = document.createElement('img');
    img.alt = g.title;

    item.appendChild(img);
    introRing.appendChild(item);

    gsap.set(item, { scale: 0.2, opacity: 0 });
    keyItems.push({ item, img, g, gi, baseAngle });
  });

  // Orbit image positions around the circle without rotating their angle
  const orbitState = { angle: 0 };
  orbitTween = gsap.to(orbitState, {
    angle: Math.PI * 2,
    duration: 26,
    repeat: -1,
    ease: 'none',
    onUpdate: () => {
      for (let j = 0; j < keyItems.length; j++) {
        const kt = keyItems[j];
        const a = kt.baseAngle + orbitState.angle;
        const x = Math.cos(a) * ringRadius;
        const y = Math.sin(a) * ringRadius;
        kt.item.style.left = `calc(50% + ${x}px)`;
        kt.item.style.top = `calc(50% + ${y}px)`;
      }
    }
  });

  // Natural staggered loading of the 12 key trigger images one by one
  let loadedCount = 0;
  keyItems.forEach((kt, i) => {
    kt.img.crossOrigin = 'anonymous';
    const onDone = () => {
      loadedCount++;
      // Extract real primary color directly from photographic trigger artwork
      const extracted = extractPrimaryColor(kt.img);
      if (extracted) {
        kt.g.extractedColor = extracted;
        setIndicatorItemColor(kt.gi, extracted);
      }
      // Natural slight delay between image reveals
      gsap.to(kt.item, {
        opacity: 1,
        scale: 1,
        duration: 0.75,
        delay: i * 0.16,
        ease: 'back.out(1.4)',
        onStart: () => {
          if (introStatus) introStatus.textContent = `${kt.g.title}`;
        },
      });

      if (loadedCount === groups.length) {
        // Once all 12 key images are loaded and their staggered ring animation plays
        const totalDelay = groups.length * 0.16 + 0.85;
        gsap.delayedCall(totalDelay, revealSphere);
      }
    };

    kt.img.onload = onDone;
    kt.img.onerror = onDone;
    kt.img.src = kt.g.imageUrls[kt.g.triggerIndex];
  });
}

// Start intro loader immediately
initIntroLoader();

/* ------------------------------------------------------------------ *
 * ARRAY NAVIGATION INDICATOR (Bottom Right)
 * ------------------------------------------------------------------ */
let lastNavHoverTime = 0;

function initArrayIndicator() {
  const container = document.getElementById('array-indicator');
  if (!container) return;
  container.innerHTML = '';

  groups.forEach((g, gi) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'array-indicator__item';
    btn.setAttribute('aria-label', `Series ${String(gi + 1).padStart(2, '0')}: ${g.title}`);
    btn.dataset.groupIndex = String(gi);

    // Color extracted dynamically from photographic trigger image (neutral fallback before load)
    const dominantColor = g.extractedColor || 'rgba(255, 255, 255, 0.45)';
    btn.style.setProperty('--item-color', dominantColor);

    const tooltip = document.createElement('span');
    tooltip.className = 'array-indicator__tooltip';
    tooltip.textContent = `${String(gi + 1).padStart(2, '0')} · ${g.title}`;
    btn.appendChild(tooltip);

    btn.addEventListener('mouseenter', () => {
      lastNavHoverTime = performance.now();
      if (activeGroup !== gi) {
        expandGroup(gi);
      }
      updateIndicatorActive(gi);
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openGallery(gi, 0);
    });

    container.appendChild(btn);
  });
}

function updateIndicatorActive(activeIdx) {
  const container = document.getElementById('array-indicator');
  if (!container) return;
  const items = container.querySelectorAll('.array-indicator__item');
  items.forEach((item, i) => {
    item.classList.toggle('is-active', i === activeIdx);
  });
}

initArrayIndicator();

/* ------------------------------------------------------------------ *
 * INTERACTION STATE
 * ------------------------------------------------------------------ */
const pointer = new THREE.Vector2(-9999, -9999); // px
let activeGroup = null;     // index of expanded group
let galleryAnchorNdc = new THREE.Vector2();
const rotation = { speed: 0.04 };
const labelEl = document.getElementById('group-label');

let isPointerDown = false;
const sphereShift = { t: 0 };
let isShifting = false;
let hasEnteredCluster = false;
const triggerScreenOrigin = new THREE.Vector2();

/* ------------------------------------------------------------------ *
 * IDLE COSMIC EVENT (Implosion -> Explosion -> Return to Sphere)
 * Triggers once per inactive minute
 * ------------------------------------------------------------------ */
const IDLE_TIMEOUT_MS = 60000; // 60s of inactivity
let lastInteractionTime = performance.now();
let idleTimeline = null;

const idleAnim = {
  rScale: 1.0,      // 1.0 = normal sphere, 0.12 = imploded core, 2.5+ = explosion
  scatter: 0.0,     // 0.0 = on-sphere, 1.0 = scattered everywhere across the screen
  scaleFactor: 1.0, // billboard size multiplier
  twist: 0.0,       // vortex swirl angle
};
const idleSwirlAxis = new THREE.Vector3(0, 1, 0);

function triggerIdleImplosion() {
  if (!sphereRevealed || isGalleryOpen || activeGroup !== null || isPointerDown) return;

  // Randomize swirl axis and dynamic parameters for each occurrence
  idleSwirlAxis.set(
    (Math.random() - 0.5) * 0.6,
    Math.random() > 0.5 ? 1 : -1,
    (Math.random() - 0.5) * 0.6
  ).normalize();

  const minRadius = 0.10 + Math.random() * 0.04;   // collapses down to 10% - 14% of radius
  const maxExplosion = 2.4 + Math.random() * 0.4;  // bursts out to 2.4x - 2.8x radius (fills screen)
  const maxTwist = (0.7 + Math.random() * 0.5) * (Math.random() > 0.5 ? 1 : -1);

  if (idleTimeline) idleTimeline.kill();
  idleTimeline = gsap.timeline({
    onComplete: () => {
      idleTimeline = null;
      idleAnim.rScale = 1.0;
      idleAnim.scatter = 0.0;
      idleAnim.scaleFactor = 1.0;
      idleAnim.twist = 0.0;
      rotation.speed = 0.04;
    }
  });

  // Phase 1: Inward gravitational collapse (implosion) into dense vortex singularity
  idleTimeline.to(rotation, { speed: 0.16, duration: 1.15, ease: 'power2.in' }, 0);
  idleTimeline.to(idleAnim, {
    rScale: minRadius,
    scatter: 0.0,
    scaleFactor: 0.38,
    twist: maxTwist,
    duration: 1.15,
    ease: 'power2.in',
  }, 0);

  // Phase 2: Supernova Detonation - Immediate explosive burst across the screen!
  // Uses power3.out for high initial blast velocity that naturally decelerates to zero velocity at peak apex
  idleTimeline.to(rotation, { speed: 0.018, duration: 1.35, ease: 'power3.out' });
  idleTimeline.to(idleAnim, {
    rScale: maxExplosion,
    scatter: 1.0,
    scaleFactor: 1.28,
    twist: -maxTwist * 0.25,
    duration: 1.35,
    ease: 'power3.out',
  }, '<');

  // Phase 3: Seamless Gravitational Infall - Smoothly flows back into the Fibonacci sphere
  // Connects directly at the zero-velocity apex with sine.inOut (continuous harmonic curve) with zero hitch or clunkiness
  idleTimeline.to(rotation, { speed: 0.04, duration: 1.80, ease: 'sine.inOut' });
  idleTimeline.to(idleAnim, {
    rScale: 1.0,
    scatter: 0.0,
    scaleFactor: 1.0,
    twist: 0.0,
    duration: 1.80,
    ease: 'sine.inOut',
  }, '<');
}

function interruptIdleAnimation() {
  if (idleTimeline) {
    idleTimeline.kill();
    idleTimeline = null;
    gsap.to(idleAnim, {
      rScale: 1.0,
      scatter: 0.0,
      scaleFactor: 1.0,
      twist: 0.0,
      duration: 0.5,
      ease: 'power2.out',
    });
    gsap.to(rotation, { speed: 0.04, duration: 0.5, ease: 'power2.out' });
  }
}

function onUserActivity() {
  lastInteractionTime = performance.now();
  interruptIdleAnimation();
}

/* ------------------------------------------------------------------ *
 * GALLERY MODAL / OVERLAY
 * ------------------------------------------------------------------ */
const modalEl = document.getElementById('gallery-modal');
const modalBackdrop = document.getElementById('gallery-backdrop');
const modalClose = document.getElementById('gallery-close');
const modalTitle = document.getElementById('gallery-title');
const modalCounter = document.getElementById('gallery-counter');
const modalImage = document.getElementById('gallery-image');
const modalPrev = document.getElementById('gallery-prev');
const modalNext = document.getElementById('gallery-next');
const modalStrip = document.getElementById('gallery-strip');

let isGalleryOpen = false;
let galleryCurrentGroup = null;
let galleryCurrentIndex = 0;

function openGallery(groupIndex, imageIndex = 0) {
  onUserActivity();
  isGalleryOpen = true;
  galleryCurrentGroup = groupIndex;
  galleryCurrentIndex = imageIndex;
  const g = groups[groupIndex];
  modalTitle.textContent = g.title;
  controls.enabled = false;

  modalStrip.innerHTML = '';
  g.imageUrls.forEach((url, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `gallery-modal__thumb ${idx === imageIndex ? 'is-active' : ''}`;
    btn.setAttribute('aria-label', `View image ${idx + 1}`);
    const thumbImg = document.createElement('img');
    thumbImg.src = url;
    thumbImg.alt = `${g.title} thumbnail ${idx + 1}`;
    btn.appendChild(thumbImg);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showGalleryImage(idx);
    });
    modalStrip.appendChild(btn);
  });

  showGalleryImage(imageIndex);
  modalEl.classList.add('is-open');
  modalEl.setAttribute('aria-hidden', 'false');
}

function showGalleryImage(index) {
  if (galleryCurrentGroup === null) return;
  const g = groups[galleryCurrentGroup];
  galleryCurrentIndex = (index + g.imageUrls.length) % g.imageUrls.length;
  modalCounter.textContent = `${galleryCurrentIndex + 1} of ${g.imageUrls.length}`;
  const highResUrl = g.imageUrls[galleryCurrentIndex].replace('/128/128', '/800/800');

  modalImage.style.opacity = '0';
  modalImage.style.transform = 'scale(0.97)';
  const img = new Image();
  img.onload = () => {
    modalImage.src = highResUrl;
    modalImage.style.opacity = '1';
    modalImage.style.transform = 'scale(1)';
  };
  img.src = highResUrl;

  Array.from(modalStrip.children).forEach((thumb, i) => {
    thumb.classList.toggle('is-active', i === galleryCurrentIndex);
    if (i === galleryCurrentIndex) {
      thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });
}

function closeGallery() {
  if (!isGalleryOpen) return;
  isGalleryOpen = false;
  modalEl.classList.remove('is-open');
  modalEl.setAttribute('aria-hidden', 'true');
  controls.enabled = true;
}

modalClose.addEventListener('click', closeGallery);
modalBackdrop.addEventListener('click', closeGallery);
modalPrev.addEventListener('click', () => showGalleryImage(galleryCurrentIndex - 1));
modalNext.addEventListener('click', () => showGalleryImage(galleryCurrentIndex + 1));
labelEl.style.cursor = 'pointer';
labelEl.addEventListener('click', () => {
  if (activeGroup !== null) openGallery(activeGroup, 0);
});

let pointerDownPos = new THREE.Vector2();
let pointerDownTime = 0;

addEventListener('pointerdown', (e) => {
  onUserActivity();
  isPointerDown = true;
  pointerDownPos.set(e.clientX, e.clientY);
  pointerDownTime = performance.now();
});

addEventListener('pointerup', (e) => {
  onUserActivity();
  isPointerDown = false;
  if (isGalleryOpen) return;
  const dist = pointerDownPos.distanceTo(new THREE.Vector2(e.clientX, e.clientY));
  const elapsed = performance.now() - pointerDownTime;
  // Clean click (not a drag or camera orbit)
  if (dist < 8 && elapsed < 450) {
    if (activeGroup !== null) {
      const hit = raycast((i) => instances[i].groupIndex === activeGroup);
      if (hit >= 0) {
        const g = groups[activeGroup];
        const indexInGroup = g.instanceIds.indexOf(hit);
        openGallery(activeGroup, Math.max(0, indexInGroup));
      }
    }
  }
});

addEventListener('pointermove', (e) => {
  onUserActivity();
  pointer.set(e.clientX, e.clientY);
});
addEventListener('pointerleave', () => pointer.set(-9999, -9999));
addEventListener('wheel', onUserActivity, { passive: true });
addEventListener('touchstart', onUserActivity, { passive: true });
addEventListener('touchmove', onUserActivity, { passive: true });
addEventListener('keydown', (e) => {
  onUserActivity();
  if (isGalleryOpen) {
    if (e.key === 'Escape') closeGallery();
    else if (e.key === 'ArrowLeft') showGalleryImage(galleryCurrentIndex - 1);
    else if (e.key === 'ArrowRight') showGalleryImage(galleryCurrentIndex + 1);
    return;
  }
  if (e.key === 'Escape' && activeGroup !== null) collapseGroup();
});

/* ------------------------------------------------------------------ *
 * RAYCASTING (screen-space, billboard-accurate)
 * Standard Raycaster vs InstancedMesh tests the un-billboarded quad; since
 * our quads always face the camera, projecting centres + size to pixels is
 * both exact and cheaper.
 * ------------------------------------------------------------------ */
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const projected = new Float32Array(COUNT * 4); // x, y, halfSizePx, depth

function projectInstances(time = 0) {
  const fh = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const breatheCycle = 0.5 - 0.5 * Math.cos(time * 2.4);
  const triggerBreathe = 1.0 + 0.15 * breatheCycle;
  for (let i = 0; i < COUNT; i++) {
    _w.fromArray(aOffset.array, i * 3).applyMatrix4(mesh.matrixWorld);
    const depth = _v.copy(_w).applyMatrix4(camera.matrixWorldInverse).z * -1;
    _w.project(camera);
    projected[i * 4]     = (_w.x * 0.5 + 0.5) * innerWidth;
    projected[i * 4 + 1] = (-_w.y * 0.5 + 0.5) * innerHeight;
    // World size projects to pixels proportionally to depth and zoom
    const isTrig = instances[i].isTrigger;
    const miniWorld = isTrig ? 0.42 * triggerBreathe : 0.28;
    const miniHalf = (miniWorld * 0.5 * fh) / Math.max(depth, 0.01);
    const fullHalf = (aScale.array[i] * 0.5 * fh) / Math.max(depth, 0.01);
    let half = THREE.MathUtils.lerp(miniHalf, fullHalf, aFocus.array[i]);
    if (isTrig && aFocus.array[i] < 0.5) half = Math.max(half, TRIGGER_MIN_HIT_PX * triggerBreathe); // keep triggers easy to hover
    projected[i * 4 + 2] = half;
    projected[i * 4 + 3] = depth;
  }
}

/** Returns the closest instance id under the pointer matching `filter`, or -1. */
function raycast(filter) {
  let best = -1, bestDepth = Infinity;
  for (let i = 0; i < COUNT; i++) {
    if (!filter(i)) continue;
    const o = i * 4, h = projected[o + 2];
    if (Math.abs(pointer.x - projected[o]) < h && Math.abs(pointer.y - projected[o + 1]) < h
        && projected[o + 3] < bestDepth) { best = i; bestDepth = projected[o + 3]; }
  }
  // Occlusion: only accept if nothing nearer (non-filtered) covers it
  if (best >= 0) {
    for (let i = 0; i < COUNT; i++) {
      const o = i * 4, h = projected[o + 2];
      if (projected[o + 3] < bestDepth - 0.5 && Math.abs(pointer.x - projected[o]) < h
          && Math.abs(pointer.y - projected[o + 1]) < h && !filter(i)) return -1;
    }
  }
  return best;
}

/** Determines if the group should stay open during and after the sphere shift. */
function shouldKeepGroupOpen(gi) {
  if (isGalleryOpen) return true;
  if (pointer.x < 0 || pointer.y < 0) return false;

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of groups[gi].instanceIds) {
    const o = id * 4, h = projected[o + 2];
    x0 = Math.min(x0, projected[o] - h);
    x1 = Math.max(x1, projected[o] + h);
    y0 = Math.min(y0, projected[o + 1] - h);
    y1 = Math.max(y1, projected[o + 1] + h);
  }
  const p = CFG.hoverPadPx;
  const inCluster = pointer.x > x0 - p && pointer.x < x1 + p && pointer.y > y0 - p && pointer.y < y1 + p;

  let inLabel = false;
  if (labelEl && +labelEl.style.opacity > 0) {
    const r = labelEl.getBoundingClientRect();
    inLabel = pointer.x >= r.left - p && pointer.x <= r.right + p && pointer.y >= r.top - p && pointer.y <= r.bottom + p;
  }

  let inNav = false;
  const navEl = document.getElementById('array-indicator');
  if (navEl) {
    const r = navEl.getBoundingClientRect();
    inNav = pointer.x >= r.left - p && pointer.x <= r.right + p && pointer.y >= r.top - p && pointer.y <= r.bottom + p;
  }

  if (inCluster || inLabel) {
    hasEnteredCluster = true;
    return true;
  }

  if (inNav) {
    return true;
  }

  // Grace transit period if user hovered from the indicator to reach the cluster
  if (performance.now() - lastNavHoverTime < 1500) {
    return true;
  }

  // Once user has entered the cluster, leaving it collapses
  if (hasEnteredCluster) {
    return false;
  }

  // Grace period while the sphere is naturally shifting to center
  if (isShifting) {
    return true;
  }

  // User is still resting near the trigger's initial screen position
  const dist = pointer.distanceTo(triggerScreenOrigin);
  if (dist < 80) {
    return true;
  }

  return false;
}

function handleHover() {
  if (isGalleryOpen) return;
  if (isPointerDown) return; // don't open if user is dragging/orbiting
  if (activeGroup === null) {
    const hit = raycast((i) => instances[i].isTrigger);
    canvas.style.cursor = hit >= 0 ? 'pointer' : 'grab';
    if (hit >= 0) expandGroup(instances[hit].groupIndex);
  } else {
    // When array is expanded, hovering any image in that group shows pointer cursor
    const hitGroupItem = raycast((i) => instances[i].groupIndex === activeGroup);
    canvas.style.cursor = hitGroupItem >= 0 ? 'pointer' : 'default';
    if (!shouldKeepGroupOpen(activeGroup)) {
      collapseGroup();
    }
  }
}

/* ------------------------------------------------------------------ *
 * ON-SPHERE CLUSTER LAYOUT
 * The group forms a curved grid "patch" on the sphere surface, centred on
 * the trigger's direction. Targets live in mesh-local space, so the patch
 * is part of the sphere and moves with it.
 * ------------------------------------------------------------------ */
const _n = new THREE.Vector3(), _tr = new THREE.Vector3(), _tu = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function getZoomFitFactors() {
  const camDist = camera.position.length();
  const clusterR = CFG.radius * CFG.clusterLift; // 10.5
  const baseDistToCluster = 30.0 - clusterR; // 19.5 at default cam distance 30
  const currDistToCluster = Math.max(2.5, camDist - clusterR);

  // Depth ratio: 1.0 at default distance 30; shrinks as camera moves closer
  const depthFactor = currDistToCluster / baseDistToCluster;

  // Account for screen aspect ratio
  const aspect = innerWidth / innerHeight;
  const aspectFactor = aspect < 1.15 ? Math.max(0.72, aspect / 1.15) : 1.0;

  // Scale both spread and image sizes proportionally so images never collapse into each other
  const baseFit = THREE.MathUtils.clamp(depthFactor * aspectFactor, 0.60, 1.12);
  const spreadFit = baseFit;
  const scaleFit = THREE.MathUtils.clamp(baseFit * 1.02, 0.68, 1.10);

  return { spreadFit, scaleFit };
}

function computeSlots(gi) {
  const g = groups[gi], ids = g.instanceIds;
  const baseR = CFG.radius * CFG.clusterLift;
  const { spreadFit, scaleFit } = getZoomFitFactors();

  // Tangent frame at the trigger: right = horizontal, up = towards the pole.
  _n.copy(instances[g.triggerId].home).normalize();
  _tr.crossVectors(WORLD_UP, _n);
  if (_tr.lengthSq() < 1e-4) _tr.set(1, 0, 0);
  _tr.normalize();
  _tu.crossVectors(_n, _tr).normalize();

  // Separate the hovered key trigger (central hero) from supporting references
  const trigId = g.triggerId;
  const others = ids.filter((id) => id !== trigId);

  // 1. Center Hero: commanding focal point, slightly lifted for crisp layered elevation
  const heroR = baseR + 0.18;
  instances[trigId].clusterScale = Math.max(1.70, 2.25 * scaleFit);
  instances[trigId].target.copy(_n).multiplyScalar(heroR);

  // Partition the 17 companion images into 3 balanced concentric organic tiers (5 + 6 + 6)
  const tier1Ids = others.slice(0, 5);
  const tier2Ids = others.slice(5, 11);
  const tier3Ids = others.slice(11);

  const placeTier = (tierIds, baseRad, baseScale, tierLift, angleOffset, angleJitter, radJitter) => {
    const count = tierIds.length;
    const tierR = baseR + tierLift;
    tierIds.forEach((id, i) => {
      const inst = instances[id];
      inst.clusterScale = baseScale;
      // Staggered base angle with gentle organic jitter
      const angle = ((i + angleOffset) / count) * Math.PI * 2 + (inst.seed - 0.5) * angleJitter;
      const rad = baseRad * (1.0 + (inst.seed - 0.5) * radJitter);
      const ax = (Math.cos(angle) * rad) / tierR;
      const ay = (Math.sin(angle) * rad) / tierR;
      inst.target.copy(_n).multiplyScalar(Math.cos(ax) * Math.cos(ay))
        .addScaledVector(_tr, Math.sin(ax) * Math.cos(ay))
        .addScaledVector(_tu, Math.sin(ay))
        .normalize().multiplyScalar(tierR);
    });
  };

  // 2. Tier 1 (5 items): inner companions framing hero with subtle ~10-14% corner overlap
  const r1 = 2.10 * spreadFit;
  const s1 = Math.max(1.02, 1.25 * scaleFit);
  placeTier(tier1Ids, r1, s1, 0.12, 0.0, 0.16, 0.10);

  // 3. Tier 2 (6 items): middle tier interleaved in angular gaps of Tier 1
  const r2 = 3.38 * spreadFit;
  const s2 = Math.max(0.80, 0.98 * scaleFit);
  placeTier(tier2Ids, r2, s2, 0.06, 0.5, 0.16, 0.10);

  // 4. Tier 3 (6 items): outer periphery framing the cluster with clear visibility
  const r3 = 4.55 * spreadFit;
  const s3 = Math.max(0.66, 0.82 * scaleFit);
  placeTier(tier3Ids, r3, s3, 0.0, 0.25, 0.16, 0.10);
}

/** Computes the target mesh quaternion so the trigger and cluster face directly towards the camera, level and upright. */
function getTargetOrientation(gi) {
  const g = groups[gi];
  const triggerHome = instances[g.triggerId].home;

  // Local tangent frame at the trigger (matches computeSlots)
  const normLocal = triggerHome.clone().normalize();
  let rightLocal = new THREE.Vector3().crossVectors(WORLD_UP, normLocal);
  if (rightLocal.lengthSq() < 1e-4) rightLocal.set(1, 0, 0);
  rightLocal.normalize();
  const upLocal = new THREE.Vector3().crossVectors(normLocal, rightLocal).normalize();

  // Desired world frame facing the camera
  const dirToCam = camera.position.clone().sub(mesh.position).normalize();
  const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

  let upWorld = camUp.clone().projectOnPlane(dirToCam);
  if (upWorld.lengthSq() < 1e-4) upWorld.copy(WORLD_UP).projectOnPlane(dirToCam);
  if (upWorld.lengthSq() < 1e-4) upWorld.set(0, 0, 1).projectOnPlane(dirToCam);
  upWorld.normalize();

  const rightWorld = new THREE.Vector3().crossVectors(upWorld, dirToCam).normalize();

  const mLocal = new THREE.Matrix4().makeBasis(rightLocal, upLocal, normLocal);
  const mWorld = new THREE.Matrix4().makeBasis(rightWorld, upWorld, dirToCam);

  // M_mesh = M_world * M_local^T
  const mMesh = mWorld.clone().multiply(mLocal.clone().transpose());
  return new THREE.Quaternion().setFromRotationMatrix(mMesh);
}

const _inv = new THREE.Matrix4();

/* ------------------------------------------------------------------ *
 * GSAP: EXPAND / COLLAPSE
 * ------------------------------------------------------------------ */
function expandGroup(gi) {
  onUserActivity();
  activeGroup = gi;
  const g = groups[gi];
  computeSlots(gi);

  isShifting = true;
  hasEnteredCluster = false;
  triggerScreenOrigin.copy(pointer);

  const startQuat = mesh.quaternion.clone();
  const targetQuat = getTargetOrientation(gi);

  gsap.killTweensOf(rotation);
  gsap.to(rotation, { speed: 0, duration: 0.6, ease: 'power2.out' });
  controls.enableRotate = false;

  // Naturally shift the entire sphere so the array opens in its center facing the viewer
  gsap.killTweensOf(sphereShift);
  sphereShift.t = 0;
  gsap.to(sphereShift, {
    t: 1,
    duration: 1.15,
    ease: 'power3.out',
    onUpdate: () => {
      mesh.quaternion.copy(startQuat).slerp(targetQuat, sphereShift.t);
    },
    onComplete: () => {
      isShifting = false;
    },
  });

  // Focus active state for clear hierarchy between cluster and background particles
  gsap.killTweensOf(material.uniforms.uFocusActive);
  gsap.to(material.uniforms.uFocusActive, { value: 1.0, duration: 0.8, ease: 'power2.out' });
  document.body.classList.add('focus');

  instances.forEach((inst, i) => {
    gsap.killTweensOf(inst.state);
    if (inst.groupIndex === gi) {
      const k = g.instanceIds.indexOf(i);
      const targetScale = inst.clusterScale || CFG.expandedScale;
      gsap.to(inst.state, {
        t: 1, scale: targetScale, dim: 0, focus: 1,
        duration: 1.15, ease: 'expo.out', delay: k * 0.016,
      });
    } else {
      gsap.to(inst.state, { t: 0, scale: inst.restScale, dim: 0, focus: 0, duration: 0.8, ease: 'power2.out' });
    }
  });

  document.getElementById('label-title').textContent = g.title;
  document.getElementById('label-desc').textContent = g.description;
  document.getElementById('label-count').textContent = `${g.imageUrls.length} works · Series ${String(gi + 1).padStart(2, '0')}`;
  gsap.killTweensOf(labelEl);
  gsap.fromTo(labelEl, { opacity: 0, y: 16 }, {
    opacity: 1, y: 0, duration: 0.7, delay: 0.25, ease: 'power3.out',
    onStart: () => { labelEl.style.pointerEvents = 'auto'; }
  });
  updateIndicatorActive(gi);
}

function collapseGroup() {
  onUserActivity();
  if (activeGroup === null) return;
  const gi = activeGroup;
  activeGroup = null;
  isShifting = false;
  hasEnteredCluster = false;
  lastNavHoverTime = 0;
  updateIndicatorActive(-1);
  gsap.killTweensOf(sphereShift);
  const ids = groups[gi].instanceIds;

  instances.forEach((inst, i) => {
    gsap.killTweensOf(inst.state);
    const k = inst.groupIndex === gi ? ids.length - ids.indexOf(i) : 0;
    gsap.to(inst.state, {
      t: 0, scale: inst.restScale, dim: 0, focus: 0,
      duration: inst.groupIndex === gi ? 1.0 : 0.7, ease: 'power3.inOut', delay: k * 0.012,
    });
  });
  gsap.to(rotation, { speed: 0.04, duration: 1.5, ease: 'power2.in' });
  controls.enableRotate = true;
  document.body.classList.remove('focus');
  gsap.killTweensOf(material.uniforms.uFocusActive);
  gsap.to(material.uniforms.uFocusActive, { value: 0.0, duration: 0.8, ease: 'power2.inOut' });
  gsap.killTweensOf(labelEl);
  gsap.to(labelEl, {
    opacity: 0, y: 10, duration: 0.35, ease: 'power2.in',
    onComplete: () => { labelEl.style.pointerEvents = 'none'; }
  });
}

/* ------------------------------------------------------------------ *
 * PER-FRAME UPDATE: blend sphere home (+drift) ↔ gallery slot
 * ------------------------------------------------------------------ */
const _home = new THREE.Vector3();

function updateInstances(time) {
  mesh.updateMatrixWorld();
  const isIdleActive = idleAnim.rScale !== 1.0 || idleAnim.scatter !== 0.0 || idleAnim.twist !== 0.0 || idleAnim.scaleFactor !== 1.0;

  for (let i = 0; i < COUNT; i++) {
    const inst = instances[i], s = inst.state, sd = inst.seed * 100;
    // Ambient drift: small Lissajous wobble around the home position
    _home.copy(inst.home).addScaledVector(inst.home, 0.025 * Math.sin(time * 0.6 + sd));
    _home.x += 0.15 * Math.sin(time * 0.35 + sd);
    _home.y += 0.15 * Math.cos(time * 0.4 + sd * 1.3);

    // Idle implosion -> explosion everywhere in screen -> return to sphere
    if (isIdleActive && s.focus < 0.5) {
      const seed = inst.seed;
      // Per-particle organic inertia: lighter particles travel slightly further and have varied momentum,
      // creating natural depth and a layered return cascade instead of a rigid shell.
      const inertia = 0.84 + seed * 0.32; // 0.84 to 1.16

      const effRadius = idleAnim.rScale > 1.0
        ? 1.0 + (idleAnim.rScale - 1.0) * inertia
        : Math.pow(idleAnim.rScale, 0.90 + seed * 0.20);

      const effScatter = idleAnim.scatter * (0.85 + ((seed * 43.17) % 1) * 0.30);

      _home.multiplyScalar(effRadius).addScaledVector(inst.scatter, effScatter);

      if (idleAnim.twist !== 0) {
        _home.applyAxisAngle(idleSwirlAxis, idleAnim.twist * (0.85 + seed * 0.30));
      }
    }

    if (s.t > 0.0001) {
      // Slerp-like path: lerp then re-project to the sphere so images glide
      // across the surface instead of cutting through the interior.
      const len = THREE.MathUtils.lerp(_home.length(), inst.target.length(), s.t);
      _home.lerp(inst.target, s.t).setLength(len);
    }
    aOffset.setXYZ(i, _home.x, _home.y, _home.z);

    let idleScale = 1.0;
    if (idleAnim.scaleFactor !== 1.0 && s.focus < 0.5) {
      idleScale = 1.0 + (idleAnim.scaleFactor - 1.0) * (0.85 + inst.seed * 0.30);
    }
    const particleScale = s.scale * idleScale;
    aScale.setX(i, particleScale);
    aDim.setX(i, s.dim);
    aFocus.setX(i, s.focus);
  }
  aOffset.needsUpdate = aScale.needsUpdate = aDim.needsUpdate = aFocus.needsUpdate = true;
}

/* ------------------------------------------------------------------ *
 * LOOP
 * ------------------------------------------------------------------ */
const clock = new THREE.Clock();
let prevCamDist = 30;

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta(), time = clock.elapsedTime;
  const now = performance.now();

  // Inactive minute animation trigger: runs once every inactive minute
  if (now - lastInteractionTime >= IDLE_TIMEOUT_MS) {
    lastInteractionTime = now;
    triggerIdleImplosion();
  }

  if (rotation.speed > 0 && !isShifting && activeGroup === null) {
    const deltaQ = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, rotation.speed * dt);
    mesh.quaternion.premultiply(deltaQ);
  }
  controls.update();
  camera.updateMatrixWorld();

  // If user scrolls / zooms while an array is open, dynamically adapt its layout to fit
  const curCamDist = camera.position.length();
  if (activeGroup !== null && Math.abs(curCamDist - prevCamDist) > 0.04) {
    prevCamDist = curCamDist;
    computeSlots(activeGroup);
    const ids = groups[activeGroup].instanceIds;
    ids.forEach((id) => {
      const inst = instances[id];
      if (inst.state.focus > 0.4) {
        gsap.to(inst.state, { scale: inst.clusterScale, duration: 0.18, ease: 'power2.out' });
      }
    });
  } else {
    prevCamDist = curCamDist;
  }

  material.uniforms.uTime.value = time;
  if (dirty) { atlasTex.needsUpdate = true; dirty = false; }

  updateInstances(time);
  projectInstances(time);
  handleHover();
  renderer.render(scene, camera);
});

window.__au = { projected, groups, triggerIdleImplosion }; // debug hook

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  material.uniforms.uPxToWorld.value = pxToWorld();
  renderer.setSize(innerWidth, innerHeight);
  if (activeGroup !== null) {
    computeSlots(activeGroup);
    groups[activeGroup].instanceIds.forEach((id) => {
      const inst = instances[id];
      if (inst.state.focus > 0.4) inst.state.scale = inst.clusterScale;
    });
  }
});
