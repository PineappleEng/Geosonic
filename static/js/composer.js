// Geosonic · composer.js
// Turns the analysis into a list of note events for every instrument (mirrors compose() in
// image_to_audio.py): sections, slow chords, drone, harp, air texture, celesta, melody and flute.

// ---------------------------------------------------------- composition (mirrors compose() in the Python script)
function compose() {
  const A = analyse(S.beats), { meter, beats, bars, swing } = A;
  const beat = 60 / S.bpm, bar = beat * meter, ev = [];
  // detail (plus motion, for video) relative to this input: calm passages stay calm even in busy ones
  const calm = stretch(A.detail.map((v, i) => v + 4 * A.motion[i]));
  const note = (layer, midi, start, dur, gain, pan = 0) => { const e = { layer, midi, start: Math.max(0, start), dur, gain, pan }; ev.push(e); return e; };

  // sections: key from hue, mode from light, pentatonic when grey; a drone on root and fifth
  const sections = []; let prev = null;
  for (let s = 0; s < A.nSec; s++) {
    prev = pickKey(A.secHue[s], A.secChroma[s], prev);
    const pc = prev * 7 % 12;
    const mode = MODE_BY_LIGHT.find(([thr]) => A.secLight[s] >= thr)[1];
    const pent = A.secChroma[s] < 0.1;
    const base = pent ? (MODES[mode][2] === 4 ? PENT_MAJOR : PENT_MINOR) : MODES[mode];
    sections.push({ root: 60 + (pc <= 6 ? pc : pc - 12), pc, mode, pent, base, scale: [...base, ...base.map(x => x + 12), 24], name: `${NAMES[pc]} ${mode}` });
    const t0 = s * SECTION_BARS * bar, span = (Math.min(bars, (s + 1) * SECTION_BARS) - s * SECTION_BARS) * bar;
    const low = sections[sections.length - 1].root - 24;
    note('drone', low, t0, span, 0.05, -0.2);
    note('drone', low + 7, t0, span, 0.04, 0.2);
  }

  // bars: slow chords (two bars each), pad, bass, harp echoes, air texture
  const barInfo = [];
  let prevIdx = null, pads = [], bassNote = null;
  for (let i = 0; i < bars; i++) {
    const secI = Math.floor(i / SECTION_BARS), sec = sections[secI];
    let idx = Math.min(Math.floor(A.green[i] * DEGREES.length), DEGREES.length - 1);
    if (i % SECTION_BARS === 0 || i === bars - 1) idx = 0;
    else if (i % 2 === 1) idx = prevIdx;   // chords last two bars
    const degree = calmDegree(sec.mode, DEGREES[idx]), chord = chordFor(sec.mode, degree);
    const same = idx === prevIdx && i % SECTION_BARS !== 0 && i !== bars - 1;
    prevIdx = idx;
    const textureOn = bars < 3 || (i > 0 && i < bars - 1);
    let bd = 0; for (let k = i * meter; k < (i + 1) * meter; k++) bd += calm[k]; bd /= meter;
    const texture = bd < 0.2 ? 'still' : bd < 0.45 ? 'breeze' : bd < 0.7 ? 'drift' : 'gust';
    const [harp, step] = HARP_RHYTHMS[Math.min(3, Math.floor(A.blueStd[i] * 8))];
    const fill = textureOn && i % SECTION_BARS === SECTION_BARS - 1;
    const tBar = i * bar;
    barInfo.push({ chord, sec: secI, harp, fill, ...chordName(sec.pc, chord, degree), drum: textureOn ? texture : (i === 0 ? 'intro' : 'outro') });

    let root = sec.root - 24 + (chord[0] % 12);
    if (root < 33) root += 12;
    if (same) { for (const e of pads) e.dur += bar; bassNote.dur += bar; }   // same chord: keep sounding
    else {
      pads = chord.map((n, k) => note('pad', sec.root - 12 + n, tBar, bar, 0.055, k % 2 === 0 ? -0.5 : 0.5));
      bassNote = note('bass', root, tBar, bar, 0.26);
    }

    const positions = [];
    if (step === 0.5) for (let x = 0; x < meter; x++) positions.push(x, x + 0.5 + swing);
    else for (let k = 0; k < Math.floor(meter / step + 0.5); k++) positions.push(k * step);
    positions.forEach((p, k) => {
      const bi = i * meter + Math.floor(p);
      note('arp', sec.root + chord[k % chord.length], tBar + p * beat, (step === 0.5 ? 0.5 : step) * beat, 0.018 + 0.04 * A.blue[bi], 0.35);
    });

    if (textureOn) {
      note('air', null, tBar, bar, 0.01 + 0.03 * bd, 0);
      if (fill) note('swell', null, tBar + (meter - 1) * beat, beat, 0.06, -0.1);
    }
  }

  // celesta on the very brightest slices
  const bellThr = percentile(A.light, 85);
  for (let i = 0; i < beats - 1; i++) {
    const info = barInfo[Math.floor(i / meter)];
    if (A.light[i] >= bellThr && A.light[i] > 0.15)
      note('bell', sections[info.sec].root + 12 + (info.chord[i % info.chord.length] % 12), i * beat + beat / 2, 0, 0.05, -0.4);
  }

  // melody, pass 1: one main note per beat (red and centroid smoothed across neighbouring slices)
  const redS = smooth3(A.red), cenS = smooth3(A.centroid);
  const plan = [], motion = [];
  let pos = null, prevMidi = null, prevSec = null, lastMove = 0;
  for (let i = 0; i < beats; i++) {
    const info = barInfo[Math.floor(i / meter)], sec = sections[info.sec], scale = sec.scale, L = scale.length;
    if (pos == null) pos = Math.floor(L / 2);
    else if (info.sec !== prevSec && prevMidi != null) {
      // key change: continue from the scale tone nearest the last pitch
      let best = 0; for (let j = 1; j < L; j++) if (Math.abs(sec.root + scale[j] - prevMidi) < Math.abs(sec.root + scale[best] - prevMidi)) best = j;
      pos = best;
    }
    pos = Math.min(pos, L - 1);
    prevSec = info.sec;
    const d = calm[i], final = i === beats - 1, strong = STRONG_BEATS[meter].includes(i % meter);

    if (A.light[i] < A.restLevel && !final) { plan.push(null); motion.push('rest'); lastMove = 0; continue; }
    if (d < 0.6 && i % meter !== 0 && !final && plan.length && plan[plan.length - 1] !== null) { plan.push('held'); motion.push('held'); continue; }

    const maxStep = 1 + Math.min(2, Math.floor(d * 3));
    let move = clamp(Math.floor(redS[i] * (L - 1)) - pos, -maxStep, maxStep);
    const recovery = Math.abs(lastMove) >= 3;
    if (recovery) move = move * lastMove < 0 ? -Math.sign(lastMove) : 0;   // after a leap, step back
    pos = clamp(pos + move, 0, L - 1);
    lastMove = move;
    let n = scale[pos];
    if (strong) {
      let best = null;
      for (const c of info.chord) for (const o of [0, 12]) { const t = c + o; if (best === null || Math.abs(t - n) < Math.abs(best - n)) best = t; }
      n = best;
    }
    let cells, kind;
    if (final) {   // resolve to the nearest tonic
      n = 12;
      if (prevMidi != null) { n = 0; for (const x of [12, 24]) if (Math.abs(sec.root + x - prevMidi) < Math.abs(sec.root + n - prevMidi)) n = x; }
      cells = [[0, 2]]; kind = 'final';
    }
    else if (d < 0.92) { cells = [[0, 1]]; kind = 'quarter'; }
    else { cells = [[0, 0.5 + swing], [0.5 + swing, 0.5 - swing]]; kind = 'eighths'; }
    plan.push({ midi: sec.root + n, n, cells, kind, sec: info.sec, final });
    prevMidi = sec.root + n;
    motion.push(recovery ? 'recovery step' : move === 0 ? 'repeat' : Math.abs(move) === 1 ? 'step' : `leap of ${Math.abs(move)}`);
  }

  // melody, pass 2: rhythm, passing notes toward the next note, phrase dynamics; flute from section 2
  const harmFromBar = bars > SECTION_BARS ? SECTION_BARS : 1, phraseLen = 2 * meter;
  const mel = [], harm = [], rhythm = [];
  let lastMel = null, lastHarm = null;
  const nearest = (arr, v) => { let b = 0; for (let j = 1; j < arr.length; j++) if (Math.abs(arr[j] - v) < Math.abs(arr[b] - v)) b = j; return b; };
  plan.forEach((p, i) => {
    if (p === null) { rhythm.push('rest'); lastMel = lastHarm = null; return; }
    if (p === 'held') { lastMel.dur += beat; if (lastHarm) lastHarm.dur += beat; rhythm.push('held'); return; }
    const sec = sections[p.sec];
    const tones = [...new Set([-1, 0, 1, 2, 3].flatMap(o => sec.base.map(x => sec.root + x + 12 * o)))].sort((a, b) => a - b);
    const cur = nearest(tones, p.midi);
    let j = i + 1; while (j < beats && plan[j] === 'held') j++;
    const nxt = j < beats && plan[j] && typeof plan[j] === 'object' ? plan[j].midi : null;
    const tgt = nxt != null ? nearest(tones, nxt) : null;
    const around = cenS[i] < 0.5 ? 1 : -1, K = p.cells.length;
    if (K > 1) motion[i] = tgt == null || tgt === cur ? 'turns around the note' : 'walks to the next note';

    const arc = 0.88 + 0.12 * Math.sin(Math.PI * ((i % phraseLen) + 0.5) / phraseLen);
    const gain = 0.22 * (0.88 + 0.24 * redS[i]) * arc, human = (cenS[i] - 0.5) * 0.024;
    p.cells.forEach(([off, len], k) => {
      let m;
      if (k === 0) m = p.midi;
      else if (tgt == null || tgt === cur) m = tones[clamp(cur + (k % 2 === 1 ? around : 0), 0, tones.length - 1)];
      else m = tones[cur + Math.floor(k * (tgt - cur) / K + 0.5)];
      lastMel = note('mel', m, i * beat + off * beat + human, len * beat, gain * (k === 0 ? 1 : 0.82), 0.1);
      lastMel.beat = i;
      mel.push(lastMel);
    });
    if (Math.floor(i / meter) >= harmFromBar) {
      lastHarm = note('harm', sec.root + harmonyBelow(p.n, sec.base, p.final), i * beat + human, p.cells.reduce((s, c) => s + c[1], 0) * beat, 0.08, -0.25);
      harm.push(lastHarm);
    } else lastHarm = null;
    rhythm.push(p.kind);
  });

  // legato: each piano note rings until the next one starts, with a slight overlap
  for (let k = 0; k + 1 < mel.length; k++) {
    const a = mel[k], gap = mel[k + 1].start - a.start;
    if (gap > a.dur - 0.02 && gap < a.dur + 0.5 * beat) a.dur = Math.max(a.dur, gap + 0.04);
  }

  return { ...A, beat, bar, sections, barInfo, ev, mel, harm, rhythm, motion, total: beats * beat + 7 };
}
