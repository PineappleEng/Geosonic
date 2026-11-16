// Geosonic · instruments.js
// Sound synthesis: the four engines that play the instruments in voices.js, and rendering all
// note events into one stereo buffer per instrument group (one group can be re-rendered alone).

// ---------------------------------------------------------- instruments
const rel = (i, held, n) => i < held ? 1 : Math.exp(-6 * (i - held) / Math.max(1, n - held - 1));
// one wavetable per detuned voice for a pad instrument (built once, then cached on the voice)
function padTables(voice) {
  return voice._tables || (voice._tables = [0, 1, 2].map(v => {
    const N = 4096, tb = new Float32Array(N + 1);
    for (let i = 0; i < N; i++) { let s = 0; voice.harmonics.forEach((a, k) => { s += a * Math.sin(TAU * (k + 1) * i / N + v * (k + 1) * 1.3); }); tb[i] = s; }
    tb[N] = tb[0]; return tb;
  }));
}

// Sum of harmonic partials, each decaying at its own rate (mirrors additive() in the Python script).
function additive(f, dur, partials, attack, release, vibrato = 0) {
  const n = Math.floor((dur + release) * SR), held = Math.floor(dur * SR), o = new Float32Array(n);
  let norm = 0;
  for (const [k, amp, dec, ph] of partials) {
    const fk = f * k;
    if (fk > 12000) continue;
    norm += amp;
    if (vibrato) {
      const beta = vibrato * f / 5;
      for (let i = 0; i < n; i++) {
        const t = i / SR, vib = beta * Math.min(1, t / 0.4) * Math.sin(TAU * 5 * t);
        o[i] += amp * Math.sin(TAU * fk * t + k * vib + ph) * Math.exp(-dec * t);
      }
    } else {
      // rotating phasor: one complex multiply per sample instead of sin() and exp()
      const w = TAU * fk / SR, g = Math.exp(-dec / SR), ar = Math.cos(w) * g, ai = Math.sin(w) * g;
      let re = amp * Math.cos(ph), im = amp * Math.sin(ph);
      for (let i = 0; i < n; i++) { o[i] += im; const nr = re * ar - im * ai; im = re * ai + im * ar; re = nr; }
    }
  }
  const k = 1 / Math.max(norm, 1e-9);
  for (let i = 0; i < n; i++) o[i] *= k * Math.min(1, i / SR / attack) * rel(i, held, n);
  return o;
}
const breathe = (t, period) => 0.82 + 0.18 * Math.sin(TAU * t / period);   // slow swell in loudness

// additive engine: partials with optional fixed ring length, tremolo and breathing
function playAdditive(v, f, dur) {
  const o = additive(f, v.fixed ?? dur, v.partials, v.attack, v.release, v.vibrato || 0);
  if (v.tremolo || v.breathe) {
    for (let i = 0; i < o.length; i++) {
      const t = i / SR;
      if (v.tremolo) o[i] *= 1 - v.tremolo[1] * (0.5 + 0.5 * Math.sin(TAU * v.tremolo[0] * t));
      if (v.breathe) o[i] *= breathe(t, v.breathe);
    }
  }
  return o;
}

