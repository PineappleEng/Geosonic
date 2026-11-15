// Hearing Earth · export.js
// Exporting the generated sonification as MP3 audio or MP4 video.
// Uses OfflineAudioContext for fast offline audio rendering, lamejs for MP3 encoding,
// and WebCodecs (VideoEncoder/AudioEncoder) + mp4-muxer with MediaRecorder fallback for MP4.

// ---------------------------------------------------------- audio mix rendering
async function renderFullAudioMix(targetSampleRate = 44100) {
  if (!S.music || !S.stems) return null;
  const m = S.music;
  const sr = targetSampleRate;
  const duration = m.total;
  const length = Math.ceil(duration * sr);
  const actx = new OfflineAudioContext(2, length, sr);

  // master -> gentle tanh soft-clip -> compressor -> output volume (matching ensureCtx)
  const master = actx.createGain();
  master.gain.value = 0.85;

  const shaper = actx.createWaveShaper();
  const curve = new Float32Array(1025);
  for (let i = 0; i < curve.length; i++) {
    const v = i / 512 - 1;
    curve[i] = Math.tanh(1.2 * v) / Math.tanh(1.2);
  }
  shaper.curve = curve;

  const comp = actx.createDynamicsCompressor();
  comp.threshold.value = -8;
  comp.knee.value = 6;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;

  const out = actx.createGain();
  out.gain.value = S.volume;

  master.connect(shaper);
  shaper.connect(comp);
  comp.connect(out);
  out.connect(actx.destination);

  // Vast, dark space reverb impulse response (mulberry32 seeds 1 & 2)
  const n = Math.floor(6.0 * sr), pd = Math.floor(0.04 * sr);
  const ir = actx.createBuffer(2, n + pd, sr);
  [1, 2].forEach((seed, c) => {
    const d = ir.getChannelData(c);
    const rnd = mulberry32(seed);
    const hist = new Float64Array(16);
    let ss = 0, sum = 0;
    for (let i = 0; i < n; i++) {
      const x = gaussian(rnd);
      sum += x - hist[i % 16];
      hist[i % 16] = x;
      const u = i / (n - 1);
      const v = 0.25 * x * Math.exp(-10 * u) + (sum / 16) * 3.9 * Math.exp(-4 * u);
      d[pd + i] = v;
      ss += v * v;
    }
    const k = 1 / Math.sqrt(ss);
    for (let i = pd; i < n + pd; i++) d[i] *= k;
  });

  const conv = actx.createConvolver();
  conv.normalize = false;
  conv.buffer = ir;

  const wet = actx.createGain();
  wet.gain.value = S.reverb ? 0.75 : 0;
  conv.connect(wet);
  wet.connect(master);

  // Connect all stems
  for (const g of GROUPS) {
    const gn = actx.createGain();
    gn.gain.value = S.mute[g.id] ? 0 : 1;
    const send = actx.createGain();
    send.gain.value = g.send;
    gn.connect(master);
    gn.connect(send);
    send.connect(conv);

    const stemBuf = S.stems[g.id];
    if (stemBuf) {
      let ab = stemBuf;
      if (stemBuf._l) {
        ab = actx.createBuffer(2, stemBuf._l.length, SR);
        ab.copyToChannel(stemBuf._l, 0);
        ab.copyToChannel(stemBuf._r, 1);
      }
      const src = actx.createBufferSource();
      src.buffer = ab;
      src.connect(gn);
      src.start(0);
    }
  }

  return await actx.startRendering();
}

function getExportBaseName() {
  if (S.proc?.name) {
    return S.proc.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_\-]/g, '_');
  }
  return 'orbit';
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
}

