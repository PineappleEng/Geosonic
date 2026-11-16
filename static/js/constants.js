// Geosonic · constants.js
// Musical and instrument tables shared by every other script: scales and modes, chord rules,
// harmonic partials for the default instruments, and the band's parts shown in the mixer.

const SR = 44100, TAU = 2 * Math.PI, SECTION_BARS = 4;
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const MODES = {
  Lydian: [0, 2, 4, 6, 7, 9, 11], Ionian: [0, 2, 4, 5, 7, 9, 11], Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10], Aeolian: [0, 2, 3, 5, 7, 8, 10], Phrygian: [0, 1, 3, 5, 7, 8, 10],
};
const MODE_BY_LIGHT = [[0.55, 'Lydian'], [0.40, 'Ionian'], [0.25, 'Mixolydian'], [0.12, 'Dorian'], [0, 'Aeolian']];   // no tense Phrygian
const PENT_MAJOR = [0, 2, 4, 7, 9], PENT_MINOR = [0, 3, 5, 7, 10];
const DEGREES = [0, 1, 3, 4, 5];
const STRONG_BEATS = { 3: [0], 4: [0, 2], 5: [0, 3] };
const HARP_RHYTHMS = [['half notes', 2.0], ['dotted quarters', 1.5], ['quarters', 1.0], ['eighths', 0.5]];
const ECHO = { mel: [0.75, 0.35, 2], arp: [0.75, 0.4, 3] };   // ping-pong echoes: [delay in beats, feedback, repeats]
const CHORD_QUALITY = { '4,7,11': 'maj7', '4,7,10': '7', '3,7,10': 'm7', '3,6,10': 'm7♭5', '4,8,11': 'maj7♯5', '3,7,11': 'm(maj7)' };
const PAD_HARM = [1, 0.4, 0.18, 0.08, 0.04, 0.02, 0.01, 0.005];
// harmonic partials: [ratio, amplitude, decay per second, phase]
// soft, dark timbres for a relaxing sound
const FELT_PIANO = [[1, 1, 0.9, 0], [1.0006, 0.45, 1.0, 0.7], [2, 0.3, 1.8, 0.3], [3, 0.12, 3.0, 1.1], [4, 0.06, 4.5, 0.5], [5, 0.03, 6.0, 2.0]];
const FLUTE = [[1, 1, 0, 0], [2, 0.22, 0, 0.6], [3, 0.07, 0, 1.3], [4, 0.03, 0, 0.4]];
const HARP = [[1, 1, 1.6, 0], [2, 0.35, 2.8, 0.6], [3, 0.15, 4.5, 1.3], [4, 0.06, 6, 0.2]];
const CELESTA = [[1, 1, 0.6, 0], [2, 0.25, 1.2, 0.8], [3, 0.08, 2.5, 1.9], [4, 0.05, 4, 0.4]];
const DRONE = [[1, 1, 0, 0], [1.003, 0.6, 0, 2.0], [2, 0.3, 0, 0.5], [3, 0.1, 0, 1.0]];
const SOFT_BASS = [[1, 1, 0.6, 0], [2, 0.25, 1.5, 0.5], [3, 0.06, 3, 1.2]];
// the band's parts; which instrument plays each one is chosen in the mixer (see voices.js)
const GROUPS = [
  { id: 'melody',   role: 'melody',   layers: ['mel'],            name: 'Melody',   src: 'Red · with echoes',   sw: 'r', send: 0.6 },
  { id: 'harmony',  role: 'harmony',  layers: ['harm'],           name: 'Harmony',  src: 'Red · a third below', sw: 'r', send: 0.7 },
  { id: 'strings',  role: 'pad',      layers: ['pad'],            name: 'Pad',      src: 'Green · chords',      sw: 'g', send: 0.8 },
  { id: 'drone',    role: 'drone',    layers: ['drone'],          name: 'Drone',    src: 'Hue · key',           sw: 'g', send: 0.6 },
  { id: 'bass',     role: 'bass',     layers: ['bass'],           name: 'Bass',     src: 'Green · roots',       sw: 'g', send: 0.2 },
  { id: 'arpeggio', role: 'arpeggio', layers: ['arp'],            name: 'Arpeggio', src: 'Blue · with echoes',  sw: 'b', send: 0.7 },
  { id: 'bells',    role: 'sparkle',  layers: ['bell'],           name: 'Sparkle',  src: 'Light · brightest',   sw: 'l', send: 0.8 },
  { id: 'drums',    role: 'texture',  layers: ['air', 'swell'],   name: 'Texture',  src: 'Detail · motion',     sw: 'd', send: 0.5 },
];
const DRUM_LAYERS = new Set(['air', 'swell']);
const GROUP_OF = {}; GROUPS.forEach(g => g.layers.forEach(l => { GROUP_OF[l] = g.id; }));
const ROLE_OF = Object.fromEntries(GROUPS.map(g => [g.id, g.role]));
