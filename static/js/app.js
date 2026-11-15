// Image Sonifier · app.js
// Wiring: rebuilding the music when the input or settings change, the instrument mixer,
// controls, scrubbing, file loading, and start-up with the sample image.

async function rebuild() {
  if (!S.proc) return;
  const job = ++S.job;
  reactiveEnd();
  stop();
  S.offset = 0;
  S.music = compose();
  S.stems = null; S.dirty = true; lastReadout = '';
  const m = S.music;
  const keys = [...new Set(m.sections.map(s => s.name))];
  const video = S.proc.kind === 'video', secs = `${m.bars} bars and ${m.nSec} section${m.nSec > 1 ? 's' : ''} of up to 4 bars`;
  $('d3').textContent = video
    ? `The video becomes ${m.beats} beats in ${m.meter}/4 (${fmt(m.beats * m.beat)} of its ${fmt(S.proc.duration)}), grouped into ${secs}. Each beat hears the frames shown during it, ${S.videoScan === 'frame' ? 'across the whole frame' : 'through a strip that sweeps across the frame once per section'}.`
    : `${m.beats} slices become ${m.beats} beats in ${m.meter}/4, grouped into ${secs}.`;
  describeBand();
  $('tTot').textContent = fmt(m.total);
  $('rBeats').textContent = m.beats; $('rBars').textContent = m.bars;
  $('cMeter').textContent = `${m.meter}/4`;
  $('cMeterBy').textContent = `${video ? 'video' : 'image'} is ${m.aspect.toFixed(2)} : 1 (${m.meter === 5 ? 'panorama' : m.meter === 3 ? 'portrait' : 'landscape'})`;
  m.motionRel = stretch(m.motion);
  $('cSwing').textContent = m.swing < 0.01 ? 'straight' : `${Math.round(m.swing / 0.17 * 100)}%`;
  $('playBtn').disabled = true;
  $('status').textContent = 'Rendering instruments…';
  await new Promise(r => setTimeout(r, 30));
  const stems = renderStems(m);
  if (job !== S.job) return;
  S.stems = stems;
  $('playBtn').disabled = false;
  $('status').textContent = `Ready · ${m.ev.length} notes · ${fmt(m.total)}`;
}


function describeBand() {
  const m = S.music;
  if (!m) return;
  const keys = [...new Set(m.sections.map(s => s.name))];
  const band = GROUPS.map(g => voiceFor(g.id).name.toLowerCase()).join(', ');
  $('d6').textContent = `${m.ev.length} notes for ${band}, with echoes, panned and sent through a vast, dark 6-second reverb: ${fmt(m.total)} at ${S.bpm} BPM. Keys: ${keys.join(' → ')}.`;
}

// switch the instrument for one part: only that part is re-rendered, and playback carries on
async function changeVoice(gid, id) {
  S.voice[gid] = id;
  describeBand();
  const m = S.music;
  if (!m || !S.stems) return;   // the next full render will use it
  const job = S.voiceJob = (S.voiceJob || 0) + 1;
  $('status').textContent = `Rendering ${VOICES[id].name.toLowerCase()}…`;
  await new Promise(r => setTimeout(r, 30));
  if (job !== S.voiceJob || m !== S.music || !S.stems) return;
  const part = renderStems(m, gid);
  const was = S.playing;
  if (was) stop();
  if (part[gid]) S.stems[gid] = part[gid]; else delete S.stems[gid];
  if (was) play();
  $('status').textContent = `Ready · ${m.ev.length} notes · ${fmt(m.total)}`;
}

// ---------------------------------------------------------- mixer
// Each part shows one bubble with its current instrument. Clicking it opens the instruments that
// part can use as a ring of floating bubbles around it; choosing one switches the sound.
const mixer = $('mixer');
const orbit = { el: null, owner: null };

function closeOrbit(returnFocus = true) {
  if (!orbit.el) return;
  const { el, owner } = orbit;
  orbit.el = orbit.owner = null;
  el.remove();
  owner.setAttribute('aria-expanded', 'false');
  if (returnFocus) owner.focus();
}