// ---------------------------------------------------------- MP3 export
async function exportAudioMp3(onProgress) {
  if (!S.music || !S.stems) return;
  if (S.exporting) return;
  S.exporting = true;
  updateExportButtons();

  const wasPlaying = S.playing;
  if (wasPlaying) stop();

  try {
    onProgress?.('Rendering audio mix…', 10);
    const audioBuffer = await renderFullAudioMix(44100);
    if (!audioBuffer) throw new Error('Audio mix rendering failed');

    onProgress?.('Encoding MP3…', 30);
    const numChannels = 2;
    const sampleRate = 44100;
    const kbps = 192;
    const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);

    const totalSamples = audioBuffer.length;
    const leftFloat = audioBuffer.getChannelData(0);
    const rightFloat = audioBuffer.getChannelData(1);

    const leftInt16 = new Int16Array(totalSamples);
    const rightInt16 = new Int16Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      const l = leftFloat[i];
      const r = rightFloat[i];
      leftInt16[i] = Math.max(-32768, Math.min(32767, l < 0 ? l * 32768 : l * 32767));
      rightInt16[i] = Math.max(-32768, Math.min(32767, r < 0 ? r * 32768 : r * 32767));
    }

    const blockSize = 1152;
    const mp3Data = [];
    const totalBlocks = Math.ceil(totalSamples / blockSize);

    for (let i = 0, blockIdx = 0; i < totalSamples; i += blockSize, blockIdx++) {
      const leftChunk = leftInt16.subarray(i, Math.min(i + blockSize, totalSamples));
      const rightChunk = rightInt16.subarray(i, Math.min(i + blockSize, totalSamples));
      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) mp3Data.push(mp3buf);

      if (blockIdx % 50 === 0) {
        const pct = 30 + Math.round((blockIdx / totalBlocks) * 65);
        onProgress?.(`Encoding MP3… ${pct}%`, pct);
        await new Promise(r => setTimeout(r, 0));
      }
    }

    const endBuf = mp3encoder.flush();
    if (endBuf.length > 0) mp3Data.push(endBuf);

    onProgress?.('Finalizing MP3 file…', 98);
    const blob = new Blob(mp3Data, { type: 'audio/mp3' });
    const filename = `hearing-earth-${getExportBaseName()}.mp3`;
    triggerDownload(blob, filename);

    onProgress?.('MP3 audio exported!', 100);
    return { blob, filename };
  } finally {
    S.exporting = false;
    updateExportButtons();
    if (wasPlaying) play();
  }
}

// ---------------------------------------------------------- Video HUD Drawing
function drawVideoHud(cv, t) {
  const m = S.music;
  if (!m) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;

  // Bottom overlay gradient
  const barHeight = Math.max(34, Math.round(H * 0.085));
  const grad = ctx.createLinearGradient(0, H - barHeight - 14, 0, H);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(0.35, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.82)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - barHeight - 14, W, barHeight + 14);

  // Text setup
  ctx.save();
  ctx.textBaseline = 'middle';
  const textY = H - barHeight / 2 - 2;
  const pad = Math.max(14, Math.round(W * 0.02));

  // Left side: Title
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;

  const titleSize = Math.max(12, Math.min(18, Math.round(H * 0.035)));
  ctx.font = `600 ${titleSize}px "Sora", "IBM Plex Sans", system-ui, sans-serif`;
  //ctx.fillText('Hearing Earth', pad, textY);

  // Right side: Musical choices at this point in orbit
  const i = clamp(Math.floor(t / m.beat), 0, m.beats - 1);
  const bar = Math.floor(i / m.meter);
  const info = m.barInfo?.[bar];
  const sec = info ? m.sections[info.sec] : null;

  if (sec && info) {
    const infoSize = Math.max(10, Math.min(15, Math.round(H * 0.03)));
    ctx.font = `500 ${infoSize}px "IBM Plex Mono", monospace`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    const chordText = info.name || '';
    const beatText = `Beat ${i + 1}/${m.beats}`;
    const desc = `${sec.name} · ${chordText} · ${beatText}`;
    ctx.textAlign = 'right';
    //ctx.fillText(desc, W - pad, textY);
  }

  ctx.restore();
}

// Clean video frame snapshot buffer to prevent any black frames if decode is delayed
let _exportVideoSnapshot = null;

function drawVideoOverlay(cv, t) {
  const m = S.music;
  if (!m || !S.proc) return;
  const x = cv.getContext('2d'), W = cv.width, H = cv.height;
  const i = Math.floor(t / m.beat);
  if (i < 0 || i >= m.beats) return;
  const [, , c, d] = m.beatRegions[i], sx = W / S.proc.k, lw = Math.max(1, W / 600);
  x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 0, c * sx, H); x.fillRect(d * sx, 0, W - d * sx, H);
  x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = lw * 2; x.strokeRect(c * sx + lw, lw, (d - c) * sx - 2 * lw, H - 2 * lw);
}

