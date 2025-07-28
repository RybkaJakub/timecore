const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database/timecore.db');
console.log('DB PATH:', dbPath);
const db = new sqlite3.Database(dbPath);


// Create table if not exists
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

module.exports = db;
