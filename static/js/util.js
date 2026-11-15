// Image Sonifier · util.js
// Small helpers: DOM lookup, number formatting, seeded random numbers, and the slicing,
// smoothing and statistics functions the analysis uses (they mirror the Python script).

const noteName = m => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const $ = id => document.getElementById(id);
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = (a, n) => ((a % n) + n) % n;

// Where a pointer event falls on a canvas's picture, as fractions 0..1 of its width and height.
// With `object-fit: contain` the picture is shrunk to fit and centred, so the element's box can
// include empty bands; those are left out. `inside` is false over a band or outside the picture.
function canvasPoint(el, e) {
  const r = el.getBoundingClientRect();
  let w = r.width, h = r.height;
  if (getComputedStyle(el).objectFit === 'contain' && el.width && el.height) {
    const a = el.width / el.height;
    if (w / h > a) w = h * a; else h = w / a;
  }
  const fx = (e.clientX - (r.left + (r.width - w) / 2)) / w, fy = (e.clientY - (r.top + (r.height - h) / 2)) / h;
  return { fx, fy, inside: fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1 };
}


function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function gaussian(rnd) { return Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(TAU * rnd()); }

function bounds(w, n) {
  const base = Math.floor(w / n), extra = w % n, b = [0];
  for (let i = 0; i < n; i++) b.push(b[i] + base + (i < extra ? 1 : 0));
  return b;
}
function smooth3(x) {
  const n = x.length, o = new Float64Array(n);
  for (let i = 0; i < n; i++) o[i] = 0.25 * x[Math.max(0, i - 1)] + 0.5 * x[i] + 0.25 * x[Math.min(n - 1, i + 1)];
  return o;
}
function stretch(x) {
  let lo = Infinity, hi = -Infinity; for (const v of x) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return hi - lo > 0.02 ? x.map(v => (v - lo) / (hi - lo)) : x;
}
function median(x) {
  const s = Array.from(x).sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function percentile(arr, p) {
  const s = Array.from(arr).sort((a, b) => a - b), pos = (p / 100) * (s.length - 1), lo = Math.floor(pos);
  return lo + 1 < s.length ? s[lo] + (s[lo + 1] - s[lo]) * (pos - lo) : s[lo];
}