function drawExportFrame(cv, t, frameConfirmed = false) {
  const m = S.music;
  const W = cv.width, H = cv.height;
  const ctx = cv.getContext('2d');
  const cols = S.proc?.kind === 'video' ? m.used : 0;

  if (cols) {
    const v = S.src;
    if (!_exportVideoSnapshot || _exportVideoSnapshot.width !== W || _exportVideoSnapshot.height !== H) {
      _exportVideoSnapshot = document.createElement('canvas');
      _exportVideoSnapshot.width = W;
      _exportVideoSnapshot.height = H;
    }
    const snapCtx = _exportVideoSnapshot.getContext('2d');

    if (v && v.readyState >= 2 && frameConfirmed) {
      ctx.drawImage(v, 0, 0, W, H);
      snapCtx.drawImage(v, 0, 0, W, H);
    } else {
      ctx.drawImage(_exportVideoSnapshot, 0, 0, W, H);
    }

    drawVideoOverlay(cv, t);
  } else {
    drawScan(cv, S.src, t, true, null);
  }

  drawVideoHud(cv, t);
}

function waitForAnimationFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

async function seekVideoFrame(v, target, fps) {
  const tolerance = Math.max(0.02, 1 / fps);
  const clamped = Math.max(0, Math.min(target, Math.max(0, v.duration - 0.02)));
  const timeoutMs = 900;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (v.readyState >= 2 && !v.seeking && Math.abs(v.currentTime - clamped) <= tolerance) {
      if ('requestVideoFrameCallback' in v) {
        await waitForAnimationFrame();
      } else {
        await waitForAnimationFrame();
        await waitForAnimationFrame();
      }
      return;
    }

    if ('requestVideoFrameCallback' in v) {
      const confirmed = await new Promise(resolve => {
        let settled = false;
        let timer;
        const finish = value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        };
        const callback = (_, meta) => {
          if (v.readyState >= 2 && !v.seeking) finish(true);
          else if (Math.abs(meta.mediaTime - clamped) <= tolerance) finish(true);
          else v.requestVideoFrameCallback(callback);
        };
        timer = setTimeout(() => finish(false), timeoutMs);
        v.requestVideoFrameCallback(callback);
        v.currentTime = clamped;
      });
      if (confirmed) return;
    } else {
      const sought = await new Promise(resolve => {
        let settled = false;
        let timer;
        const finish = value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          v.removeEventListener('seeked', onSeeked);
          v.removeEventListener('error', onError);
          resolve(value);
        };
        const onSeeked = () => finish(true);
        const onError = () => finish(false);
        timer = setTimeout(() => finish(false), timeoutMs);
        v.addEventListener('seeked', onSeeked, { once: true });
        v.addEventListener('error', onError, { once: true });
        v.currentTime = clamped;
      });
      if (sought) {
        await waitForAnimationFrame();
        await waitForAnimationFrame();
        if (v.readyState >= 2 && !v.seeking && Math.abs(v.currentTime - clamped) <= tolerance) return;
      }
    }
  }

  const error = new Error(`Could not decode video frame at ${clamped.toFixed(3)}s`);
  error.code = 'VIDEO_FRAME_UNAVAILABLE';
  throw error;
}

async function startVideoPlayback(v, onFrame) {
  let signalResolve;
  let signalReject;
  const signal = new Promise((resolve, reject) => {
    signalResolve = resolve;
    signalReject = reject;
  });
  let timer;
  const onPlaying = () => signalResolve();
  const onError = () => signalReject(new Error('Could not start video playback'));

  v.addEventListener('playing', onPlaying, { once: true });
  v.addEventListener('error', onError, { once: true });
  if ('requestVideoFrameCallback' in v) {
    v.requestVideoFrameCallback((now, meta) => {
      onFrame?.(now, meta);
      signalResolve();
    });
  }

  try {
    timer = setTimeout(() => signalReject(new Error('Timed out waiting for video playback')), 900);
    await v.play();
    await signal;
    if (!('requestVideoFrameCallback' in v)) {
      await waitForAnimationFrame();
      await waitForAnimationFrame();
    }
  } finally {
    clearTimeout(timer);
    v.removeEventListener('playing', onPlaying);
    v.removeEventListener('error', onError);
  }
}

