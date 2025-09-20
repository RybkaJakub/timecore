window.serialConnected = false;
window.currentSelectedRowId = null;
const show = id => document.getElementById(id)?.removeAttribute('hidden');
const hide = id => document.getElementById(id)?.setAttribute('hidden', '');
const toBool = v => v === true || v === 1 || v === '1' || v === 'true';

async function confirmBox({
  title = 'Změna výsledku',
  message = 'Opravdu přepsat uložený výsledek? Tato akce je nevratná.',
  ok = 'Ano, přepsat',
  cancel = 'Zrušit'
} = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-50 flex items-center justify-center';
    wrap.innerHTML = `
      <div class="absolute inset-0 bg-black/60"></div>
      <div class="relative bg-gray-800 text-white rounded-lg shadow-xl w-full max-w-md p-6 animate-[pop_.15s_ease-out]">
        <h3 class="text-lg font-semibold mb-2">${title}</h3>
        <p class="text-sm text-gray-300 mb-6">${message}</p>
        <div class="flex justify-end gap-3">
          <button class="btn-cancel inline-flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg">
            ❌ ${cancel}
          </button>
          <button class="btn-ok inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold">
            ✅ ${ok}
          </button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const done = v => { wrap.remove(); resolve(v); };

    wrap.querySelector('.btn-cancel').addEventListener('click', () => done(false));
    wrap.querySelector('.btn-ok').addEventListener('click', () => done(true));
    wrap.querySelector('.absolute').addEventListener('click', () => done(false));

    const onKey = e => {
      if (e.key === 'Escape') done(false);
      if (e.key === 'Enter') done(true);
    };
    document.addEventListener('keydown', onKey, { once: true });
  });
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = '';
  if (type === 'success') {
    icon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>`;
  } else if (type === 'error') {
    icon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>`;
  } else {
    icon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" />
            </svg>`;
  }

  toast.innerHTML = `${icon}<span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 5000); // zmizí po 5s
}


// Funkce pro otevření modalu soutěží
async function openCompetitionModal() {
    console.log("▶️ Otevírám modal soutěží");

    const modal = document.getElementById('competitionModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const competitions = await window.electron.invoke('getCompetitions');
    competitions.sort((a, b) => b.id - a.id);
    window.allCompetitions = competitions;

    const searchInput = document.getElementById('searchCompetitionInput');
    const sortSelect = document.getElementById('sortCompetitionSelect');

    let currentSearch = '';
    let currentSort = 'date_desc';

    const refreshList = () => {
        let filtered = window.allCompetitions.filter(c =>
            c.name.toLowerCase().includes(currentSearch.toLowerCase()) ||
            (c.date || '').includes(currentSearch)
        );

        if (currentSort === 'name_asc') filtered.sort((a, b) => a.name.localeCompare(b.name));
        else if (currentSort === 'name_desc') filtered.sort((a, b) => b.name.localeCompare(a.name));
        else if (currentSort === 'date_asc') filtered.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        else filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        renderCompetitionList(filtered);
    };

    // při psaní ve vyhledávači
    if (searchInput?._listener) {
        searchInput.removeEventListener('input', searchInput._listener);
    }
    searchInput._listener = (e) => {
        currentSearch = e.target.value;
        refreshList();
    };
    searchInput.addEventListener('input', searchInput._listener);


    // řazení
    if (sortSelect?._listener) {
        sortSelect.removeEventListener('change', sortSelect._listener);
    }
    sortSelect._listener = (e) => {
        currentSort = e.target.value;
        refreshList();
    };
    sortSelect.addEventListener('change', sortSelect._listener);


    // + Nová soutěž
    document.getElementById('createNewCompetitionBtn')?.addEventListener('click', () => {
        clearCompetitionForm();
        document.getElementById('createCompetitionModal')?.classList.remove('hidden');
    });

    refreshList();
}


function renderCompetitionList(competitions) {
    const container = document.getElementById('competitionList');
    container.innerHTML = '';

    const selectedId = parseInt(localStorage.getItem('selectedCompetitionId'));

    if (!competitions || competitions.length === 0) {
        container.innerHTML = `<div class="text-gray-400 italic">Žádné soutěže nejsou k dispozici.</div>`;
        return;
    }

    competitions.forEach(c => {
        const isSelected = selectedId === c.id;

        const item = document.createElement('div');
        item.className = `bg-gray-700 p-3 rounded flex justify-between items-center hover:bg-gray-600 transition ${isSelected ? 'ring-2 ring-primary' : ''}`;

        const name = document.createElement('div');
        const formattedDate = c.date
            ? new Date(c.date).toLocaleDateString('cs-CZ', {day: 'numeric', month: 'numeric', year: 'numeric'})
            : 'bez data';

        name.textContent = `${c.name} (${formattedDate})`;
        name.className = 'cursor-pointer font-medium';
        name.addEventListener('click', () => {
            localStorage.setItem('selectedCompetitionId', c.id);
            localStorage.setItem('selectedCompetitionName', c.name);
            localStorage.setItem('selectedCompetitionDate', c.date || '');
            document.getElementById('competitionModal')?.classList.add('hidden');
            updateSelectedCompetitionLabel();
            showSidebarFull();
            loadView('dashboard');
        });

        const actions = document.createElement('div');
        actions.className = 'flex gap-2 text-sm';

        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️';
        editBtn.title = 'Upravit';
        editBtn.className = 'hover:text-yellow-400';
        editBtn.addEventListener('click', () => editCompetition(c));

        const duplicateBtn = document.createElement('button');
        duplicateBtn.textContent = '📄';
        duplicateBtn.title = 'Duplikovat';
        duplicateBtn.className = 'hover:text-blue-400';
        duplicateBtn.addEventListener('click', async () => {
            const copy = {...c, name: c.name + ' (kopie)'};
            delete copy.id;
            await window.electron.invoke('createCompetition', copy);
            await openCompetitionModal();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.title = 'Smazat';
        deleteBtn.className = 'hover:text-red-400';
        deleteBtn.addEventListener('click', async () => {
            const ok = await confirmBox({
                title: 'Smazání soutěže',
                message: `Opravdu smazat soutěž "${c.name}"?`,
                ok: 'Potvrdit',
                cancel: 'Zrušit'
            });
            if (ok) {
                console.log("Mazání soutěže ID:", c.id);

                // 🔁 Přidej animaci skrytí před smazáním
                item.classList.add('opacity-0', 'transition-opacity', 'duration-300');

                setTimeout(async () => {
                    item.remove();
                    await window.electron.invoke('deleteCompetition', c.id);

                    // Aktualizuj data z DB
                    const competitions = await window.electron.invoke('getCompetitions');
                    competitions.sort((a, b) => b.id - a.id);
                    window.allCompetitions = competitions;

                    const search = document.getElementById('searchCompetitionInput')?.value || '';
                    const sort = document.getElementById('sortCompetitionSelect')?.value || 'date_desc';

                    let filtered = competitions.filter(c =>
                        c.name.toLowerCase().includes(search.toLowerCase()) || (c.date || '').includes(search)
                    );

                    if (sort === 'name_asc') filtered.sort((a, b) => a.name.localeCompare(b.name));
                    else if (sort === 'name_desc') filtered.sort((a, b) => b.name.localeCompare(a.name));
                    else if (sort === 'date_asc') filtered.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                    else filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

                    renderCompetitionList(filtered);

                    const selectedId = parseInt(localStorage.getItem('selectedCompetitionId'));
                    if (selectedId === c.id) {
                        localStorage.removeItem('selectedCompetitionId');
                        localStorage.removeItem('selectedCompetitionName');
                        updateSelectedCompetitionLabel();
                    }
                    await loadCompetitions();

                    showToast(`Soutěž "${c.name}" byla úspěšně smazána ✅`);
                }, 300); // počkej na animaci
            }
        });


        actions.append(editBtn, duplicateBtn, deleteBtn);
        item.append(name, actions);
        container.appendChild(item);
    });
}

function editCompetition(comp) {
    document.getElementById('editCompName').value = comp.name || '';
    document.getElementById('editCompDate').value = comp.date || '';
    document.getElementById('editCompTime').value = comp.time || '';
    document.getElementById('editCompType').value = comp.type || '';
    document.getElementById('competitionModal')?.classList.add('hidden');
    document.getElementById('editCompetitionModal')?.classList.remove('hidden');
    const cancelBtn = document.getElementById('cancelCreateComp');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            clearCompetitionForm();
            document.getElementById('editCompetitionModal').classList.add('hidden');
        });
    }

    const saveBtn = document.getElementById('editSaveCreateComp');
    saveBtn.onclick = async () => {
        const name = document.getElementById('editCompName').value.trim();
        const date = document.getElementById('editCompDate').value;
        const time = document.getElementById('editCompTime').value;
        const type = document.getElementById('editCompType').value;

        if (!name) return showToast('Zadej název.', 'error');


        await window.electron.invoke('updateCompetition', {
            id: comp.id,
            name, date, time, type
        });
        localStorage.setItem('selectedCompetitionId', comp.id);
        localStorage.setItem('selectedCompetitionName', name);
        document.getElementById('editCompetitionModal').classList.add('hidden');
        document.getElementById('competitionModal')?.classList.add('hidden'); // zavře i ten hlavní
        await loadCompetitions(); // znovu načti soutěže
        updateSelectedCompetitionLabel(); // aktualizuj text
        loadView('dashboard');

        clearCompetitionForm();

    };
}

// DOM načten
document.addEventListener('DOMContentLoaded', async () => {
    console.log("✅ DOMContentLoaded");

    await loadSidebar();
    attachNavbarListeners();
    attachSidebarListeners();

    const openBtn = document.getElementById('openCompetitionModalBtn');
    if (openBtn) {
        console.log("✅ Našel jsem tlačítko openCompetitionModalBtn");
        openBtn.addEventListener('click', () => {
            console.log("🖱️ Kliknuto na Zvolit soutěž");
            openCompetitionModal();
        });
    } else {
        console.warn("❌ Tlačítko openCompetitionModalBtn nenalezeno!");
    }

    // Zavření modalu výběru soutěže
    const closeBtn = document.getElementById('closeCompetitionModal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('competitionModal')?.classList.add('hidden');
        });
    }

    const cancelBtn = document.getElementById('cancelSelectCompetitionBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.getElementById('competitionModal')?.classList.add('hidden');
        });
    }

    const selectedId = localStorage.getItem('selectedCompetitionId');
    if (!selectedId) {
        console.log("🔔 Žádná soutěž není vybraná, otevírám modal");
        openCompetitionModal();
    } else {
        console.log("ℹ️ Vybraná soutěž z localStorage: ", selectedId);
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
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const logo = document.getElementById('logo');
    const linkTexts = document.querySelectorAll('.link-text');
    const links = document.querySelectorAll('.sidebar-link');
    const themeToggle = document.getElementById('themeToggle');

    sidebarToggle.addEventListener('click', () => {
        const collapsed = sidebar.classList.toggle('w-16');
        sidebar.classList.toggle('w-64', !collapsed);

        logo.classList.toggle('hidden', collapsed);
        linkTexts.forEach(span => span.classList.toggle('hidden', collapsed));
        links.forEach(link => {
            link.classList.toggle('justify-center', collapsed);
            link.classList.toggle('justify-start', !collapsed);
        });
    });

    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.dataset.view;
            loadView(view);
            setActiveLink(link);
        });
    });
}

function formatDate(isoDate) {
    const d = new Date(isoDate);
    return d.toLocaleDateString('cs-CZ', {year: 'numeric', month: 'long', day: 'numeric'});
}

function setActiveLink(activeLink) {
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.remove('bg-primary');
    });
    activeLink.classList.add('bg-primary');
}

function renderDashboardCompetitionInfo() {
    const infoBox = document.getElementById('competitionInfo');
    const nameEl = document.getElementById('infoName');
    const dateEl = document.getElementById('infoDate');
    const timeEl = document.getElementById('infoTime');
    const typeEl = document.getElementById('infoType');

    const selectedId = parseInt(localStorage.getItem('selectedCompetitionId'));
    if (!selectedId || !window.allCompetitions) return;

    const selected = window.allCompetitions.find(c => c.id === selectedId);
    if (!selected) return;

    nameEl.textContent = selected.name;
    dateEl.textContent = selected.date ? formatDate(selected.date) : 'Neuvedeno';
    timeEl.textContent = selected.time || 'Neuvedeno';
    typeEl.textContent = selected.type || 'Neuvedeno';

    infoBox.classList.remove('hidden');
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
            if (viewName === 'results_app') {
                loadResultsCategories();
                attachResultsListeners();
            }
            if (viewName === 'dashboard') {
                renderDashboardCompetitionInfo();
                const element = document.querySelector('[data-view="dashboard"]');
                setActiveLink(element);
            }
            if (viewName === 'relay') {
                loadRelayCategories();
                attachRelayListeners();
            }

        });
}

function attachNavbarListeners() {
    const createBtn = document.getElementById('createCompetitionBtn');
    const cancelBtn = document.getElementById('cancelCreateComp');
    const saveBtn = document.getElementById('saveCreateComp');

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
                showToast('Zadejte název soutěže.', 'error');
                return;
            }

            const result = await window.electron.invoke('createCompetition', {name, date, time, type});

            console.log(`Result: ${result}`);

            if (result?.id) {
                localStorage.setItem('selectedCompetitionId', result.id);
                localStorage.setItem('selectedCompetitionName', name);
                document.getElementById('createCompetitionModal').classList.add('hidden');
                document.getElementById('competitionModal')?.classList.add('hidden'); // zavře i ten hlavní
                await loadCompetitions(); // znovu načti soutěže
                updateSelectedCompetitionLabel(); // aktualizuj text
                showSidebarFull();
                loadView('dashboard');
            }

            clearCompetitionForm();
            document.getElementById('createCompetitionModal').classList.add('hidden');
        });
    }
}

function updateSelectedCompetitionLabel() {
    const label = document.getElementById('selectedCompetitionLabel');
    const name = localStorage.getItem('selectedCompetitionName');
    const date = localStorage.getItem('selectedCompetitionDate');

    if (label) {
        if (name) {
            const formattedDate = date
                ? new Date(date).toLocaleDateString('cs-CZ', {
                    day: 'numeric',
                    month: 'numeric',
                    year: 'numeric'
                })
                : 'bez data';
            label.textContent = `🏁 Aktuální: ${name} (${formattedDate})`;
        } else {
            label.textContent = 'Žádná soutěž není vybraná';
        }
    }
}


async function loadCompetitions() {
    const competitions = await window.electron.invoke('getCompetitions');
    competitions.sort((a, b) => b.id - a.id);
    window.allCompetitions = competitions;

    // Pokud žádná soutěž není vybraná → nastav první
    if (!localStorage.getItem('selectedCompetitionId') && competitions.length > 0) {
        const first = competitions[0];
        localStorage.setItem('selectedCompetitionId', first.id);
        localStorage.setItem('selectedCompetitionName', first.name);
        console.log("🔄 Automaticky nastavuji soutěž:", first.name);
    }

    updateSelectedCompetitionLabel();
}

function clearCompetitionForm() {
    document.getElementById('compName').value = "";
    document.getElementById('compDate').value = "";
    document.getElementById('compTime').value = "";
    document.getElementById('compType').value = "";
    document.getElementById('editCompName').value = "";
    document.getElementById('editCompDate').value = "";
    document.getElementById('editCompTime').value = "";
    document.getElementById('editCompType').value = "";
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
    hide('laneCountSelect');
    hide('addStartlistEntryBtn');
    hide('generateStartlistBtn');
    hide('addTeamBtn');

    const tbody = document.getElementById('startlistRows');
    const thead = document.getElementById('startlistHead');
    if (!tbody || !thead) return;

    tbody.innerHTML = '';
    thead.innerHTML = '';
}

// ===== Startlist Search (binduje se JEDNOU, znovu se jen filtruje) =====
const setupStartlistSearch = (() => {
    let bound = false;
    let rowsEl, searchEl, clearBtn, badgeEl;
    let defaultDisplay = 'table';

    const norm = s => (s || '').toString().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ').trim();

    const getRows = () =>
        Array.from(rowsEl.querySelectorAll('#startlistRows > tr'))
            .filter(tr => tr.id !== 'emptyStateRow');

    const primeDefaultDisplay = () => {
        const first = getRows()[0];
        if (first) defaultDisplay = getComputedStyle(first).display || 'table';
    };

    const updateBadge = () => {
        if (!badgeEl) return;
        const all = getRows().length;
        const visible = getRows().filter(tr => tr.style.display !== 'none').length;
        badgeEl.textContent = `${visible} / ${all} položek`;
    };

    const toggleEmpty = () => {
        const emptyRow = document.getElementById('emptyStateRow');
        if (!emptyRow) return;
        const anyVisible = getRows().some(tr => tr.style.display !== 'none');
        emptyRow.classList.toggle('hidden', anyVisible);
    };

    const filter = () => {
        const q = norm(searchEl?.value || '');
        for (const tr of getRows()) {
            const hide = q && !norm(tr.innerText).includes(q);
            tr.style.display = hide ? 'none' : defaultDisplay; // neřešíme .hidden vs display:table
        }
        toggleEmpty();
        updateBadge();
    };

    // veřejná init funkce
    return function initSearch() {
        rowsEl = document.getElementById('startlistRows');
        searchEl = document.getElementById('searchStartlistInput');
        clearBtn = document.getElementById('searchClearBtn');     // může být null, nevadí
        badgeEl = document.getElementById('rowsCountBadge');     // může být null, nevadí
        if (!rowsEl) return;

        primeDefaultDisplay();
        filter(); // hned spočti a přefiltruj

        if (!bound) {
            // debounce
            let t;
            const deb = (fn, ms = 120) => (...a) => {
                clearTimeout(t);
                t = setTimeout(() => fn(...a), ms);
            };

            searchEl?.addEventListener('input', deb(filter, 120));
            searchEl?.addEventListener('keydown', e => {
                if (e.key === 'Escape') {
                    searchEl.value = '';
                    filter();
                }
            });
            clearBtn?.addEventListener('click', () => {
                if (searchEl) {
                    searchEl.value = '';
                    searchEl.focus();
                }
                filter();
            });

            // kdykoli se vymění řádky -> znovu načti default display a filtr
            const mo = new MutationObserver(() => {
                primeDefaultDisplay();
                filter();
            });
            mo.observe(rowsEl, {childList: true});
            bound = true;
        }
    };
})();


function attachStartlistListeners() {
    const importCsvBtn = document.getElementById('importCsvBtn');
    const importExcelBtn = document.getElementById('importExcelBtn');
    const generateBtn = document.getElementById('generateStartlistBtn');
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const addRunnerBtn = document.getElementById('addStartlistEntryBtn');
    const addTeamBtn = document.getElementById('addTeamBtn');
    const cancelRunnerBtn = document.getElementById('cancelRunnerBtn'); // FIX
    const cancelTeamBtn = document.getElementById('cancelTeamBtn');   // FIX
    const saveRunnerBtn = document.getElementById('saveRunnerBtn');
    const saveTeamBtn = document.getElementById('saveTeamBtn');
    const categorySelect = document.getElementById('categorySelect');
    const laneCountSelect = document.getElementById('laneCountSelect');

    const searchInput = document.getElementById('searchStartlistInput');
    const rowsContainer = document.getElementById('startlistRows');

    let currentSearch = '';

    const normalize = (s) =>
        (s || '')
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

    const filterRows = () => {
        if (!rowsContainer) return;
        const q = normalize(currentSearch);
        rowsContainer.querySelectorAll('tr').forEach(row => {
            const text = normalize(row.innerText);
            const hide = q && !text.includes(q);
            if (hide) {
                row.style.display = 'none';
            } else {
                // vrať zpět layout tabulky
                row.style.display = 'table';
            }
        });
    };


    const debounce = (fn, ms) => {
        let t;
        return (...a) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...a), ms);
        };
    };

    if (searchInput) {
        if (searchInput._inputListener) {
            searchInput.removeEventListener('input', searchInput._inputListener);
        }
        searchInput._inputListener = debounce((e) => {
            currentSearch = e.target.value || '';
            filterRows();
        }, 150);
        searchInput.addEventListener('input', searchInput._inputListener);

        if (searchInput._keyListener) {
            searchInput.removeEventListener('keydown', searchInput._keyListener);
        }
        searchInput._keyListener = (e) => {
            if (e.key === 'Escape') {
                e.target.value = '';
                currentSearch = '';
                filterRows();
            }
        };
        searchInput.addEventListener('keydown', searchInput._keyListener);
    }

    if (rowsContainer) {
        if (!rowsContainer._mo) {
            rowsContainer._mo = new MutationObserver(filterRows);
            rowsContainer._mo.observe(rowsContainer, {childList: true});
        }
    }

    if (importCsvBtn) {
        importCsvBtn.addEventListener('click', async () => {
            const competitionId = localStorage.getItem('selectedCompetitionId');
            const categoryId = categorySelect?.value;
            const discipline = await getCurrentDiscipline();

            if (!competitionId || !categoryId) {
                showToast('Nejprve vyber soutěž a kategorii.', 'error');
                return;
            }

            const success = await window.electron.invoke('importStartlistCsv', competitionId, categoryId, discipline);
            if (success) {
                showToast('Import CSV proběhl úspěšně.', 'success');
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
                showToast('Nejprve vyber soutěž a kategorii.', 'error');
                return;
            }

            const success = await window.electron.invoke('importStartlistExcel', competitionId, categoryId, discipline);
            if (success) {
                showToast('Import Excelu proběhl úspěšně.', 'success');
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
                showToast('Startovka vygenerována.', 'success');
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
                showToast('Nejprve vyber soutěž.', 'error');
                return;
            }

            const discipline = comp.type || null;
            const competitionName = comp.name || null;
            const competitionDate = comp.date || null;

            const categories = await window.electron.invoke('getCategories', discipline);
            const category = categories.find(cat => cat.id == categoryId);
            const categoryName = category?.name || null;

            if (!competitionId || !categoryId || !discipline) {
                showToast('Nejprve vyber soutěž a kategorii.', 'error');
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
            showToast('Export do Excelu dokončen.', 'success');
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
            document.getElementById('teamName').value = '';
            document.getElementById('teamStartPosition').value = '';
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
                        const ok = await confirmBox({
                            title: 'Smazání týmu',
                            message: `Opravdu smazat tento tým?`,
                            ok: 'Potvrdit',
                            cancel: 'Zrušit'
                        });
                        if (!ok) return;
                        await window.electron.invoke('deleteStartlistEntry', r.id);
                        tr.remove();
                    });

                    tbody.appendChild(tr);

                });
                hide('generateStartlistBtn');
                hide('addStartlistEntryBtn');
                hide('laneCountSelect');
                show('addTeamBtn');

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
                        const ok = await confirmBox({
                            title: 'Smazání závodníka',
                            message: `Opravdu smazat tohoto závodníka?`,
                            ok: 'Potvrdit',
                            cancel: 'Zrušit'
                        });
                        if (!ok) return;
                        await window.electron.invoke('deleteStartlistEntry', r.id);
                        tr.remove();
                    });

                    tbody.appendChild(tr);
                });

                show('generateStartlistBtn');
                show('addStartlistEntryBtn');
                show('laneCountSelect');
                hide('addTeamBtn');
            }
        });
        setupStartlistSearch();
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

    sel.addEventListener('change', async (e) => {
        const catId = e.target.value;
        window.electron.invoke('storeSet', 'selectedCategoryId', catId);
        window.electron.invoke('storeSet', 'selectedCompetitionId', competitionId);
        window.electron.invoke('storeSet', 'selectedDiscipline', discipline);
        await loadMeasurementStartlist(competitionId, catId, discipline);
    });

}

async function loadMeasurementStartlist(competitionId, categoryId, discipline) {
    const rows = await window.electron.invoke('getStartlist', competitionId, categoryId);

    const tbody = document.getElementById('measurementRows');
    const thead = document.getElementById('measurementHead');
    const heatContainer = document.getElementById('heatContainer');
    const attemptContainer = document.getElementById('attemptContainer');
    const heatSelect = document.getElementById('heatSelect');
    const attemptSelect = document.getElementById('attemptSelect');

    tbody.innerHTML = '';
    thead.innerHTML = '';
    document.getElementById('saveAttackContainer').classList.add('hidden');
    document.getElementById('saveRunContainer').classList.add('hidden');
    if (discipline === 'Požární útok') {

        document.getElementById('saveAttackContainer').classList.remove('hidden');

        heatContainer.classList.add('hidden');
        attemptContainer.classList.add('hidden');

        thead.innerHTML = `
          <tr class="bg-gray-700 text-gray-200 uppercase text-xs">
          <th class="p-2 border border-gray-600 w-28">Start. č.</th>
          <th class="p-2 border border-gray-600 w-64">Družstvo</th>
          <th class="p-2 border border-gray-600 w-48">LP čas</th>
          <th class="p-2 border border-gray-600 w-48">PP čas</th>
          <th class="p-2 border border-gray-600 w-48">Výsledek</th>
          <th class="p-2 border border-gray-600 w-48">Platný pokus</th>
        </tr>
        `;

        rows.forEach(r => {
            const tr = document.createElement('tr');
            const isN = !!r.results[0]?.is_n;
            const valid = !isN;
            tr.dataset.id = r.id;
            tr.dataset.resultId = r.results[0].id;

            tr.className = [
                'h-10 leading-none transition-colors',
                'hover:bg-gray-600/60'
            ].join(' ');
            tr.innerHTML = `
                <td class="p-2 border border-gray-600 text-center font-medium  w-28">${r.start_number ?? ''}</td>
          <td class="p-2 border border-gray-600 w-64">
            <div class="flex items-center gap-2">
              <span class="font-semibold tracking-wide">${r.team ?? ''}</span>
            </div>
          </td>
          <td class="p-2 border border-gray-600 text-center lp-time w-48" contenteditable="true">${r.results[0].time_lp ?? '-'}</td>
          <td class="p-2 border border-gray-600 text-center pp-time w-48" contenteditable="true">${r.results[0].time_pp ?? '-'}</td>
          <td class="p-2 border border-gray-600 text-center font-semibold result-time w-48">
            ${r.results[0].final_time ?? '-'}
          </td>
          <td class="p-2 border border-gray-600 text-center font-semibold w-48">
      ${
                r.results[0].is_n != null
                    ? `<div class="flex justify-center">
                <button 
                  class="validity-toggle-utok px-3 py-1 rounded text-white text-sm transition
                    ${valid ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}"
                  data-valid="${valid}"
                  data-index="${r.results[0].id}"
                >
                  ${valid ? '✅ PLATNÝ' : '❌ NEPLATNÝ'}
                </button>
              </div>`
                    : '-'
            }
    </td>
    
    
            
          `;

            tbody.appendChild(tr);
        });

        const patchResult = async (id, patch) => {
            if (!Number.isFinite(id)) {
                console.error('Invalid id', id, patch);
                return;
            }
            console.log('[IPC] updateResults ->', id, patch);
            return await window.electron.invoke('updateResults', {id, ...patch});
        };

        // toggle platnosti
        document.getElementById('measurementRows')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('.validity-toggle-utok');
            if (!btn) return;

            const tr = btn.closest('tr');
            const id = Number(btn.dataset.index || tr?.dataset.id);
            const wasValid = btn.dataset.valid === 'true';
            const nowValid = !wasValid;

            const res = await patchResult(id, {is_n: !nowValid});

            btn.dataset.valid = String(nowValid);
            btn.textContent = nowValid ? '✅ PLATNÝ' : '❌ NEPLATNÝ';
            btn.classList.toggle('bg-green-600', nowValid);
            btn.classList.toggle('hover:bg-green-700', nowValid);
            btn.classList.toggle('bg-red-600', !nowValid);
            btn.classList.toggle('hover:bg-red-700', !nowValid);

            const finalEl = tr.querySelector('.result-time');
            const newFinal = res?.updated?.final_time;
            if (finalEl && newFinal != null) {
                finalEl.textContent = Number(newFinal).toFixed(2);
            }
        });

        // edit LP/PP – použij focusout (bublá)
        document.getElementById('measurementRows')?.addEventListener('focusout', async (e) => {
            const td = e.target.closest('td.lp-time, td.pp-time');
            if (!td) return;

            const tr = td.closest('tr');
            const id = Number(tr?.dataset.resultId);
            const raw = (td.textContent || '').trim().toUpperCase().replace(',', '.');

            let val = null;
            if (raw && raw !== '-' && raw !== 'N') {
                const num = Number(raw);
                val = Number.isFinite(num) ? num : null;
            }

            const patch = td.classList.contains('lp-time') ? {time_lp: val} : {time_pp: val};
            const res = await patchResult(id, patch);

            td.textContent = val == null ? '-' : Number(val).toFixed(2);

            const finalEl = tr.querySelector('.result-time');
            const newFinal = res?.updated?.final_time;
            if (finalEl && newFinal != null) {
                finalEl.textContent = Number(newFinal).toFixed(2);
            }
        });

        // zabraň enteru v contenteditable dělat nový řádek a místo toho “blur”
        document.getElementById('measurementRows')?.addEventListener('keydown', (e) => {
            const td = e.target.closest('td.lp-time, td.pp-time');
            if (!td) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                td.blur();
            }
        });


    } else {
        // Běh na 60m
        heatContainer.classList.remove('hidden');
        attemptContainer.classList.remove('hidden');
        const attempt = attemptSelect.value;
        localStorage.setItem('attempt', attempt);
        document.getElementById('saveRunContainer').classList.remove('hidden');

        // Seznam unikátních rozběhů
        const heats = [...new Set(rows.map(r => r.heat).filter(h => h !== null))].sort((a, b) => Number(a) - Number(b));
        heatSelect.innerHTML = heats
            .map(h => `<option value="${h}">Rozběh ${h}</option>`)
            .join('');
        if (heats.length > 0) heatSelect.value = heats[0];

        showHeat(rows, heatSelect.value);

        heatSelect.addEventListener('change', () => {
            showHeat(rows, heatSelect.value);
        });

        if (attemptSelect) {
            attemptSelect.addEventListener('change', (e) => {
                const attempt = e.target.value;
                localStorage.setItem('attempt', attempt);
            });
        }

        function showHeat(allRows, heat) {
            tbody.innerHTML = '';
            thead.innerHTML = '';
            thead.innerHTML = `
            <tr>
              <th class="p-2">Rozběh</th>
              <th class="p-2">Dráha</th>
              <th class="p-2">Startovní číslo</th>
              <th class="p-2">Jméno</th>
              <th class="p-2">Příjmení</th>
              <th class="p-2">Tým</th>
              <th class="p-2">1. pokus</th>
              <th class="p-2">2. pokus</th>
              <th class="p-2">Výsledek</th>
            </tr>
          `;

            allRows
                .filter(r => r.heat == heat)
                .sort((a, b) => (a.lane || 0) - (b.lane || 0))
                .forEach(r => {
                    const tr = document.createElement('tr');
                    tr.dataset.id = r.id;
                    tr.innerHTML = `
                <td class="p-2">${r.heat ?? ''}</td>
                <td class="p-2">${r.lane}</td>
                <td class="p-2">${r.start_number}</td>
                <td class="p-2">${r.name ?? ''}</td>
                <td class="p-2">${r.surname ?? ''}</td>
                <td class="p-2">${r.team ?? ''}</td>
                <td class="p-2 time-1 ${toBool(r.results[0].is_n_first) ? 'text-red-400 font-semibold' : ''}">${r.results[0].is_n_first ? `N (${r.results[0].time_first})` : (r.results[0].time_first ?? '')}</td>
                <td class="p-2 time-2 ${toBool(r.results[0].is_n_second) ? 'text-red-400 font-semibold' : ''}">${r.results[0].is_n_second ? `N (${r.results[0].time_second})` : (r.results[0].time_second ?? '')}</td>
                <td class="p-2 result-time ${toBool(r.results[0].is_n_first) && toBool(r.results[0].is_n_second) ? 'text-red-400 font-semibold' : ''}">${r.results[0].final_time ?? ''}</td>
              `;
                    tbody.appendChild(tr);
                });
        }
    }
}

async function loadDisplays() {
    const displays = await window.electron.invoke('getDisplays');
    const select = document.getElementById('displaySelect');
    select.innerHTML = '';

    displays.forEach(display => {
        const option = document.createElement('option');
        option.value = display.id;
        option.textContent = display.name;
        select.appendChild(option);
    });
}

const laneValidityState = {};

// ✅ UPRAVENÁ FUNKCE attachMeasurementListeners
async function attachMeasurementListeners() {
    const serialSelect = document.getElementById('serialPortSelect');
    const connectBtn = document.getElementById('connectSerialBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');

    const ports = await window.electron.invoke('listSerialPorts');

    const toggleResultsBtn = document.getElementById('toggleResultsBtn');
    const displaySelect = document.getElementById('displaySelect');

    await loadDisplays();

    toggleResultsBtn.addEventListener('click', async () => {
        const index = parseInt(displaySelect.value || 0);
        const res = await window.electron.invoke('openResultsWindow', index);

        if (res.opened) {
            toggleResultsBtn.textContent = '❌ Zavřít výsledky';
        } else if (res.closed) {
            toggleResultsBtn.textContent = '📺 Zobrazit výsledky';
        }
    });


    serialSelect.innerHTML = "";
    ports.forEach(port => {
        const option = document.createElement('option');
        option.value = port.path;
        option.textContent = `${port.path} - ${port.manufacturer || ''}`;
        serialSelect.appendChild(option);
    });

    const b = document.getElementById('serialBadge');

    if (window.serialConnected) {
        b.textContent = 'Připojeno';
        b.classList.remove('is-off');
        b.classList.add('is-on');
        connectBtn?.classList.add('hidden');
        disconnectBtn?.classList.remove('hidden');
        serialSelect?.classList.add('hidden');
        const discipline = await getCurrentDiscipline();
        console.log(discipline);
        if (discipline === 'Požární útok') {
            document.querySelector('.utok').classList.remove('hidden');
        } else {
            document.querySelector('.utok').classList.add('hidden');
        }
    }

    connectBtn?.addEventListener('click', async () => {
        const port = serialSelect?.value;
        if (!port) {
            showToast('Vyber nejdřív port!', 'error');
            return;
        }
        await window.electron.invoke('openSerialPort', port);
        window.serialConnected = true;
        b.textContent = 'Připojeno';
        b.classList.remove('is-off');
        b.classList.add('is-on');
        connectBtn?.classList.add('hidden');
        disconnectBtn?.classList.remove('hidden');
        serialSelect?.classList.add('hidden');
        const discipline = await getCurrentDiscipline();
        console.log(discipline);
        if (discipline === 'Požární útok') {
            document.querySelector('.utok').classList.remove('hidden');
        } else {
            document.querySelector('.utok').classList.add('hidden');
        }
    });

    disconnectBtn?.addEventListener('click', async () => {
        await window.electron.invoke('closeSerialPort');
        window.serialConnected = false;
        b.textContent = 'Nepřipojeno';
        b.classList.remove('is-on');
        b.classList.add('is-off');
        disconnectBtn?.classList.add('hidden');
        connectBtn?.classList.remove('hidden');
        serialSelect?.classList.remove('hidden');
        const discipline = await getCurrentDiscipline();
        if (discipline === 'Požární útok') {
            document.querySelector('.utok').classList.add('hidden')
        } else {
            document.querySelector('.utok').classList.add('hidden')
        }
    });

    document.getElementById('stopResetBtn')?.addEventListener('click', () => {
        window.electron.invoke('sendToSerialPort', 'RST');
        window.electron.invoke('sendToSerialPort', 'RST');
    });


    window.electron.on('timer-data', async (e, payload) => {
        console.log('DATA ZE ČASOMÍRY:', payload);

        const timerDisplay = document.getElementById('timerDisplay');
        const discipline = await getCurrentDiscipline();

        if (timerDisplay) {
            if (discipline === 'Požární útok') {
                const lp = payload.times[0] !== null || Number.isNaN(+t) ? `${payload.times[0].toFixed(3)} s` : "---";
                const pp = payload.times[1] !== null || Number.isNaN(+t) ? `${payload.times[1].toFixed(3)} s` : "---";

                const lpCell = document.querySelector('.lpTime');
                const ppCell = document.querySelector('.ppTime');
                if (lpCell) lpCell.textContent = lp
                if (ppCell) ppCell.textContent = pp
            } else {

                const activeRows = Array.from(document.querySelectorAll('#measurementRows tr')).filter(r => r.offsetParent !== null);

                timerDisplay.innerHTML = `
      <div class="flex items-center justify-center gap-6">
        ${activeRows.map((r, i) => {
                    const time = payload.times[i] !== null ? `${payload.times[i].toFixed(3)} s` : "---";
                    const valid = laneValidityState[i] !== false; // defaultně platný
                    return `
            <div class="text-center" data-lane="${i}">
              <div class="text-xs text-gray-400 mb-1">Dráha ${i + 1}</div>
              <div class="text-4xl font-bold text-yellow-400">${time}</div>
              <button 
                class="validity-toggle mt-2 px-3 py-1 rounded text-white text-sm transition
                  ${valid ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}"
                data-valid="${valid}"
                data-index="${i}"
              >
                ${valid ? '✅ PLATNÝ' : '❌ NEPLATNÝ'}
              </button>
            </div>
          `;
                }).join('')}
      </div>
    `;
                document.querySelectorAll('.validity-toggle').forEach(btn => {
                    const index = btn.dataset.index;
                    btn.addEventListener('click', () => {
                        const isValid = btn.dataset.valid === 'true';
                        laneValidityState[index] = !isValid;
                        btn.dataset.valid = (!isValid).toString();
                        if (isValid) {
                            btn.textContent = "❌ NEPLATNÝ";
                            btn.classList.remove("bg-green-600", "hover:bg-green-700");
                            btn.classList.add("bg-red-600", "hover:bg-red-700");
                        } else {
                            btn.textContent = "✅ PLATNÝ";
                            btn.classList.remove("bg-red-600", "hover:bg-red-700");
                            btn.classList.add("bg-green-600", "hover:bg-green-700");
                        }
                    });
                });


                const attempt = localStorage.getItem('attempt');
                const laneCount = parseInt(localStorage.getItem('laneCount') || '1');
                const rows = document.querySelectorAll('#measurementRows tr');

                for (let i = 0; i < laneCount; i++) {

                    const row = rows[i];
                    if (!row) continue;

                    const cell = row.querySelector(`td.${CSS.escape(`time-${attempt}`)}`)

                    const time = payload.times[i]?.toFixed(3) || "---";

                    if (cell) {
                        cell.textContent = time !== null ? time : "---";
                    }
                }

            }
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

    async function confirmDanger({
                                     title = 'Změna výsledku',
                                     message = 'Opravdu přepsat uložený výsledek? Tato akce je nevratná.',
                                     ok = 'Ano, přepsat',
                                     cancel = 'Zrušit'
                                 } = {}) {
        return new Promise(resolve => {
            const wrap = document.createElement('div');
            wrap.className = 'fixed inset-0 z-50 flex items-center justify-center';
            wrap.innerHTML = `
          <div class="absolute inset-0 bg-black/60"></div>
          <div class="relative bg-gray-800 text-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 class="text-lg font-semibold mb-2">${title}</h3>
            <p class="text-sm text-gray-300 mb-6">${message}</p>
            <div class="flex justify-end gap-3">
              <button class="btn-cancel px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded">${cancel}</button>
              <button class="btn-ok px-4 py-2 bg-red-600 hover:bg-red-700 rounded">${ok}</button>
            </div>
          </div>`;
            document.body.appendChild(wrap);
            const done = v => {
                wrap.remove();
                resolve(v);
            };
            wrap.querySelector('.btn-cancel').addEventListener('click', () => done(false));
            wrap.querySelector('.btn-ok').addEventListener('click', () => done(true));
        });
    }

    document.getElementById('removeResultBtn')?.addEventListener('click', async () => {
        const competitionId = localStorage.getItem('selectedCompetitionId');
        const categoryId = document.getElementById('measurementCategory')?.value;
        if (!competitionId || !categoryId) return;

        const startlistId = window.currentSelectedRowId;
        if (!startlistId) return;

        // zjisti, jestli už něco v DB je
        const existingMap = await window.electron.invoke('getResultsByStartlistIds', [startlistId]);
        const existing = Array.isArray(existingMap)
            ? existingMap[0]
            : (existingMap?.[startlistId] ?? null);

        const exists =
            !!existing &&
            (
                existing.id != null ||
                existing.time_lp != null ||
                existing.time_pp != null ||
                existing.final_time != null ||
                existing.is_n != null
            );

        if (!exists) {
            showToast('Pro tento tým zatím není uložen žádný výsledek.', 'error');
            return;
        }

        const ok = await confirmDanger({
            message: 'Pro tento tým už je uložen výsledek. Opravdu ho chceš nenávratně smazat?',
            ok: 'Ano, smazat',
            cancel: 'Ne, ponechat'
        });
        if (!ok) return;

        await window.electron.invoke('removeResult', {startlist_id: startlistId});

        // posun na další řádek (komfort)
        const currentRow = document.querySelector(`tr[data-id="${startlistId}"]`);
        const nextRow = currentRow?.nextElementSibling;
        if (nextRow) {
            document.querySelectorAll('#measurementRows tr').forEach(r => r.classList.remove('highlighted'));
            nextRow.classList.add('highlighted');
            window.currentSelectedRowId = nextRow.dataset.id;
        }

        await loadMeasurementStartlist(competitionId, categoryId, 'Požární útok');
        showToast('Výsledek smazán.', 'success');
    });


    document.getElementById('saveResultBtn')?.addEventListener('click', async () => {
        const competitionId = localStorage.getItem('selectedCompetitionId');
        const categoryId = document.getElementById('measurementCategory')?.value;
        if (!competitionId || !categoryId) return;

        console.log(competitionId);

        const startlistId = window.currentSelectedRowId;
        if (!startlistId) return;

        const readNum = sel => {
            const el = document.querySelector(sel);
            if (!el) return null;
            let raw = (el.textContent || '').trim().toLowerCase();
            raw = raw.replace(',', '.');       // české čárky
            raw = raw.replace(/[^0-9.\-]/g, ''); // vyhoď všechno krom číslic, tečky a minus
            const num = Number(raw);
            return Number.isFinite(num) ? num : null;
        };

        const time_lp = readNum('.lpTime');
        const time_pp = readNum('.ppTime');
        console.log("LP: ", time_lp, ", PP: ", time_pp);
        const vals = [time_lp, time_pp].filter(v => v != null);
        const final_time = vals.length ? Math.max(...vals) : 999.999; // sjednoť na 999.999

        let existing = null;
        try {
            const existingMap = await window.electron.invoke('getResultsByStartlistIds', [startlistId]);
            existing = Array.isArray(existingMap) ? existingMap[0] : (existingMap?.[startlistId] ?? null);
        } catch (e) {
            console.warn('getResultsByStartlistIds selhalo:', e);
        }

        const exists = !!existing && (existing.id != null);

        if (exists) {
            const ok = await confirmDanger({
                message: 'Pro tento tým už je uložen výsledek. Opravdu ho chceš přepsat?',
                ok: 'Ano, přepsat',
                cancel: 'Ne, ponechat'
            });
            if (!ok) return;
        }

        const payload = {
            startlist_id: Number(startlistId),
            discipline: 'Požární útok',
            time_lp, time_pp,
            final_time,
            ...(existing?.id ? {id: existing.id} : {})
        };

        try {
            const res = await window.electron.invoke('saveResult', payload);
            console.log('[saveResult] payload:', payload, '-> response:', res);

            if (!res?.success) {
                showToast('Uložení selhalo: ' + (res?.error || 'neznámá chyba'), 'error');
                return;
            }

            // posun + reload
            const currentRow = document.querySelector(`tr[data-id="${startlistId}"]`);
            const nextRow = currentRow?.nextElementSibling;
            if (nextRow) {
                document.querySelectorAll('#measurementRows tr').forEach(r => r.classList.remove('highlighted'));
                nextRow.classList.add('highlighted');
                window.currentSelectedRowId = nextRow.dataset.id;
            }

            await loadMeasurementStartlist(competitionId, categoryId, 'Požární útok');
            showToast(exists ? 'Výsledek přepsán.' : 'Výsledek uložen.', 'success');
        } catch (err) {
            console.error('saveResult error:', err);
            showToast('Uložení selhalo (IPC). Mrkni do konzole.', 'error');
        }
    });


    document.getElementById('saveResult60mBtn')?.addEventListener('click', async () => {
        const competitionId = localStorage.getItem('selectedCompetitionId');
        const categoryId = document.getElementById('measurementCategory')?.value;
        const attempt = localStorage.getItem('attempt'); // "1" | "2"
        const laneCount = parseInt(localStorage.getItem('laneCount') || '1', 10);
        const rows = document.querySelectorAll('#measurementRows tr');
        if (!competitionId || !categoryId || !rows.length) return;


        // 1) Přednačti existující výsledky z DB pro viditelné dráhy
        const laneRows = [...Array(laneCount).keys()]
            .map(i => rows[i])
            .filter(Boolean);

        const startlistIds = laneRows.map(r => r.dataset.id);
        // pokud máš batch endpoint, použij ho; jinak per‑item:
        const existingByStartlist = {};
        for (const id of startlistIds) {
            const existingByStartlist = await window.electron.invoke('getResultsByStartlistIds', startlistIds);
            // očekává objekt { time_first, time_second, is_n_first, is_n_second } nebo null
        }

        const resultsToSave = [];

        for (let i = 0; i < laneCount; i++) {
            const row = rows[i];
            if (!row) continue;

            const startlistId = row.dataset.id;

            const timeCell = row.querySelector(`td.time-${attempt}`);
            const timeNow = timeCell ? parseFloat(timeCell.textContent) : null;

            const validBtn = document.querySelector(`.validity-toggle[data-index="${i}"]`);
            const isNNow = validBtn?.dataset.valid === 'false';

            const attemptName = attempt === '1' ? 'first' : 'second';

            // 2) Slož obě hodnoty (aktuální + z DB)
            const existing = existingByStartlist[startlistId] || {};
            const t1 = attempt === '1'
                ? (isNNow ? null : timeNow)
                : (toBool(existing.is_n_first) ? null : (existing.time_first != null ? Number(existing.time_first) : null));

            const t2 = attempt === '2'
                ? (isNNow ? null : timeNow)
                : (toBool(existing.is_n_second) ? null : (existing.time_second != null ? Number(existing.time_second) : null));

            let final_time;
            if (t1 == null && t2 == null) {
                final_time = '999.99';
            } else if (t1 == null) {
                final_time = t2.toFixed(2);
            } else if (t2 == null) {
                final_time = t1.toFixed(2);
            } else {
                final_time = Math.min(t1, t2).toFixed(2);
            }

            resultsToSave.push({
                startlist_id: startlistId,
                discipline: 'Běh',
                [`time_${attemptName}`]: timeNow,
                [`is_n_${attemptName}`]: isNNow,
                final_time,
            });
            await loadMeasurementStartlist(competitionId, categoryId, 'Běh');
        }

        for (const result of resultsToSave) {
            await window.electron.invoke('saveResult', result);
        }
        showToast('Výsledky uloženy!', 'success');
    });


}

// ===== stav + util =====
const MODE_ATTACK = 'attack';
const MODE_RELAY  = 'relay';
const MODE_OVERALL = 'overall';
let ACTIVE_MODE = MODE_ATTACK;

const cid = () => localStorage.getItem('selectedCompetitionId');
const nOrNull = v => (v==null || v==='') ? null : Number(v);
const fmt = v => (Number.isFinite(v) ? v.toFixed(2) : '—');

function setActiveTab(mode){
  ACTIVE_MODE = mode;
  document.getElementById('tabAttack') .classList.toggle('active', mode===MODE_ATTACK);
  document.getElementById('tabRelay')  .classList.toggle('active', mode===MODE_RELAY);
  document.getElementById('tabOverall').classList.toggle('active', mode===MODE_OVERALL);
  renderHead();
  refreshResultsTable();
}

function renderHead(){
  const h = document.querySelector('#resultsHead tr');
  if (!h) return;
  if (ACTIVE_MODE===MODE_ATTACK){
    h.innerHTML = `
      <th class="w-20">Start. č.</th>
      <th class="w-64">Tým</th>
      <th class="w-24">OOC</th>
      <th class="w-40">LP</th>
      <th class="w-40">PP</th>
      <th class="w-40">Výsledek</th>
      <th class="w-24">Pořadí</th>`;
  } else if (ACTIVE_MODE===MODE_RELAY){
    h.innerHTML = `
      <th class="w-20">Start. č.</th>
      <th class="w-64">Tým</th>
      <th class="w-24">OOC</th>
      <th class="w-40">1. pokus</th>
      <th class="w-40">2. pokus</th>
      <th class="w-40">Výsledek</th>
      <th class="w-24">Pořadí</th>`;
  } else {
    h.innerHTML = `
      <th class="w-20">Start. č.</th>
      <th class="w-64">Tým</th>
      <th class="w-24">OOC</th>
      <th class="w-40">Pořadí útok</th>
      <th class="w-40">Pořadí štafeta</th>
      <th class="w-40">Součet</th>
      <th class="w-24">Celkové pořadí</th>`;
  }
}

// ===== veřejné API – načtení kategorií =====
async function loadResultsCategories() {
  const competitionId = cid(); if (!competitionId) return;
  const comp = window.allCompetitions?.find(c => c.id == competitionId); if (!comp) return;

  const categories = await window.electron.invoke('getCategories', comp.type);
  const sel = document.getElementById('resultsCategorySelect');
  sel.innerHTML = `<option value="">Vyber kategorii</option>`;
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    sel.appendChild(opt);
  });

  renderHead(); // default: Útok
}

// ===== veřejné API – listenery =====
function attachResultsListeners() {
  const sel = document.getElementById('resultsCategorySelect');
  sel?.addEventListener('change', refreshResultsTable);

  document.getElementById('tabAttack') ?.addEventListener('click', () => setActiveTab(MODE_ATTACK));
  document.getElementById('tabRelay')  ?.addEventListener('click', () => setActiveTab(MODE_RELAY));
  document.getElementById('tabOverall')?.addEventListener('click', () => setActiveTab(MODE_OVERALL));

  // exporty – přidáme param mode + relayType
  document.getElementById('exportResultsExcelBtn')?.addEventListener('click', async ()=>{
    const categoryId = sel.value; if(!categoryId) return showToast('Vyber kategorii.', 'error');
    const comp = window.allCompetitions.find(c => c.id == cid());
    const cats = await window.electron.invoke('getCategories', comp.type);
    const category = cats.find(cat => cat.id == categoryId);
    await window.electron.invoke('exportResultsExcel', {
      competitionId: cid(),
      categoryId,
      mode: ACTIVE_MODE,
      relayType: await window.electron.invoke('relay:getType', { competitionId: cid() }),
      competitionName: comp.name,
      competitionDate: comp.date,
      categoryName: category?.name
    }).then(()=>showToast('Export Excel hotov.','success'))
      .catch(()=>showToast('Export do Excelu selhal.','error'));
  });

  document.getElementById('exportResultsPdfBtn')?.addEventListener('click', async ()=>{
    const categoryId = sel.value; if(!categoryId) return showToast('Vyber kategorii.', 'error');
    const comp = window.allCompetitions.find(c => c.id == cid());
    const cats = await window.electron.invoke('getCategories', comp.type);
    const category = cats.find(cat => cat.id == categoryId);
    await window.electron.invoke('exportResultsPdf', {
      competitionId: cid(),
      categoryId,
      mode: ACTIVE_MODE,
      relayType: await window.electron.invoke('relay:getType', { competitionId: cid() }),
      competition: comp,
      categoryName: category?.name
    }).then(()=>showToast('Export PDF hotov.','success'))
      .catch(()=>showToast('Export do PDF selhal.','error'));
  });
}

// ===== veřejné API – refresh/renderer =====
async function refreshResultsTable() {
  const categoryId = document.getElementById('resultsCategorySelect').value;
  const tbody = document.getElementById('resultsRows');
  if (!categoryId){
    tbody.innerHTML = `<tr id="resultsEmpty"><td colspan="99" class="text-center py-8 text-slate-400">Zvol kategorii pro zobrazení.</td></tr>`;
    return;
  }
  return renderResultsTable(categoryId, ACTIVE_MODE);
}

async function renderResultsTable(categoryId, mode) {
  if (mode === MODE_ATTACK)  return renderAttack(categoryId);
  if (mode === MODE_RELAY)   return renderRelay(categoryId);
  return renderOverall(categoryId);
}

// ===== interní rendery =====
async function renderAttack(categoryId){
  const competitionId = cid();
  const rows = await window.electron.invoke('getStartlist', competitionId, categoryId);

  const data = rows.map(r=>{
    const res = r.results?.[0] || {};
    const final = nOrNull(res.final_time);
    return {
      id:r.id, start:r.start_number ?? '', team:r.team || `${r.name||''} ${r.surname||''}`.trim(),
      lp:nOrNull(res.time_lp), pp:nOrNull(res.time_pp),
      final: Number.isFinite(final) ? final : 999.999,
      n: toBool(res.is_n),
      ooc: toBool(r.out_of_competition)
    };
  }).sort((a,b)=>{
    if (a.ooc!==b.ooc) return a.ooc?1:-1;
    const at=(a.n||!Number.isFinite(a.final))?999.999:a.final;
    const bt=(b.n||!Number.isFinite(b.final))?999.999:b.final;
    return at-bt;
  });

  // rank
  let rank=0,last=null,idx=0; const rankMap=new Map();
  for(const x of data){ idx++; const t=(x.n||x.ooc)?999.999:x.final;
    if(t!==last){ if(t<999.999) rank=idx; last=t; } rankMap.set(x.id,t<999.999&&!x.ooc?rank:'—'); }

  const tbody=document.getElementById('resultsRows'); tbody.innerHTML='';
  for(const r of data){
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td class="td-center">${r.start}</td>
      <td>${r.team} ${r.ooc?'<span class="tag-ooc text-xs ml-2">MIMO</span>':''}</td>
      <td class="td-center">
        <label class="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" class="ooc-toggle" data-sid="${r.id}" ${r.ooc?'checked':''}/>
          <span class="text-xs opacity-80">Mimo soutěž</span>
        </label>
      </td>
      <td class="td-center">${fmt(r.lp)}</td>
      <td class="td-center">${fmt(r.pp)}</td>
      <td class="td-center ${r.n?'text-red-400 font-semibold':''}">${r.n?'—':fmt(r.final)}</td>
      <td class="td-center font-semibold">${rankMap.get(r.id)}</td>`;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.ooc-toggle').forEach(ch=>{
    ch.addEventListener('change', async ()=>{
      await window.electron.invoke('startlist:setOOC', { startlist_id:Number(ch.dataset.sid), value: ch.checked?1:0 });
      refreshResultsTable();
    });
  });
}

