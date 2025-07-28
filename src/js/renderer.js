window.serialConnected = false;
window.currentSelectedRowId = null;

// Funkce pro otevření modalu soutěží
function openCompetitionModal() {
  document.getElementById('competitionModal')?.classList.remove('hidden');
  renderCompetitionList(window.allCompetitions);
  document.getElementById('competitionSearch')?.addEventListener('input', filterCompetitionList);
  document.getElementById('competitionSort')?.addEventListener('change', sortCompetitionList);
}

// Vykreslení soutěží do modalu
function renderCompetitionList(competitions) {
  const container = document.getElementById('competitionList');
  container.innerHTML = '';

  competitions.forEach(c => {
    const item = document.createElement('div');
    item.className = 'cursor-pointer px-4 py-2 hover:bg-gray-700 transition rounded';
    item.textContent = `${c.name} (${c.date || ''})`;
    item.dataset.id = c.id;
    item.addEventListener('click', () => {
      localStorage.setItem('selectedCompetitionId', c.id);
      localStorage.setItem('selectedCompetitionName', c.name);
      document.getElementById('competitionModal')?.classList.add('hidden');
      showSidebarFull();
      loadView('dashboard');
    });
    container.appendChild(item);
  });
}

// Vyhledávání soutěží
function filterCompetitionList(e) {
  const search = e.target.value.toLowerCase();
  const filtered = window.allCompetitions.filter(c =>
    c.name.toLowerCase().includes(search) || (c.date || '').includes(search)
  );
  renderCompetitionList(filtered);
}

// Řazení soutěží
function sortCompetitionList(e) {
  const val = e.target.value;
  let sorted = [...window.allCompetitions];
  if (val === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (val === 'date') {
    sorted.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }
  renderCompetitionList(sorted);
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSidebar();
  attachNavbarListeners();
  attachSidebarListeners();

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
    updateThemeIcon(true);
  } else {
    document.documentElement.classList.remove('dark');
    updateThemeIcon(false);
  }

  await loadCompetitions();

  // Akce na tlačítko Zvolit soutěž
  document.getElementById('openCompetitionModalBtn')?.addEventListener('click', () => {
    openCompetitionModal();
  });

  // Zavření modalu výběru soutěže
  document.getElementById('closeCompetitionModal')?.addEventListener('click', () => {
    document.getElementById('competitionModal')?.classList.add('hidden');
  });

  document.getElementById('cancelSelectCompetitionBtn')?.addEventListener('click', () => {
    document.getElementById('competitionModal')?.classList.add('hidden');
  });

  const selectedId = localStorage.getItem('selectedCompetitionId');
  if (!selectedId) {
    openCompetitionModal();
  } else {
    showSidebarFull();
    loadView('dashboard');
  }

  hideSidebarViews();
});



async function loadSidebar() {
  const sidebarHTML = await fetch('./components/sidebar.html').then(r => r.text());
  document.getElementById('sidebar-container').innerHTML = sidebarHTML;
}

function attachSidebarListeners() {
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const logo = document.getElementById('logo');
  const linkTexts = document.querySelectorAll('.link-text');

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('w-64');
      sidebar.classList.toggle('w-16');
      linkTexts.forEach(span => span.classList.toggle('hidden'));
      if (logo) logo.classList.toggle('hidden');
    });
  }

  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      loadView(view);
      setActiveLink(link);
    });
  });
}

function setActiveLink(activeLink) {
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.classList.remove('bg-primary');
  });
  activeLink.classList.add('bg-primary');
}

function loadView(viewName) {
  fetch(`views/${viewName}.html`)
    .then(res => res.text())
    .then(html => {
      document.getElementById('main-content').innerHTML = html;

      if (viewName === 'startlist') {
        loadCategoriesForSelectedCompetition();
        attachStartlistListeners();
      }
      if (viewName === 'measurement') {
        loadMeasurementCategories();
        attachMeasurementListeners();
      }
      if (viewName === 'results') {
        loadResultsCategories();
      }
    });
}

