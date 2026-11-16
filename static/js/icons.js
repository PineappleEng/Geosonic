// Geosonic · icons.js
// A small line icon for every instrument in voices.js, drawn on a 24 × 24 grid with the current
// text colour (so they follow the theme). iconSvg(id) returns the icon as an <svg> string.

const ICON_BODY = '<path d="M12 2v4"/><path d="M12 6c-2.2 0-3.4 1.4-3.4 3.2 0 .9.4 1.6 1 2.1-.9.4-2.6 1.5-2.6 4.6 0 3 1.9 5.1 5 5.1s5-2.1 5-5.1c0-3.1-1.7-4.2-2.6-4.6.6-.5 1-1.2 1-2.1C15.4 7.4 14.2 6 12 6z"/><path d="M12 21v1.5"/>';
const ICON_CELLO = ICON_BODY + '<path d="M10.3 13.6v2.8M13.7 13.6v2.8"/><path d="M16 3l5.5 10"/>';
const ICON_CHOIR = '<circle cx="8.5" cy="8" r="3"/><circle cx="16" cy="9" r="2.6"/><path d="M3 20c.4-3.4 2.6-5.6 5.5-5.6s5.1 2.2 5.5 5.6"/><path d="M14.5 14.6c.5-.2 1-.2 1.5-.2 2.6 0 4.5 2 5 5"/>';

const ICONS = {
  // struck and plucked
  felt_piano:   '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7.5 13v6M12 13v6M16.5 13v6"/><path d="M6.3 5h2.4v8H6.3zM10.8 5h2.4v8h-2.4zM15.3 5h2.4v8h-2.4z" fill="currentColor" stroke="none"/>',
  rhodes:       '<rect x="3" y="11" width="18" height="8" rx="1.5"/><path d="M7.5 11v8M12 11v8M16.5 11v8"/><path d="M3 7c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/>',
  music_box:    '<path d="M4 11h13v8H4z"/><path d="M4 11l2-5h13l-2 5"/><path d="M17 15h3M20 12.5v5"/><path d="M8 15h5"/>',
  vibraphone:   '<path d="M4 6h16M5 10h14M6 14h12" stroke-width="2.4"/><path d="M14 20.5l4-4"/><circle cx="19.2" cy="15.3" r="1.6"/><path d="M4 18.5c1-1 2-1 3 0s2 1 3 0"/>',
  marimba:      '<path d="M5 5v12M9 6v10M13 7v8M17 8v6" stroke-width="2.6"/><path d="M3 20h18"/>',
  kalimba:      '<rect x="5" y="3.5" width="14" height="17" rx="4"/><path d="M8.5 3.5v6M10.8 3.5v8M13.2 3.5v8M15.5 3.5v6"/><circle cx="12" cy="16" r="1.6"/>',
  nylon_guitar: '<path d="M13.5 10.5l6.5-6.5"/><path d="M18.2 2.8l3 3"/><path d="M10.8 8.6c-3.2 0-6.3 2.3-6.3 6.6 0 3.6 2.6 6.4 6 5.2 3.2-1.1 4.9-3.8 4.9-6.6 0-3-1.6-5.2-4.6-5.2z"/><circle cx="10.4" cy="14.6" r="1.5"/>',
  harp:         '<path d="M6 21V3.5c6 0 11.5 5.5 12.5 14H6"/><path d="M9.2 6.5v11M12.3 8.8v8.7M15.3 12.3v5.2"/>',
  celesta:      '<path d="M6 17c1-1.6 1-3.2 1-6a5 5 0 0 1 10 0c0 2.8 0 4.4 1 6z"/><path d="M10 20h4"/><path d="M12 3v3"/>',
  glass:        '<path d="M8 3h8l-.8 5.6a3.2 3.2 0 0 1-6.4 0z"/><path d="M12 11.8V19M8.5 20h7"/><path d="M18.5 5c1.2 1.2 1.2 3 0 4.2M20.5 3.5c2 2 2 5.2 0 7.2"/>',
  // legato lines
  flute:        '<rect x="2.5" y="10" width="19" height="4" rx="2"/><circle cx="5.5" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="11" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="17" cy="12" r="1" fill="currentColor" stroke="none"/>',
  clarinet:     '<path d="M5 3l9.5 9.5" stroke-width="3"/><path d="M13.6 14.4l2-2 4.9 6.6-1.3 1.3z"/><path d="M7.5 8.5l1.5-1.5M10 11l1.5-1.5"/>',
  choir:        ICON_CHOIR,
  cello:        ICON_CELLO,
  ocarina:      '<path d="M3.5 13c0-4 4-7 9-7s7.5 3 7.5 6-3 6-8.5 6S3.5 16.6 3.5 13z"/><path d="M19.5 10.5l2.5-1.2"/><circle cx="9" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="10.3" r="1.1" fill="currentColor" stroke="none"/><circle cx="11" cy="14.3" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="13" r="1.1" fill="currentColor" stroke="none"/>',
  // pads and drones
  warm_pad:     '<path d="M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 9.1 4.5 4.5 0 0 0 7 18z"/>',
  string_pad:   '<path d="M3 8c3-2 6 2 9 0s6-2 9 0M3 12c3-2 6 2 9 0s6-2 9 0M3 16c3-2 6 2 9 0s6-2 9 0"/>',
  choir_pad:    ICON_CHOIR,
  organ:        '<path d="M5 19V10M9 19V6M12 19V3.5M15 19V6M19 19V10" stroke-width="2.2"/><path d="M3 20.5h18"/>',
  glass_pad:    '<path d="M12 3l7 7-7 11-7-11z"/><path d="M5 10h14M9 10l3 11 3-11M9 10l3-7 3 7"/>',
  soft_drone:   '<path d="M3 12h18"/><path d="M4 8.5c4.5-2 11.5-2 16 0M4 15.5c4.5 2 11.5 2 16 0" opacity="0.55"/>',
  // bass
  sub_bass:     '<path d="M2 12c3-8 7-8 10 0s7 8 10 0"/>',
  upright:      ICON_BODY + '<path d="M11 8.5v11M13 8.5v11"/>',
  cello_bass:   ICON_CELLO,
  synth_bass:   '<path d="M3 17l6-10v10l6-10v10l6-10"/>',
  // texture
  air:          '<path d="M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h7"/>',
  ocean:        '<path d="M2 10c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>',
  rain:         '<path d="M7 14h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 6.8 7.3 3.4 3.4 0 0 0 7 14z"/><path d="M8 17l-1 2.5M12 17l-1 2.5M16 17l-1 2.5"/>',
};

function iconSvg(id) {
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">${ICONS[id] || '<circle cx="12" cy="12" r="6"/>'}</svg>`;
}
