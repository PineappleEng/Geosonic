// Image Sonifier · voices.js
// The instrument library. Every part of the band (melody, harmony, pad, drone, bass, arpeggio,
// sparkle, texture) can be played by any instrument listed for it in ROLE_VOICES.
// Mirrors VOICES / ROLE_VOICES in image_to_audio.py, so both make the same sounds.
//
// Engines (see instruments.js):
//   additive  harmonic partials [ratio, amplitude, decay per second, phase], each fading at its own
//             rate; optional fixed ring length, tremolo [rate Hz, depth], vibrato and breathing swell
//   pad       three slightly detuned voices built from a list of harmonic amplitudes, slow swell
//   line      one continuous legato line that glides between notes (used for the harmony part)
//   noise     filtered noise beds (air, ocean, rain)

const VOICES = {
  // ---- struck and plucked (melody, arpeggio, sparkle)
  felt_piano:   { name: 'Felt piano', engine: 'additive', partials: FELT_PIANO, attack: 0.012, release: 1.6 },
  rhodes:       { name: 'Electric piano', engine: 'additive', attack: 0.006, release: 1.2, tremolo: [4, 0.12], gain: 1.2,
                  partials: [[1, 1, 0.9, 0], [1.0005, 0.3, 1.0, 2.2], [2, 0.35, 1.6, 0.4], [3, 0.12, 2.8, 1.1], [4, 0.1, 4, 0.2]] },
  music_box:    { name: 'Music box', engine: 'additive', fixed: 3.0, attack: 0.002, release: 0.05, gain: 1.0, roleGain: { sparkle: 1.5 },
                  partials: [[1, 1, 1.3, 0], [2, 0.35, 2.4, 0.6], [3, 0.08, 4, 1.2], [4, 0.12, 5, 0.3], [6, 0.05, 8, 1.7]] },
  vibraphone:   { name: 'Vibraphone', engine: 'additive', attack: 0.005, release: 1.5, tremolo: [5.5, 0.35], gain: 0.7, roleGain: { sparkle: 2.5 },
                  partials: [[1, 1, 0.55, 0], [4, 0.25, 1.6, 0.4], [10, 0.04, 5, 1]] },
  marimba:      { name: 'Marimba', engine: 'additive', attack: 0.004, release: 0.3, gain: 1.2,
                  partials: [[1, 1, 3.0, 0], [4, 0.3, 8, 0.4], [10, 0.05, 18, 1.0]] },
  kalimba:      { name: 'Kalimba', engine: 'additive', attack: 0.002, release: 0.5, roleGain: { sparkle: 2.5 },
                  partials: [[1, 1, 2.0, 0], [3, 0.06, 6, 0.5], [6, 0.22, 8, 1.1]] },
  nylon_guitar: { name: 'Nylon guitar', engine: 'additive', attack: 0.003, release: 0.5, gain: 1.9,
                  partials: [1, 0.6, 0.45, 0.3, 0.22, 0.15, 0.1, 0.07].map((a, i) => [i + 1, a, 1.4 + 0.9 * (i + 1), (i + 1) * 0.7]) },
  harp:         { name: 'Harp', engine: 'additive', partials: HARP, attack: 0.004, release: 1.0 },
  celesta:      { name: 'Celesta', engine: 'additive', partials: CELESTA, fixed: 5.0, attack: 0.01, release: 0.05, roleGain: { melody: 0.62, arpeggio: 0.62 } },
  glass:        { name: 'Glass bells', engine: 'additive', attack: 0.08, release: 2.0, tremolo: [3, 0.12], gain: 0.5, roleGain: { sparkle: 2.5 },
                  partials: [[1, 1, 0.3, 0], [2, 0.12, 0.6, 0.5], [3, 0.06, 1.0, 1.0], [4, 0.03, 1.5, 0.2]] },

  // ---- legato lines (harmony)
  flute:        { name: 'Flute', engine: 'line', partials: FLUTE, attack: 0.4, release: 0.6, vibrato: 0.002, dip: 0.08 },
  clarinet:     { name: 'Clarinet', engine: 'line', attack: 0.25, release: 0.5, vibrato: 0.0025, dip: 0.1, gain: 1.25,
                  partials: [[1, 1, 0, 0], [3, 0.45, 0, 1.0], [5, 0.22, 0, 2.1], [7, 0.1, 0, 0.8], [2, 0.06, 0, 0.4]] },
  choir:        { name: 'Choir “ooh”', engine: 'line', attack: 0.6, release: 1.0, vibrato: 0.003, dip: 0.05, gain: 1.45,
                  partials: [[1, 1, 0, 0], [2, 0.55, 0, 0.5], [3, 0.25, 0, 1.2], [4, 0.08, 0, 0.3], [1.004, 0.6, 0, 2.0]] },
  cello:        { name: 'Cello', engine: 'line', attack: 0.3, release: 0.7, vibrato: 0.004, dip: 0.1, gain: 1.6,
                  partials: [[1, 1, 0, 0], [2, 0.7, 0, 0.3], [3, 0.45, 0, 0.9], [4, 0.3, 0, 1.4], [5, 0.2, 0, 0.2], [6, 0.12, 0, 0.8]] },
  ocarina:      { name: 'Ocarina', engine: 'line', attack: 0.2, release: 0.5, vibrato: 0.0015, dip: 0.08, gain: 0.85,
                  partials: [[1, 1, 0, 0], [2, 0.08, 0, 0.5], [3, 0.03, 0, 1]] },

  // ---- pads (pad, drone)
  warm_pad:     { name: 'Warm pad', engine: 'pad', harmonics: PAD_HARM, detune: 0.0045, attack: 3, release: 4, breathe: 7 },
  string_pad:   { name: 'String ensemble', engine: 'pad', harmonics: [1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.13, 0.1], detune: 0.006, attack: 3, release: 4, breathe: 7, gain: 1.25 },
  choir_pad:    { name: 'Choir pad', engine: 'pad', harmonics: [0.6, 1, 0.7, 0.35, 0.12, 0.06, 0.03, 0.02], detune: 0.004, attack: 3, release: 4, breathe: 7, gain: 1.45 },
  organ:        { name: 'Soft organ', engine: 'pad', harmonics: [1, 0.8, 0.5, 0.4, 0, 0.3, 0, 0.2], detune: 0.0015, attack: 2, release: 3, breathe: 9, gain: 1.2 },
  glass_pad:    { name: 'Glass pad', engine: 'pad', harmonics: [1, 0, 0.3, 0, 0.12, 0, 0.05, 0], detune: 0.003, attack: 3, release: 4, breathe: 7, gain: 0.75 },
  soft_drone:   { name: 'Soft drone', engine: 'additive', partials: DRONE, attack: 3, release: 4, breathe: 9 },

  // ---- bass
  sub_bass:     { name: 'Sub bass', engine: 'additive', partials: SOFT_BASS, attack: 0.3, release: 1.5 },
  upright:      { name: 'Upright bass', engine: 'additive', attack: 0.008, release: 0.4, gain: 1.3,
                  partials: [[1, 1, 1.2, 0], [2, 0.45, 2.5, 0.5], [3, 0.2, 4, 1.2], [4, 0.08, 6, 0.3]] },
  cello_bass:   { name: 'Bowed cello', engine: 'additive', attack: 0.25, release: 0.8, vibrato: 0.003, gain: 0.4,
                  partials: [[1, 1, 0, 0], [2, 0.7, 0, 0.3], [3, 0.45, 0, 0.9], [4, 0.3, 0, 1.4], [5, 0.2, 0, 0.2], [6, 0.12, 0, 0.8]] },
  synth_bass:   { name: 'Warm synth bass', engine: 'additive', attack: 0.05, release: 0.6, gain: 1.2,
                  partials: [[1, 1, 0.4, 0], [2, 0.5, 0.8, 0], [3, 0.33, 1.2, 0], [4, 0.25, 1.6, 0], [5, 0.2, 2, 0]] },

  // ---- texture
  air:          { name: 'Air', engine: 'noise', kind: 'air' },
  ocean:        { name: 'Ocean waves', engine: 'noise', kind: 'ocean' },
  rain:         { name: 'Soft rain', engine: 'noise', kind: 'rain', gain: 1.1 },
};