function attachNavbarListeners() {
  const createBtn = document.getElementById('createCompetitionBtn');
  const cancelBtn = document.getElementById('cancelCreateComp');
  const saveBtn = document.getElementById('saveCreateComp');
  const themeToggle = document.getElementById('themeToggle');

  if (createBtn) {
    createBtn.addEventListener('click', () => {
      document.getElementById('createCompetitionModal').classList.remove('hidden');
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      clearCompetitionForm();
      document.getElementById('createCompetitionModal').classList.add('hidden');
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const name = document.getElementById('compName').value.trim();
      const date = document.getElementById('compDate').value;
      const time = document.getElementById('compTime').value;
      const type = document.getElementById('compType').value;

      if (!name) {
        alert("Zadejte název soutěže.");
        return;
      }

      const result = await window.electron.invoke('createCompetition', { name, date, time, type });
      await loadCompetitions();

      if (result?.id) {
        localStorage.setItem('selectedCompetitionId', result.id);
        localStorage.setItem('selectedCompetitionName', name);
        document.getElementById('createCompetitionModal').classList.add('hidden');
        showSidebarFull();
        loadView('dashboard');
      }
      

      clearCompetitionForm();
      document.getElementById('createCompetitionModal').classList.add('hidden');
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      updateThemeIcon(isDark);
    });
  }
}

function clearCompetitionForm() {
  document.getElementById('compName').value = "";
  document.getElementById('compDate').value = "";
  document.getElementById('compTime').value = "";
  document.getElementById('compType').value = "";
}

window.allCompetitions = [];

async function loadCompetitions() {
  const competitions = await window.electron.invoke('getCompetitions');
  competitions.sort((a, b) => b.id - a.id);

  window.allCompetitions = competitions;

  const select = document.getElementById('competitionSelect');
  select.innerHTML = `<option disabled selected>Vyber soutěž</option>`;

  competitions.forEach(c => {
    const option = document.createElement('option');
    option.value = c.id;
    option.textContent = `${c.name} (${c.date || ''})`;
    select.appendChild(option);
  });
}

function showSidebarFull() {
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.classList.remove('hidden');
  });
}

function hideSidebarViews() {
  document.querySelectorAll('.sidebar-link').forEach(link => {
    if (link.dataset.view !== 'settings') {
      link.classList.add('hidden');
    }
  });
}

function updateThemeIcon(isDark) {
  const iconContainer = document.getElementById('themeIcon');
  if (!iconContainer) return;

  iconContainer.outerHTML = isDark
    ? `<svg id="themeIcon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>`
    : `<svg id="themeIcon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="#ffffff" class="w-6 h-6"><path d="M361.5 1.2c5 2.1 8.6 6.6 9.6 11.9L391 121l107.9 19.8c5.3 1 9.8 4.6 11.9 9.6s1.5 10.7-1.6 15.2L446.9 256l62.3 90.3c3.1 4.5 3.7 10.2 1.6 15.2s-6.6 8.6-11.9 9.6L391 391 371.1 498.9c-1 5.3-4.6 9.8-9.6 11.9s-10.7 1.5-15.2-1.6L256 446.9l-90.3 62.3c-4.5 3.1-10.2 3.7-15.2 1.6s-8.6-6.6-9.6-11.9L121 391 13.1 371.1c-5.3-1-9.8-4.6-11.9-9.6s-1.5-10.7 1.6-15.2L65.1 256 2.8 165.7c-3.1-4.5-3.7-10.2-1.6-15.2s6.6-8.6 11.9-9.6L121 121 140.9 13.1c1-5.3 4.6-9.8 9.6-11.9s10.7-1.5 15.2 1.6L256 65.1 346.3 2.8c4.5-3.1 10.2-3.7 15.2-1.6zM160 256a96 96 0 1 1 192 0 96 96 0 1 1 -192 0zm224 0a128 128 0 1 0 -256 0 128 128 0 1 0 256 0z"/></svg>`;
}

