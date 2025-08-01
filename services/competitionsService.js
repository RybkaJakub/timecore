const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { app } = require('electron');

const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'database.db');
const db = new sqlite3.Database(dbPath);

console.log(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS competitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT,
      time TEXT,
      type TEXT
    )
  `);
});

exports.getCompetitions = (callback) => {
  db.all(`SELECT * FROM competitions`, (err, rows) => {
    if (err) {
      console.error(err);
      callback([]);
    } else {
      callback(rows);
    }
  });
};

exports.createCompetition = (comp, callback) => {
  db.run(
    `INSERT INTO competitions (name, date, time, type) VALUES (?, ?, ?, ?)`,
    [comp.name, comp.date, comp.time, comp.type],
    function (err) {
      if (err) {
        console.error(err);
        callback(err, null);
      } else {
        callback(null, { id: this.lastID });
      }
    }
  );
};

exports.getCompetitionById = (id, callback) => {
  db.get(
    `SELECT * FROM competitions WHERE id = ?`,
    [id],
    (err, row) => {
      if (err) callback(err);
      else callback(null, row);
    }
  );
};