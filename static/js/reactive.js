// Hearing Earth · reactive.js
// Spotlight mode: with "Follow cursor" on, only the circle under the cursor is heard. The slices
// of the scan play no part: every beat, a small live composer measures the pixels inside the circle
// and turns them into music with the same mapping as the scan (red melody, green chords, blue
// arpeggio, light mode, sparkles and rests, hue key, detail busyness). Continuity comes from time:
// the melody steps from its last note, chords change on bar lines and the key only moves when the
// colours stay changed for a while. Scrolling over the image changes the size of the circle.

const SPOT = { radius: 0.16, min: 0.04, max: 0.5 };   // circle radius as a fraction of image height
const SUSTAIN_BARS = 2;     // long notes (pad, bass, drone, texture) last this long unless the chord changes
const KEY_BARS = 2;         // a new key or mode must hold this many bar lines before the music moves to it
const LOOKAHEAD = 0.3;      // each beat is measured and rendered this long before it sounds
const WANDER = [0, 1, 2, 1, 0, -1, 0, 1];   // scale steps around red's pitch, so a still spotlight sings a phrase

const R = {
  on: false, hover: false, focus: null, timer: null, nextAt: 0,
  st: null, ref: null, show: null,
  beatClip: null, sustClip: null, sustKey: '', sustAt: -1e9,
  cache: new Map(),   // rendered long notes, keyed by their notes and instruments (they are slow to render)
};

const reactiveAllowed = () => !!(S.proc && S.proc.kind === 'image' && S.music && S.stems);

// ---------------------------------------------------------- measuring the circle
// Everything inside the circle centred on (fx, fy). Distances are in image heights, so the
// circle stays round on any shape of image.
function measure(fx, fy, radius = SPOT.radius) {
  const p = S.proc, U = p.U, h = p.h, r2 = radius * radius, rx = radius / p.aspect;
  let n = 0, sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0, sb2 = 0, sc = 0, hx = 0, hy = 0;
  const add = i => {
    const R_ = p.r[i], G = p.g[i], B = p.b[i], L = p.lum[i], C = p.chroma[i], a = TAU * p.hue[i];
    n++; sr += R_; sg += G; sb += B; sl += L; sl2 += L * L; sb2 += B * B; sc += C;
    hx += C * Math.cos(a); hy += C * Math.sin(a);
  };
  const u0 = Math.max(0, Math.floor((fx - rx) * U)), u1 = Math.min(U - 1, Math.ceil((fx + rx) * U));
  const y0 = Math.max(0, Math.floor((fy - radius) * h)), y1 = Math.min(h - 1, Math.ceil((fy + radius) * h));
  for (let u = u0; u <= u1; u++) {
    const dx = ((u + 0.5) / U - fx) * p.aspect;
    for (let y = y0; y <= y1; y++) { const dy = (y + 0.5) / h - fy; if (dx * dx + dy * dy <= r2) add(u * h + y); }
  }
  if (!n) add(clamp(Math.floor(fx * U), 0, U - 1) * h + clamp(Math.floor(fy * h), 0, h - 1));   // tiny circle: the pixel under the cursor
  const lum = sl / n, b = sb / n;
  return {
    r: sr / n, g: sg / n, b, lum, chroma: sc / n, hue: mod(Math.atan2(hy, hx) / TAU, 1),
    detail: Math.min(1, 4 * Math.sqrt(Math.max(0, sl2 / n - lum * lum))),
    blueStd: Math.sqrt(Math.max(0, sb2 / n - b * b)),
  };
}

// The range each value takes over this picture at this circle size, so the mapping is relative
// to the picture (like the scan, which stretches its values across the image).
function reference() {
  const lo = {}, hi = {}, keys = ['r', 'g', 'b', 'lum', 'detail'];
  for (const k of keys) { lo[k] = Infinity; hi[k] = -Infinity; }
  for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) {
    const m = measure((i + 0.5) / 9, (j + 0.5) / 5);
    for (const k of keys) { lo[k] = Math.min(lo[k], m[k]); hi[k] = Math.max(hi[k], m[k]); }
  }
  return { lo, hi };
}
function normalise(m) {
  const out = {};
  for (const k of Object.keys(R.ref.lo)) {
    const lo = R.ref.lo[k], hi = R.ref.hi[k];
    out[k] = hi - lo > 0.02 ? clamp((m[k] - lo) / (hi - lo), 0, 1) : m[k];
  }
  return out;
}

// ---------------------------------------------------------- the live composer
function makeSection(pc, mode, pent) {
  const base = pent ? (MODES[mode][2] === 4 ? PENT_MAJOR : PENT_MINOR) : MODES[mode];
  return { pc, mode, pent, base, root: 60 + (pc <= 6 ? pc : pc - 12), scale: [...base, ...base.map(x => x + 12), 24], name: `${NAMES[pc]} ${mode}` };
}

