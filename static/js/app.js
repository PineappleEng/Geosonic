// Image Sonifier · app.js
// Wiring: rebuilding the music when the input or settings change, the instrument mixer,
// controls, scrubbing, file loading, and start-up with the sample image.

async function rebuild() {
  if (!S.proc) return;
  const job = ++S.job;
  stop();
  S.offset = 0;
  S.music = compose();
  S.stems = null; S.dirty = true; lastReadout = '';
  const m = S.music;
  const keys = [...new Set(m.sections.map(s => s.name))];
  const video = S.proc.kind === 'video', secs = `${m.bars} bars and ${m.nSec} section${m.nSec > 1 ? 's' : ''} of up to 4 bars`;
  $('d3').textContent = video
    ? `The video becomes ${m.beats} beats in ${m.meter}/4 (${fmt(m.beats * m.beat)} of its ${fmt(S.proc.duration)}), grouped into ${secs}. Each beat hears the frames shown during it, through a strip that sweeps across the frame once per section.`
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
// Each part gets a row of round icon buttons ("bubbles"), one per instrument it can use.
// They behave as a radio group: click to choose, or Tab in and use the arrow keys.
const mixer = $('mixer');
for (const g of GROUPS) {
  const ids = ROLE_VOICES[g.role];
  S.voice[g.id] = ids[0];
  const row = document.createElement('div');
  row.className = 'inst'; row.dataset.group = g.id;
  const bubbles = ids.map((id, k) => {
    const name = VOICES[id].name;
    return `<button type="button" class="bubble" role="radio" data-voice="${id}" data-name="${name}" aria-label="${name}"`
      + ` aria-checked="${k === 0}" tabindex="${k === 0 ? 0 : -1}">${iconSvg(id)}</button>`;
  }).join('');
  row.innerHTML = `<input type="checkbox" id="mute-${g.id}" checked aria-label="Play the ${g.name.toLowerCase()}">`
    + `<span class="sw ${g.sw}"></span>`
    + `<div class="nm"><label for="mute-${g.id}">${g.name}</label><small class="src">${g.src}</small>`
    + `<span class="cur" id="cur-${g.id}">${VOICES[ids[0]].name}</span></div>`
    + `<div class="bubbles" role="radiogroup" aria-label="${g.name} instrument">${bubbles}</div>`;

  row.querySelector('input').addEventListener('change', e => {
    S.mute[g.id] = !e.target.checked;
    row.classList.toggle('muted', S.mute[g.id]);
    if (S.graph) setGain(S.graph.groups[g.id].gain, S.mute[g.id] ? 0 : 1);
    S.dirty = true;
  });

  const buttons = [...row.querySelectorAll('.bubble')];
  const choose = (btn, focus) => {
    for (const b of buttons) { const on = b === btn; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; }
    if (focus) btn.focus();
    $('cur-' + g.id).textContent = btn.dataset.name;
    if (S.voice[g.id] !== btn.dataset.voice) changeVoice(g.id, btn.dataset.voice);
  };
  buttons.forEach((btn, k) => {
    btn.addEventListener('click', () => choose(btn, false));
    btn.addEventListener('keydown', e => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      let next = null;
      if (step) next = buttons[(k + step + buttons.length) % buttons.length];
      else if (e.key === 'Home') next = buttons[0];
      else if (e.key === 'End') next = buttons[buttons.length - 1];
      if (next) { e.preventDefault(); choose(next, true); }
    });
  });
  mixer.appendChild(row);
}


// ---------------------------------------------------------- input
function scrubbable(el, toTime) {
  let resume = false, down = false;
  el.addEventListener('pointerdown', e => {
    if (!S.music || (el.id === 'imgCv' && S.proc.kind === 'video')) return;
    down = true; resume = S.playing; stop();
    el.setPointerCapture(e.pointerId);
    S.offset = toTime(e); S.dirty = true;
  });
  el.addEventListener('pointermove', e => { if (down) { S.offset = toTime(e); S.dirty = true; } });
  const end = () => { if (!down) return; down = false; if (resume) play(); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
function imageTime(e) {
  const r = e.currentTarget.getBoundingClientRect(), m = S.music;
  const px = clamp((e.clientX - r.left) / r.width, 0, 0.9999) * m.U;
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
$('bpm').addEventListener('change', e => { S.bpm = +e.target.value; rebuild(); });
$('volume').addEventListener('input', e => {
  $('volumeVal').textContent = e.target.value;
  S.volume = e.target.value / 100;
  if (S.graph) setGain(S.graph.out.gain, S.volume);
});
$('reverb').addEventListener('change', e => { S.reverb = e.target.checked; if (S.graph) setGain(S.graph.wet.gain, S.reverb ? 0.75 : 0); });
$('sampleBtn').addEventListener('click', () => processImage(sampleImage(), 'Sample image (generated nebula)'));
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


processImage(sampleImage(), 'Sample image (generated nebula)');
requestAnimationFrame(frame);
