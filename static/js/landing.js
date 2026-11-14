// Image Sonifier · landing.js
// Fills in "The band" on the landing page from the same instrument data the app uses
// (GROUPS in constants.js, VOICES and ROLE_VOICES in voices.js), so the two never disagree.

(() => {
  const list = document.getElementById('band');
  if (!list) return;
  for (const g of GROUPS) {
    const [first, ...rest] = ROLE_VOICES[g.role].map(id => VOICES[id].name);
    const li = document.createElement('li');
    li.innerHTML = `<h3><span class="sw ${g.sw}"></span>${g.name}</h3>`
      + `<p class="band-src">${g.src}</p>`
      + `<p class="band-voices"><b>${first}</b>${rest.length ? ` · ${rest.join(' · ')}` : ''}</p>`;
    list.appendChild(li);
  }
})();