function newState() {
  return { k: 0, sec: null, cand: null, candBars: 0, chord: null, degree: 0, chordName: '', positions: [], pos: null, prevMidi: null, lastMove: 0 };
}

// one beat of music from one measurement; returns the beat's events and, on bar lines, the long notes
function composeBeat(M, N) {
  const st = R.st, base = S.music, meter = base.meter, beat = 60 / S.bpm, bar = beat * meter;
  const b = st.k % meter, ev = [], note = (layer, midi, start, dur, gain, pan = 0) => { const e = { layer, midi, start, dur, gain, pan }; ev.push(e); return e; };
  let sustain = null;

  if (b === 0) {
    // key and mode: from hue, colourfulness and light, moving only once a change has held
    const pc = pickKey(M.hue, M.chroma, st.sec ? st.sec.pc : null);
    const mode = MODE_BY_LIGHT.find(([thr]) => M.lum >= thr)[1], pent = M.chroma < 0.1;
    const cand = `${pc}|${mode}|${pent}`;
    if (!st.sec) st.sec = makeSection(pc, mode, pent);
    else if (cand !== `${st.sec.pc}|${st.sec.mode}|${st.sec.pent}`) {
      st.candBars = cand === st.cand ? st.candBars + 1 : 1; st.cand = cand;
      if (st.candBars >= KEY_BARS) {
        st.sec = makeSection(pc, mode, pent); st.cand = null; st.candBars = 0;
        if (st.prevMidi != null) {   // continue the melody from the scale tone nearest its last note
          const sc = st.sec.scale; let best = 0;
          for (let j = 1; j < sc.length; j++) if (Math.abs(st.sec.root + sc[j] - st.prevMidi) < Math.abs(st.sec.root + sc[best] - st.prevMidi)) best = j;
          st.pos = best;
        }
      }
    } else { st.cand = null; st.candBars = 0; }
    const sec = st.sec;

    // chord from green, coming home to I every fourth bar; arpeggio rhythm from how much the blue varies
    const barNo = Math.floor(st.k / meter);
    const idx = barNo % SECTION_BARS === 0 ? 0 : Math.min(Math.floor(N.g * DEGREES.length), DEGREES.length - 1);
    st.degree = calmDegree(sec.mode, DEGREES[idx]); st.chord = chordFor(sec.mode, st.degree);
    st.chordName = chordName(sec.pc, st.chord, st.degree).name;
    const [harp, step] = HARP_RHYTHMS[Math.min(3, Math.floor(M.blueStd * 8))];
    st.harp = harp; st.positions = [];
    if (step === 0.5) for (let x = 0; x < meter; x++) st.positions.push(x, x + 0.5 + base.swing);
    else for (let k = 0; k < Math.floor(meter / step + 0.5); k++) st.positions.push(k * step);

    // long notes: pad, bass, drone and texture, rendered for SUSTAIN_BARS bars
    const dur = SUSTAIN_BARS * bar, low = sec.root - 24;
    let root = sec.root - 24 + (st.chord[0] % 12); if (root < 33) root += 12;
    st.texture = N.detail < 0.2 ? 'still' : N.detail < 0.45 ? 'breeze' : N.detail < 0.7 ? 'drift' : 'gust';
    const air = 0.01 + 0.03 * Math.round(N.detail * 4) / 4;   // in steps, so the render can be reused
    sustain = [
      ...st.chord.map((n, k) => ({ layer: 'pad', midi: sec.root - 12 + n, start: 0, dur, gain: 0.055, pan: k % 2 === 0 ? -0.5 : 0.5 })),
      { layer: 'bass', midi: root, start: 0, dur, gain: 0.26, pan: 0 },
      { layer: 'drone', midi: low, start: 0, dur, gain: 0.05, pan: -0.2 },
      { layer: 'drone', midi: low + 7, start: 0, dur, gain: 0.04, pan: 0.2 },
      { layer: 'air', midi: null, start: 0, dur, gain: air, pan: 0 },
    ];
  }
  const sec = st.sec, chord = st.chord;

  // arpeggio notes that fall in this beat, louder with more blue
  st.positions.forEach((p, k) => {
    if (p >= b && p < b + 1) note('arp', sec.root + chord[k % chord.length], (p - b) * beat, (st.positions[1] - st.positions[0] || 1) * beat, 0.018 + 0.04 * N.b, 0.35);
  });
  // a sparkle when the circle is among the brightest parts of the picture
  if (N.lum >= 0.85 && M.lum > 0.15) note('bell', sec.root + 12 + (chord[st.k % chord.length] % 12), beat / 2, 0, 0.05, -0.4);

  // melody: rests in the dark, holds when calm, otherwise steps toward the pitch red asks for
  const strong = STRONG_BEATS[meter].includes(b), d = N.detail, scale = sec.scale, L = scale.length;
  if (st.pos == null) st.pos = Math.floor(L / 2);
  st.pos = Math.min(st.pos, L - 1);
  if (M.lum < base.restLevel) { st.rhythm = 'rest'; st.motion = 'rest'; st.melName = 'rest'; st.prevMidi = null; st.lastMove = 0; }
  else if (d < 0.6 && !strong && st.prevMidi != null) { st.rhythm = 'held'; st.motion = 'held'; }
  else {
    const maxStep = 1 + Math.min(2, Math.floor(d * 3));
    const target = clamp(Math.floor(N.r * (L - 1)) + WANDER[st.k % WANDER.length], 0, L - 1);
    let move = clamp(target - st.pos, -maxStep, maxStep);
    const recovery = Math.abs(st.lastMove) >= 3;
    if (recovery) move = move * st.lastMove < 0 ? -Math.sign(st.lastMove) : 0;   // after a leap, step back
    st.pos = clamp(st.pos + move, 0, L - 1); st.lastMove = move;
    let n = scale[st.pos];
    if (strong) {   // strong beats land on a chord tone
      let best = null;
      for (const c of chord) for (const o of [0, 12]) { const t = c + o; if (best === null || Math.abs(t - n) < Math.abs(best - n)) best = t; }
      n = best;
    }
    const midi = sec.root + n, arc = 0.88 + 0.12 * Math.sin(Math.PI * ((st.k % (2 * meter)) + 0.5) / (2 * meter));
    const gain = 0.22 * (0.88 + 0.24 * N.r) * arc;
    if (d < 0.92) { note('mel', midi, 0, beat * 1.6, gain, 0.1); st.rhythm = 'quarter'; }
    else {   // busy: two eighths, the second a neighbour tone on the way to where red points
      const sw = base.swing, up = Math.floor(N.r * (L - 1)) >= st.pos ? 1 : -1;
      note('mel', midi, 0, (0.5 + sw) * beat + 0.04, gain, 0.1);
      note('mel', sec.root + scale[clamp(st.pos + up, 0, L - 1)], (0.5 + sw) * beat, (0.5 - sw) * beat * 1.6, gain * 0.82, 0.1);
      st.rhythm = 'eighths';
    }
    note('harm', sec.root + harmonyBelow(n, sec.base, false), 0, beat, 0.08, -0.25);
    st.motion = recovery ? 'recovery step' : move === 0 ? 'repeat' : Math.abs(move) === 1 ? 'step' : `leap of ${Math.abs(move)}`;
    st.melName = noteName(midi); st.prevMidi = midi;
  }
  st.k++;
  return { ev, sustain, beat, bar };
}

