// Geosonic · theory.js
// Music theory helpers: choosing keys, building and naming chords, harmony notes.

// ---------------------------------------------------------- music theory
function pickKey(hue, chroma, prev) {
  if (chroma < 0.04) return prev ?? 0;
  const pos = mod(Math.floor(hue * 12 + 0.5), 12);
  if (prev == null) return pos;
  const diff = mod(pos - prev + 6, 12) - 6;
  return mod(prev + clamp(diff, -2, 2), 12);
}
function chordFor(mode, degree) {
  const sc = MODES[mode], out = [];
  for (let k = 0; k < 4; k++) { const j = degree + 2 * k; out.push(sc[j % 7] + 12 * Math.floor(j / 7)); }
  return out;
}
// avoid tense half-diminished chords: fall back to IV, then V, then I
function calmDegree(mode, degree) {
  for (const d of [degree, 3, 4, 0]) { const c = chordFor(mode, d); if (c[2] - c[0] !== 6) return d; }
  return 0;
}
function chordName(keyPc, chord, degree) {
  const q = [chord[1] - chord[0], chord[2] - chord[0], chord[3] - chord[0]];
  let roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][degree];
  const shift = chord[0] - MODES.Ionian[degree];
  roman = (shift < 0 ? '♭' : shift > 0 ? '♯' : '') + roman;
  if (q[0] === 3) roman = roman.toLowerCase() + (q[1] === 6 ? 'ø' : '');
  return { roman, name: NAMES[(keyPc + chord[0]) % 12] + (CHORD_QUALITY[q.join(',')] || '') };
}
function harmonyBelow(n, base, final) {
  if (final) return n - 5;
  let best = null;
  for (const o of [-1, 0, 1, 2]) for (const x of base) {
    const c = x + 12 * o, d = n - c;
    if (d >= 3 && d <= 5 && (best === null || Math.abs(d - 3.5) < Math.abs(n - best - 3.5))) best = c;
  }
  return best ?? n - 3;
}