// ---------------------------------------------------------- MP4 export (WebCodecs + mp4-muxer)
async function exportVideoMp4(onProgress) {
  if (!S.music || !S.stems) return;
  if (S.exporting) return;
  S.exporting = true;
  updateExportButtons();

  const wasPlaying = S.playing;
  if (wasPlaying) stop();

  const hasWebCodecs = typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof Mp4Muxer !== 'undefined';

  try {
    if (!hasWebCodecs) {
      return await exportVideoWithMediaRecorder(onProgress);
    }

    const aspect = S.proc?.aspect || 16 / 9;
    let targetW = 1280;
    if (S.proc?.iw && S.proc.iw < targetW) targetW = Math.max(640, S.proc.iw);
    targetW = Math.round(targetW / 2) * 2;
    let targetH = Math.round(targetW / aspect / 2) * 2;
    if (targetH < 240) targetH = 240;

    // Detect audio codec support (AAC preferred, Opus fallback)
    let audioCodec = 'aac';
    let audioEncoderCodec = 'mp4a.40.2';
    let audioSampleRate = 44100;

    try {
      const aacSup = await AudioEncoder.isConfigSupported({
        codec: 'mp4a.40.2',
        sampleRate: 44100,
        numberOfChannels: 2,
        bitrate: 128000
      });
      if (!aacSup || !aacSup.supported) {
        const opusSup = await AudioEncoder.isConfigSupported({
          codec: 'opus',
          sampleRate: 48000,
          numberOfChannels: 2,
          bitrate: 128000
        });
        if (opusSup && opusSup.supported) {
          audioCodec = 'opus';
          audioEncoderCodec = 'opus';
          audioSampleRate = 48000;
        }
      }
    } catch (e) {
      audioCodec = 'opus';
      audioEncoderCodec = 'opus';
      audioSampleRate = 48000;
    }

    // Detect video codec configuration
    let videoEncoderCodec = 'avc1.42001f'; // H.264 Baseline
    try {
      const vSup = await VideoEncoder.isConfigSupported({
        codec: 'avc1.42001f',
        width: targetW,
        height: targetH,
        bitrate: 2500000
      });
      if (!vSup || !vSup.supported) {
        const vSup2 = await VideoEncoder.isConfigSupported({
          codec: 'avc1.4d002a',
          width: targetW,
          height: targetH,
          bitrate: 2500000
        });
        if (vSup2 && vSup2.supported) videoEncoderCodec = 'avc1.4d002a';
      }
    } catch (e) {}

    onProgress?.('Preparing audio mix…', 5);
    const audioBuffer = await renderFullAudioMix(audioSampleRate);
    if (!audioBuffer) throw new Error('Audio rendering failed');

    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: targetW,
        height: targetH
      },
      audio: {
        codec: audioCodec,
        numberOfChannels: 2,
        sampleRate: audioSampleRate
      },
      fastStart: 'in-memory'
    });

    let videoEncoderError = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: err => { videoEncoderError = err; console.error('VideoEncoder error:', err); }
    });
    videoEncoder.configure({
      codec: videoEncoderCodec,
      width: targetW,
      height: targetH,
      bitrate: 2500000
    });

    let audioEncoderError = null;
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: err => { audioEncoderError = err; console.error('AudioEncoder error:', err); }
    });
    audioEncoder.configure({
      codec: audioEncoderCodec,
      numberOfChannels: 2,
      sampleRate: audioSampleRate,
      bitrate: 128000
    });

    // Encode audio stream
    onProgress?.('Encoding audio track…', 12);
    const totalAudioFrames = audioBuffer.length;
    const leftData = audioBuffer.getChannelData(0);
    const rightData = audioBuffer.getChannelData(1);
    const audioChunkSize = 4096;

    for (let i = 0; i < totalAudioFrames; i += audioChunkSize) {
      const framesInChunk = Math.min(audioChunkSize, totalAudioFrames - i);
      const planar = new Float32Array(framesInChunk * 2);
      planar.set(leftData.subarray(i, i + framesInChunk), 0);
      planar.set(rightData.subarray(i, i + framesInChunk), framesInChunk);

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: audioSampleRate,
        numberOfFrames: framesInChunk,
        numberOfChannels: 2,
        timestamp: Math.round((i / audioSampleRate) * 1000000),
        data: planar
      });
      audioEncoder.encode(audioData);
      audioData.close();
    }
    await audioEncoder.flush();
    if (audioEncoderError) throw audioEncoderError;

    // Encode video frames
    const fps = 30;
    const frameDurationUs = Math.round(1000000 / fps);
    const totalSeconds = S.music.total;
    const totalVideoFrames = Math.ceil(totalSeconds * fps);

    const offCanvas = document.createElement('canvas');
    offCanvas.width = targetW;
    offCanvas.height = targetH;

    // Ensure video element is paused and primed at frame 0
    if (S.proc.kind === 'video' && S.src) {
      const v = S.src;
      v.pause();
      if (Math.abs(v.currentTime) > 0.01) {
        v.currentTime = 0;
        await new Promise(resolve => {
          v.addEventListener('seeked', resolve, { once: true });
          setTimeout(resolve, 500);
        });
      }
      for (let k = 0; k < 20 && v.readyState < 2; k++) {
        await new Promise(r => setTimeout(r, 50));
      }
      if (!_exportVideoSnapshot || _exportVideoSnapshot.width !== targetW || _exportVideoSnapshot.height !== targetH) {
        _exportVideoSnapshot = document.createElement('canvas');
        _exportVideoSnapshot.width = targetW;
        _exportVideoSnapshot.height = targetH;
      }
      if (v.readyState >= 2) {
        _exportVideoSnapshot.getContext('2d').drawImage(v, 0, 0, targetW, targetH);
      }
    }

    for (let f = 0; f < totalVideoFrames; f++) {
      if (videoEncoderError) throw videoEncoderError;
      const t = f / fps;

      // Sync video element frame if input is video
      if (S.proc.kind === 'video' && S.src) await seekVideoFrame(S.src, t, fps);

      drawExportFrame(offCanvas, t, true);

      const keyFrame = f % (fps * 2) === 0;
      const timestampUs = Math.round(t * 1000000);
      const videoFrame = new VideoFrame(offCanvas, {
        timestamp: timestampUs,
        duration: frameDurationUs
      });

      videoEncoder.encode(videoFrame, { keyFrame });
      videoFrame.close();

      if (videoEncoder.encodeQueueSize > 6) {
        await new Promise(r => setTimeout(r, 10));
      }

      if (f % 15 === 0) {
        const pct = 15 + Math.round((f / totalVideoFrames) * 80);
        onProgress?.(`Rendering MP4 video… ${pct}%`, pct);
        await new Promise(r => setTimeout(r, 0));
      }
    }

    onProgress?.('Finalizing video file…', 96);
    await videoEncoder.flush();
    if (videoEncoderError) throw videoEncoderError;

    muxer.finalize();

    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    const filename = `hearing-earth-${getExportBaseName()}.mp4`;
    triggerDownload(blob, filename);

    onProgress?.('MP4 video exported!', 100);
    return { blob, filename };
  } catch (err) {
    if (err?.code === 'VIDEO_FRAME_UNAVAILABLE') {
      onProgress?.(`MP4 export cancelled: ${err.message}`, 0);
      throw err;
    }
    if (!hasWebCodecs) throw err;
    console.warn('WebCodecs MP4 export encountered an issue, trying fallback:', err);
    return await exportVideoWithMediaRecorder(onProgress);
  } finally {
    S.exporting = false;
    updateExportButtons();
    if (S.proc?.kind === 'video' && S.src) {
      S.src.pause();
      S.src.currentTime = S.offset || 0;
    }
    S.dirty = true;
    if (wasPlaying) play();
  }
}