// pad engine: three detuned voices, slow swell, long fade, slow breathing
function playPad(v, f, dur) {
  const n = Math.floor((dur + v.release) * SR), held = Math.floor(dur * SR), o = new Float32Array(n), N = 4096, tables = padTables(v);
  const inc = [f * (1 - v.detune) / SR, f / SR, f * (1 + v.detune) / SR];
  let mx = 1e-9;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let q = 0; q < 3; q++) {
      const ph = (inc[q] * i) % 1 * N, k = Math.floor(ph), fr = ph - k, tb = tables[q];
      s += tb[k] + (tb[k + 1] - tb[k]) * fr;
    }
    o[i] = s; const a = Math.abs(s); if (a > mx) mx = a;
  }
  for (let i = 0; i < n; i++) o[i] = o[i] / mx * Math.min(1, i / SR / v.attack) * rel(i, held, n) * breathe(i / SR, v.breathe);
  return o;
}
// moving average of width w with held edges: turns pitch steps into glides
function box(x, w) {
  const n = x.length, h = w >> 1, o = new Float64Array(n), at = i => x[clamp(i, 0, n - 1)];
  let sum = 0;
  for (let i = -h; i < w - h; i++) sum += at(i);
  for (let i = 0; i < n; i++) { o[i] = sum / w; sum += at(i + w - h) - at(i - h); }
  return o;
}
// line engine: one continuous line through consecutive notes, ~70 ms glides, a slight dip at each change
function playLine(v, notes) {
  const t0 = notes[0].start, last = notes[notes.length - 1];
  const held = Math.floor((last.start + last.dur - t0) * SR), n = held + Math.floor(v.release * SR);
  const m = new Float64Array(n).fill(notes[0].midi), changes = [];
  for (const e of notes.slice(1)) { const k = Math.floor((e.start - t0) * SR); m.fill(e.midi, Math.max(0, k)); changes.push(k); }
  const w = Math.floor(0.035 * SR), mm = box(box(m, w), w);
  const freq = new Float64Array(n), phase = new Float64Array(n);
  let acc = 0, fmax = 0;
  for (let i = 0; i < n; i++) { freq[i] = 440 * Math.pow(2, (mm[i] - 69) / 12); acc += freq[i]; phase[i] = TAU * acc / SR; fmax = Math.max(fmax, freq[i]); }
  const o = new Float32Array(n), parts = v.partials.filter(([k]) => fmax * k <= 12000);
  const norm = parts.reduce((s, p) => s + p[1], 0);
  for (let i = 0; i < n; i++) {
    const t = i / SR, ph = phase[i] + v.vibrato * freq[i] / 5 * Math.min(1, t / 0.4) * Math.sin(TAU * 5 * t);
    let s = 0; for (const [k, amp, , p0] of parts) s += amp * Math.sin(k * ph + p0);
    o[i] = s / norm * Math.min(1, t / v.attack) * rel(i, held, n);
  }
  const tl = 2 * Math.floor(0.02 * SR);
  for (const k of changes) {
    const a = Math.max(0, k - (tl >> 1));
    for (let q = 0; q < tl && a + q < n; q++) o[a + q] *= 1 - v.dip * (1 - Math.abs(-1 + 2 * q / (tl - 1)));
  }
  return o;
}
function harmonyPhrases(notes, gap = 0.08) {
  const out = [];
  for (const e of [...notes].sort((a, b) => a.start - b.start)) {
    const ph = out[out.length - 1];
    if (ph && e.start - (ph[ph.length - 1].start + ph[ph.length - 1].dur) < gap) ph.push(e); else out.push([e]);
  }
  return out;
}
// smoothed (darker) noise: running average of the last w samples
function softNoise(n, rnd, w = 8) {
  const o = new Float32Array(n), hist = new Float64Array(w); let sum = 0;
  for (let i = 0; i < n; i++) { const x = gaussian(rnd); sum += x - hist[i % w]; hist[i % w] = x; o[i] = sum / w; }
  return o;
}
// noise engine: air (dark wind), ocean (slow surf swells) or rain (soft hiss with droplets), over a bar
function playNoise(v, f, dur, rnd) {
  const held = Math.floor(dur * SR);
  if (v.kind === 'ocean') {
    const n = Math.floor((dur + 3) * SR), o = softNoise(n, rnd, 48);
    for (let i = 0; i < n; i++) { const t = i / SR; o[i] *= 6.9 * Math.min(1, t / 2) * rel(i, held, n) * (0.2 + 0.8 * Math.sin(Math.PI * t / 6) ** 2); }
    return o;
  }
  if (v.kind === 'rain') {
    const n = Math.floor((dur + 2) * SR), o = softNoise(n, rnd, 3), fall = Math.exp(-1 / (0.004 * SR));
    let drop = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      drop *= fall; if (rnd() < 0.002) drop += 0.5 + rnd();
      o[i] = (0.35 * 1.7 * o[i] + drop * gaussian(rnd)) * Math.min(1, t) * rel(i, held, n);
    }
    return o;
  }
  const n = Math.floor((dur + 2.5) * SR), o = softNoise(n, rnd, 24);   // air
  for (let i = 0; i < n; i++) { const t = i / SR; o[i] *= 4.9 * Math.min(1, t / 1.5) * rel(i, held, n) * breathe(t, 5); }
  return o;
}
// soft swell rising into the next section
function swell(f, dur, rnd) {
  const n = Math.floor(dur * SR) + Math.floor(0.03 * SR), o = softNoise(n, rnd);
  for (let i = 0; i < n; i++) { const t = i / SR; o[i] *= 2.2 * Math.min(1, (t / Math.max(dur, 1e-3)) ** 2) * (t > dur ? Math.exp(-(t - dur) * 120) : 1); }
  return o;
}
const ENGINES = { additive: playAdditive, pad: playPad, noise: playNoise };
const voiceFor = gid => VOICES[S.voice[gid]] || VOICES[ROLE_VOICES[ROLE_OF[gid]][0]];
const levelFor = (v, gid) => (v.gain ?? 1) * (v.roleGain?.[ROLE_OF[gid]] ?? 1);

