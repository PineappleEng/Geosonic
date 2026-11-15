// Image Sonifier · view.js
// Drawing: the scanned image or video with its current slice, the timeline and channel
// thumbnails, the score, the live readout, and the animation loop that keeps video in sync.

// ---------------------------------------------------------- drawing
function colors() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  return { ink: v('--ink'), muted: v('--muted'), line: v('--line'), accent: v('--accent'), r: v('--ch-r'), g: v('--ch-g'), b: v('--ch-b'), l: v('--ch-l'), d: v('--ch-d'), mono: v('--font-data') };
}

function sliceAt(t) {
  const m = S.music, f = t / m.beat, i = Math.floor(f);
  if (i >= m.beats || i < 0) return null;
  return { i, x: m.bb[i] + (m.bb[i + 1] - m.bb[i]) * (f - i), x0: m.bb[i], x1: m.bb[i + 1] };
}

// cols: for timeline sources (one column per unit), draw only the columns the music covers
function drawScan(cv, source, t, showGrid, cols) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, m = S.music, sx = W / m.U;
  x.clearRect(0, 0, W, H);
  if (cols) x.drawImage(source, 0, 0, cols, source.height, 0, 0, W, H); else x.drawImage(source, 0, 0, W, H);
  const lw = Math.max(1, W / 600);
  if (showGrid) {
    for (let i = 1; i < m.beats; i++) {
      const sectionEdge = i % (m.meter * SECTION_BARS) === 0, barEdge = i % m.meter === 0;
      x.fillStyle = sectionEdge ? 'rgba(255,255,255,.85)' : barEdge ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.14)';
      x.fillRect(Math.round(m.bb[i] * sx), 0, sectionEdge ? lw * 2 : lw, H);
    }
  }
  const started = S.playing || S.offset > 0 || S.exporting, sl = sliceAt(t);
  const px = sl ? sl.x * sx : (t > 0 ? W : 0);
  if (started && px < W) { x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(px, 0, W - px, H); }
  if (sl) {
    const a = sl.x0 * sx, b = sl.x1 * sx;
    x.fillStyle = 'rgba(255,255,255,.14)'; x.fillRect(a, 0, b - a, H);
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = lw * 1.5; x.strokeRect(a + lw, lw, b - a - 2 * lw, H - 2 * lw);
    if (showGrid) {  // light centroid marker: where the light sits vertically in this slice
      const cy = m.centroid[sl.i] * H;
      x.fillStyle = '#fff'; x.beginPath(); x.arc((a + b) / 2, cy, lw * 4, 0, TAU); x.fill();
    }
    x.fillStyle = '#fff'; x.fillRect(px - lw, 0, lw * 2, H);
  }
}

