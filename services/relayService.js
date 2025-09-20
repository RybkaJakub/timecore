const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { app } = require('electron');

const dbPath = path.join(app.getPath('userData'), 'database.db');
const db = new sqlite3.Database(dbPath);

// === SCHEMA ===
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS competitionRelay (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competition_id INTEGER NOT NULL UNIQUE,
      type TEXT CHECK(type IN ('4x60','pairs')) NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS relay (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      startlist_id INTEGER NOT NULL UNIQUE,
      discipline TEXT CHECK(discipline IN ('4x60','pairs')),
      attempt1_time REAL,
      attempt1_valid INTEGER DEFAULT 1,
      attempt2_time REAL,
      attempt2_valid INTEGER DEFAULT 1,
      final_time REAL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (startlist_id) REFERENCES startlist(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_relay_startlist ON relay(startlist_id)`);
});

// helpers
function run(sql, params, cb){ db.run(sql, params, function(err){ if(err) cb(err); else cb(null,{changes:this.changes,lastID:this.lastID}); }); }
function get(sql, params, cb){ db.get(sql, params, (e,r)=>cb(e,r)); }
function all(sql, params, cb){ db.all(sql, params, (e,r)=>cb(e,r)); }

// veřejné API
exports.getCompetitionRelayType = (competitionId, cb) => {
  get(`SELECT type FROM competitionRelay WHERE competition_id = ?`, [competitionId], (err, row) => {
    if (err) return cb(err);
    cb(null, row ? row.type : null);
  });
};

exports.setCompetitionRelayType = (competitionId, type, cb) => {
  run(`
    INSERT INTO competitionRelay (competition_id, type)
    VALUES (?, ?)
    ON CONFLICT(competition_id) DO UPDATE SET type=excluded.type
  `, [competitionId, type], (err) => {
    if (err) return cb(err);
    cb(null, true);
  });
};

// načtení dat do tabulky – join na startlist
exports.listRowsWithRank = (competitionId, categoryId, cb) => {
  all(`
    SELECT
      s.id AS startlist_id,
      s.start_number,
      s.team,
      r.discipline,
      r.attempt1_time, r.attempt1_valid,
      r.attempt2_time, r.attempt2_valid,
      r.final_time
    FROM startlist s
    LEFT JOIN relay r ON r.startlist_id = s.id
    WHERE s.competition_id = ? AND s.category_id = ?
    ORDER BY s.start_number ASC
  `, [competitionId, categoryId], (err, rows) => {
    if (err) return cb(err);
    cb(null, rows);
  });
};

// upsert pokusu + přepočet finále (min z platných, jinak 999.999)
exports.upsertRelayPartial = ({ startlist_id, discipline, attempt, time, valid }, cb) => {
  db.serialize(() => {
    run(`
      INSERT INTO relay (startlist_id, discipline)
      VALUES (?, ?)
      ON CONFLICT(startlist_id) DO NOTHING
    `, [startlist_id, discipline], (err) => {
      if (err) return cb(err);

      const colTime  = attempt === 1 ? 'attempt1_time'  : 'attempt2_time';
      const colValid = attempt === 1 ? 'attempt1_valid' : 'attempt2_valid';

      // ❗ už NEPŘEPISUJEME čas na 999.999 při neplatném pokusu
      run(`
        UPDATE relay
           SET ${colTime} = ?,
               ${colValid} = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE startlist_id = ?
      `, [Number.isFinite(Number(time)) ? Number(time) : null, valid ? 1 : 0, startlist_id], (err2) => {
        if (err2) return cb(err2);

        // přepočet final_time = min z platných pokusů
        get(`SELECT attempt1_time, attempt1_valid, attempt2_time, attempt2_valid
             FROM relay WHERE startlist_id = ?`,
          [startlist_id], (err3, row) => {
            if (err3) return cb(err3);
            const arr=[];
            if (row?.attempt1_valid && Number.isFinite(Number(row?.attempt1_time))) arr.push(Number(row.attempt1_time));
            if (row?.attempt2_valid && Number.isFinite(Number(row?.attempt2_time))) arr.push(Number(row.attempt2_time));
            const final = arr.length ? Math.min(...arr) : null; // žádný platný -> null

            run(`UPDATE relay SET final_time = ?, updated_at=CURRENT_TIMESTAMP WHERE startlist_id = ?`,
              [final, startlist_id], (err4) => {
                if (err4) return cb(err4);
                cb(null, { ok:true, final });
              });
          });
      });
    });
  });
};
