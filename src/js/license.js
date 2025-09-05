// license.js
const keyInput   = document.getElementById('keyInput');
const verifyBtn  = document.getElementById('submitBtn');      // „Ověřit“
const okMsg      = document.getElementById('okMsg');
const errMsg     = document.getElementById('errMsg');
const quitBtn    = document.getElementById('quitBtn');
const localClose = document.getElementById('localClose');

// dynamický info panel (přidáme do DOM)
const infoPanel = document.createElement('div');
infoPanel.id = 'licenseInfo';
infoPanel.className = 'info-panel';
infoPanel.hidden = true;
infoPanel.innerHTML = `
  <div class="info-grid">
    <div><span class="label">Oddíl</span><span class="val" id="infDept">—</span></div>
    <div><span class="label">Platnost do</span><span class="val" id="infExp">—</span></div>
    <div><span class="label">Povolené použití</span><span class="val" id="infAllowed">—</span></div>
    <div><span class="label">Využito</span><span class="val" id="infUsed">—</span></div>
    <div><span class="label">Zbývá</span><span class="val" id="infRemain">—</span></div>
    <div><span class="label">Stav</span><span class="val" id="infState">—</span></div>
  </div>
  <div class="actions">
    <button id="confirmBtn" class="btn btn--primary" disabled>Potvrdit aktivaci</button>
  </div>
`;
document.querySelector('.card').appendChild(infoPanel);

// kosmetika
keyInput.addEventListener('input', () => {
  keyInput.value = keyInput.value.toUpperCase().replace(/\s+/g, '');
  okMsg.hidden = true; errMsg.hidden = true;
  infoPanel.hidden = true;
});

// Ověřit
verifyBtn.addEventListener('click', async () => {
  const key = keyInput.value.trim();
  if (!key) return;

  try {
    const result = await window.electron.invoke('license-lookup', key);
    renderLookup(result);
  } catch (e) {
    errMsg.hidden = false; errMsg.textContent = 'Chyba ověřování.';
  }
});

// Potvrdit (aktivace)
infoPanel.addEventListener('click', async (e) => {
  if (e.target.id !== 'confirmBtn') return;
  const key = keyInput.value.trim();
  e.target.disabled = true;

  const res = await window.electron.invoke('license-confirm', key);
  if (res.ok) {
    okMsg.hidden = false; okMsg.textContent = 'Licence ověřena. Spouštím aplikaci…';
    errMsg.hidden = true;
    // tady můžeš buď poslat signál na otevření hlavního okna,
    // nebo to už děláš v mainu po uložení lic.
    window.electron.send('check-license', key); // pokud chceš zachovat původní tok
  } else {
    errMsg.hidden = false; errMsg.textContent = res.error || 'Aktivace selhala.';
  }
  e.target.disabled = false;
});

// vykreslení panelu po lookupu
function renderLookup(res) {
  const dept    = document.getElementById('infDept');
  const exp     = document.getElementById('infExp');
  const allowed = document.getElementById('infAllowed');
  const used    = document.getElementById('infUsed');
  const remain  = document.getElementById('infRemain');
  const state   = document.getElementById('infState');
  const confirm = document.getElementById('confirmBtn');

  if (!res.exists) {
    dept.textContent = '—';
    exp.textContent = '—';
    allowed.textContent = '—';
    used.textContent = '—';
    remain.textContent = '—';
    state.textContent = 'Nenalezeno';
    state.className = 'val badge badge--err';
    confirm.disabled = true;
    infoPanel.hidden = false;
    okMsg.hidden = true; errMsg.hidden = false;
    errMsg.textContent = 'Klíč nebyl nalezen.';
    return;
  }

  const i = res.info;
  dept.textContent    = i.department;
  exp.textContent     = new Date(i.expiration + 'T00:00:00Z').toLocaleDateString('cs-CZ');
  allowed.textContent = i.allowedUsages;
  used.textContent    = i.usages;
  remain.textContent  = i.remaining;

  if (res.valid) {
    state.textContent = 'Platný';
    state.className = 'val badge badge--ok';
    confirm.disabled = false;
    okMsg.hidden = true; errMsg.hidden = true;
  } else {
    state.textContent = 'Neplatný';
    state.className = 'val badge badge--err';
    confirm.disabled = true;
    okMsg.hidden = true; errMsg.hidden = false;
    errMsg.textContent = res.reason || 'Klíč není platný.';
  }

  infoPanel.hidden = false;
}

// zavření
quitBtn.addEventListener('click', () => window.electron.send('quit-app'));
localClose.addEventListener('click', () => window.electron.send('quit-app'));
