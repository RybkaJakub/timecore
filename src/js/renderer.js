window.serialConnected = false;
window.currentSelectedRowId = null;

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
            if (confirm(`Opravdu smazat soutěž "${c.name}"?`)) {
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

        if (!name) return alert('Zadej název.');


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

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    const icon = document.getElementById('themeIcon');
    icon.textContent = theme === 'dark' ? '🌙' : '☀️';
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
            if (viewName === 'results') {
                loadResultsCategories();
            }
            if (viewName === 'dashboard') {
                renderDashboardCompetitionInfo();
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
                alert("Zadejte název soutěže.");
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

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `px-4 py-2 rounded shadow text-white animate-fade-in-down ${
        type === 'error' ? 'bg-red-600' : 'bg-green-600'
    }`;
    toast.textContent = message;

    const container = document.getElementById('toastContainer');
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity', 'duration-500');
        setTimeout(() => toast.remove(), 500);
    }, 2500);
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

function showModal(message) {
    const modal = document.getElementById('customModal');
    const messageElem = document.getElementById('customModalMessage');
    messageElem.textContent = message;
    modal.classList.remove('hidden');
}

document.getElementById('customModalCloseBtn').addEventListener('click', () => {
    document.getElementById('customModal').classList.add('hidden');
});


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
    const heatSelect = document.getElementById('heatSelect');

    tbody.innerHTML = '';
    thead.innerHTML = '';
    document.getElementById('saveAttackContainer').classList.add('hidden');
    document.getElementById('saveRunContainer').classList.add('hidden');
    if (discipline === 'Požární útok') {

        document.getElementById('saveAttackContainer').classList.remove('hidden');

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
      `;
            tbody.appendChild(tr);
        });

    } else {
        // Běh na 60m
        heatContainer.classList.remove('hidden');
        document.getElementById('saveRunContainer').classList.remove('hidden');

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
                    tr.innerHTML = `
            <td class="p-2">${r.start_number ?? ''}</td>
            <td class="p-2">${r.heat}</td>
            <td class="p-2">${r.lane}</td>
            <td class="p-2">${r.name ?? ''}</td>
            <td class="p-2">${r.surname ?? ''}</td>
            <td class="p-2">${r.team ?? ''}</td>
            <td class="p-2 pp-time" data-id="${r.id}"></td>
            <td class="p-2 lp-time" data-id="${r.id}"></td>
            <td class="p-2 result-time" data-id="${r.id}"></td>
          `;
                    tbody.appendChild(tr);
                });
        }
    }
}


function loadResultsCategories() {
    loadCategoriesForSelectedCompetition();
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


// ✅ UPRAVENÁ FUNKCE attachMeasurementListeners
async function attachMeasurementListeners() {
    const serialSelect = document.getElementById('serialPortSelect');
    const connectBtn = document.getElementById('connectSerialBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const serialLog = document.getElementById('serialLog');

    const ports = await window.electron.invoke('listSerialPorts');

    const toggleResultsBtn = document.getElementById('toggleResultsBtn');
    const displaySelect = document.getElementById('displaySelect');

    loadDisplays();

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

    connectBtn?.addEventListener('click', async () => {
        const port = serialSelect?.value;
        if (!port) {
            alert("Vyber nejdřív port!");
            return;
        }
        await window.electron.invoke('openSerialPort', port);
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

    document.getElementById('stopResetBtn')?.addEventListener('click', () => {
        window.electron.invoke('sendToSerialPort', 'RST');
        window.electron.invoke('sendToSerialPort', 'RST');
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
              <div class="text-5xl font-bold text-green-400 lpTime">${lp}</div>
            </div>
            <div class="text-center">
              <div class="text-xs text-gray-400 mb-1">PP</div>
              <div class="text-5xl font-bold text-blue-400 ppTime">${pp}</div>
            </div>
          </div>
        `;
            } else {

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
        const time_pp_element = document.getElementsByClassName('ppTime')[0];
        const time_pp = time_pp_element ? parseFloat(time_pp_element.textContent) : null;
        const time_lp_element = document.getElementsByClassName('lpTime')[0];
        const time_lp = time_lp_element ? parseFloat(time_lp_element.textContent) : null;
        const isN = document.getElementById('nCheckbox')?.checked || false;
        let final_time;

        if (isN) {
            final_time = 999.999;
        } else {
            final_time = time_pp > time_lp ? time_pp : time_lp;
        }

        await window.electron.invoke('saveResult', {
            startlist_id: startlistId,
            discipline: 'Požární útok',
            time_lp: time_lp,
            time_pp: time_pp,
            is_n: isN,
            final_time: final_time
        });

        alert('Výsledek uložen!');

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