// ---------------------------------------------------------- playing it
function playClip(bufs, when) {
  const ctx = S.ctx, parts = [];
  for (const [gid, buf] of Object.entries(bufs)) {
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.connect(g); g.connect(S.graph.groups[gid]);
    src.start(when);
    parts.push({ src, g });
  }
  return parts;
}
function fadeClip(clip, at, tc) {
  if (!clip) return;
  for (const { src, g } of clip) {
    g.gain.setTargetAtTime(0, at, tc);
    try { src.stop(at + tc * 8); } catch (e) { /* already stopped */ }
  }
}

function fireBeat() {
  const ctx = S.ctx, scale = S.music.stemScale ?? 1;
  if (!R.ref) R.ref = reference();
  const M = measure(R.focus.fx, R.focus.fy), N = normalise(M);
  const { ev, sustain, beat, bar } = composeBeat(M, N);
  const when = Math.max(R.nextAt, ctx.currentTime + 0.02);
  R.beatClip = playClip(renderClip(ctx, ev, 0, beat, scale), when);

  if (sustain) {
    const key = sustain.map(e => `${e.layer}:${e.midi}:${e.gain.toFixed(4)}:${S.voice[GROUP_OF[e.layer]]}`).join('|') + `|${bar}|${scale}`;
    if (key !== R.sustKey || when - R.sustAt >= SUSTAIN_BARS * bar - 0.05) {
      let bufs = R.cache.get(key);
      if (!bufs) {
        bufs = renderClip(ctx, sustain, 0, beat, scale);
        if (R.cache.size >= 32) R.cache.delete(R.cache.keys().next().value);
        R.cache.set(key, bufs);
      }
      const at = Math.max(when, ctx.currentTime + 0.02);
      fadeClip(R.sustClip, at, 0.15);
      R.sustClip = playClip(bufs, at);
      R.sustKey = key; R.sustAt = at;
    }
  }
  R.nextAt = when + beat;
  R.show = { M, N, st: R.st };
  S.dirty = true;
}

