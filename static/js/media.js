// Image Sonifier · media.js
// Loading inputs. Images and videos both become "units" laid out [unit][row][col]:
// an image unit is one pixel column, a video unit is one sampled frame. Also the sample image.

// ---------------------------------------------------------- image / video side
// Both become "units" (mirrors the Python script): arrays laid out [unit][row][col].
// Image: a unit is one pixel column (k = 1). Video: a unit is one sampled frame (k = frame width).
function pixelArrays(n) {
  return { r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), lum: new Float32Array(n), hue: new Float32Array(n), chroma: new Float32Array(n) };
}
function setPixel(A, dst, R, G, B) {
  A.r[dst] = R; A.g[dst] = G; A.b[dst] = B;
  A.lum[dst] = 0.299 * R + 0.587 * G + 0.114 * B;
  const mx = Math.max(R, G, B), c2 = mx - Math.min(R, G, B);
  A.chroma[dst] = c2;
  if (c2 > 0) A.hue[dst] = (mx === R ? mod((G - B) / c2, 6) : mx === G ? (B - R) / c2 + 2 : (R - G) / c2 + 4) / 6;
}
function channelCanvas(w, h, fill) {   // fill(k) returns value 0..1 for pixel (x, y) channel k
  const cc = document.createElement('canvas'); cc.width = w; cc.height = h;
  const ctx = cc.getContext('2d'), id = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    for (let k = 0; k < 3; k++) id.data[o + k] = fill(x, y, k) * 255;
    id.data[o + 3] = 255;
  }
  ctx.putImageData(id, 0, 0); return cc;
}
function showMode(kind) {
  const video = kind === 'video';
  $('timeCv').hidden = !video;
  $('imgCv').classList.toggle('video', video);
  $('scanTitle').textContent = video ? 'Video scan' : 'Image scan';
  $('beats').disabled = video; $('beatsNote').hidden = !video;
}

