// Geosonic · state.js
// The one shared state object: the loaded image or video, the composed music, rendered
// audio, user settings and playback position.

const S = {
  src: null, proc: null, music: null, stems: null,
  beats: 32, bpm: 60, reverb: true, volume: 0.8, mute: {}, voice: {},   // voice: instrument id chosen per part
  videoScan: 'sweep',   // how a video is read: 'sweep' (a strip crossing the frame) or 'frame' (the whole frame)
  ctx: null, graph: null, nodes: [], playing: false, offset: 0, startedAt: 0,
  dirty: true, job: 0, exporting: false,
};
