// držíme fázi animace mezi refreshi (L = levá, R = pravá kolona)
const panePhase = { L: null, R: null };

async function fetchResults() {
  console.clear();
  console.log('[fetchResults] START');

  const res = await window.electron.invoke('getMeasurementResults');
  const container   = document.getElementById('resultsContainer');
  const categoryEl  = document.getElementById('currentCategory');
  const disciplineEl= document.getElementById('currentDiscipline');

  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  if (!res || !res.results?.length) {
    console.warn('[fetchResults] EMPTY results');
    container.innerHTML = '';
    if (categoryEl) categoryEl.textContent = 'Kategorie: -';
    if (disciplineEl) disciplineEl.textContent = '-';
    return;
  }


  const isPU = res.discipline === 'Požární útok';

  if (categoryEl)  categoryEl.textContent  = `Kategorie: ${res.category}`;
  if (disciplineEl) disciplineEl.textContent = res.discipline;

  const sorted = [...res.results].sort((a,b)=>(a.start_number??9e9)-(b.start_number??9e9));

  // /2 dělení
  const mid = Math.ceil(sorted.length / 2);
  let leftRows  = sorted.slice(0, mid);
  let rightRows = sorted.slice(mid);

  // ===== JEDNOTNÁ VÝŠKA A DOROVNÁNÍ ŘÁDKŮ =====
  const top   = container.getBoundingClientRect().top;
  const avail = Math.max(320, window.innerHeight - top - 16); // dostupná výška pro tabulku
  const ROW = 36, THEAD = 36;

  // max počet řádků (pro dorovnání obou sloupců)
  const maxRows = Math.max(leftRows.length, rightRows.length);

  // spočti viewH tak, aby pokud se všechny vejdou, nescrollovalo se (fixed height)
  const allRowsH = maxRows * ROW;
  const maxViewH = Math.floor((avail - THEAD) / ROW) * ROW;
  const canShowAll = (allRowsH <= maxViewH);
  const viewH = canShowAll ? allRowsH : maxViewH;
  const noScroll = canShowAll || maxRows === 0;

  // pad kratší stranu “prázdnými” řádky, aby měly obě tabulky stejný počet
  function makeFillerRow() {
    return { _filler: true, heat: null, start_number: '', lane: '', name: '', surname: '', team: '', time_first: '', time_second: '', time_lp: '', time_pp: '', final_time: '' };
  }
  while (leftRows.length  < maxRows) leftRows.push(makeFillerRow());
  while (rightRows.length < maxRows) rightRows.push(makeFillerRow());

  // jednorázové CSS
  if (!document.getElementById('tc-inf-css')) {
    const st = document.createElement('style');
    st.id = 'tc-inf-css';
    st.textContent = `
      :root { --tc-loop-h: 0px; }
      @keyframes tcY { 0% { transform: translateY(0) } 100% { transform: translateY(calc(-1 * var(--tc-loop-h))) } }
      .tc-pane{background:#1f2937;border-radius:.5rem;box-shadow:0 1px 8px rgba(0,0,0,.25);display:flex;flex-direction:column}
      .tc-head{position:sticky;top:0;z-index:10}
      .tc-view{overflow:hidden}
      .tc-inner{will-change:transform}
      .tc-pane:hover .tc-inner{animation-play-state:paused}
      .tc-view::-webkit-scrollbar{width:0;height:0}
      .tc-view{scrollbar-width:none;-ms-overflow-style:none}
    `;
    document.head.appendChild(st);
  }

  // layout – 2 sloupce
  container.className = 'grid gap-4 grid-cols-1 xl:grid-cols-2';
  container.innerHTML = '';

  const COLGROUP = isPU ? `
    <colgroup>
      <col class="w-14" />
      <col class="w-48" />
      <col class="w-20" />
      <col class="w-20" />
      <col class="w-24" />
    </colgroup>
  ` : `
    <colgroup>
      <col class="w-14" />
      <col class="w-16" />
      <col class="w-14" />
      <col class="w-28" />
      <col class="w-32" />
      <col class="w-48" />
      <col class="w-20" />
      <col class="w-20" />
      <col class="w-24" />
    </colgroup>
  `;

  const HEAD = `
    <thead class="bg-gray-700 text-gray-300 uppercase text-xs">
      <tr class="h-9">
        <th class="p-2 text-center"">Start. č.</th>
        ${!isPU ? `
          <th class="p-2 text-center"">Rozběh</th>
          <th class="p-2 text-center"">Dráha</th>
          <th class="p-2 text-center"">Jméno</th>
          <th class="p-2 text-center"">Příjmení</th>
        ` : ``}
        <th class="p-2 text-center"">Tým</th>
        ${isPU ? `
          <th class="p-2 text-center"">LP</th>
          <th class="p-2 text-center"">PP</th>
        ` : `
          <th class="p-2 text-center"">Čas 1</th>
          <th class="p-2 text-center"">Čas 2</th>
        `}
        <th class="p-2 text-center"">Výsledek</th>
      </tr>
    </thead>
  `;

  const CELL  = 'p-2 whitespace-nowrap';
  const CELLN = 'p-2 whitespace-nowrap';

  // zebra podle indexu (ne podle heat), funguje i pro filler řádky
  const rowHtml = (r, i) => {
    const zebra = (i % 2) ? 'bg-gray-800' : 'bg-gray-700';
    if (r._filler) {
      return `
        <tr class="h-9 leading-none ${zebra}">
          <td class="${CELL} text-center">&nbsp;</td>
          ${!isPU ? `
            <td class="${CELL} text-center">&nbsp;</td>
            <td class="${CELL} text-center">&nbsp;</td>
            <td class="${CELL} text-center">&nbsp;</td>
            <td class="${CELL} text-center"">&nbsp;</td>
          ` : ``}
          <td class="${CELL} text-center"">&nbsp;</td>
          ${isPU ? `
            <td class="${CELLN} text-center"">&nbsp;</td>
            <td class="${CELLN} text-center"">&nbsp;</td>
            <td class="${CELLN} font-semibold">&nbsp;</td>
          ` : `
            <td class="${CELLN} text-center"">&nbsp;</td>
            <td class="${CELLN} text-center"">&nbsp;</td>
            <td class="${CELLN} font-semibold text-center"">&nbsp;</td>
          `}
        </tr>
      `;
    }

    return `
      <tr class="h-9 leading-none ${zebra}">
        <td class="${CELL} text-center">${r.start_number ?? ''}</td>
        ${!isPU ? `
          <td class="${CELL} text-center">${r.heat ?? ''}</td>
          <td class="${CELL} text-center">${r.lane ?? ''}</td>
          <td class="${CELL} text-center"">${r.name ?? ''}</td>
          <td class="${CELL} text-center"">${r.surname ?? ''}</td>
        ` : ``}
        <td class="${CELL} text-center"">${r.team ?? ''}</td>
        ${isPU ? `
          <td class="${CELLN} text-center"">${r.time_lp ?? '-'}</td>
          <td class="${CELLN} text-center"">${r.time_pp ?? '-'}</td>
          <td class="${CELLN} font-semibold text-center"">${r.final_time ?? '-'}</td>
        ` : `
          <td class="${CELLN} text-center ${toBool(r.is_n_first) ? 'text-red-400 font-semibold' : ''}">
            ${toBool(r.is_n_first) ? '999.999' : (r.time_first ?? '-')}
          </td>
          <td class="${CELLN} text-center ${toBool(r.is_n_second) ? 'text-red-400 font-semibold' : ''}">
            ${toBool(r.is_n_second) ? '999.999' : (r.time_second ?? '-')}
          </td>
          <td class="${CELLN} font-semibold text-center"">${r.final_time ? r.final_time : '-'}</td>
        `}
      </tr>
    `;
  };

  const tbodyOnce = rows =>
    `<tbody class="divide-y divide-gray-700">${rows.map((r,i)=>rowHtml(r,i)).join('')}</tbody>`;

  function buildPane(rows, keyLabel) {
    const pane = document.createElement('div');
    pane.className = 'tc-pane';

    const headTbl = document.createElement('table');
    headTbl.className = 'w-full table-fixed border-collapse text-sm rounded-t tc-head';
    headTbl.innerHTML = `${COLGROUP}${HEAD}`;
    pane.appendChild(headTbl);

    const view = document.createElement('div');
    view.className = 'tc-view';
    view.style.height = `${viewH}px`;               // stejné pro obě tabulky
    pane.appendChild(view);

    const inner = document.createElement('div');
    inner.className = 'tc-inner';
    view.appendChild(inner);

    const bodyTbl = document.createElement('table');
    bodyTbl.className = 'w-full table-fixed border-collapse text-sm';
    bodyTbl.innerHTML = `${COLGROUP}${tbodyOnce(rows)}`;
    inner.appendChild(bodyTbl);

    requestAnimationFrame(() => {
      const tb = bodyTbl.tBodies[0];
      const loopH = tb.getBoundingClientRect().height || rows.length * ROW;

      // když není dost řádků → žádná duplikace, žádná animace (fixed)
      if (noScroll || loopH <= viewH) {
        inner.style.animation = 'none';
        inner.style.transform = 'translate3d(0,0,0)';
        panePhase[keyLabel] = { startMs: performance.now(), durationSec: 0 };
        console.log(`[pane ${keyLabel}] FIXED, h=${loopH}px`);
        return;
      }

      // duplikace → A + A a plynulý loop
      bodyTbl.insertAdjacentHTML('beforeend', tbodyOnce(rows));

      const durationSec = Math.max(20, Math.round(loopH / 24)); // ~24 px/s

      // navázání fáze animace
      let delaySec = 0;
      const prev = panePhase[keyLabel];
      if (prev && prev.durationSec > 0) {
        const now = performance.now();
        const elapsedSec = (now - prev.startMs) / 1000;
        const phaseSec   = elapsedSec % prev.durationSec;
        delaySec = phaseSec;
      }

      inner.style.setProperty('--tc-loop-h', `${loopH}px`);
      inner.style.animation = `tcY ${durationSec}s linear infinite`;
      if (delaySec) inner.style.animationDelay = `-${delaySec}s`;
      inner.style.transform = 'translate3d(0,0,0)';

      const now = performance.now();
      panePhase[keyLabel] = { startMs: now - delaySec * 1000, durationSec };
      console.log(`[pane ${keyLabel}] SCROLL, loopH=${loopH}px, dur=${durationSec}s, delay=-${delaySec.toFixed(2)}s`);
    });

    return pane;
  }

  container.appendChild(buildPane(leftRows,  'L'));
  container.appendChild(buildPane(rightRows, 'R'));

  console.log('[fetchResults] DONE');
}

// ===== REFRESH LOOP =====
let interval = null;
window.addEventListener('DOMContentLoaded', () => {
  fetchResults();
  interval = setInterval(fetchResults, 10000);
});
window.addEventListener('beforeunload', () => {
  clearInterval(interval);
});