function processImage(img, label) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.min(400 / iw, 600 / ih);
  const w = Math.max(64, Math.round(iw * s)), h = Math.max(16, Math.round(ih * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data, A = pixelArrays(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    setPixel(A, x * h + y, d[o] / 255, d[o + 1] / 255, d[o + 2] / 255);   // unit = column x
  }
  const chans = [0, 1, 2].map(k => channelCanvas(w, h, (x, y, kk) => kk === k ? d[(y * w + x) * 4 + k] / 255 : 0));
  if (S.videoUrl) { URL.revokeObjectURL(S.videoUrl); S.videoUrl = null; }
  S.src = img;
  S.proc = { kind: 'image', U: w, h, k: 1, aspect: iw / ih, fps: null, iw, ih, ...A, chans };
  showMode('image');
  const dv = $('imgCv'), ds = Math.min(1, 1200 / iw);
  dv.width = Math.max(1, Math.round(iw * ds)); dv.height = Math.max(1, Math.round(ih * ds));
  for (const id of ['cvR', 'cvG', 'cvB']) { $(id).width = w; $(id).height = h; }
  $('imgCaption').textContent = `${label} · click or drag on the image to jump to a slice. You can also drop an image or video file here.`;
  $('d1').textContent = `${iw} × ${ih} px image, analysed at ${w} × ${h} px.`;
  rebuild();
}

// Decode a video into small frames, sampled evenly through time (8 per second, at most 600).
// Plays it muted at 4x and grabs frames as they are shown; falls back to seeking.
const VIDEO_FPS = 8, VIDEO_MAX_FRAMES = 600, VIDEO_WIDTH = 96;
const once = (el, ev) => new Promise((res, rej) => {
  const ok = () => { el.removeEventListener('error', bad); res(); }, bad = () => { el.removeEventListener(ev, ok); rej(new Error('decode')); };
  el.addEventListener(ev, ok, { once: true }); el.addEventListener('error', bad, { once: true });
});
async function readVideo(v, onProgress) {
  await once(v, 'loadedmetadata');
  if (!isFinite(v.duration)) {            // some recorded WebM files only learn their length after a seek to the end
    v.currentTime = 1e7; await once(v, 'seeked'); v.currentTime = 0; await once(v, 'seeked');
  }
  const duration = v.duration, W = v.videoWidth, H = v.videoHeight;
  if (!isFinite(duration) || duration <= 0 || !W || !H) throw new Error('no usable video track');
  const fps = Math.min(VIDEO_FPS, VIDEO_MAX_FRAMES / duration), n = Math.max(2, Math.floor(duration * fps));
  const w = VIDEO_WIDTH, h = Math.max(2, Math.round(w * H / W / 2) * 2);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const frames = new Array(n).fill(null);
  const grab = i => { cx.drawImage(v, 0, 0, w, h); frames[i] = cx.getImageData(0, 0, w, h).data; };

  if ('requestVideoFrameCallback' in v) {
    await new Promise(resolve => {
      let last = -1, done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const cb = (_, meta) => {
        const idx = Math.min(n - 1, Math.floor(meta.mediaTime * fps));
        if (idx > last) { grab(idx); last = idx; onProgress(idx / n); }
        if (last >= n - 1) finish(); else v.requestVideoFrameCallback(cb);
      };
      v.requestVideoFrameCallback(cb);
      v.addEventListener('ended', finish, { once: true });
      v.playbackRate = 4; v.currentTime = 0;
      v.play().catch(finish);
    });
    v.pause(); v.playbackRate = 1;
  }
  for (let i = 0; i < n; i++) if (!frames[i] && i > 0 && frames[i - 1] && frames.slice(i).some(Boolean)) frames[i] = frames[i - 1];
  for (let i = 0; i < n; i++) {           // seek for anything still missing
    if (frames[i]) continue;
    v.currentTime = Math.min(duration - 0.01, i / fps); await once(v, 'seeked'); grab(i); onProgress(i / n);
  }
  v.currentTime = 0;
  return { frames, fps, duration, W, H, w, h };
}

async function processVideo(file) {
  const job = ++S.job;
  stop();
  const url = URL.createObjectURL(file), v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  $('playBtn').disabled = true;
  $('status').textContent = 'Reading video frames…';
  // show the video while it is read (browsers only hand over frames of videos that are on the page)
  v.className = 'reading'; $('imgCv').hidden = true; $('drop').appendChild(v);
  let data;
  try {
    data = await readVideo(v, f => { $('status').textContent = `Reading video frames… ${Math.round(f * 100)}%`; });
  } catch (e) {
    v.remove(); $('imgCv').hidden = false;
    URL.revokeObjectURL(url);
    $('status').textContent = `Could not play ${file.name} in this browser. Try a WebM (VP8/VP9) or MP4 (H.264) file.`;
    $('playBtn').disabled = !S.stems;
    return;
  }
  v.remove(); $('imgCv').hidden = false;
  if (job !== S.job) { URL.revokeObjectURL(url); return; }
  const { frames, fps, duration, W, H, w, h } = data, n = frames.length;
  const A = pixelArrays(n * h * w);
  frames.forEach((d, u) => { for (let q = 0; q < w * h; q++) setPixel(A, u * h * w + q, d[q * 4] / 255, d[q * 4 + 1] / 255, d[q * 4 + 2] / 255); });
  // slit-scans: column u = frame u averaged across its width (a picture of the video through time)
  const rowMean = (arr, u, y) => { let sum = 0; const o = (u * h + y) * w; for (let x = 0; x < w; x++) sum += arr[o + x]; return sum / w; };
  const chans = [A.r, A.g, A.b].map((arr, k) => channelCanvas(n, h, (x, y, kk) => kk === k ? rowMean(arr, x, y) : 0));
  const slit = channelCanvas(n, h, (x, y, kk) => rowMean([A.r, A.g, A.b][kk], x, y));
  if (S.videoUrl) URL.revokeObjectURL(S.videoUrl);
  S.videoUrl = url;
  v.addEventListener('seeked', () => { S.dirty = true; });
  S.src = v;
  S.proc = { kind: 'video', U: n, h, k: w, aspect: W / H, fps, duration, iw: W, ih: H, ...A, chans, slit };
  showMode('video');
  const dv = $('imgCv'), ds = Math.min(1, 1200 / W);
  dv.width = Math.max(1, Math.round(W * ds)); dv.height = Math.max(1, Math.round(H * ds));
  for (const id of ['cvR', 'cvG', 'cvB']) { $(id).width = n; $(id).height = h; }
  $('imgCaption').textContent = `${file.name} · the highlighted strip is what the music hears right now; it sweeps across the frame once per section. Click or drag on the timeline to jump.`;
  $('d1').textContent = `${W} × ${H} px video, ${duration.toFixed(1)} s, analysed as ${n} frames of ${w} × ${h} px (${fps.toFixed(1)} per second).`;
  rebuild();
}


// ---------------------------------------------------------- sample image
function sampleImage() {
  const c = document.createElement('canvas'); c.width = 800; c.height = 450;
  const x = c.getContext('2d'), rnd = mulberry32(7);
  x.fillStyle = '#05060c'; x.fillRect(0, 0, 800, 450);
  x.globalCompositeOperation = 'lighter';
  const blobs = [
    [110, 260, 240, '255,70,90'], [300, 130, 210, '70,220,140'], [470, 300, 250, '60,110,255'],
    [640, 160, 210, '255,110,220'], [400, 240, 140, '255,200,90'], [740, 330, 170, '90,230,255'],
  ];
  for (const [cx, cy, r, col] of blobs) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${col},.85)`); g.addColorStop(0.45, `rgba(${col},.28)`); g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 800, 450);
  }
  for (let i = 0; i < 600; i++) {
    x.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
    const s = rnd() < 0.95 ? 1 : 2.5;
    x.fillRect(rnd() * 800, rnd() * 450, s, s);
  }
  x.globalCompositeOperation = 'source-over';
  return c;
}
