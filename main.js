const {app, BrowserWindow, ipcMain, dialog, screen} = require('electron');
const path = require('path');
const fs = require('fs');
const csvParse = require('csv-parse/sync');
const xlsx = require('xlsx');
const puppeteer = require('puppeteer');
const {SerialPort} = require('serialport');
const Store = require('electron-store');
const store = new Store();

const competitionsService = require('./services/competitionsService');
const startlistService = require('./services/startlistService');
const timerService = require('./services/timerService');

let licenseWin;
let splashWindow;
let mainWindow;
const validKeys = [
    {
        key: 'NAZEVSBORU-ABCD-1234',
        department: 'NAZEVSBORU',
        expiration: '2026-03-02',     // ISO date string
        allowedUsages: 3,
        usages: 0
    },
    // ... další záznamy
];

function parseDate(s) {
    return new Date(s + 'T00:00:00Z');
}

function todayUTC() {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function findKeyRecord(key) {
    return validKeys.find(k => k.key.trim().toUpperCase() === key.trim().toUpperCase()) || null;
}

function inspectKey(key) {
    const rec = findKeyRecord(key);
    if (!rec) {
        return {exists: false, valid: false, reason: 'Klíč nebyl nalezen.'};
    }

    const exp = parseDate(rec.expiration);
    const t = todayUTC();

    if (isNaN(exp)) {
        return {exists: true, valid: false, reason: 'Neplatný formát expirace.', info: recPublic(rec)};
    }
    if (t > exp) {
        return {exists: true, valid: false, reason: 'Platnost licence vypršela.', info: recPublic(rec)};
    }
    if (rec.usages >= rec.allowedUsages) {
        return {exists: true, valid: false, reason: 'Vyčerpán limit aktivací.', info: recPublic(rec)};
    }

    return {exists: true, valid: true, reason: null, info: recPublic(rec)};
}

// bezpečný public výřez bez interních referencí
function recPublic(rec) {
    const remaining = Math.max(0, rec.allowedUsages - rec.usages);
    return {
        key: rec.key,
        department: rec.department,
        expiration: rec.expiration,
        allowedUsages: rec.allowedUsages,
        usages: rec.usages,
        remaining
    };
}

// 1) jen nahlédnout – žádné side-effects
ipcMain.handle('license-lookup', (_e, key) => {
    const result = inspectKey(key);
    return result; // {exists, valid, reason, info?}
});

// 2) potvrdit aktivaci – zvýší usages, uloží do store a vrátí finální stav
ipcMain.handle('license-confirm', (_e, key) => {
    const res = inspectKey(key);
    if (!res.valid) return {ok: false, error: res.reason, info: res.info};

    // Side-effect: navýšit usages v paměťovém poli (u tebe to může jít do DB/API)
    const rec = findKeyRecord(key);
    rec.usages += 1;

    // Uložit do store
    store.set('license', {
        key: rec.key,
        department: rec.department,
        expiration: rec.expiration,
        activatedAt: new Date().toISOString()
    });
    store.set('license_valid', true);

    createMainWindow();
    if (licenseWin && !licenseWin.isDestroyed()) licenseWin.close();
    return {ok: true, info: recPublic(rec)};
});

// volitelně: ukončení okna na požadavek
ipcMain.on('quit-app', () => {
    app.quit();
});


function createSplashWindow() {
    splashWindow = new BrowserWindow({
        width: 500,
        height: 300,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        icon: path.join(__dirname, 'src', 'assets', 'logo.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        }
    });

    splashWindow.loadFile(path.join(__dirname, 'src', 'views', 'splash.html'));

    setTimeout(() => {
        splashWindow.close();

        const ok = store.get('license_valid') === true;
        if (ok) createMainWindow();
        else createLicenseWindow();
    }, 3000);
}

function createLicenseWindow() {
    licenseWin = new BrowserWindow({
        width: 960,
        height: 620,
        resizable: false,
        frame: true,                 // ⬅ bez systémového rámu
        transparent: false,
        show: false,
        icon: path.join(__dirname, 'src', 'assets', 'logo.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        }
    });

    licenseWin.once('ready-to-show', () => licenseWin.show());
    licenseWin.loadFile(path.join(__dirname, 'src', 'views', 'license.html'));
}

function createMainWindow() {
    const {width, height} = screen.getPrimaryDisplay().bounds;

    const minWidth = Math.round(width/20*11);
    const plusWidth = Math.round(width/8);

    console.log(minWidth);

    mainWindow = new BrowserWindow({
        width: width,
        height: height,
        // autoHideMenuBar: true,
        x: 0,
        y: 0,
        minWidth: minWidth + plusWidth,
        minHeight: height,
        icon: path.join(__dirname, 'src', 'assets', 'logo.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

const sqlite3 = require('sqlite3').verbose();

const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'database.db');
const db = new sqlite3.Database(dbPath);

ipcMain.handle('deleteCompetition', async (e, id) => {
    db.prepare('DELETE FROM competitions WHERE id = ?').run(id);
});

ipcMain.handle('updateCompetition', async (e, comp) => {
    db.prepare('UPDATE competitions SET name = ?, date = ?, time = ?, type = ? WHERE id = ?')
        .run(comp.name, comp.date, comp.time, comp.type, comp.id);
});

ipcMain.handle('updateResults', async (_e, comp) => {
  if (!comp || comp.id == null) throw new Error('Chybí id');
  const id = Number(comp.id);
  if (!Number.isFinite(id)) throw new Error('Neplatné id');

  const allowed = new Set([
    'time_lp', 'time_pp', 'final_time', 'is_n',
    'discipline', 'startlist_id', 'team', 'category_id', 'note'
  ]);

  const toUpdate = {};
  for (const [k, v] of Object.entries(comp)) {
    if (k === 'id') continue;
    if (!allowed.has(k) || v === undefined) continue;
    toUpdate[k] = (k === 'is_n') ? (v ? 1 : 0) : v;
  }

  // načti aktuální řádek (kvůli přepočtu)
  const current = await dbGet(
    'SELECT id, time_lp, time_pp, is_n, final_time FROM results WHERE id = ?',
    [id]
  );
  if (!current) return { ok: false, changes: 0, reason: 'not_found' };

  const norm = v => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const lp = ('time_lp' in toUpdate) ? toUpdate.time_lp : current.time_lp;
  const pp = ('time_pp' in toUpdate) ? toUpdate.time_pp : current.time_pp;
  const nFlag = ('is_n' in toUpdate) ? !!toUpdate.is_n : !!current.is_n;

  const lpN = norm(lp);
  const ppN = norm(pp);

  // vždy přepočítej final_time, když se mění is_n/lp/pp
  const mustRecalc = ('is_n' in toUpdate) || ('time_lp' in toUpdate) || ('time_pp' in toUpdate) || !('final_time' in toUpdate);
  if (mustRecalc) {
    let final = null;
    if (nFlag) {
      final = 999.99;
    } else {
      const vals = [lpN, ppN].filter(v => v != null);
      final = vals.length ? Math.max(...vals) : null; // když není z čeho, necháme null
    }
    toUpdate.final_time = final;
  }

  const keys = Object.keys(toUpdate);
  if (!keys.length) return { ok: false, changes: 0 };

  const setSql = keys.map(k => `${k} = ?`).join(', ');
  const params = keys.map(k => toUpdate[k]).concat(id);

  const info = await dbRun(`UPDATE results SET ${setSql} WHERE id = ?`, params);

  const fresh = await dbGet(
    'SELECT id, time_lp, time_pp, is_n, final_time FROM results WHERE id = ?',
    [id]
  );

  return { ok: true, changes: info.changes, updated: toUpdate, row: fresh };
});


// promisified db.get
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// promisified db.run
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}
app.whenReady().then(createSplashWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC HANDLERS
ipcMain.handle('getCompetitions', () => {
    return new Promise((resolve) => {
        competitionsService.getCompetitions((rows) => resolve(rows));
    });
});

ipcMain.handle('createCompetition', (e, comp) => {
    return new Promise((resolve, reject) => {
        competitionsService.createCompetition(comp, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
});

ipcMain.handle('getCategories', (e, discipline) => {
    return new Promise((resolve, reject) => {
        startlistService.getCategoriesByDiscipline(discipline, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('addStartlistEntry', (e, entry) => {
    return new Promise((resolve, reject) => {
        startlistService.addStartlistEntry(entry, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
});

ipcMain.handle('getStartlist', (e, competitionId, categoryId) => {
    return new Promise((resolve, reject) => {
        startlistService.getStartlist(competitionId, categoryId, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('saveResult', async (e, payload) => {
  try {
    const res = await startlistService.saveResult(payload);
    return res; // { success:true, ... }
  } catch (error) {
    console.error('[saveResult] error:', error);
    return { success: false, error: error.message };
  }
});


ipcMain.handle('getResults', (e, competitionId, categoryId) => {
    return new Promise((resolve, reject) => {
        startlistService.getResults(competitionId, categoryId, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

// IMPORT CSV
ipcMain.handle('importStartlistCsv', async (e, competitionId, categoryId, discipline) => {
    const {canceled, filePaths} = await dialog.showOpenDialog({
        title: 'Vyber CSV',
        filters: [{name: 'CSV', extensions: ['csv']}],
        properties: ['openFile']
    });

    if (canceled || !filePaths.length) return false;

    const filePath = filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    const records = csvParse.parse(content, {columns: true, skip_empty_lines: true});

    for (const row of records) {
        let name = null;
        let surname = null;
        let team = null;
        let start_number = null;

        // Převod českých hlaviček na vnitřní pole
        if (discipline === 'Požární útok') {
            team = row['Tým'] || row['team'];
            start_number = row['Startovní číslo'] || row['start_number'];
        } else {
            name = row['Jméno'] || row['name'];
            surname = row['Příjmení'] || row['surname'];
            team = row['Tým'] || row['team'];
        }

        await new Promise((resolve, reject) => {
            startlistService.addStartlistEntry({
                name,
                surname,
                team,
                start_number,
                lane: null,
                heat: null,
                competition_id: competitionId,
                category_id: categoryId
            }, (err, result) => {
                if (err) reject(err);
                else resolve(result); // ← `result.id` teď obsahuje vložené ID
            });
        });
    }
    return true;
});



ipcMain.handle('removeResult', (event, payload) => {
  return new Promise((resolve, reject) => {
    if (!payload.startlist_id) return reject(new Error('startlist_id je povinné'));

    const sql = `DELETE FROM results WHERE startlist_id = ?`;
    db.run(sql, [payload.startlist_id], function (err) {
      if (err) return reject(err);
      resolve({ removed: this.changes > 0 });
    });
  });
});

// IMPORT EXCEL
ipcMain.handle('importStartlistExcel', async (e, competitionId, categoryId, discipline) => {
    const {canceled, filePaths} = await dialog.showOpenDialog({
        title: 'Vyber Excel',
        filters: [{name: 'Excel', extensions: ['xls', 'xlsx']}],
        properties: ['openFile']
    });

    if (canceled || !filePaths.length) return false;

    const filePath = filePaths[0];
    const wb = xlsx.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    for (const row of rows) {
        let name = null;
        let surname = null;
        let team = null;

        if (discipline === 'Požární útok') {
            team = row.team;
        } else {
            name = row.name;
            surname = row.surname;
            team = row.team;
        }

        await new Promise((resolve, reject) => {
            startlistService.addStartlistEntry({
                name,
                surname,
                team,
                lane: null,
                heat: null,
                competition_id: competitionId,
                category_id: categoryId
            }, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
    return true;
});

// EXPORT PDF
ipcMain.handle('exportStartlistPdf', async (e, {
    competition,
    discipline,
    category,
    rows,
    headers
}) => {
    const templatePath = path.join(__dirname, 'startlist_template.html');
    let html = fs.readFileSync(templatePath, 'utf-8');

    // Převod datumu na český formát:
    const formattedDate = new Date(competition.date).toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });

    // Vložení hlaviček:
    const theadHtml = headers.map(h => `<th>${h}</th>`).join('');

    // Vložení řádků:
    const rowsHtml = rows.map(row => {
        return "<tr>" + row.map(col => `<td>${col}</td>`).join('') + "</tr>";
    }).join('');

    html = html
        .replace('{{competitionName}}', competition.name || '')
        .replace('{{date}}', formattedDate || '')
        .replace('{{discipline}}', discipline || '')
        .replace('{{category}}', category || '')
        .replace('{{thead}}', theadHtml)
        .replace('{{tbody}}', rowsHtml);

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, {waitUntil: 'networkidle0'});

    const {filePath} = await dialog.showSaveDialog({
        title: 'Uložit PDF',
        filters: [{name: 'PDF', extensions: ['pdf']}]
    });

    if (!filePath) {
        await browser.close();
        return false;
    }

    await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: {top: '20mm', bottom: '20mm', left: '15mm', right: '15mm'}
    });

    await browser.close();
    return true;
});

// EXPORT EXCEL
ipcMain.handle('exportStartlistExcel', async (e, {
    discipline,
    competitionName,
    competitionDate,
    categoryName,
    competitionId,
    categoryId
}) => {
    const {canceled, filePath} = await dialog.showSaveDialog({
        title: 'Uložit startovku',
        filters: [{name: 'Excel', extensions: ['xlsx']}]
    });

    if (canceled || !filePath) return false;

    let rows = [];
    if (competitionId && categoryId) {
        rows = await new Promise((resolve, reject) => {
            startlistService.getStartlist(competitionId, categoryId, (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });
    }

    const sheetData = [];

    // Úvodní hlavička
    sheetData.push([
        `Soutěž: ${competitionName || ''}`,
        `Datum: ${competitionDate || ''}`,
        `Disciplína: ${discipline || ''}`,
        `Kategorie: ${categoryName || ''}`
    ]);

    sheetData.push([]); // prázdný řádek

    if (discipline === 'útok') {
        sheetData.push(['Startovní číslo', 'Tým']);
        rows.forEach(item => {
            sheetData.push([
                item.lane || '',
                item.team || ''
            ]);
        });
    } else {
        sheetData.push(['Startovní číslo', 'Rozběh', 'Dráha', 'Jméno', 'Příjmení', '1. pokus', '2. pokus', 'Výsledný čas', 'Pořadí']);
        rows.forEach(item => {
            sheetData.push([
                item.bib_number || '',
                item.heat || '',
                item.lane || '',
                item.name || '',
                item.surname || '',
                '', '', '', ''
            ]);
        });
    }

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(sheetData);
    xlsx.utils.book_append_sheet(wb, ws, 'Startlist');
    xlsx.writeFile(wb, filePath);

    return true;
});


ipcMain.handle('saveStartlistChanges', async (e, entry) => {
    try {
        const {id, ...updatedFields} = entry;
        const result = await startlistService.updateStartlistEntry(id, updatedFields);
        return result;
    } catch (err) {
        console.error(err);
        throw err;
    }
});


ipcMain.handle('deleteStartlistEntry', (e, id) => {
    return new Promise((resolve, reject) => {
        startlistService.deleteStartlistEntry(id, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
});

ipcMain.handle('generateStartlist', async (e, competitionId, categoryId, discipline, lanes) => {
    return new Promise((resolve, reject) => {
        startlistService.getStartlist(competitionId, categoryId, (err, rows) => {
            if (err) return reject(err);
            if (discipline === 'Požární útok') return resolve(true);

            const runners = [...rows];
            const teamQueues = {};

            // Rozdělíme závodníky do front podle týmů
            for (const r of runners) {
                if (!teamQueues[r.team]) teamQueues[r.team] = [];
                teamQueues[r.team].push(r);
            }

            // Sloučíme závodníky do jednoho frontu tak, aby byly týmy od sebe
            const finalQueue = [];
            let roundRobinTeams = Object.keys(teamQueues);
            while (roundRobinTeams.length > 0) {
                const nextTeams = [];
                for (const team of roundRobinTeams) {
                    const runner = teamQueues[team].shift();
                    if (runner) finalQueue.push(runner);
                    if (teamQueues[team].length > 0) nextTeams.push(team);
                }
                roundRobinTeams = nextTeams;
            }

            // Rozdělení do heatů bez stejných týmů
            const heats = [];
            while (finalQueue.length > 0) {
                const heat = [];
                const usedTeams = new Set();
                let i = 0;

                while (heat.length < lanes && i < finalQueue.length) {
                    const runner = finalQueue[i];
                    if (!usedTeams.has(runner.team)) {
                        heat.push(runner);
                        usedTeams.add(runner.team);
                        finalQueue.splice(i, 1);
                    } else {
                        i++;
                    }
                }

                // fallback: pokud heat není plný, doplň zbytkem
                i = 0;
                while (heat.length < lanes && finalQueue.length > 0) {
                    heat.push(finalQueue.splice(0, 1)[0]);
                }

                heats.push(heat);
            }

            let startNumber = 1;
            const updates = [];

            heats.forEach((heat, heatIdx) => {
                heat.forEach((runner, laneIdx) => {
                    updates.push(
                        startlistService.updateStartlistEntry(runner.id, {
                            heat: heatIdx + 1,
                            lane: laneIdx + 1,
                            start_number: startNumber++
                        })
                    );
                });
            });

            Promise.all(updates)
                .then(() => resolve(true))
                .catch(reject);
        });
    });
});


ipcMain.handle('listSerialPorts', async () => {
    const ports = await SerialPort.list();
    console.log(ports)
    return ports.map(p => ({
        path: p.path,
        manufacturer: p.manufacturer || '',
        serialNumber: p.serialNumber || ''
    }));
});

ipcMain.handle('openSerialPort', async (e, portPath) => {
    timerService.openTimer(portPath, (data, rawLine) => {
        // Posíláme dekódovaná data do rendereru
        mainWindow.webContents.send('timer-data', data);

        // Posíláme i raw řádek
        mainWindow.webContents.send('serial-raw-line', rawLine);
    });
});


ipcMain.handle('sendToSerialPort', async (e, data) => {
    console.log('IPC přijato:', data);
    timerService.sendToTimer(data);
});

ipcMain.handle('getResultsForCategory', async (e, competitionId, categoryId) => {
    try {
        const rows = await startlistService.getResultsForCategory(competitionId, categoryId);
        return rows;
    } catch (error) {
        console.error(error);
        return [];
    }
});

ipcMain.handle('closeSerialPort', async () => {
    timerService.closeTimer();
});

let resultsWindow = null;

ipcMain.handle('openResultsWindow', async (e, displayIndex) => {
    const displays = screen.getAllDisplays();
    const display = displays[displayIndex] || displays[0];

    if (resultsWindow) {
        resultsWindow.close();
        resultsWindow = null;
        return {closed: true};
    }

    resultsWindow = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        icon: path.join(__dirname, 'src', 'assets', 'logo.png'),
        fullscreen: true,
        frame: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    resultsWindow.loadFile(path.join(__dirname, 'src', 'views', 'results.html'));

    resultsWindow.on('closed', () => {
        resultsWindow = null;
    });

    return {opened: true};
});

ipcMain.handle('getDisplays', () => {
    return screen.getAllDisplays().map((d, i) => ({
        id: i,
        name: `Monitor ${i + 1} (${d.bounds.width}×${d.bounds.height})`,
    }));
});


ipcMain.handle('getResultsByStartlistIds', async (_evt, ids) => {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(ids) || ids.length === 0) return resolve({});

    startlistService.getResultsByStartlistIds(ids, (err, rows) => {
      if (err) return reject(err);

      const byId = {};
      for (const r of rows) {
        byId[r.startlist_id] = {
          time_first: r.time_first,
          time_second: r.time_second,
          is_n_first: r.is_n_first,
          is_n_second: r.is_n_second,
          time_lp: r.time_lp,
          time_pp: r.time_pp,
          is_n: r.is_n,
        };
      }
      resolve(byId);
    });
  });
});

ipcMain.handle('getMeasurementResults', async () => {
    const competitionId = store.get('selectedCompetitionId');
    const categoryId = store.get('selectedCategoryId');
    const discipline = store.get('selectedDiscipline');

    if (!competitionId || !categoryId) return {results: [], category: 'Neznámá'};

    const categoryName = await new Promise((resolve) => {
        startlistService.getCategoryById(categoryId, (err, category) => {
            if (err) {
                console.error('CATEGORY LOAD FAIL:', err);
                return resolve('Neznámá');
            }
            resolve(category?.name || 'Neznámá');
        });
    });

    return new Promise((resolve, reject) => {
        startlistService.getStartlist(competitionId, categoryId, async (err, rows) => {
            if (err) {
                console.error('GET STARTLIST ERROR:', err);
                return reject(err);
            }

            const startlistIds = rows.map(r => r.id);
            if (!startlistIds.length) return resolve({results: [], category: categoryName, discipline});

            try {
                // Získáme výsledky pro dané startlist ID
                const results = await new Promise((res, rej) => {
                    startlistService.getResultsByStartlistIds(startlistIds, (err, resultRows) => {
                        if (err) {
                            console.error('RESULTS LOAD FAIL:', err);
                            return res([]); // vrať prázdné pole místo err
                        }
                        res(resultRows);
                    });
                });

                const resultMap = {};
                results.forEach(r => {
                    resultMap[r.startlist_id] = r;
                });

                const merged = rows.map(row => {
                    const result = resultMap[row.id] || {};
                    return {
                        ...row,
                        time_first: result.time_first ?? null,
                        time_second: result.time_second ?? null,
                        is_n: result.is_n ?? null,
                        time_lp: result.time_lp ?? null,
                        time_pp: result.time_pp ?? null,
                        final_time: result.final_time ?? null,
                        is_n_first: result.is_n_first ?? 0,
                        is_n_second: result.is_n_second ?? 0,
                    };
                });

                merged.sort((a, b) => (a.start_number ?? 9999) - (b.start_number ?? 9999));

                resolve({
                    category: categoryName,
                    results: merged,
                    discipline,
                });
            } catch (e) {
                console.error('MERGE FAIL:', e);
                reject(e);
            }
        });
    });
});


ipcMain.handle('storeSet', (e, key, value) => {
    store.set(key, value);
});