// Render every event into one stereo buffer per instrument group, playing each group with the
// instrument chosen for it. With `only` set, render just that group, scaled like the full mix.
function renderStems(m, only = null) {
  const len = Math.floor(m.total * SR), rnd = mulberry32(0), stems = {};
  const mk = () => (typeof AudioBuffer === 'function'
    ? new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: SR })
    : { _l: new Float32Array(len), _r: new Float32Array(len), getChannelData(c) { return c ? this._r : this._l; } });
  const place = (layer, sig, start, gain, pan) => {
    const th = (pan + 1) * Math.PI / 4, gl = gain * Math.cos(th), gr = gain * Math.sin(th);
    const s0 = Math.floor(start * SR), n = Math.min(sig.length, len - s0);
    if (n <= 0) return;
    const gid = GROUP_OF[layer], buf = stems[gid] || (stems[gid] = mk());
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    for (let i = 0; i < n; i++) { L[s0 + i] += gl * sig[i]; R[s0 + i] += gr * sig[i]; }
  };
  for (const e of m.ev) {
    const gid = GROUP_OF[e.layer];
    if (e.layer === 'harm' || (only && gid !== only)) continue;
    const v = voiceFor(gid), f = e.midi != null ? mtof(e.midi) : 0;
    const sig = e.layer === 'swell' ? swell(f, e.dur, rnd) : ENGINES[v.engine](v, f, e.dur, rnd);
    const gain = e.gain * (e.layer === 'swell' ? 1 : levelFor(v, gid));
    place(e.layer, sig, e.start, gain, e.pan);
    if (ECHO[e.layer]) {   // ping-pong echoes, each softer than the last
      const [delay, fb, repeats] = ECHO[e.layer];
      for (let k = 1; k <= repeats; k++) { const sgn = k % 2 ? -1 : 1; place(e.layer, sig, e.start + k * delay * m.beat, gain * fb ** k, e.pan * sgn - 0.3 * sgn); }
    }
  }
  if (!only || only === 'harmony') {
    const v = voiceFor('harmony');
    for (const ph of harmonyPhrases(m.ev.filter(e => e.layer === 'harm')))
      place('harm', playLine(v, ph), ph[0].start, ph[0].gain * levelFor(v, 'harmony'), ph[0].pan);
  }
  // fade out, then scale every stem by one factor so the full mix peaks at 0.9
  // (a single re-rendered group reuses the factor from the last full render)
  const f = Math.floor(4.0 * SR), bufs = Object.values(stems);
  let mx = 1e-9;
  for (let c = 0; c < 2; c++) {
    const chans = bufs.map(b => b.getChannelData(c));
    for (const ch of chans) for (let i = 0; i < f; i++) ch[len - f + i] *= 1 - i / (f - 1);
    if (!only) for (let i = 0; i < len; i++) { let s = 0; for (const ch of chans) s += ch[i]; const a = Math.abs(s); if (a > mx) mx = a; }
  }
  const k = only ? (m.stemScale ?? 1) : (m.stemScale = 0.9 / mx);
  for (const b of bufs) for (let c = 0; c < 2; c++) { const ch = b.getChannelData(c); for (let i = 0; i < len; i++) ch[i] *= k; }
  return stems;
}

// Render a few events (reactive mode) into short stereo AudioBuffers, one per group, with time
// measured from t0. Same instruments, echoes and mix level (`scale`) as the full render.
function renderClip(ctx, events, t0, beat, scale) {
  let end = 0;
  for (const e of events) end = Math.max(end, e.start - t0 + (e.dur || 0.6) + (ECHO[e.layer] ? ECHO[e.layer][0] * ECHO[e.layer][2] * beat : 0));
  const len = Math.floor((end + 4) * SR), rnd = mulberry32(0), bufs = {};
  const place = (gid, sig, start, gain, pan) => {
    const th = (pan + 1) * Math.PI / 4, gl = scale * gain * Math.cos(th), gr = scale * gain * Math.sin(th);
    const s0 = Math.max(0, Math.floor((start - t0) * SR)), n = Math.min(sig.length, len - s0);
    if (n <= 0) return;
    const b = bufs[gid] || (bufs[gid] = ctx.createBuffer(2, len, SR));
    const L = b.getChannelData(0), R = b.getChannelData(1);
    for (let i = 0; i < n; i++) { L[s0 + i] += gl * sig[i]; R[s0 + i] += gr * sig[i]; }
  };
  for (const e of events) {
    const gid = GROUP_OF[e.layer], v = voiceFor(gid), f = e.midi != null ? mtof(e.midi) : 0;
    if (e.layer === 'harm') { place(gid, playLine(v, [e]), e.start, e.gain * levelFor(v, gid), e.pan); continue; }
    const sig = e.layer === 'swell' ? swell(f, e.dur, rnd) : ENGINES[v.engine](v, f, e.dur, rnd);
    const gain = e.gain * (e.layer === 'swell' ? 1 : levelFor(v, gid));
    place(gid, sig, e.start, gain, e.pan);
    if (ECHO[e.layer]) {
      const [delay, fb, repeats] = ECHO[e.layer];
      for (let k = 1; k <= repeats; k++) { const sgn = k % 2 ? -1 : 1; place(gid, sig, e.start + k * delay * beat, gain * fb ** k, e.pan * sgn - 0.3 * sgn); }
    }
  }
  return bufs;
}
