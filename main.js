const {app, BrowserWindow, ipcMain, dialog, screen, nativeTheme } = require('electron');
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
const relayService = require('./services/relayService');

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
        width: 640,
        height: 200,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
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
    }, 5500);
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

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCzDate(d) {
  try {
    const dt = (d instanceof Date) ? d : new Date(d);
    return dt.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

function buildTableHtml(headers = [], rows = []) {
  const theadHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');

  const rowsHtml = rows.map(r => {
    const tds = (Array.isArray(r) ? r : []).map(col => `<td>${escapeHtml(col)}</td>`).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  return { theadHtml, rowsHtml };
}

function buildHeaderFooterTemplates({ titleLeft = '', titleRight = '' } = {}) {
  const baseStyle = `
    <style>
      .hf {
        font-family: Arial, sans-serif;
        font-size: 10px;
        color: #666;
        padding: 0 12mm;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .hf .left { text-align: left; }
      .hf .center { text-align: center; }
      .hf .right { text-align: right; }
      .truncate {
        max-width: 70%;
        white-space: nowrap; 
        overflow: hidden; 
        text-overflow: ellipsis;
      }
    </style>
  `;
  const headerTemplate = `
    ${baseStyle}
    <div class="hf">
      <div class="left truncate">${escapeHtml(titleLeft)}</div>
      <div class="right truncate">${escapeHtml(titleRight)}</div>
    </div>
  `;
  const footerTemplate = `
    ${baseStyle}
    <div class="hf">
      <div class="left">Vygenerováno: <span class="date"></span></div>
      <div class="center">Strana <span class="pageNumber"></span> / <span class="totalPages"></span></div>
      <div class="right"></div>
    </div>
  `;
  return { headerTemplate, footerTemplate };
}

ipcMain.handle('exportStartlistPdf', async (e, payload) => {
  // ---- Validace vstupu ----
  if (!payload || typeof payload !== 'object') return false;
  const {
    competition = {},
    discipline = '',
    category = '',
    rows = [],
    headers = [],
    logoPath // volitelné: absolutní cesta k logu
  } = payload;

  const competitionName = competition?.name || '';
  const eventDate = formatCzDate(competition?.date);
  const safeDiscipline = discipline || '';
  const safeCategory = category || '';

  const cols = Array.isArray(headers) ? headers.length : 0;
  const landscape = cols >= 7; // víc sloupců => landscape

  // ---- Načtení šablony ----
  const templatePath = path.join(app.getAppPath(), 'src', 'assets', 'startlist_template.html');
  if (!fs.existsSync(templatePath)) {
    console.error('Template not found:', templatePath);
    return false;
  }
  let html = fs.readFileSync(templatePath, 'utf-8');

  // ---- Tabulka ----
  const { theadHtml, rowsHtml } = buildTableHtml(headers, rows);

  // ---- Logo (data URL / nebo relativní cesta) ----
  let logoTag = '';
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      const buf = fs.readFileSync(logoPath);
      const ext = path.extname(logoPath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : '';
      if (mime) {
        const base64 = buf.toString('base64');
        logoTag = `<img class="logo" src="data:${mime};base64,${base64}" alt="Logo" />`;
      }
    } catch { /* ignore */ }
  }

  // ---- Nahradit placeholdery ----
  html = html
    .replace(/{{\s*logo\s*}}/g, logoTag)
    .replace(/{{\s*competitionName\s*}}/g, escapeHtml(competitionName))
    .replace(/{{\s*date\s*}}/g, escapeHtml(eventDate))
    .replace(/{{\s*discipline\s*}}/g, escapeHtml(safeDiscipline))
    .replace(/{{\s*category\s*}}/g, escapeHtml(safeCategory))
    .replace(/{{\s*thead\s*}}/g, theadHtml)
    .replace(/{{\s*tbody\s*}}/g, rowsHtml);

  // ---- Puppeteer + PDF ----
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--font-render-hinting=medium']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Pro jistotu stejný vzhled v PDF
    await page.emulateMediaType('print');

    // Hlavička/Zápatí
    const { headerTemplate, footerTemplate } = buildHeaderFooterTemplates({
      titleLeft: `${competitionName}`.trim(),
      titleRight: `${safeDiscipline}${safeCategory ? ' • ' + safeCategory : ''}`.trim()
    });

    // Název souboru
    const safeName = [
      'Startovní listina',
      competitionName && competitionName.replace(/[\\/:*?"<>|]+/g, ' '),
      safeDiscipline && safeDiscipline.replace(/[\\/:*?"<>|]+/g, ' '),
      safeCategory && safeCategory.replace(/[\\/:*?"<>|]+/g, ' '),
      eventDate
    ].filter(Boolean).join(' - ');

    const { filePath } = await dialog.showSaveDialog({
      title: 'Uložit PDF',
      defaultPath: `${safeName}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (!filePath) {
      await page.close();
      await browser.close();
      return false;
    }

    await page.pdf({
      path: filePath,
      format: 'A4',
      landscape,
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '12mm', right: '12mm' },
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate
    });

    await page.close();
    await browser.close();
    return true;
  } catch (err) {
    console.error('PDF export error:', err);
    if (browser) try { await browser.close(); } catch {}
    return false;
  }
});


// barvy dle PDF/ukázky
const BRAND = 'FF0E756E';     // tmavá zeleň na orámování
const HEAD_BG = 'FFE6FFFA';   // světle tyrkysová hlavička
const GRID = 'FFDDDDDD';      // světle šedé mřížky

function czDate(d) {
  if (!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  return dt.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
}
function safeFs(s){ return (s||'').toString().replace(/[\\/:*?"<>|]+/g,' ').trim(); }
// vyhoď kontrolní znaky, které Excel nesnáší
function clean(v){ return (v==null ? '' : String(v)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }

function autoWidth(ws){
  ws.columns.forEach(col=>{
    let max = 10;
    col.eachCell({includeEmpty:true}, c=>{
      const len = clean(c.value).length;
      if (len + 2 > max) max = Math.min(len + 2, 90);
    });
    col.width = max;
  });
}

ipcMain.handle('exportStartlistExcel', async (e, {
  // stejné jako u PDF
  competition = {},            // { name, date }
  discipline = '',
  category = '',
  headers = [],                // např. ['Startovní číslo','Tým']
  rows = []                    // např. [[1,'SDH…'], [2,'SDH…'], ...]
}) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Uložit startovku',
      defaultPath: path.join(
        app.getPath('documents'),
        ['Startovní listina', safeFs(competition.name), safeFs(discipline), safeFs(category), czDate(competition.date)]
          .filter(Boolean).join(' - ') + '.xlsx'
      ),
      filters: [{ name:'Excel', extensions:['xlsx'] }]
    });
    if (canceled || !filePath) return false;

    if (!Array.isArray(headers) || headers.length === 0) headers = ['#'];
    if (!Array.isArray(rows)) rows = [];
    rows = rows.map(r => Array.isArray(r) ? r.map(clean) : []);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'TimeCore';

    const ws = wb.addWorksheet(([discipline, category].filter(Boolean).join(' • ') || 'Startlist').slice(0,31));

    const colCount = Math.max(headers.length, 1);

    // ── Ř.1: „Startovní listina“
    ws.mergeCells(1,1,1,colCount);
    const title = ws.getCell(1,1);
    title.value = 'Startovní listina';
    title.font = { name: 'Arial', size: 18, bold: true, color: { argb: BRAND } };
    title.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(1).height = 24;

    // ── Ř.2: meta text (Soutěž / Datum / Disciplína / Kategorie)
    ws.mergeCells(2,1,2,colCount);
    const meta = ws.getCell(2,1);
    meta.value = clean(
      `Soutěž: ${competition.name || ''}    Datum: ${czDate(competition.date)}    ` +
      `Disciplína: ${discipline || ''}    Kategorie: ${category || ''}`
    );
    meta.font = { name: 'Arial', size: 11, color: { argb: 'FF666666' } };
    meta.alignment = { horizontal: 'left', vertical: 'middle' };
    // podtržení meta řádku barvou BRAND
    for (let c = 1; c <= colCount; c++) {
      ws.getCell(2, c).border = {
        bottom: { style: 'medium', color: { argb: BRAND } }
      };
    }

    // ── Ř.3: mezera
    ws.addRow([]);

    // ── Ř.4: hlavička tabulky
    ws.addRow(headers.map(clean));
    const headRowIdx = 4;
    const head = ws.getRow(headRowIdx);
    head.height = 20;
    head.eachCell(cell => {
      cell.font = { name: 'Arial', size: 9, bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_BG } };
      cell.border = {
        top: { style: 'thin', color: { argb: BRAND } },
        left:{ style: 'thin', color: { argb: BRAND } },
        right:{ style: 'thin', color: { argb: BRAND } },
        bottom:{ style: 'thin', color: { argb: BRAND } }
      };
    });

    // ── Data (bez zebra, šedé mřížky)
    rows.forEach(r => {
      const row = ws.addRow(r.slice(0, headers.length));
      row.eachCell(cell => {
        cell.font = { name: 'Arial', size: 9 };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: GRID } },
          left:{ style: 'thin', color: { argb: GRID } },
          right:{ style: 'thin', color: { argb: GRID } },
          bottom:{ style: 'thin', color: { argb: GRID } }
        };
      });
    });

    // Autofit + tisk
    autoWidth(ws);
    ws.pageSetup = {
      orientation: (headers.length >= 7) ? 'landscape' : 'portrait',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left:0.35, right:0.35, top:0.5, bottom:0.5, header:0.2, footer:0.2 },
      printTitlesRow: `1:${headRowIdx}`
    };

    await wb.xlsx.writeFile(filePath);
    return true;
  } catch (err) {
    console.error('exportStartlistExcel error:', err);
    return false;
  }
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


function getStartlistPromise(competitionId, categoryId) {
  return new Promise((resolve, reject) => {
    startlistService.getStartlist(competitionId, categoryId, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function getResultsByStartlistIdsPromise(ids) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(ids) || !ids.length) return resolve([]);
    startlistService.getResultsByStartlistIds(ids, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// --- Sloučení startlist + results do jednoho pole ---
async function getStartlistWithResults(competitionId, categoryId) {
  const startlist = await getStartlistPromise(competitionId, categoryId);
  const ids = startlist.map(r => r.id);
  const results = await getResultsByStartlistIdsPromise(ids);

  // map výsledků podle startlist_id
  const byId = {};
  for (const r of results) byId[r.startlist_id] = r;

  // vrátíme pole objektů s jednotným tvarem
  return startlist.map(s => {
    const res = byId[s.id] || {};
    return {
      // startlist pole
      id: s.id,
      start_number: s.start_number ?? null,
      team: s.team ?? null,
      name: s.name ?? null,
      surname: s.surname ?? null,
      heat: s.heat ?? null,
      lane: s.lane ?? null,

      // results pole (flatten)
      result_id: res.id ?? null,
      time_lp: res.time_lp ?? null,
      time_pp: res.time_pp ?? null,
      time_first: res.time_first ?? null,
      time_second: res.time_second ?? null,
      is_n: res.is_n ?? null,
      is_n_first: res.is_n_first ?? 0,
      is_n_second: res.is_n_second ?? 0,
      final_time: res.final_time ?? null
    };
  });
}

// --- Pomocné převody (pro exporty) ---
const toNum = v => (v == null || v === '' ? null : Number(v));
const toBool = v => v === true || v === 1 || v === '1' || v === 'true';

// Normalizovaný řádek pro výsledkovku (útok vs. běh)
function normalizeResultRow(row, discipline) {
  const lp = toNum(row.time_lp);
  const pp = toNum(row.time_pp);

  // finál vždy podle DB; když tam není, necháme 999.999
  let final = toNum(row.final_time);
  if (!Number.isFinite(final)) final = 999.999;

  // N-logika: útok dle is_n; u běhu dle is_n nebo final >= 999.999
  const isN = (discipline === 'Požární útok')
    ? toBool(row.is_n)
    : (toBool(row.is_n) || (Number.isFinite(final) && final >= 999.999));

  const who = row.team
    ? row.team
    : [row.name || '', row.surname || ''].join(' ').trim();

  return {
    start: row.start_number ?? '',
    who,
    lp,
    pp,
    final,
    isN
  };
}

const ExcelJS = require('exceljs');

const qRun = (sql, p=[]) => new Promise((res,rej)=>db.run(sql,p,function(e){e?rej(e):res(this)}));
const qAll = (sql, p=[]) => new Promise((res,rej)=>db.all(sql,p,(e,r)=>e?rej(e):res(r||[])));

// ====== DATA SOURCES ======
const getStartlist = (competitionId, categoryId) =>
  new Promise((resolve,reject)=> startlistService.getStartlist(competitionId, categoryId, (e,r)=>e?reject(e):resolve(r||[])));

const getResultsByStartlistIds = (ids) =>
  new Promise((resolve,reject)=> {
    if (!ids?.length) return resolve([]);
    startlistService.getResultsByStartlistIds(ids, (e,r)=>e?reject(e):resolve(r||[]));
  });

const getRelayRows = (competitionId, categoryId) =>
  new Promise((resolve,reject)=> relayService.listRowsWithRank(competitionId, categoryId, (e,r)=>e?reject(e):resolve(r||[])));

// ====== RANKING HELPERS ======
// seřadí s ohledem na OOC, vrátí place mapu (tie sdílené pořadí; jen ti s validRank=true)
function rankByFinal(list, { getFinal, isRankEligible, isOOC }) {
  // seřadit: OOC až nakonec, jinak podle final (null/NaN => 1000.00 = za všechny)
  const norm = v => (Number.isFinite(v) ? v : 1000.00); // 1000 > 999.99
  const arr = [...list].sort((a,b)=>{
    const ao = !!isOOC(a), bo = !!isOOC(b);
    if (ao!==bo) return ao?1:-1;
    return norm(getFinal(a)) - norm(getFinal(b));
  });

  const placeMap = new Map();
  let place = 0, last = null, idx = 0;
  for (const x of arr) {
    idx++;
    const final = getFinal(x);
    const eligible = isRankEligible(x) && !isOOC(x);
    const key = norm(final);
    if (eligible) {
      if (key !== last) { place = idx; last = key; }
      placeMap.set(x, place);
    } else {
      placeMap.set(x, '—');
    }
  }
  return { sorted: arr, placeMap };
}

// ====== MODE: ATTACK ======
async function buildAttackRows(competitionId, categoryId) {
  const start = await getStartlist(competitionId, categoryId);
  const ids   = start.map(s=>s.id);
  const res   = await getResultsByStartlistIds(ids);
  const byId  = Object.fromEntries(res.map(r=>[r.startlist_id, r]));

  const rows = start.map(s=>{
    const r = byId[s.id] || {};
    const lp = toNum(r.time_lp);
    const pp = toNum(r.time_pp);
    const isN = toBool(r.is_n);
    // Final: když N => 999.99; když má final_time, ber ho; jinak null (žádný čas)
    let final = toNum(r.final_time);
    if (isN) final = 999.99;
    if (!isN && !Number.isFinite(final)) final = (Number.isFinite(lp)||Number.isFinite(pp)) ? toNum(r.final_time) : null;

    return {
      id:s.id, start:s.start_number??'', who: s.team ?? `${s.name||''} ${s.surname||''}`.trim(),
      ooc: toBool(s.out_of_competition),
      lp, pp, isN, final
    };
  });

  const { sorted, placeMap } = rankByFinal(rows, {
    getFinal: r => (r.isN ? 999.99 : r.final),
    isRankEligible: r => Number.isFinite(r.final) && r.final < 999.99 && !r.isN,
    isOOC: r => r.ooc
  });

  return sorted.map(r=>({
    ...r,
    place: placeMap.get(r)
  }));
}

// ====== MODE: RELAY ======
async function buildRelayRows(competitionId, categoryId) {
  const rows  = await getRelayRows(competitionId, categoryId);
  const start = await getStartlist(competitionId, categoryId);
  const oocMap = new Map(start.map(s=>[s.id, toBool(s.out_of_competition)]));

  const prepared = rows.map(r=>{
    const a1 = toNum(r.attempt1_time);
    const a2 = toNum(r.attempt2_time);
    const v1 = (r.attempt1_valid !== 0);
    const v2 = (r.attempt2_valid !== 0);
    const show1 = v1 ? a1 : 999.99;   // N -> 999.99 v tabulce
    const show2 = v2 ? a2 : 999.99;
    let final = toNum(r.final_time);
    if (!Number.isFinite(final)) {
      // když nemáme nic (obě N nebo bez času), final = 999.99 jen pro řazení na konec
      final = (v1||v2) ? null : 999.99;
    }
    // když jsou oba N, final = 999.99 kvůli řazení
    if (!v1 && !v2) final = 999.99;

    return {
      id:r.startlist_id, start:r.start_number??'', who:r.team??'',
      ooc: oocMap.get(r.startlist_id) || false,
      a1: show1, a2: show2, final
    };
  });

  const { sorted, placeMap } = rankByFinal(prepared, {
    getFinal: r => r.final,
    isRankEligible: r => Number.isFinite(r.final) && r.final < 999.99,
    isOOC: r => r.ooc
  });

  return sorted.map(r=>({ ...r, place: placeMap.get(r) }));
}

// ====== MODE: OVERALL ======
async function buildOverallRows(competitionId, categoryId) {
  const attack = await buildAttackRows(competitionId, categoryId);
  const relay  = await buildRelayRows(competitionId, categoryId);

  const aRank = new Map(attack.map(r=>[r.id, (typeof r.place==='number') ? r.place : null]));
  const rRank = new Map(relay.map(r=>[r.id,  (typeof r.place==='number') ? r.place : null]));
  const ooc   = new Map(attack.map(r=>[r.id, !!r.ooc])); // startlist je stejný

  // max rank pro penalizaci „bez disciplíny“
  const maxRank = Math.max(
    ...[...aRank.values(), ...rRank.values()].filter(n => Number.isFinite(n)),
    0
  ) || 0;

  // spoj
  const pool = new Map();
  // jména/start vezmu z útoku/relaye podle dostupnosti
  for (const x of attack) pool.set(x.id, { id:x.id, start:x.start, who:x.who, ooc:x.ooc, aPlace:aRank.get(x.id) ?? null, rPlace:null });
  for (const y of relay) {
    const t = pool.get(y.id) || { id:y.id, start:y.start, who:y.who, ooc: y.ooc, aPlace:null, rPlace:null };
    // preferuj who/start z útoku, jinak doplň z relaye
    if (!t.who)   t.who = y.who;
    if (!t.start) t.start = y.start;
    t.rPlace = rRank.get(y.id) ?? null;
    pool.set(y.id, t);
  }

  const rows = [...pool.values()].map(r=>{
    const a = r.aPlace, rr = r.rPlace;
    const sum = r.ooc ? Infinity : ((a ?? (maxRank+1)) + (rr ?? (maxRank+1)));
    return { ...r, sum };
  });

  // seřadit OOC poslední, jinak podle sum
  rows.sort((x,y)=>{
    if (!!x.ooc !== !!y.ooc) return x.ooc ? 1 : -1;
    return x.sum - y.sum;
  });

  // přiděl „celkové pořadí“ (bez OOC a pouze čísla)
  let place=0, last=null, idx=0;
  for (const r of rows) {
    idx++;
    if (r.ooc || !Number.isFinite(r.sum)) { r.overall='—'; continue; }
    if (r.sum !== last) { place = idx; last = r.sum; }
    r.overall = place;
  }

  return rows;
}

// ====== PDF ======
ipcMain.handle('exportResultsPdf', async (_e, payload={}) => {
  const {
    competitionId,
    categoryId,
    mode,                 // 'attack' | 'relay' | 'overall'
    relayType,            // '4x60' | 'pairs' (jen pro titulek)
    competition,          // { name, date }
    categoryName
  } = payload;

  if (!competitionId || !categoryId || !mode) return false;

  // data + hlavička sloupců
  let headers = [], rows = [];
  if (mode === 'attack') {
    headers = ['Pořadí', 'Start. č.', 'Tým / Jméno', 'LP', 'PP', 'Výsledek', 'N'];
    const data = await buildAttackRows(competitionId, categoryId);
    rows = data.map(r => ([
      (typeof r.place==='number') ? r.place : '—',
      r.start ?? '',
      r.who ?? '',
      Number.isFinite(r.lp) ? r.lp.toFixed(2) : '—',
      Number.isFinite(r.pp) ? r.pp.toFixed(2) : '—',
      (Number.isFinite(r.final) && r.final < 999.99) ? r.final.toFixed(2) : (r.isN ? '999.99' : '—'),
      (r.isN || (Number.isFinite(r.final) && r.final >= 999.99)) ? 'N' : ''
    ]));
  } else if (mode === 'relay') {
    headers = ['Pořadí', 'Start. č.', 'Tým', '1. pokus', '2. pokus', 'Výsledek'];
    const data = await buildRelayRows(competitionId, categoryId);
    rows = data.map(r => ([
      (typeof r.place==='number') ? r.place : '—',
      r.start ?? '',
      r.who ?? '',
      Number.isFinite(r.a1) ? r.a1.toFixed(2) : '—',
      Number.isFinite(r.a2) ? r.a2.toFixed(2) : '—',
      (Number.isFinite(r.final) && r.final < 999.99) ? r.final.toFixed(2) : '999.99'
    ]));
  } else { // overall
    headers = ['Celkové pořadí', 'Start. č.', 'Tým', 'Pořadí útok', 'Pořadí štafeta', 'Součet'];
    const data = await buildOverallRows(competitionId, categoryId);
    rows = data.map(r => ([
      (typeof r.overall==='number') ? r.overall : '—',
      r.start ?? '',
      r.who ?? '',
      r.aPlace ?? '—',
      r.rPlace ?? '—',
      Number.isFinite(r.sum) ? r.sum : '—'
    ]));
  }

  // === šablona ===
  const templatePath = path.join(app.getAppPath(), 'src', 'assets', 'results_template.html');
  if (!fs.existsSync(templatePath)) {
    console.error('Missing template:', templatePath);
    return false;
  }
  let html = fs.readFileSync(templatePath, 'utf-8');

  const theadHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
  const rowsHtml  = rows.map(cols => `<tr>${cols.map(c=>`<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`).join('');

  const compName = competition?.name || '';
  const eventDate = formatCzDate(competition?.date);
  const discText = mode==='attack' ? 'Požární útok'
                  : mode==='relay' ? (relayType==='pairs' ? 'Štafeta dvojic' : 'Štafeta 4×60')
                  : 'Celkové výsledky';

  html = html
    .replace(/{{\s*competitionName\s*}}/g, escapeHtml(compName))
    .replace(/{{\s*date\s*}}/g, escapeHtml(eventDate))
    .replace(/{{\s*discipline\s*}}/g, escapeHtml(discText))
    .replace(/{{\s*category\s*}}/g, escapeHtml(categoryName || ''))
    .replace(/{{\s*thead\s*}}/g, theadHtml)
    .replace(/{{\s*tbody\s*}}/g, rowsHtml);

  // PDF
  let browser;
  try {
    browser = await puppeteer.launch({ headless:true, args:['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil:'networkidle0' });
    await page.emulateMediaType('print');

    const { headerTemplate, footerTemplate } = buildHeaderFooterTemplates({
      titleLeft: compName,
      titleRight: `${discText}${categoryName ? ' • ' + categoryName : ''}`
    });

    const safe = s => (s||'').toString().replace(/[\\/:*?"<>|]+/g,' ').trim();
    const { filePath } = await dialog.showSaveDialog({
      title: 'Uložit PDF',
      defaultPath: `${safe('Výsledky')} - ${safe(compName)} - ${safe(discText)} - ${safe(categoryName)} - ${eventDate}.pdf`,
      filters: [{ name:'PDF', extensions:['pdf'] }]
    });
    if (!filePath) { await browser.close(); return false; }

    await page.pdf({
      path: filePath, format:'A4', printBackground:true,
      margin:{ top:'18mm', bottom:'18mm', left:'12mm', right:'12mm' },
      displayHeaderFooter:true, headerTemplate, footerTemplate
    });

    await browser.close();
    return true;
  } catch (err) {
    console.error('exportResultsPdf error:', err);
    if (browser) try{ await browser.close(); }catch{}
    return false;
  }
});

// ====== EXCEL ======
ipcMain.handle('exportResultsExcel', async (_e, payload={}) => {
  const {
    competitionId,
    categoryId,
    mode,                 // 'attack' | 'relay' | 'overall'
    relayType,
    competitionName,
    competitionDate,
    categoryName
  } = payload;

  if (!competitionId || !categoryId || !mode) return false;

  // data + hlavičky
  let headers = [], rows = [];
  if (mode === 'attack') {
    headers = ['Pořadí', 'Start. č.', 'Tým / Jméno', 'LP', 'PP', 'Výsledek', 'N'];
    const data = await buildAttackRows(competitionId, categoryId);
    rows = data.map(r => ([
      (typeof r.place==='number') ? r.place : '—',
      r.start ?? '',
      r.who ?? '',
      Number.isFinite(r.lp) ? r.lp.toFixed(2) : '—',
      Number.isFinite(r.pp) ? r.pp.toFixed(2) : '—',
      (Number.isFinite(r.final) && r.final < 999.99) ? r.final.toFixed(2) : (r.isN ? '999.99' : '—'),
      (r.isN || (Number.isFinite(r.final) && r.final >= 999.99)) ? 'N' : ''
    ]));
  } else if (mode === 'relay') {
    headers = ['Pořadí', 'Start. č.', 'Tým', '1. pokus', '2. pokus', 'Výsledek'];
    const data = await buildRelayRows(competitionId, categoryId);
    rows = data.map(r => ([
      (typeof r.place==='number') ? r.place : '—',
      r.start ?? '',
      r.who ?? '',
      Number.isFinite(r.a1) ? r.a1.toFixed(2) : '—',
      Number.isFinite(r.a2) ? r.a2.toFixed(2) : '—',
      (Number.isFinite(r.final) && r.final < 999.99) ? r.final.toFixed(2) : '999.99'
    ]));
  } else {
    headers = ['Celkové pořadí', 'Start. č.', 'Tým', 'Pořadí útok', 'Pořadí štafeta', 'Součet'];
    const data = await buildOverallRows(competitionId, categoryId);
    rows = data.map(r => ([
      (typeof r.overall==='number') ? r.overall : '—',
      r.start ?? '',
      r.who ?? '',
      r.aPlace ?? '—',
      r.rPlace ?? '—',
      Number.isFinite(r.sum) ? r.sum : '—'
    ]));
  }

  try {
    // Workbook
    const wb = new ExcelJS.Workbook();
    wb.creator = 'TimeCore';
    const ws = wb.addWorksheet((() => {
      const d = (mode==='attack') ? 'Útok' : (mode==='relay' ? (relayType==='pairs'?'Štafeta dvojic':'Štafeta 4×60') : 'Celkové');
      return ([d, categoryName].filter(Boolean).join(' • ') || 'Výsledky').slice(0,31);
    })());

    // Titulek + meta
    const title = ([ 'Výsledky',
      competitionName,
      (mode==='attack') ? 'Požární útok' : (mode==='relay' ? (relayType==='pairs'?'Štafeta dvojic':'Štafeta 4×60') : 'Celkové výsledky'),
      categoryName, formatCzDate(competitionDate) ]).filter(Boolean).join(' – ');

    ws.mergeCells(1,1,1,headers.length);
    ws.getCell(1,1).value = title;
    ws.getCell(1,1).font  = { name:'Arial', size:16, bold:true };
    ws.getCell(1,1).alignment = { vertical:'middle', horizontal:'left' };
    ws.addRow([]);

    ws.addRow(headers);
    const headRow = ws.getRow(ws.lastRow.number);
    headRow.eachCell(c => {
      c.font = { name:'Arial', size:10, bold:true };
      c.alignment = { vertical:'middle', horizontal:'center', wrapText:true };
      c.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF0F172A' } };
      c.font = { name:'Arial', size:10, bold:true, color:{ argb:'FFCBD5E1' } };
      c.border = { top:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'}, bottom:{style:'thin'} };
    });

    rows.forEach(r=>{
      const row = ws.addRow(r);
      row.eachCell(c=>{
        c.font = { name:'Arial', size:10 };
        c.alignment = { vertical:'middle', horizontal:'center' };
        c.border = { top:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'}, bottom:{style:'thin'} };
      });
      // Sloupec „Tým / Jméno“ resp. „Tým“ do leva
      const idxText = (mode==='overall') ? 3 : 3;
      row.getCell(idxText).alignment = { vertical:'middle', horizontal:'left' };
    });

    // Auto width
    const colCount = headers.length;
    for (let c=1; c<=colCount; c++){
      let max=0;
      ws.eachRow({ includeEmpty:true }, row=>{
        const cell = row.getCell(c);
        const v = String(cell.value ?? '');
        max = Math.max(max, v.length);
      });
      ws.getColumn(c).width = Math.min(Math.max(max + 2, 10), 40);
    }

    const safe = s => (s||'').toString().replace(/[\\/:*?"<>|]+/g,' ').trim();
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Uložit výsledky',
      defaultPath: path.join(
        app.getPath('documents'),
        `${safe('Výsledky')} - ${safe(competitionName)} - ${safe((mode==='attack')?'Požární útok':(mode==='relay'?(relayType==='pairs'?'Štafeta dvojic':'Štafeta 4×60'):'Celkové výsledky'))} - ${safe(categoryName)} - ${formatCzDate(competitionDate)}.xlsx`
      ),
      filters: [{ name:'Excel', extensions:['xlsx'] }]
    });
    if (canceled || !filePath) return false;

    await wb.xlsx.writeFile(filePath);
    return true;
  } catch (err) {
    console.error('exportResultsExcel error:', err);
    return false;
  }
});


const cbp = (fn) => (...args) => new Promise((resolve, reject) => {
  fn(...args, (err, data) => err ? reject(err) : resolve(data));
});

// typ štafety
ipcMain.handle('relay:getType', cbp((e, { competitionId }, cb) =>
  relayService.getCompetitionRelayType(competitionId, cb)
));
ipcMain.handle('relay:setType', cbp((e, { competitionId, type }, cb) =>
  relayService.setCompetitionRelayType(competitionId, type, cb)
));

// načtení řádků do tabulky (2 řádky na tým)
ipcMain.handle('relay:listRows', cbp((e, { competitionId, categoryId }, cb) =>
  relayService.listRowsWithRank(competitionId, categoryId, cb) // rank se už neukazuje, ale nechal jsem kompatibilní
));

// uložení jednoho pokusu (upsert + přepočet final)
ipcMain.handle('relay:savePartial', cbp((e, payload, cb) =>
  relayService.upsertRelayPartial(payload, cb)
));

const runP = (sql, params=[]) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
});

// tichá migrace – přidá sloupec, když chybí (ignoruje chybu, pokud už existuje)
async function ensureStartlistOOCColumn() {
  try {
    await runP(`ALTER TABLE startlist ADD COLUMN out_of_competition INTEGER DEFAULT 0`);
  } catch (_) {
    // sloupec už pravděpodobně existuje -> ignoruj
  }
}

// IPC handler – nastaví/odnastaví OOC pro konkrétní startlist_id
ipcMain.handle('startlist:setOOC', async (_e, { startlist_id, value }) => {
  if (!startlist_id) throw new Error('startlist_id is required');
  await ensureStartlistOOCColumn();
  await runP(`UPDATE startlist SET out_of_competition = ? WHERE id = ?`, [value ? 1 : 0, startlist_id]);
  return true;
});

ipcMain.handle('theme:get', () => store.get('theme') || 'system');
ipcMain.handle('theme:set', (_e, mode) => {
  const m = (mode === 'dark' || mode === 'light') ? mode : 'system';
  store.set('theme', m);
  nativeTheme.themeSource = m; // když používáš i nativní prvky
  return m;
});

// při startu appky:
nativeTheme.themeSource = store.get('theme') || 'system';