async function renderRelay(categoryId){
  const competitionId = cid();
  const relayType = await window.electron.invoke('relay:getType', { competitionId });
  const rows  = await window.electron.invoke('relay:listRows', { competitionId, categoryId });
  const start = await window.electron.invoke('getStartlist', competitionId, categoryId);
  const oocMap = new Map(start.map(s=>[s.id, toBool(s.out_of_competition)]));

  const data = rows.map(r=>({
    id:r.startlist_id, start:r.start_number??'', team:r.team??'',
    a1:nOrNull(r.attempt1_time), v1:r.attempt1_valid!==0,
    a2:nOrNull(r.attempt2_time), v2:r.attempt2_valid!==0,
    final:nOrNull(r.final_time), ooc:oocMap.get(r.startlist_id)||false
  })).sort((a,b)=>{
    if (a.ooc!==b.ooc) return a.ooc?1:-1;
    const at=Number.isFinite(a.final)?a.final:999.999;
    const bt=Number.isFinite(b.final)?b.final:999.999;
    return at-bt;
  });

  let rank=0,last=null,idx=0; const rankMap=new Map();
  for(const x of data){ idx++; const t=(x.ooc||!Number.isFinite(x.final))?999.999:x.final;
    if(t!==last){ if(t<999.999) rank=idx; last=t; } rankMap.set(x.id,t<999.999&&!x.ooc?rank:'—'); }

  const tbody=document.getElementById('resultsRows'); tbody.innerHTML='';
  for(const r of data){
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td class="td-center">${r.start}</td>
      <td>${r.team} ${r.ooc?'<span class="tag-ooc text-xs ml-2">MIMO</span>':''}</td>
      <td class="td-center">
        <label class="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" class="ooc-toggle" data-sid="${r.id}" ${r.ooc?'checked':''}/>
          <span class="text-xs opacity-80">Mimo soutěž</span>
        </label>
      </td>
      <td class="td-center">${r.v1?fmt(r.a1):'—'}</td>
      <td class="td-center">${r.v2?fmt(r.a2):'—'}</td>
      <td class="td-center ${Number.isFinite(r.final)?'':'text-red-400 font-semibold'}">${Number.isFinite(r.final)?fmt(r.final):'—'}</td>
      <td class="td-center font-semibold">${rankMap.get(r.id)}</td>`;
    tbody.appendChild(tr);
  }

  document.getElementById('tabRelay').innerText = relayType==='4x60' ? 'Štafeta 4×60' : 'Štafeta dvojic';

  tbody.querySelectorAll('.ooc-toggle').forEach(ch=>{
    ch.addEventListener('change', async ()=>{
      await window.electron.invoke('startlist:setOOC', { startlist_id:Number(ch.dataset.sid), value: ch.checked?1:0 });
      refreshResultsTable();
    });
  });
}

async function renderOverall(categoryId){
  const competitionId = cid();
  const startRows = await window.electron.invoke('getStartlist', competitionId, categoryId);

  // Útok – pořadí
  const a = startRows.map(r=>{
    const res=r.results?.[0]||{};
    const fin=nOrNull(res.final_time);
    return {id:r.id,ooc:toBool(r.out_of_competition),key:(toBool(res.is_n)||!Number.isFinite(fin))?999.999:fin};
  }).sort((x,y)=> (x.ooc!==y.ooc)?(x.ooc?1:-1):x.key-y.key);
  let rk=0,last=null,idx=0; const aRank=new Map();
  for(const x of a){ idx++; if(x.ooc||x.key>=999.999){aRank.set(x.id,null);continue;}
    if(x.key!==last){rk=idx;last=x.key;} aRank.set(x.id,rk); }

  // Štafeta – pořadí
  const relayRows = await window.electron.invoke('relay:listRows', { competitionId, categoryId });
  const rel = relayRows.map(r=>{
    const t=nOrNull(r.final_time);
    return {id:r.startlist_id,ooc:toBool(startRows.find(s=>s.id===r.startlist_id)?.out_of_competition),key:Number.isFinite(t)?t:999.999};
  }).sort((x,y)=> (x.ooc!==y.ooc)?(x.ooc?1:-1):x.key-y.key);
  rk=0; last=null; idx=0; const rRank=new Map();
  for(const x of rel){ idx++; if(x.ooc||x.key>=999.999){rRank.set(x.id,null);continue;}
    if(x.key!==last){rk=idx;last=x.key;} rRank.set(x.id,rk); }

  const maxRank = Math.max(...[...aRank.values(),...rRank.values()].filter(Boolean),0) || 0;

  const rows = startRows.map(s=>{
    const A=aRank.get(s.id), R=rRank.get(s.id), O=toBool(s.out_of_competition);
    const sum = O ? Infinity : ((A??(maxRank+1)) + (R??(maxRank+1)));
    return {
      id:s.id, start:s.start_number??'', team:s.team || `${s.name||''} ${s.surname||''}`.trim(),
      ooc:O, aPlace:A??'—', rPlace:R??'—', sum
    };
  }).sort((x,y)=> (x.ooc!==y.ooc)?(x.ooc?1:-1):(x.sum - y.sum));

  let place=0,i=0,lastSum=null;
  const tbody=document.getElementById('resultsRows'); tbody.innerHTML='';
  for(const r of rows){
    i++; let overall='—';
    if(!r.ooc && Number.isFinite(r.sum)){ if(r.sum!==lastSum){place=i;lastSum=r.sum;} overall=place; }
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td class="td-center">${r.start}</td>
      <td>${r.team} ${r.ooc?'<span class="tag-ooc text-xs ml-2">MIMO</span>':''}</td>
      <td class="td-center">
        <label class="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" class="ooc-toggle" data-sid="${r.id}" ${r.ooc?'checked':''}/>
          <span class="text-xs opacity-80">Mimo soutěž</span>
        </label>
      </td>
      <td class="td-center">${r.aPlace}</td>
      <td class="td-center">${r.rPlace}</td>
      <td class="td-center">${Number.isFinite(r.sum)?r.sum:'—'}</td>
      <td class="td-center font-semibold">${overall}</td>`;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.ooc-toggle').forEach(ch=>{
    ch.addEventListener('change', async ()=>{
      await window.electron.invoke('startlist:setOOC', { startlist_id:Number(ch.dataset.sid), value: ch.checked?1:0 });
      refreshResultsTable();
    });
  });
}