function tick() {
  if (!R.hover || !S.ctx || !R.focus) return;
  if (S.ctx.currentTime >= R.nextAt - LOOKAHEAD) fireBeat();
}

function startHover() {
  if (S.playing) stop();
  const ctx = ensureCtx();
  if (ctx.state === 'suspended') ctx.resume();
  R.hover = true; R.st = newState(); R.sustKey = ''; R.sustAt = -1e9;
  R.nextAt = ctx.currentTime + 0.05;
  R.timer = setInterval(tick, 25);
}

function reactiveEnd() {
  if (!R.hover) return;
  R.hover = false; clearInterval(R.timer); R.timer = null;
  if (S.ctx) fadeClip(R.sustClip, S.ctx.currentTime, 0.4);   // let the last beat ring out, fade the long notes
  R.sustClip = R.beatClip = null; R.focus = null; R.show = null;
  S.dirty = true; lastReadout = '';
}

// ---------------------------------------------------------- showing it
// the picture with everything outside the circle dimmed
function drawSpotlight(cv) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, lw = Math.max(1, W / 600);
  const cx = R.focus.fx * W, cy = R.focus.fy * H, r = SPOT.radius * H;
  x.clearRect(0, 0, W, H);
  x.drawImage(S.src, 0, 0, W, H);
  x.fillStyle = 'rgba(0,0,0,.6)';
  x.beginPath(); x.rect(0, 0, W, H); x.arc(cx, cy, r, 0, TAU); x.fill('evenodd');
  x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = lw * 1.5;
  x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.stroke();
}

// the "Now playing" and "Musical choices" panels describe the spotlight while it plays
function spotlightReadout() {
  const s = R.show;
  if (!s) return;
  const { M, N, st } = s;
  const vals = { R: N.r, G: N.g, B: N.b, L: N.lum, D: N.detail };
  for (const [k, v] of Object.entries(vals)) { $('v' + k).textContent = v.toFixed(2); $('bar' + k).style.width = `${v * 100}%`; }
  $('oR').textContent = st.melName || '–';
  $('oG').textContent = st.chordName;
  $('oB').textContent = `${Math.round((0.018 + 0.04 * N.b) / 0.058 * 100)}%`;
  $('oL').textContent = N.lum >= 0.85 && M.lum > 0.15 ? 'on' : 'silent';
  $('oD').textContent = st.texture;
  $('cKey').textContent = st.sec.name + (st.sec.pent ? ', pentatonic' : '');
  $('cDrum').textContent = st.texture; $('cHarp').textContent = st.harp;
  $('cRhythm').textContent = st.rhythm; $('cMotion').textContent = st.motion;
  $('tNow').textContent = 'live'; $('rBeat').textContent = (st.k - 1) % S.music.meter + 1; $('rBar').textContent = '–';
}

// ---------------------------------------------------------- wiring
(() => {
  const cv = $('imgCv'), box = $('reactive'), cap = $('imgCaption');
  let savedCaption = null;
  const pos = e => { const p = canvasPoint(cv, e); return { fx: clamp(p.fx, 0, 1), fy: clamp(p.fy, 0, 1), inside: p.inside }; };
  const move = e => {
    if (!R.on || !reactiveAllowed()) return;
    const p = pos(e);
    if (!p.inside) { reactiveEnd(); return; }   // over an empty band beside the picture: nothing to hear
    R.focus = { fx: p.fx, fy: p.fy }; S.dirty = true;
    if (!R.hover) startHover();
  };
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerdown', e => { if (S.ctx && S.ctx.state === 'suspended') S.ctx.resume(); move(e); });
  cv.addEventListener('pointerleave', reactiveEnd);
  // scroll over the image to change the size of the circle
  cv.addEventListener('wheel', e => {
    if (!R.on || !reactiveAllowed() || !pos(e).inside) return;   // over a band, scroll the page as usual
    e.preventDefault();
    SPOT.radius = clamp(SPOT.radius * Math.exp(-e.deltaY * 0.0015), SPOT.min, SPOT.max);
    R.ref = null; S.dirty = true;
    if (!R.focus) { const p = pos(e); R.focus = { fx: p.fx, fy: p.fy }; }
  }, { passive: false });
  box.addEventListener('change', () => {
    R.on = box.checked;
    cv.classList.toggle('reactive', R.on);
    if (R.on) {
      const ctx = ensureCtx(); if (ctx.state === 'suspended') ctx.resume();   // the click unlocks audio
      savedCaption = cap.textContent;
      cap.textContent = 'Follow cursor is on: only the circle under the cursor is heard. Scroll to make it bigger or smaller.';
    } else {
      reactiveEnd();
      if (savedCaption !== null) cap.textContent = savedCaption;
    }
  });
})();
