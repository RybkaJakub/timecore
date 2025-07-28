const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'timecore.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  const fs = require('fs');
  const migrations = fs.readFileSync(path.join(__dirname, 'migrations.sql'), 'utf-8');
  db.exec(migrations);
});

module.exports = db;