const SCORE_H = 490, GUT = 58, RPAD = 10;
function drawScore(t, C) {
  const cv = $('score'), dpr = window.devicePixelRatio || 1, m = S.music;
  const cssW = cv.parentElement.clientWidth, cssH = SCORE_H;
  if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) { cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr); }
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, cssW, cssH);
  const dom = (m.beats + 1) * m.beat, X = s => GUT + (s / dom) * (cssW - GUT - RPAD);
  x.font = `11px ${C.mono}`; x.textBaseline = 'middle';

  // measurement strips
  const strips = [['Red', m.red, m.beat, C.r], ['Green', m.green, m.bar, C.g], ['Blue', m.blue, m.beat, C.b], ['Light', m.light, m.beat, C.l], ['Detail', m.detail, m.beat, C.d]];
  strips.forEach(([name, vals, step, col], k) => {
    const y = 4 + k * 18;
    x.fillStyle = C.muted; x.fillText(name, 0, y + 6.5);
    x.fillStyle = col;
    for (let i = 0; i < vals.length; i++) {
      x.globalAlpha = 0.08 + 0.92 * vals[i];
      const a = X(i * step), b = X((i + 1) * step);
      x.fillRect(a + 0.5, y, Math.max(1, b - a - 1), 13);
    }
    x.globalAlpha = 1;
  });

  // section keys
  x.textBaseline = 'alphabetic';
  m.sections.forEach((s, k) => {
    const a = X(k * SECTION_BARS * m.bar), b = X(Math.min(m.bars, (k + 1) * SECTION_BARS) * m.bar);
    const active = t >= k * SECTION_BARS * m.bar && t < (k + 1) * SECTION_BARS * m.bar;
    x.fillStyle = active ? C.accent : C.line; x.fillRect(a + 1, 116, b - a - 2, 2);
    x.fillStyle = active ? C.ink : C.muted; x.font = `600 11px ${C.mono}`;
    const label = s.name + (s.pent ? ' · pent.' : '');
    if (x.measureText(label).width < b - a - 6) x.fillText(label, a + 4, 112);
  });
  x.font = `11px ${C.mono}`; x.fillStyle = C.muted; x.fillText('Key', 0, 112);

  // layout of roll + drum lane
  const top = 146, drumH = 33, bot = cssH - 22 - drumH - 10, dTop = bot + 8;
  let lo = Infinity, hi = -Infinity;
  for (const e of m.ev) if (e.midi != null && !DRUM_LAYERS.has(e.layer)) { lo = Math.min(lo, e.midi); hi = Math.max(hi, e.midi); }
  lo -= 1; hi += 1;
  const rh = (bot - top) / (hi - lo + 1), Y = n => bot - (n - lo + 1) * rh;

  x.textBaseline = 'middle';
  x.fillStyle = C.line;
  for (let n = lo; n <= hi; n++) if (n % 12 === 0) {
    x.fillRect(GUT, Math.round(Y(n) + rh) - 0.5, cssW - GUT - RPAD, 1);
    x.fillStyle = C.muted; x.fillText(noteName(n), 0, Y(n) + rh / 2); x.fillStyle = C.line;
  }
  for (let i = 0; i <= m.bars; i++) x.fillRect(Math.round(X(i * m.bar)), top - 4, 1, dTop + drumH - top + 4);
  ['Air', 'Swell', ''].forEach((nm, k) => { x.fillStyle = C.muted; x.fillText(nm, 0, dTop + k * 11 + 5); });

  // chord names and bar numbers
  x.textBaseline = 'alphabetic';
  for (let i = 0; i < m.bars; i++) {
    const xi = X(i * m.bar) + 4, active = t >= i * m.bar && t < (i + 1) * m.bar, info = m.barInfo[i];
    x.fillStyle = active ? C.ink : C.muted;
    x.font = `${active ? 600 : 400} 11px ${C.mono}`;
    const room = X((i + 1) * m.bar) - xi - 4, full = `${info.roman} ${info.name}`;
    const label = x.measureText(full).width < room ? full : (x.measureText(info.name).width < room ? info.name : '');
    if (label) x.fillText(label, xi, top - 10);
    x.font = `11px ${C.mono}`; x.fillStyle = C.muted;
    x.fillText(String(i + 1), xi, cssH - 6);
  }
  x.fillText('Bar', 0, cssH - 6);
  x.fillText('Chord', 0, top - 10);

  const style = { drone: [C.g, 0.12, 0.3], pad: [C.g, 0.2, 0.6], bass: [C.g, 0.45, 0.9], arp: [C.b, 0.3, 1], bell: [C.l, 0.55, 1], harm: [C.r, 0.3, 0.6], mel: [C.r, 0.75, 1] };
  for (const layer of ['drone', 'pad', 'bass', 'arp', 'bell', 'harm', 'mel']) {
    const [col, base, on] = style[layer], dim = S.mute[GROUP_OF[layer]] ? 0.25 : 1;
    for (const e of m.ev) {
      if (e.layer !== layer) continue;
      const dur = layer === 'bell' ? m.beat / 2 : e.dur;
      const active = t >= e.start && t < e.start + dur;
      const a = X(e.start), w = Math.max(2, X(e.start + dur) - a - 1), y = Y(e.midi);
      x.fillStyle = col;
      x.globalAlpha = dim * (active ? on : (layer === 'arp' ? base + e.gain * 3 : base));
      x.fillRect(a, y + 0.5, w, Math.max(2, rh - 1));
      if (active && dim === 1 && (layer === 'mel' || layer === 'bell')) {
        x.globalAlpha = 1; x.strokeStyle = C.ink; x.lineWidth = 1.5; x.strokeRect(a - 1, y - 1, w + 2, Math.max(2, rh - 1) + 3);
      }
    }
  }
  // drum hits
  const dDim = S.mute.drums ? 0.25 : 1;
  x.fillStyle = C.d;
  for (const e of m.ev) {
    if (!DRUM_LAYERS.has(e.layer)) continue;
    const active = t >= e.start && t < e.start + e.dur, row = e.layer === 'air' ? 0 : 1;
    x.globalAlpha = dDim * (active ? 0.9 : 0.15 + e.gain * 8);
    const a = X(e.start);
    x.fillRect(a, dTop + row * 11, Math.max(2, X(e.start + e.dur) - a - 1), 9);
  }
  x.globalAlpha = 1;

  // playhead
  if (t <= dom) {
    const px = X(t);
    x.fillStyle = C.accent; x.fillRect(px - 1, 2, 2, dTop + drumH - 2);
    x.beginPath(); x.moveTo(px - 5, 0); x.lineTo(px + 5, 0); x.lineTo(px, 6); x.fill();
  }
}