async function loadCategoriesForSelectedCompetition() {
  const competitionId = localStorage.getItem('selectedCompetitionId');
  if (!competitionId) return;

  const comp = window.allCompetitions.find(c => c.id == competitionId);
  if (!comp) return;

  const discipline = comp.type;

  const categories = await window.electron.invoke('getCategories', discipline);
  const sel = document.getElementById('categorySelect');
  if (!sel) return;

  sel.innerHTML = `<option value="">Vyber kategorii</option>`;

  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat.id;
    option.textContent = cat.name;
    sel.appendChild(option);
  });
  document.getElementById('laneCountSelect').classList.add('hidden');
  document.getElementById('addStartlistEntryBtn').classList.add('hidden');
  document.getElementById('generateStartlistBtn').classList.add('hidden');
  document.getElementById('addTeamBtn').classList.add('hidden');

  const tbody = document.getElementById('startlistRows');
  const thead = document.getElementById('startlistHead');
  if (!tbody || !thead) return;

  tbody.innerHTML = '';
  thead.innerHTML = '';
}

function clearStartlist() {
  const tbody = document.getElementById('startlistRows');
  if (tbody) tbody.innerHTML = '';
}

function attachStartlistListeners() {
  const importCsvBtn = document.getElementById('importCsvBtn');
  const importExcelBtn = document.getElementById('importExcelBtn');
  const generateBtn = document.getElementById('generateStartlistBtn');
  const exportExcelBtn = document.getElementById('exportExcelBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const addRunnerBtn = document.getElementById('addStartlistEntryBtn');
  const addTeamBtn = document.getElementById('addTeamBtn');
  const cancelRunnerBtn = document.getElementById('cancelTeamBtn');
  const cancelTeamBtn = document.getElementById('cancelRunnerBtn');
  const saveRunnerBtn = document.getElementById('saveRunnerBtn');
  const saveTeamBtn = document.getElementById('saveTeamBtn');
  const categorySelect = document.getElementById('categorySelect');
  const laneCountSelect = document.getElementById('laneCountSelect');

  if (importCsvBtn) {
    importCsvBtn.addEventListener('click', async () => {
      const competitionId = localStorage.getItem('selectedCompetitionId');
      const categoryId = categorySelect?.value;
      const discipline = await getCurrentDiscipline();

      if (!competitionId || !categoryId) {
        alert("Nejprve vyber soutěž a kategorii.");
        return;
      }

      const success = await window.electron.invoke('importStartlistCsv', competitionId, categoryId, discipline);
      if (success) {
        alert("Import CSV proběhl úspěšně.");
        categorySelect.dispatchEvent(new Event('change'));
      }
    });
  }

  if (importExcelBtn) {
    importExcelBtn.addEventListener('click', async () => {
      const competitionId = localStorage.getItem('selectedCompetitionId');
      const categoryId = categorySelect?.value;
      const discipline = await getCurrentDiscipline();

      if (!competitionId || !categoryId) {
        alert("Nejprve vyber soutěž a kategorii.");
        return;
      }

      const success = await window.electron.invoke('importStartlistExcel', competitionId, categoryId, discipline);
      if (success) {
        alert("Import Excelu proběhl úspěšně.");
        categorySelect.dispatchEvent(new Event('change'));
      }
    });
  }

  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      const competitionId = localStorage.getItem('selectedCompetitionId');
      const categoryId = categorySelect?.value;
      const discipline = await getCurrentDiscipline();
      const lanes = parseInt(laneCountSelect?.value || "1");

      const success = await window.electron.invoke(
        'generateStartlist',
        competitionId,
        categoryId,
        discipline,
        lanes
      );

      if (success) {
        alert("Startovka vygenerována.");
        categorySelect.dispatchEvent(new Event('change'));
      }
    });
  }

  if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', async () => {
      const competitionId = localStorage.getItem('selectedCompetitionId');
      const categoryId = categorySelect?.value;

      const comp = window.allCompetitions.find(c => c.id == competitionId);
      if (!comp) {
        alert("Nejprve vyber soutěž.");
        return;
      }

      const discipline = comp.type || null;
      const competitionName = comp.name || null;
      const competitionDate = comp.date || null;

      const categories = await window.electron.invoke('getCategories', discipline);
      const category = categories.find(cat => cat.id == categoryId);
      const categoryName = category?.name || null;

      if (!competitionId || !categoryId || !discipline) {
        alert("Nejprve vyber soutěž a kategorii.");
        return;
      }

      await window.electron.invoke('exportStartlistExcel', {
        discipline,
        competitionName,
        competitionDate,
        categoryName,
        competitionId,
        categoryId
      });

      alert("Export do Excelu dokončen.");
    });

  }

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', async () => {
      const competitionId = localStorage.getItem('selectedCompetitionId');
      const categoryId = categorySelect?.value;
      const discipline = await getCurrentDiscipline();
      const competition = window.allCompetitions.find(c => c.id == competitionId);

      const rows = await window.electron.invoke('getStartlist', competitionId, categoryId);

      let headers, rowData;
      if (discipline === 'Požární útok') {
        headers = ['Startovní číslo', 'Tým'];
        rowData = rows
          .sort((a, b) => (a.start_number || 0) - (b.start_number || 0))
          .map(r => [
            r.start_number || '',
            r.team || ''
          ]);

      } else {
        headers = ['Rozběh', 'Dráha', 'Startovní číslo', 'Jméno', 'Příjmení'];
        rowData = rows.sort((a, b) => {
          const heatDiff = (a.heat || 0) - (b.heat || 0);
          if (heatDiff !== 0) {
            return heatDiff;
          }
          return (a.lane || 0) - (b.lane || 0);
        }).map(r => [
          r.heat || '',
          r.lane || '',
          r.start_number || '',
          r.name || '',
          r.surname || ''
        ]);
      }

      await window.electron.invoke('exportStartlistPdf', {
        competition,
        discipline,
        category: categorySelect?.selectedOptions[0]?.textContent || '',
        rows: rowData,
        headers
      });
    });

  }

  if (addRunnerBtn) {
    addRunnerBtn.addEventListener('click', async () => {
      document.getElementById('modal-add-runner').classList.remove('hidden');
    });
  }

  if (addTeamBtn) {
    addTeamBtn.addEventListener('click', async () => {
      document.getElementById('modal-add-team').classList.remove('hidden');
    });
  }

  if (cancelRunnerBtn) {
    cancelRunnerBtn.addEventListener('click', () => {
      document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
    });
  }

  if (cancelTeamBtn) {
    cancelTeamBtn.addEventListener('click', () => {
      document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
    });
  }

  if (saveRunnerBtn) {
    saveRunnerBtn.addEventListener('click', async () => {
      const competitionId = localStorage.getItem('selectedCompetitionId');
      const categoryId = categorySelect?.value;

      let entry = {
        competition_id: competitionId,
        category_id: categoryId,
      };
      entry.name = document.getElementById('runnerName').value;
      entry.surname = document.getElementById('runnerSurname').value;
      entry.team = document.getElementById('runnerTeam').value;
      entry.lane = null;
      entry.rozbeh = null;

      await window.electron.invoke('addStartlistEntry', entry);
      document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
      categorySelect.dispatchEvent(new Event('change'));
    });
  }

  if (saveTeamBtn) {
    saveTeamBtn.addEventListener('click', async () => {
      const competitionId = localStorage.getItem('selectedCompetitionId');
      const categoryId = categorySelect?.value;

      let entry = {
        competition_id: competitionId,
        category_id: categoryId,
      };

      entry.team = document.getElementById('teamName').value;
      entry.name = null;
      entry.surname = null;
      entry.lane = null;
      entry.rozbeh = null;
      entry.start_number = document.getElementById('teamStartPosition').value;

      await window.electron.invoke('addStartlistEntry', entry);
      document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
      categorySelect.dispatchEvent(new Event('change'));
    });
  }

  if (laneCountSelect) {
    laneCountSelect.addEventListener('change', (e) => {
      const lanes = e.target.value;
      localStorage.setItem('laneCount', lanes);
    });
  }

  if (categorySelect) {
    categorySelect.addEventListener('change', async (e) => {
      const categoryId = e.target.value;
      const competitionId = localStorage.getItem('selectedCompetitionId');
      const discipline = await getCurrentDiscipline();

      const rows = await window.electron.invoke('getStartlist', competitionId, categoryId);
      const tbody = document.getElementById('startlistRows');
      const thead = document.getElementById('startlistHead');

      if (!tbody || !thead) return;

      tbody.innerHTML = '';

      if (discipline === 'Požární útok') {

        rows.sort((a, b) => (a.start_number || 0) - (b.start_number || 0));

        // HLAVIČKA
        thead.innerHTML = `
          <tr>
            <th class="px-6 py-3 text-left">Startovní číslo</th>
            <th class="px-6 py-3 text-left">Tým</th>
            <th class="px-6 py-3 text-center">Akce</th>
          </tr>
        `;

        rows.forEach((r, idx) => {
          const tr = document.createElement('tr');
          tr.dataset.id = r.id;
          tr.className = 'hover:bg-gray-600 transition'; // přidáme hezký hover efekt

          tr.innerHTML = `
  <td contenteditable="true" class="px-6 py-3 text-white border-b border-gray-600">${r.start_number ?? ''}</td>
  <td contenteditable="true" class="px-6 py-3 text-white border-b border-gray-600">${r.team ?? ''}</td>
  <td class="px-6 py-3 text-center border-b border-gray-600">
    <button class="delete-row-btn text-red-500 hover:text-red-300 transition" title="Smazat">
      🗑️
    </button>
  </td>
`;


          // Ukládání při opuštění buňky
          tr.querySelectorAll('td[contenteditable]').forEach(td => {
            td.addEventListener('blur', async () => {
              const cells = tr.querySelectorAll('td');
              const updatedEntry = {
                id: tr.dataset.id,
                start_number: cells[0].innerText.trim() || null,
                team: cells[1].innerText.trim() || null
              };
              await window.electron.invoke('saveStartlistChanges', updatedEntry);
            });
          });


          tr.querySelector('.delete-row-btn').addEventListener('click', async () => {
            if (!confirm('Opravdu smazat tento tým?')) return;
            await window.electron.invoke('deleteStartlistEntry', r.id);
            tr.remove();
          });

          tbody.appendChild(tr);

        });
        document.getElementById('addTeamBtn').classList.remove('hidden');
        document.getElementById('laneCountSelect').classList.add('hidden');
        document.getElementById('addStartlistEntryBtn').classList.add('hidden');
        document.getElementById('generateStartlistBtn').classList.add('hidden');

      } else {

        rows.sort((a, b) => {
          const heatDiff = (a.heat || 0) - (b.heat || 0);
          if (heatDiff !== 0) {
            return heatDiff;
          }
          return (a.lane || 0) - (b.lane || 0);
        });


        // HLAVIČKA PRO BĚHY (60 m apod.)
        thead.innerHTML = `
          <tr>
            <th class="px-6 py-3 text-left">Rozběh</th>
            <th class="px-6 py-3 text-left">Dráha</th>
            <th class="px-6 py-3 text-left">Startovní číslo</th>
            <th class="px-6 py-3 text-left">Jméno</th>
            <th class="px-6 py-3 text-left">Příjmení</th>
            <th class="px-6 py-3 text-left">Tým</th>
            <th class="px-6 py-3 text-center">Akce</th>
          </tr>
        `;

        rows.forEach((r, idx) => {
          const tr = document.createElement('tr');
          tr.dataset.id = r.id;
          if (r.heat % 2) {
            tr.className = 'bg-gray-800 hover:bg-gray-700 transition';
          } else {
            tr.className = 'bg-gray-900 hover:bg-gray-800 transition';
          }

          tr.innerHTML = `
            <td contenteditable="true" class="px-6 py-3 text-white border-b border-gray-600">${r.heat ?? ''}</td>
            <td contenteditable="true" class="px-6 py-3 text-white border-b border-gray-600">${r.lane ?? ''}</td>
            <td contenteditable="true" class="px-6 py-3 text-white border-b border-gray-600">${r.start_number ?? ''}</td>
            <td contenteditable="true" class="px-6 py-3 text-white border-b border-gray-600">${r.name ?? ''}</td>
            <td contenteditable="true" class="px-6 py-3 text-white border-b border-gray-600">${r.surname ?? ''}</td>
            <td contenteditable="true" class="px-6 py-3 text-white border-b border-gray-600">${r.team ?? ''}</td>
            <td class="px-6 py-3 text-center border-b border-gray-600">
    <button class="delete-row-btn text-red-500 hover:text-red-300 transition" title="Smazat">
      🗑️
    </button>
  </td>
          `;

          tr.querySelectorAll('td[contenteditable]').forEach(td => {
            td.addEventListener('blur', async () => {
              const cells = tr.querySelectorAll('td');

              const updatedEntry = {
                id: tr.dataset.id,
                heat: cells[0].innerText.trim() || null,
                lane: cells[1].innerText.trim() || null,
                start_number: cells[2].innerText.trim() || null,
                name: cells[3].innerText.trim() || null,
                surname: cells[4].innerText.trim() || null,
                team: cells[5].innerText.trim() || null,
              };

              await window.electron.invoke('saveStartlistChanges', updatedEntry);
            });
          });


          tr.querySelector('.delete-row-btn').addEventListener('click', async () => {
            if (!confirm('Opravdu smazat tohoto závodníka?')) return;
            await window.electron.invoke('deleteStartlistEntry', r.id);
            tr.remove();
          });

          tbody.appendChild(tr);
        });
        document.getElementById('laneCountSelect').classList.remove('hidden');
        document.getElementById('addStartlistEntryBtn').classList.remove('hidden');
        document.getElementById('generateStartlistBtn').classList.remove('hidden');
        document.getElementById('addTeamBtn').classList.add('hidden');
      }
    });
  }
}