function openOrbit(g, owner, onChoose) {
  closeOrbit(false);
  const ids = ROLE_VOICES[g.role], n = ids.length, current = S.voice[g.id];
  const radius = Math.max(76, Math.min(130, n * 54 / (2 * Math.PI)));
  // centre the ring on the bubble, nudged inward so it stays on screen
  const r = owner.getBoundingClientRect(), pad = radius + 34;
  const cx = clamp(r.left + r.width / 2, pad, Math.max(pad, innerWidth - pad));
  const cy = clamp(r.top + r.height / 2, pad, Math.max(pad, innerHeight - pad));

  const el = document.createElement('div');
  el.className = 'orbit';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', `Choose the ${g.name.toLowerCase()} instrument`);
  const slots = ids.map((id, k) => {
    // start at the top; even counts turn half a step so no bubble sits on the name label below the hub
    const a = -Math.PI / 2 + (n % 2 ? 0 : Math.PI / n) + k * 2 * Math.PI / n;
    const x = Math.round(Math.cos(a) * radius), y = Math.round(Math.sin(a) * radius);
    return `<span class="orbit-slot" style="--x:${x}px;--y:${y}px;--i:${k}">`
      + `<button type="button" class="bubble opt" data-voice="${id}" aria-label="${VOICES[id].name}" aria-pressed="${id === current}">${iconSvg(id)}</button></span>`;
  }).join('');
  el.innerHTML = '<div class="orbit-scrim"></div>'
    + `<div class="orbit-ring" style="left:${cx}px;top:${cy}px">`
    + `<button type="button" class="bubble hub" aria-label="Close">${iconSvg(current)}</button>`
    + `<span class="orbit-name" aria-live="polite">${VOICES[current].name}</span>${slots}</div>`;
  document.body.appendChild(el);
  orbit.el = el; orbit.owner = owner;
  owner.setAttribute('aria-expanded', 'true');

  const opts = [...el.querySelectorAll('.opt')], name = el.querySelector('.orbit-name');
  const show = id => { name.textContent = VOICES[id].name; };
  el.querySelector('.orbit-scrim').addEventListener('click', () => closeOrbit());
  el.querySelector('.hub').addEventListener('click', () => closeOrbit());
  opts.forEach((btn, k) => {
    btn.addEventListener('click', () => { onChoose(btn.dataset.voice); closeOrbit(); });
    btn.addEventListener('pointerenter', () => show(btn.dataset.voice));
    btn.addEventListener('focus', () => show(btn.dataset.voice));
    btn.addEventListener('pointerleave', () => show(document.activeElement?.dataset?.voice || current));
  });
  el.addEventListener('keydown', e => {
    const k = opts.indexOf(document.activeElement);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
      ?? (e.key === 'Tab' ? (e.shiftKey ? -1 : 1) : 0);
    if (e.key === 'Escape') { e.preventDefault(); closeOrbit(); }
    else if (step) { e.preventDefault(); opts[(Math.max(k, 0) + step + n) % n].focus(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); opts[e.key === 'Home' ? 0 : n - 1].focus(); }
  });
  requestAnimationFrame(() => el.classList.add('open'));   // let the bubbles fly out
  (opts[ids.indexOf(current)] || opts[0]).focus({ preventScroll: true });
}
addEventListener('resize', () => closeOrbit(false));
addEventListener('scroll', () => closeOrbit(false), { passive: true });

for (const g of GROUPS) {
  const ids = ROLE_VOICES[g.role];
  S.voice[g.id] = ids[0];
  const row = document.createElement('div');
  row.className = 'inst'; row.dataset.group = g.id;
  row.innerHTML = `<input type="checkbox" id="mute-${g.id}" checked aria-label="Play the ${g.name.toLowerCase()}">`
    + `<span class="sw ${g.sw}"></span>`
    + `<div class="nm"><label for="mute-${g.id}">${g.name}</label><small class="src">${g.src}</small>`
    + `<span class="cur" id="cur-${g.id}">${VOICES[ids[0]].name}</span></div>`
    + `<button type="button" class="bubble main" aria-haspopup="dialog" aria-expanded="false"`
    + ` aria-label="${g.name}: ${VOICES[ids[0]].name}. Choose another instrument">${iconSvg(ids[0])}<span class="more" aria-hidden="true">${ids.length}</span></button>`;

  row.querySelector('input').addEventListener('change', e => {
    S.mute[g.id] = !e.target.checked;
    row.classList.toggle('muted', S.mute[g.id]);
    if (S.graph) setGain(S.graph.groups[g.id].gain, S.mute[g.id] ? 0 : 1);
    S.dirty = true;
  });

  const main = row.querySelector('.bubble.main');
  const choose = id => {
    main.querySelector('svg').outerHTML = iconSvg(id);
    main.setAttribute('aria-label', `${g.name}: ${VOICES[id].name}. Choose another instrument`);
    $('cur-' + g.id).textContent = VOICES[id].name;
    if (S.voice[g.id] !== id) changeVoice(g.id, id);
  };
  main.addEventListener('click', () => (orbit.owner === main ? closeOrbit() : openOrbit(g, main, choose)));
  mixer.appendChild(row);
}


