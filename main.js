const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const csvParse = require('csv-parse/sync');
const xlsx = require('xlsx');
const puppeteer = require('puppeteer');
const { SerialPort } = require('serialport');

const competitionsService = require('./services/competitionsService');
const startlistService = require('./services/startlistService');
const timerService = require('./services/timerService');

let splashWindow;
let mainWindow;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'src', 'views', 'splash.html'));

  setTimeout(() => {
    splashWindow.close();
    createMainWindow();
  }, 3000);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'src', 'assets', 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.webContents.openDevTools();
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
    await startlistService.saveResult(payload);
    return { success: true };
  } catch (error) {
    console.error(error);
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
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Vyber CSV',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    properties: ['openFile']
  });

  if (canceled || !filePaths.length) return false;

  const filePath = filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = csvParse.parse(content, { columns: true, skip_empty_lines: true });

  for (const row of records) {
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

// IMPORT EXCEL
ipcMain.handle('importStartlistExcel', async (e, competitionId, categoryId, discipline) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Vyber Excel',
    filters: [{ name: 'Excel', extensions: ['xls', 'xlsx'] }],
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
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const { filePath } = await dialog.showSaveDialog({
    title: 'Uložit PDF',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (!filePath) {
    await browser.close();
    return false;
  }

  await page.pdf({
    path: filePath,
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
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
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Uložit startovku',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
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
    const { id, ...updatedFields } = entry;
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

      if (discipline === 'Požární útok') {
        return resolve(true);
      }

      const runners = [...rows];
      const heats = [];

      while (runners.length > 0) {
        const heat = [];
        const usedTeams = new Set();

        for (let i = 0; i < lanes && runners.length > 0; i++) {
          let idx = runners.findIndex(r => !usedTeams.has(r.team));

          if (idx === -1) {
            idx = 0;
          }

          const runner = runners.splice(idx, 1)[0];
          usedTeams.add(runner.team);
          heat.push(runner);
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
