const tbody = document.getElementById('resultsTable');
const categoryEl = document.getElementById('currentCategory');

async function fetchResults() {
  const res = await window.electron.invoke('getMeasurementResults');
  const container = document.getElementById('resultsContainer');
  const categoryEl = document.getElementById('currentCategory');
  const disciplineEl = document.getElementById('currentDiscipline');

  container.innerHTML = '';
  if (!res || !res.results?.length) return;

  categoryEl.textContent = `Kategorie: ${res.category}`;
  disciplineEl.textContent = res.discipline;


  const total = res.results.length;
  const cols = total > 90 ? 4 : total > 60 ? 3 : total > 30 ? 2 : 1;
  container.className = `results-grid cols-${cols}`;

  const isPozarniUtok = res.discipline === 'Požární útok';
  const perColumn = Math.ceil(total / cols);

  for (let i = 0; i < cols; i++) {
    const table = document.createElement('table');
    table.className = 'min-w-full divide-y divide-gray-700 bg-gray-800 rounded shadow text-sm';

    // 🧠 Dynamický header podle disciplíny
    table.innerHTML = `
      <thead class="bg-gray-700 text-gray-300 uppercase text-xs">
        <tr>
          <th class="p-2">Start. č.</th>
          ${!isPozarniUtok ? `
            <th class="p-2">Rozběh</th>
            <th class="p-2">Dráha</th>
            <th class="p-2">Jméno</th>
            <th class="p-2">Příjmení</th>
          ` : ''}
          <th class="p-2">Tým</th>
          ${isPozarniUtok
            ? `
              <th class="p-2">LP</th>
              <th class="p-2">PP</th>
            `
            : `
              <th class="p-2">Čas 1</th>
              <th class="p-2">Čas 2</th>
            `
          }
          <th class="p-2">Výsledek</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-600"></tbody>
    `;

    const tbody = table.querySelector('tbody');
    const slice = res.results.slice(i * perColumn, (i + 1) * perColumn);

    slice.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = (r.heat % 2)
        ? 'bg-gray-800 hover:bg-gray-700 transition'
        : 'bg-gray-700 hover:bg-gray-600 transition';

      tr.innerHTML = `
        <td class="p-2 text-center">${r.start_number ?? ''}</td>
        ${!isPozarniUtok ? `
          <td class="p-2 text-center">${r.heat ?? ''}</td>
          <td class="p-2 text-center">${r.lane ?? ''}</td>
          <td class="p-2">${r.name ?? ''}</td>
          <td class="p-2">${r.surname ?? ''}</td>
        ` : ''}
        <td class="p-2">${r.team ?? ''}</td>
        ${isPozarniUtok
          ? `
            <td class="p-2">${r.time_lp ?? '-'}</td>
            <td class="p-2">${r.time_pp ?? '-'}</td>
          `
          : `
            <td class="p-2">${r.time_first ?? '-'}</td>
            <td class="p-2">${r.time_second ?? '-'}</td>
          `
        }
        <td class="p-2 font-bold">${r.final_time ?? '-'}</td>
      `;
      tbody.appendChild(tr);
    });

    container.appendChild(table);
  }
}


// Refresh loop
let interval = null;

window.addEventListener('DOMContentLoaded', () => {
  fetchResults(); // načti poprvé
  interval = setInterval(fetchResults, 10000);
});

window.addEventListener('beforeunload', () => {
  clearInterval(interval);
});