// gain: overall level so instruments sit at a similar loudness; roleGain: extra level for one part
// Which instruments each part can use (first one is the default), keyed by part (role)
const ROLE_VOICES = {
  melody:   ['felt_piano', 'rhodes', 'music_box', 'vibraphone', 'marimba', 'kalimba', 'nylon_guitar', 'harp', 'celesta', 'glass'],
  harmony:  ['flute', 'clarinet', 'choir', 'cello', 'ocarina'],
  pad:      ['warm_pad', 'string_pad', 'choir_pad', 'organ', 'glass_pad'],
  drone:    ['soft_drone', 'organ', 'choir_pad', 'string_pad', 'glass_pad'],
  bass:     ['sub_bass', 'upright', 'cello_bass', 'synth_bass'],
  arpeggio: ['harp', 'felt_piano', 'music_box', 'kalimba', 'marimba', 'nylon_guitar', 'vibraphone', 'celesta'],
  sparkle:  ['celesta', 'music_box', 'glass', 'vibraphone', 'kalimba'],
  texture:  ['air', 'ocean', 'rain'],
};

// Presets de género / ambiente: combinaciones equilibradas por timbre y rango de frecuencia
const AMBIENT_PRESETS = [
  {
    id: 'orbital',
    name: 'Orbital Chill',
    desc: 'Suave, atmosférico y equilibrado (por defecto)',
    voices: {
      melody: 'felt_piano',
      harmony: 'flute',
      strings: 'warm_pad',
      drone: 'soft_drone',
      bass: 'sub_bass',
      arpeggio: 'harp',
      bells: 'celesta',
      drums: 'air'
    }
  },
  {
    id: 'chamber',
    name: 'Chamber Orchestra',
    desc: 'Cuerdas, maderas y acústica clásica de cámara',
    voices: {
      melody: 'harp',
      harmony: 'cello',
      strings: 'string_pad',
      drone: 'string_pad',
      bass: 'cello_bass',
      arpeggio: 'nylon_guitar',
      bells: 'celesta',
      drums: 'air'
    }
  },
  {
    id: 'ethereal',
    name: 'Ethereal Cathedral',
    desc: 'Coros, órgano suave y campanas de cristal',
    voices: {
      melody: 'glass',
      harmony: 'choir',
      strings: 'choir_pad',
      drone: 'organ',
      bass: 'sub_bass',
      arpeggio: 'celesta',
      bells: 'glass',
      drums: 'air'
    }
  },
  {
    id: 'lofi',
    name: 'Lo-Fi Rainy Jazz',
    desc: 'Piano eléctrico Rhodes, contrabajo y lluvia suave',
    voices: {
      melody: 'rhodes',
      harmony: 'clarinet',
      strings: 'warm_pad',
      drone: 'soft_drone',
      bass: 'upright',
      arpeggio: 'vibraphone',
      bells: 'music_box',
      drums: 'rain'
    }
  },
  {
    id: 'tropical',
    name: 'Coastal Acoustic',
    desc: 'Percusión de madera, guitarra y olas del mar',
    voices: {
      melody: 'marimba',
      harmony: 'ocarina',
      strings: 'glass_pad',
      drone: 'soft_drone',
      bass: 'upright',
      arpeggio: 'kalimba',
      bells: 'kalimba',
      drums: 'ocean'
    }
  },
  {
    id: 'synth',
    name: 'Deep Space Synth',
    desc: 'Texturas electrónicas cálidas y bajo sintetizado',
    voices: {
      melody: 'vibraphone',
      harmony: 'choir',
      strings: 'glass_pad',
      drone: 'organ',
      bass: 'synth_bass',
      arpeggio: 'rhodes',
      bells: 'glass',
      drums: 'air'
    }
  }
];