let lastReadout = '';
function updateReadout(t) {
  const m = S.music, i = clamp(Math.floor(t / m.beat), 0, m.beats - 1), bar = Math.floor(i / m.meter);
  const info = m.barInfo[bar], sec = m.sections[info.sec];
  const mel = m.mel.find(e => t >= e.start && t < e.start + e.dur) || m.mel.find(e => e.beat === i);
  const sounding = {};
  for (const e of m.ev) {
    const len = e.layer === 'bell' ? 0.6 : (e.dur || 0.12);
    if (t >= e.start && t < e.start + len && (S.playing || S.offset > 0)) sounding[GROUP_OF[e.layer]] = true;
  }
  const key = `${fmt(t)}|${i}|${mel ? mel.midi : '-'}|${Object.keys(sounding).sort().join()}`;
  if (key === lastReadout) return;
  lastReadout = key;
  $('tNow').textContent = fmt(t);
  $('rBeat').textContent = i + 1; $('rBar').textContent = bar + 1;
  const vals = { R: m.red[i], G: m.green[bar], B: m.blue[i], L: m.light[i], D: m.detail[i] };
  for (const [k, v] of Object.entries(vals)) { $('v' + k).textContent = v.toFixed(2); $('bar' + k).style.width = `${v * 100}%`; }
  const hn = m.harm.find(e => t >= e.start && t < e.start + e.dur);
  $('oR').textContent = m.rhythm[i] === 'rest' ? 'rest' : (mel ? noteName(mel.midi) + (hn ? ` + ${noteName(hn.midi)}` : '') : '–');
  $('oG').textContent = info.name;
  $('oB').textContent = `${Math.round((0.018 + 0.04 * vals.B) / 0.058 * 100)}%`;
  const bellNote = m.ev.find(e => e.layer === 'bell' && e.start >= i * m.beat && e.start < (i + 1) * m.beat);
  $('oL').textContent = bellNote ? noteName(bellNote.midi) : 'silent';
  const hatOn = info.drum !== 'intro' && info.drum !== 'outro';
  $('oD').textContent = hatOn ? info.drum : info.drum;

  $('cKey').textContent = sec.name + (sec.pent ? ', pentatonic' : '');
  $('cDrum').textContent = info.drum + (info.fill ? ' + fill' : '');
  $('cHarp').textContent = info.harp;
  $('cRhythm').textContent = m.rhythm[i];
  $('cMotion').textContent = m.motion[i];
  $('cMove').textContent = S.proc.kind === 'video' ? `${Math.round(m.motionRel[i] * 100)}% of its busiest` : 'still image';
  const ms = Math.round((m.centroid[i] - 0.5) * 40);
  $('cTiming').textContent = m.rhythm[i] === 'rest' ? '–' : (ms === 0 ? 'on the beat' : `${ms > 0 ? '+' : '−'}${Math.abs(ms)} ms ${ms > 0 ? 'late' : 'early'}`);
  for (const row of mixer.children) row.classList.toggle('on', !!sounding[row.dataset.group]);
}

