// Image Sonifier · playback.js
// Web Audio playback: the mixing graph (soft clip, compressor, reverb, per-instrument
// mute and reverb sends) and play / pause / position.

// ---------------------------------------------------------- playback graph
function ensureCtx() {
  if (S.ctx) return S.ctx;
  const ctx = S.ctx = new (window.AudioContext || window.webkitAudioContext)();
  // master -> gentle tanh soft-clip -> compressor -> speakers
  const master = ctx.createGain(); master.gain.value = 0.85;
  const shaper = ctx.createWaveShaper(), curve = new Float32Array(1025);
  for (let i = 0; i < curve.length; i++) { const v = i / 512 - 1; curve[i] = Math.tanh(1.2 * v) / Math.tanh(1.2); }
  shaper.curve = curve;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
  master.connect(shaper); shaper.connect(comp); comp.connect(ctx.destination);

  // vast, dark space: a faint burst over a very long tail, after a 40 ms pre-delay
  const sr = ctx.sampleRate, n = Math.floor(6.0 * sr), pd = Math.floor(0.04 * sr), ir = ctx.createBuffer(2, n + pd, sr);
  [1, 2].forEach((seed, c) => {
    const d = ir.getChannelData(c), rnd = mulberry32(seed), hist = new Float64Array(16);
    let ss = 0, sum = 0;
    for (let i = 0; i < n; i++) {
      const x = gaussian(rnd); sum += x - hist[i % 16]; hist[i % 16] = x;
      const u = i / (n - 1), v = 0.25 * x * Math.exp(-10 * u) + (sum / 16) * 3.9 * Math.exp(-4 * u);
      d[pd + i] = v; ss += v * v;
    }
    const k = 1 / Math.sqrt(ss); for (let i = pd; i < n + pd; i++) d[i] *= k;
  });
  const conv = ctx.createConvolver(); conv.normalize = false; conv.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = S.reverb ? 0.75 : 0;
  conv.connect(wet); wet.connect(master);

  const groups = {};
  for (const g of GROUPS) {
    const gn = ctx.createGain(); gn.gain.value = S.mute[g.id] ? 0 : 1;
    const send = ctx.createGain(); send.gain.value = g.send;
    gn.connect(master); gn.connect(send); send.connect(conv);
    groups[g.id] = gn;
  }
  S.graph = { wet, groups };
  return ctx;
}
const setGain = (param, v) => { if (S.ctx) param.setTargetAtTime(v, S.ctx.currentTime, 0.02); };

function now() {
  if (!S.music) return 0;
  return S.playing ? Math.min(S.music.total, S.offset + Math.max(0, S.ctx.currentTime - S.startedAt)) : S.offset;
}
function play() {
  if (!S.stems) return;
  const ctx = ensureCtx();
  if (ctx.state === 'suspended') ctx.resume();
  if (S.offset >= S.music.total - 0.05) S.offset = 0;
  const when = ctx.currentTime + 0.03;
  S.nodes = [];
  for (const [gid, buf] of Object.entries(S.stems)) {
    let ab = buf;
    if (buf._l) {
      ab = ctx.createBuffer(2, buf._l.length, SR); ab.copyToChannel(buf._l, 0); ab.copyToChannel(buf._r, 1);
      S.stems[gid] = ab;
    }
    const src = ctx.createBufferSource(); src.buffer = ab; src.connect(S.graph.groups[gid]);
    src.start(when, S.offset);
    S.nodes.push(src);
  }
  const first = S.nodes[0];
  first.onended = () => { if (S.nodes[0] === first && S.playing) { S.nodes = []; S.playing = false; S.offset = 0; S.dirty = true; updateBtn(); } };
  S.startedAt = when; S.playing = true;
  updateBtn();
}
function stop() {
  if (!S.playing) return;
  S.offset = now();
  const nodes = S.nodes; S.nodes = []; S.playing = false;
  for (const n of nodes) { try { n.stop(); } catch (e) { /* already stopped */ } }
  updateBtn(); S.dirty = true;
}
function updateBtn() {
  $('playLbl').textContent = S.playing ? 'Pause' : 'Play';
  $('playIcon').innerHTML = S.playing
    ? '<path d="M3 1.5h3v11H3zM8 1.5h3v11H8z" fill="currentColor"/>'
    : '<path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/>';
}