async function getCurrentDiscipline() {
  const competitionId = localStorage.getItem('selectedCompetitionId');
  const comp = window.allCompetitions.find(c => c.id == competitionId);
  return comp?.type || null;
}

async function loadMeasurementCategories() {
  const competitionId = localStorage.getItem('selectedCompetitionId');
  if (!competitionId) return;

  const comp = window.allCompetitions.find(c => c.id == competitionId);
  if (!comp) return;

  const discipline = comp.type;

  const categories = await window.electron.invoke('getCategories', discipline);

  const sel = document.getElementById('measurementCategory');
  sel.innerHTML = `<option value="">Vyber kategorii</option>`;

  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    sel.appendChild(opt);
  });

  // OPRAVA – rovnou vyvolá change
  if (categories.length > 0) {
    sel.value = categories[0].id;
    sel.dispatchEvent(new Event('change'));
  }

  sel.addEventListener('change', async (e) => {
    const catId = e.target.value;
    await loadMeasurementStartlist(competitionId, catId, discipline);
  });

}

async function loadMeasurementStartlist(competitionId, categoryId, discipline) {
  const rows = await window.electron.invoke('getStartlist', competitionId, categoryId);

  const tbody = document.getElementById('measurementRows');
  const thead = document.getElementById('measurementHead');
  const heatContainer = document.getElementById('heatContainer');
  const heatSelect = document.getElementById('heatSelect');

  tbody.innerHTML = '';
  thead.innerHTML = '';

  if (discipline === 'Požární útok') {
    heatContainer.classList.add('hidden');

    thead.innerHTML = `
      <tr class="bg-gray-700">
        <th class="p-2 border border-gray-600">Startovní číslo</th>
        <th class="p-2 border border-gray-600">Družstvo</th>
        <th class="p-2 border border-gray-600">LP čas</th>
        <th class="p-2 border border-gray-600">PP čas</th>
        <th class="p-2 border border-gray-600">N</th>
      </tr>
    `;

    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.dataset.id = r.id;
      tr.innerHTML = `
        <td>${r.start_number ?? ''}</td>
        <td>${r.team ?? ''}</td>
        <td class="lp-time"></td>
        <td class="pp-time"></td>
        <label class="flex items-center gap-2 text-sm">
  <input type="checkbox" id="modalNCheckbox" class="rounded">
  Neplatný pokus (N)
</label>
      `;
      tbody.appendChild(tr);
    });

  } else {
    // Běh na 60m
    heatContainer.classList.remove('hidden');

    // Seznam unikátních rozběhů
    const heats = [...new Set(rows.map(r => r.heat).filter(h => h !== null))];
    heatSelect.innerHTML = heats
      .map(h => `<option value="${h}">Rozběh ${h}</option>`)
      .join('');
    if (heats.length > 0) heatSelect.value = heats[0];

    showHeat(rows, heatSelect.value);

    heatSelect.addEventListener('change', () => {
      showHeat(rows, heatSelect.value);
    });

    function showHeat(allRows, heat) {
      tbody.innerHTML = '';
      thead.innerHTML = `
        <tr class="bg-gray-700">
          <th class="p-2 border border-gray-600">Rozběh</th>
          <th class="p-2 border border-gray-600">Dráha</th>
          <th vclass="p-2 border border-gray-600">Startovní číslo</th>
          <th class="p-2 border border-gray-600">Jméno</th>
          <th class="p-2 border border-gray-600">Příjmení</th>
          <th class="p-2 border border-gray-600">1. pokus</th>
          <th class="p-2 border border-gray-600">2. pokus</th>
          <th class="p-2 border border-gray-600">N</th>
        </tr>
      `;

      allRows
        .filter(r => r.heat == heat)
        .sort((a, b) => (a.lane || 0) - (b.lane || 0))
        .forEach(r => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${r.heat}</td>
            <td>${r.lane}</td>
            <td>${r.start_number ?? ''}</td>
            <td>${r.name ?? ''}</td>
            <td>${r.surname ?? ''}</td>
            <td class="lp-time" data-id="${r.id}"></td>
  <td class="pp-time" data-id="${r.id}"></td>
            <td class="p-2 text-center">
  <input type="checkbox" class="n-first">
</td>
<td class="p-2 text-center">
  <input type="checkbox" class="n-second">
</td>

          `;
          tbody.appendChild(tr);
        });
    }
  }
}



function loadResultsCategories() {
  loadCategoriesForSelectedCompetition();
}


// ✅ UPRAVENÁ FUNKCE attachMeasurementListeners
async function attachMeasurementListeners() {
  const serialSelect = document.getElementById('serialPortSelect');
  const connectBtn = document.getElementById('connectSerialBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const serialLog = document.getElementById('serialLog');

  const ports = await window.electron.invoke('listSerialPorts');
  serialSelect.innerHTML = "";
  ports.forEach(port => {
    const option = document.createElement('option');
    option.value = port.path;
    option.textContent = `${port.path} - ${port.manufacturer || ''}`;
    serialSelect.appendChild(option);
  });

  connectBtn?.addEventListener('click', async () => {
    const port = serialSelect?.value;
    if (!port) {
      alert("Vyber nejdřív port!");
      return;
    }
    await window.electron.invoke('openSerialPort', port);
    document.getElementById('startBtn')?.removeAttribute('disabled');
    document.getElementById('stopBtn')?.setAttribute('disabled', 'disabled');
    document.getElementById('resetBtn')?.removeAttribute('disabled');
    window.serialConnected = true;
    document.getElementById('serialStatus').textContent = "Připojeno";
    document.getElementById('serialStatus').classList.remove('text-gray-300');
    document.getElementById('serialStatus').classList.add('text-green-400');
    connectBtn?.classList.add('hidden');
    disconnectBtn?.classList.remove('hidden');
    serialSelect?.classList.add('hidden');
    serialLog?.insertAdjacentHTML('beforeend', `<div>[INFO] Připojeno k ${port}</div>`);
  });

  disconnectBtn?.addEventListener('click', async () => {
    await window.electron.invoke('closeSerialPort');
    window.serialConnected = false;
    document.getElementById('serialStatus').textContent = "Nepřipojeno";
    document.getElementById('serialStatus').classList.add('text-gray-300');
    document.getElementById('serialStatus').classList.remove('text-green-400');
    disconnectBtn?.classList.add('hidden');
    connectBtn?.classList.remove('hidden');
    serialSelect?.classList.remove('hidden');
  });

  document.getElementById('startBtn')?.addEventListener('click', () => {
    window.electron.invoke('sendToSerialPort', 'START');
    document.getElementById('startBtn').setAttribute('disabled', 'disabled');
    document.getElementById('stopBtn').removeAttribute('disabled');
  });

  document.getElementById('stopBtn')?.addEventListener('click', () => {
    window.electron.invoke('sendToSerialPort', 'STOP');
    document.getElementById('startBtn').removeAttribute('disabled');
    document.getElementById('stopBtn').setAttribute('disabled', 'disabled');
  });

  document.getElementById('resetBtn')?.addEventListener('click', () => {
    window.electron.invoke('sendToSerialPort', 'RESET');
    document.getElementById('startBtn').removeAttribute('disabled');
    document.getElementById('stopBtn').setAttribute('disabled', 'disabled');
  });

  window.electron.on('timer-data', async (e, payload) => {
    console.log('DATA ZE ČASOMÍRY:', payload);

    const timerDisplay = document.getElementById('timerDisplay');
    const row = document.querySelector('tr.highlighted');
    const discipline = await getCurrentDiscipline();

    const lp = payload.times[0] !== null ? `${payload.times[0].toFixed(3)} s` : "---";
    const pp = payload.times[1] !== null ? `${payload.times[1].toFixed(3)} s` : "---";

    if (timerDisplay) {
      if (discipline === 'Požární útok') {
        timerDisplay.innerHTML = `
          <div class="flex items-center justify-center gap-8">
            <div class="text-center">
              <div class="text-xs text-gray-400 mb-1">LP</div>
              <div class="text-5xl font-bold text-green-400">${lp}</div>
            </div>
            <div class="text-center">
              <div class="text-xs text-gray-400 mb-1">PP</div>
              <div class="text-5xl font-bold text-blue-400">${pp}</div>
            </div>
          </div>
        `;
      } else {
        // pro 60m ukážeme jen LP (Dráha 1)
        const activeRows = Array.from(document.querySelectorAll('#measurementRows tr')).filter(r => r.offsetParent !== null);
const drah = activeRows.length;

timerDisplay.innerHTML = `
  <div class="flex items-center justify-center gap-6">
    ${activeRows.map((r, i) => {
      const time = payload.times[i] !== null ? `${payload.times[i].toFixed(3)} s` : "---";
      return `
        <div class="text-center">
          <div class="text-xs text-gray-400 mb-1">Dráha ${i + 1}</div>
          <div class="text-4xl font-bold text-yellow-400">${time}</div>
        </div>
      `;
    }).join('')}
  </div>
`;

      }
    }

    // Přímé propsání do tabulky (měřená řádka)
    if (row) {
      const lpCell = row.querySelector('.lp-time');
      const ppCell = row.querySelector('.pp-time');
      if (lpCell) lpCell.textContent = payload.times[0]?.toFixed(3) || "---";
      if (ppCell) ppCell.textContent = payload.times[1]?.toFixed(3) || "---";
    }
  });


  window.electron.on('serial-raw-line', (e, rawHex) => {
    console.log('RAW SERIAL DATA:', rawHex);
    if (serialLog) {
      serialLog.insertAdjacentHTML('beforeend', `<div>[RAW] ${rawHex}</div>`);
      serialLog.scrollTop = serialLog.scrollHeight;
    }
  });

  document.addEventListener('click', (e) => {
    const row = e.target?.closest('#measurementRows tr');
    if (row) {
      document.querySelectorAll('#measurementRows tr')
        .forEach(r => r.classList.remove('highlighted'));
      row.classList.add('highlighted');
      window.currentSelectedRowId = row.dataset.id;
    }
  });

  // SAVE button handler for Požární útok
  document.getElementById('saveResultBtn')?.addEventListener('click', async () => {
    const competitionId = localStorage.getItem('selectedCompetitionId');
    const categoryId = document.getElementById('measurementCategory')?.value;
    if (!competitionId || !categoryId) return;
    const startlistId = window.currentSelectedRowId;
    if (!startlistId) return;
    const rawTime = document.getElementById('timerDisplay')?.textContent;
    const timeNumber = rawTime && rawTime !== "---"
      ? parseFloat(rawTime.replace(' s', ''))
      : null;
    const isN = document.getElementById('nCheckbox')?.checked || false;

    await window.electron.invoke('saveResult', {
      startlist_id: startlistId,
      discipline: 'Požární útok',
      time_lp: timeNumber,
      time_pp: null,
      is_n: isN
    });

    alert('Výsledek uložen!');

    // Přepnout na další tým
    const currentRow = document.querySelector(`tr[data-id="${startlistId}"]`);
    const nextRow = currentRow?.nextElementSibling;
    if (nextRow) {
      document.querySelectorAll('#measurementRows tr')
        .forEach(r => r.classList.remove('highlighted'));
      nextRow.classList.add('highlighted');
      window.currentSelectedRowId = nextRow.dataset.id;
    }
  });
}