// video mode: the current frame, with the strip the music is hearing highlighted (in whole-frame
// mode the region is the full frame, so nothing is dimmed and the outline frames the picture)
// With ch (0 red, 1 green, 2 blue) it draws only that channel of the frame, for the channel panels,
// marking what the music hears the same way (strip, whole frame or spotlight circle).
const CHANNEL_FILL = ['#f00', '#0f0', '#00f'];
function drawVideo(cv, t, ch = null) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, m = S.music, v = S.src;
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  if (v.readyState >= 2) {
    x.drawImage(v, 0, 0, W, H);
    if (ch !== null) {   // multiplying by pure red (or green, or blue) keeps just that channel
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = CHANNEL_FILL[ch]; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'source-over';
    }
  }
  if (R.hover && R.focus) { spotMask(x, W, H); return; }
  const i = Math.floor(t / m.beat);
  if (i < 0 || i >= m.beats) return;
  const [, , c, d] = m.beatRegions[i], sx = W / S.proc.k, lw = Math.max(1, W / 600);
  x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 0, c * sx, H); x.fillRect(d * sx, 0, W - d * sx, H);
  x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = lw * 2; x.strokeRect(c * sx + lw, lw, (d - c) * sx - 2 * lw, H - 2 * lw);
}
// keep the (muted) video in step with the music
function syncVideo(t) {
  const v = S.src;
  if (!S.proc || S.proc.kind !== 'video' || v.readyState < 1) return;
  if (R.hover) {   // spotlight mode: the video plays on by itself, looping, while the circle listens
    const st = spotTime();
    if (v.paused) { v.currentTime = st; v.play().catch(() => {}); }
    else if (Math.abs(v.currentTime - st) > 0.25) v.currentTime = st;
    return;
  }
  const target = Math.min(t, S.proc.duration - 0.05);
  if (S.playing && t < S.proc.duration) {
    if (v.paused) { v.currentTime = target; v.play().catch(() => {}); }
    else if (Math.abs(v.currentTime - target) > 0.25) v.currentTime = target;
  } else {
    if (!v.paused) v.pause();
    if (!v.seeking && Math.abs(v.currentTime - target) > 0.04) v.currentTime = target;
  }
}

function frame() {
  if (S.music && S.proc && !S.exporting) syncVideo(now());
  const spot = R.hover && R.focus;
  if (!S.exporting && S.music && (S.playing || S.dirty || (spot && S.proc.kind === 'video'))) {
    const cols = S.proc.kind === 'video' ? S.music.used : 0;
    const t = spot && cols ? spotTime() : now(), C = colors();   // a video under the spotlight keeps moving
    if (spot) drawSpotlight($('imgCv'));   // spotlight mode: only the circle is heard
    else if (cols) drawVideo($('imgCv'), t);
    else drawScan($('imgCv'), S.src, t, true);
    if (cols) drawScan($('timeCv'), S.proc.slit, t, true, cols);
    ['cvR', 'cvG', 'cvB'].forEach((id, k) => {   // a video's panels show the current frame, split into channels
      if (cols) drawVideo($(id), t, k); else drawScan($(id), S.proc.chans[k], t, false);
    });
    drawScore(t, C);
    if (R.hover) spotlightReadout(); else updateReadout(t);
    S.dirty = false;
  }
  requestAnimationFrame(frame);
}