// ---------------------------------------------------------- input
function scrubbable(el, toTime) {
  let resume = false, down = false;
  el.addEventListener('pointerdown', e => {
    if (!S.music || (el.id === 'imgCv' && (S.proc.kind === 'video' || R.on))) return;   // reactive mode: the cursor plays instead
    down = true; resume = S.playing; stop();
    el.setPointerCapture(e.pointerId);
    S.offset = toTime(e); S.dirty = true;
  });
  el.addEventListener('pointermove', e => { if (down) { S.offset = toTime(e); S.dirty = true; } });
  const end = () => { if (!down) return; down = false; if (resume) play(); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
function imageTime(e) {
  const m = S.music, px = clamp(canvasPoint(e.currentTarget, e).fx, 0, 0.9999) * m.U;
  let i = 0; while (i < m.beats - 1 && m.bb[i + 1] <= px) i++;
  return (i + (px - m.bb[i]) / (m.bb[i + 1] - m.bb[i])) * m.beat;
}
for (const id of ['imgCv', 'timeCv', 'cvR', 'cvG', 'cvB']) scrubbable($(id), imageTime);
scrubbable($('score'), e => {
  const r = e.currentTarget.getBoundingClientRect(), m = S.music, dom = (m.beats + 1) * m.beat;
  return clamp((e.clientX - r.left - GUT) / (r.width - GUT - RPAD), 0, 1) * dom;
});

$('playBtn').addEventListener('click', () => (S.playing ? stop() : play()));
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.target.closest('input, select, button, label')) return;
  e.preventDefault(); if (!$('playBtn').disabled) (S.playing ? stop() : play());
});
$('beats').addEventListener('change', e => { S.beats = +e.target.value; rebuild(); });
$('bpm').addEventListener('input', e => { $('bpmVal').textContent = e.target.value; });
// video scan mode: switching re-reads the same frames and recomposes
for (const radio of document.querySelectorAll('input[name="scanMode"]')) {
  radio.addEventListener('change', e => {
    if (!e.target.checked) return;
    S.videoScan = e.target.value;
    if (S.proc?.kind === 'video') { videoCaption(); rebuild(); }
  });
}
$('bpm').addEventListener('change', e => { S.bpm = +e.target.value; rebuild(); });
$('volume').addEventListener('input', e => {
  $('volumeVal').textContent = e.target.value;
  S.volume = e.target.value / 100;
  if (S.graph) setGain(S.graph.out.gain, S.volume);
});
$('reverb').addEventListener('change', e => { S.reverb = e.target.checked; if (S.graph) setGain(S.graph.wet.gain, S.reverb ? 0.75 : 0); });
$('sampleBtn').addEventListener('click', () => processImage(sampleImage(), 'Sample image (generated view of Earth from orbit)'));
$('fileLbl').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });

function loadFile(file) {
  if (file && (file.type.startsWith('video/') || /\.(webm|mp4|mkv|mov|ogv|m4v)$/i.test(file.name))) { processVideo(file); return; }
  if (!file || !file.type.startsWith('image/')) { $('status').textContent = 'That file is not an image or video. Choose a PNG, JPEG, WebM or MP4.'; return; }
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => processImage(img, file.name);
  img.onerror = () => { $('status').textContent = `Could not read ${file.name}. Try a PNG or JPEG.`; };
  img.src = url;
}
$('file').addEventListener('change', e => loadFile(e.target.files[0]));
const drop = $('drop');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); loadFile(e.dataTransfer.files[0]); });

window.addEventListener('resize', () => { S.dirty = true; });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { S.dirty = true; });
new MutationObserver(() => { S.dirty = true; }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });


processImage(sampleImage(), 'Sample image (generated view of Earth from orbit)');
requestAnimationFrame(frame);