// ---------------------------------------------------------- Fallback: MediaRecorder
async function exportVideoWithMediaRecorder(onProgress) {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Video recording is not supported in this browser.');
  }

  const mimeType = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm'
  ].find(t => MediaRecorder.isTypeSupported(t)) || '';

  if (!mimeType) throw new Error('No supported video recording codec found.');

  const isMp4 = mimeType.includes('mp4');
  const ext = isMp4 ? 'mp4' : 'webm';
  const aspect = S.proc?.aspect || 16 / 9;
  let targetW = 960;
  if (S.proc?.iw && S.proc.iw < targetW) targetW = Math.max(640, S.proc.iw);
  targetW = Math.round(targetW / 2) * 2;
  const targetH = Math.round(targetW / aspect / 2) * 2;

  const wasPlaying = S.playing;
  if (wasPlaying) stop();
  S.exporting = true;
  updateExportButtons();

  let decodedTime = null;
  let trackDecoded = false;
  let trackDecodedFrames;
  if (S.proc?.kind === 'video' && S.src) {
    const v = S.src;
    v.pause();
    try {
      await seekVideoFrame(v, 0, 30);
    } catch (err) {
      onProgress?.(`Video export cancelled: ${err.message}`, 0);
      throw err;
    }
    trackDecodedFrames = (_, meta) => {
      decodedTime = meta.mediaTime;
      if (trackDecoded) v.requestVideoFrameCallback(trackDecodedFrames);
    };
  }

  const cv = document.createElement('canvas');
  cv.width = targetW;
  cv.height = targetH;
  if (S.proc?.kind === 'video' && S.src) drawExportFrame(cv, 0, true);

  const ctx = ensureCtx();
  if (ctx.state === 'suspended') await ctx.resume();
  const dest = ctx.createMediaStreamDestination();

  // Play mix into MediaStreamDestination
  const when = ctx.currentTime + 0.05;
  const sources = [];
  for (const [gid, buf] of Object.entries(S.stems)) {
    let ab = buf;
    if (buf._l) {
      ab = ctx.createBuffer(2, buf._l.length, SR);
      ab.copyToChannel(buf._l, 0);
      ab.copyToChannel(buf._r, 1);
    }
    const src = ctx.createBufferSource();
    src.buffer = ab;
    src.connect(dest);
    src.start(when);
    sources.push(src);
  }

  const canvasStream = cv.captureStream(30);
  const combinedStream = new MediaStream([
    canvasStream.getVideoTracks()[0],
    dest.stream.getAudioTracks()[0]
  ]);

  const recorder = new MediaRecorder(combinedStream, { mimeType });
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  const duration = S.music.total;

  return new Promise((resolve, reject) => {
    let animId;
    const cleanup = () => {
      cancelAnimationFrame(animId);
      trackDecoded = false;
      sources.forEach(s => { try { s.stop(); } catch(e) {} });
      if (S.proc?.kind === 'video' && S.src) {
        S.src.pause();
        S.src.currentTime = S.offset || 0;
      }
      S.exporting = false;
      updateExportButtons();
      S.dirty = true;
      if (wasPlaying) play();
    };

    recorder.onstop = () => {
      cleanup();
      const blob = new Blob(chunks, { type: mimeType });
      const filename = `hearing-earth-${getExportBaseName()}.${ext}`;
      triggerDownload(blob, filename);
      onProgress?.(isMp4 ? 'MP4 video exported!' : 'Video exported (WebM)!', 100);
      resolve({ blob, filename });
    };

    recorder.onerror = e => {
      cleanup();
      onProgress?.('Video export failed while recording frames.', 0);
      reject(e);
    };

    const startRecording = async () => {
      try {
        if (S.proc?.kind === 'video' && S.src) {
          trackDecoded = true;
          await startVideoPlayback(S.src, trackDecodedFrames);
        }
        const startTime = performance.now();
        recorder.start(500);
        const renderTick = () => {
          const elapsed = (performance.now() - startTime) / 1000;
          const t = Math.min(elapsed, duration);
          const v = S.proc?.kind === 'video' ? S.src : null;
          const tolerance = 0.15;
          const frameConfirmed = !v || (v.readyState >= 2 && !v.seeking && (
            ('requestVideoFrameCallback' in v && typeof decodedTime === 'number')
              ? Math.abs(decodedTime - t) <= tolerance
              : Math.abs(v.currentTime - t) <= tolerance
          ));
          drawExportFrame(cv, t, frameConfirmed);

          const pct = Math.min(95, Math.round((t / duration) * 100));
          onProgress?.(`Recording video… ${pct}%`, pct);

          if (elapsed < duration) {
            animId = requestAnimationFrame(renderTick);
          } else {
            setTimeout(() => recorder.stop(), 500);
          }
        };

        animId = requestAnimationFrame(renderTick);
      } catch (err) {
        cleanup();
        onProgress?.(`Video export cancelled: ${err.message}`, 0);
        reject(err);
      }
    };
    startRecording();
  });
}

// ---------------------------------------------------------- UI Wiring
function updateExportButtons() {
  const ready = !!(S.music && S.stems && !S.exporting);
  const mp3Btn = $('exportMp3Btn');
  const mp4Btn = $('exportMp4Btn');
  if (mp3Btn) {
    mp3Btn.disabled = !ready;
    mp3Btn.classList.toggle('busy', S.exporting);
  }
  if (mp4Btn) {
    mp4Btn.disabled = !ready;
    mp4Btn.classList.toggle('busy', S.exporting);
  }
}
