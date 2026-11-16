// Geosonic · analysis.js
// Measures everything the composer needs from the loaded image or video: per beat, per bar
// and per section brightness, color, detail, motion and light balance.

const meterFor = aspect => aspect >= 2.2 ? 5 : aspect < 1 / 1.15 ? 3 : 4;

// Everything the composer needs from the image or video (mirrors analyse() in the Python script)
function analyse(beatsReq) {
  const p = S.proc, { h, k } = p, video = p.kind === 'video';
  const meter = meterFor(p.aspect);
  let beats = video ? Math.floor(p.U / p.fps * S.bpm / 60) : beatsReq;   // video: as many beats as fit
  beats = Math.max(meter, beats - beats % meter);
  let U = p.U;
  if (video) U = Math.min(U, Math.round(beats * 60 / S.bpm * p.fps));     // only the frames the music covers
  const used = U;   // frames (or columns) the music actually covers
  let map = null;
  if (U < beats) { map = Array.from({ length: beats }, (_, i) => Math.floor(i * U / beats)); U = beats; }
  const unit = u => map ? map[u] : u;
  const bars = beats / meter, nSec = Math.ceil(bars / SECTION_BARS);
  const bb = bounds(U, beats), gb = bounds(U, bars), sb = [];
  for (let s = 0; s <= nSec; s++) sb.push(gb[Math.min(bars, s * SECTION_BARS)]);

  // columns each beat looks at: image = its own column; video = either a strip sweeping across the
  // frame once per section (S.videoScan 'sweep'), or the whole frame every beat ('frame')
  const sectionBeats = s => (Math.min(bars, (s + 1) * SECTION_BARS) - s * SECTION_BARS) * meter;
  const strip = (first, nb) => {
    if (!video || S.videoScan === 'frame') return [0, k];
    const s = Math.floor(first / (SECTION_BARS * meter)), j = first - s * SECTION_BARS * meter, cb = bounds(k, sectionBeats(s));
    return [cb[j], cb[j + nb]];
  };
  const beatRegions = [], barRegions = [], secRegions = [];
  for (let i = 0; i < beats; i++) beatRegions.push([bb[i], bb[i + 1], ...strip(i, 1)]);
  for (let i = 0; i < bars; i++) barRegions.push([gb[i], gb[i + 1], ...strip(i * meter, meter)]);
  for (let i = 0; i < nSec; i++) secRegions.push([sb[i], sb[i + 1], 0, k]);

  const each = ([a, z, c, d], cb) => {
    for (let u = a; u < z; u++) {
      const base = unit(u) * h, prevBase = (U > 1 ? unit(u > 0 ? u - 1 : 1) : unit(u)) * h;
      for (let y = 0; y < h; y++) for (let x = c; x < d; x++) cb((base + y) * k + x, y, (prevBase + y) * k + x);
    }
  };
  const count = ([a, z, c, d]) => (z - a) * h * (d - c);
  const per = (regions, fn) => Float64Array.from(regions, fn);
  const mean = arr => r => { let s = 0; each(r, i => { s += arr[i]; }); return s / count(r); };
  const std = arr => r => {
    let s = 0, s2 = 0; each(r, i => { s += arr[i]; s2 += arr[i] * arr[i]; });
    const n = count(r), m = s / n; return Math.sqrt(Math.max(0, s2 / n - m * m));
  };
  const centroid = r => { let s = 0, sy = 0; each(r, (i, y) => { s += p.lum[i]; sy += p.lum[i] * y / Math.max(1, h - 1); }); return s > 1e-9 ? sy / s : 0.5; };
  const hueMean = r => {
    let sx = 0, sy = 0; each(r, i => { const a = TAU * p.hue[i]; sx += p.chroma[i] * Math.cos(a); sy += p.chroma[i] * Math.sin(a); });
    return mod(Math.atan2(sy, sx) / TAU, 1);
  };
  const motion = r => { if (!video || U < 2) return 0; let s = 0; each(r, (i, y, j) => { s += Math.abs(p.lum[i] - p.lum[j]); }); return s / count(r); };
  let cm = 0; each([0, U, 0, k], i => { cm += p.chroma[i]; }); cm /= U * h * k;

  // whole-frame video changes slowly and subtly, so even small colour drifts are stretched into music
  const minRange = video && S.videoScan === 'frame' ? 0.002 : 0.02;
  const light = per(beatRegions, mean(p.lum));
  return {
    meter, beats, bars, nSec, aspect: p.aspect, bb, gb, U, used, beatRegions,
    swing: clamp((cm - 0.05) * 0.5, 0, 0.1),
    red: stretch(per(beatRegions, mean(p.r)), minRange),
    blue: per(beatRegions, mean(p.b)),
    light, restLevel: Math.min(0.04, 0.5 * median(light)),
    detail: per(beatRegions, std(p.lum)).map(v => Math.min(1, 4 * v)),
    motion: per(beatRegions, motion),
    centroid: per(beatRegions, centroid),
    green: stretch(per(barRegions, mean(p.g)), minRange),
    blueStd: per(barRegions, std(p.b)),
    secLight: per(secRegions, mean(p.lum)), secChroma: per(secRegions, mean(p.chroma)), secHue: per(secRegions, hueMean),
  };
}