function getCompetitionId(){ return localStorage.getItem('selectedCompetitionId'); }
function fmtTime(v){ if(v==null) return ''; const n=Number(v); return (isFinite(n)&&n<999.999)?n.toFixed(2):'999.999'; }
function isGood(v){ return isFinite(v)&&Number(v)<999.999; }

async function ensureRelayTypeChosen(){
  const cid = getCompetitionId();
  const type = await window.electron.invoke('relay:getType', { competitionId: cid });
  if (type) return;

  const modal = document.getElementById('relayTypeModal');
  modal.classList.remove('hidden');

  const choose = async (t) => {
    await window.electron.invoke('relay:setType', { competitionId: cid, type: t });
    modal.classList.add('hidden');
  };
  document.getElementById('choose4x60')?.addEventListener('click', ()=>choose('4x60'), {once:true});
  document.getElementById('choosePairs')?.addEventListener('click', ()=>choose('pairs'), {once:true});

  await new Promise(res=>{
    const obs=new MutationObserver(()=>{ if(modal.classList.contains('hidden')){obs.disconnect();res();} });
    obs.observe(modal,{attributes:true,attributeFilter:['class']});
  });
}

async function refreshRelayTable(){
  const categoryId = document.getElementById('resultsCategorySelect').value;
  const cid = localStorage.getItem('selectedCompetitionId');
  const tbody = document.getElementById('resultsRows');
  const empty = document.getElementById('resultsEmpty');

  if (!categoryId){ tbody.innerHTML=''; tbody.appendChild(empty); return; }

  const data = await window.electron.invoke('relay:listRows', { competitionId: cid, categoryId });
  tbody.innerHTML = '';

  if (!data?.length){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td colspan="99" class="text-center py-8 text-slate-400">V této kategorii není startovka.</td>`;
    tbody.appendChild(tr);
    return;
  }

  for (const r of data){
    const validBtn = (sid, attempt, valid) => `
      <div class="flex justify-center">
        <button
          class="validity-toggle-relay px-3 py-1 rounded text-white text-sm transition
            ${valid ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}"
          data-sid="${sid}"
          data-attempt="${attempt}"
          data-valid="${valid ? '1':'0'}"
        >
          ${valid ? '✅ PLATNÝ' : '❌ NEPLATNÝ'}
        </button>
      </div>`;

    // 1. řádek – nese Start, Tým i Výsledek
    const tr1=document.createElement('tr');
    tr1.innerHTML=`
      <td class="td-center">${r.start_number ?? ''}</td>
      <td><span class="font-semibold">${r.team ?? ''}</span></td>
      <td>1. pokus</td>
      <td class="editable td-right" data-sid="${r.startlist_id}" data-attempt="1" contenteditable="true">${fmtTime(r.attempt1_time)}</td>
      <td class="td-center">${validBtn(r.startlist_id, 1, r.attempt1_valid !== 0)}</td>
      <td class="${isGood(r.final_time)?'':'text-red-400 font-semibold'} td-center">${fmtTime(r.final_time)}</td>
    `;

    // 2. řádek – Start/Tým/Výsledek neukazujeme (neopakovat)
    const tr2=document.createElement('tr');
    tr2.innerHTML=`
      <td></td>
      <td></td>
      <td>2. pokus</td>
      <td class="editable td-right" data-sid="${r.startlist_id}" data-attempt="2" contenteditable="true">${fmtTime(r.attempt2_time)}</td>
      <td class="td-center">${validBtn(r.startlist_id, 2, r.attempt2_valid !== 0)}</td>
      <td></td>
    `;

    tbody.appendChild(tr1);
    tbody.appendChild(tr2);
  }

  // Uložení času – NEŘEŠÍ platnost, pouze zapisuje hodnotu
  tbody.querySelectorAll('.editable').forEach(td=>{
    td.addEventListener('blur', async ()=>{
      const sid = Number(td.dataset.sid);
      const attempt = Number(td.dataset.attempt);
      const raw = (td.innerText||'').trim().replace(',', '.');
      const time = Number.isFinite(Number(raw)) ? Number(raw) : null;

      // platnost necháme jak je (z tlačítka)
      const btn = tbody.querySelector(`.validity-toggle-relay[data-sid="${sid}"][data-attempt="${attempt}"]`);
      const valid = btn?.dataset.valid === '1';

      const cid = localStorage.getItem('selectedCompetitionId');
      const discipline = await window.electron.invoke('relay:getType', { competitionId: cid });
      await window.electron.invoke('relay:savePartial', { startlist_id: sid, discipline, attempt, time, valid });
      await refreshRelayTable();
    });
  });

  // Přepínání platnosti – čas ponechán, jen uložíme flag
  tbody.querySelectorAll('.validity-toggle-relay').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const sid = Number(btn.dataset.sid);
      const attempt = Number(btn.dataset.attempt);
      const nowValid = btn.dataset.valid !== '1';
      btn.dataset.valid = nowValid ? '1' : '0';
      btn.classList.toggle('bg-green-600', nowValid);
      btn.classList.toggle('hover:bg-green-700', nowValid);
      btn.classList.toggle('bg-red-600', !nowValid);
      btn.classList.toggle('hover:bg-red-700', !nowValid);
      btn.innerText = nowValid ? '✅ PLATNÝ' : '❌ NEPLATNÝ';

      // přečti aktuální čas z buňky (bez zásahů)
      const td = tbody.querySelector(`.editable[data-sid="${sid}"][data-attempt="${attempt}"]`);
      const raw = (td?.innerText||'').trim().replace(',', '.');
      const time = Number.isFinite(Number(raw)) ? Number(raw) : null;

      const cid = localStorage.getItem('selectedCompetitionId');
      const discipline = await window.electron.invoke('relay:getType', { competitionId: cid });
      await window.electron.invoke('relay:savePartial', { startlist_id: sid, discipline, attempt, time, valid: nowValid });
      await refreshRelayTable();
    });
  });
}

async function loadRelayCategories() {
  await ensureRelayTypeChosen();

  const cid = localStorage.getItem('selectedCompetitionId');
  const comp = window.allCompetitions?.find(c => c.id == cid);
  if (!comp) return;

  const cats = await window.electron.invoke('getCategories', comp.type);
  const sel = document.getElementById('resultsCategorySelect');
  sel.innerHTML = `<option value="">Vyber kategorii</option>`;
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });

  await refreshRelayTable();
}


function attachRelayListeners() {
  document.getElementById('resultsCategorySelect')
    ?.addEventListener('change', refreshRelayTable);

  const btnChange = document.getElementById('relayTypeChangeBtn');
  const changeModal = document.getElementById('relayTypeChangeModal');
  const step2 = document.getElementById('relayChangeStep2');

  btnChange?.addEventListener('click', ()=>{
    changeModal.classList.remove('hidden');
    step2.classList.add('hidden');
  });
  document.getElementById('relayChangeCancel1')?.addEventListener('click', ()=> changeModal.classList.add('hidden'));
  document.getElementById('relayChangeCancel2')?.addEventListener('click', ()=> changeModal.classList.add('hidden'));
  document.getElementById('relayChangeConfirm1')?.addEventListener('click', ()=> step2.classList.remove('hidden'));
  document.getElementById('relayChangeConfirm2')?.addEventListener('click', async ()=>{
    const cid = localStorage.getItem('selectedCompetitionId');
    const curr = await window.electron.invoke('relay:getType', { competitionId: cid });
    const next = curr === '4x60' ? 'pairs' : '4x60';
    await window.electron.invoke('relay:setType', { competitionId: cid, type: next });
    changeModal.classList.add('hidden');
    await refreshRelayTable();
  });
}
