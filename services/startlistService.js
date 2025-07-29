const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../database/timecore.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    discipline TEXT NOT NULL
  )`);

    db.run(`CREATE TABLE IF NOT EXISTS startlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    lane INTEGER,
    heat INTEGER,
    start_number INTEGER,
    name TEXT,
    surname TEXT,
    team TEXT,
    FOREIGN KEY (competition_id) REFERENCES competitions(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`);

    db.run(`CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    startlist_id INTEGER NOT NULL,
    time_first REAL,
    time_second REAL,
    is_n_first BOOLEAN DEFAULT 0,
    is_n_second BOOLEAN DEFAULT 0,
    final_time REAL,
    place INTEGER,
    time_lp REAL,
    time_pp REAL,
    is_n BOOLEAN DEFAULT 0,
    FOREIGN KEY (startlist_id) REFERENCES startlist(id)
  )`);

    db.get(`SELECT COUNT(*) as count FROM categories`, [], (err, row) => {
        if (err) {
            console.error(err);
            return;
        }

        if (row.count === 0) {
            const categories = [
                ['Mladší žáci', 'Požární útok'],
                ['Starší žáci', 'Požární útok'],
                ['Mladší žáci - 60 m překážek', 'Běh'],
                ['Mladší žákyně - 60 m překážek', 'Běh'],
                ['Starší žáci - 60 m překážek', 'Běh'],
                ['Starší žákyně - 60 m překážek', 'Běh']
            ];

            const stmt = db.prepare(`INSERT INTO categories (name, discipline) VALUES (?, ?)`);
            categories.forEach(([name, discipline]) => {
                stmt.run([name, discipline], (err) => {
                    if (err) console.error(err);
                    else console.log(`Kategorie "${name}" vložena.`);
                });
            });
            stmt.finalize();
        } else {
            console.log(`Tabulka categories už má data, nevkládám znovu.`);
        }
    });

});

exports.getCategoriesByDiscipline = (discipline, callback) => {
    db.all(`SELECT * FROM categories WHERE discipline = ?`, [discipline], (err, rows) => {
        if (err) return callback(err, []);
        callback(null, rows);
    });
};



exports.addCategory = (name, callback) => {
    db.run(`INSERT INTO categories (name) VALUES (?)`, [name], function (err) {
        if (err) return callback(err);
        callback(null, { id: this.lastID });
    });
};

exports.addStartlistEntry = (entry, callback) => {
    db.run(`
        INSERT INTO startlist 
          (competition_id, category_id, lane, name, surname, team, start_number)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        [
            entry.competition_id,
            entry.category_id,
            entry.lane ?? null,
            entry.name ?? null,
            entry.surname ?? null,
            entry.team ?? null,
            entry.start_number ?? null
        ],
        function (err) {
            if (err) return callback(err);
            callback(null, { id: this.lastID });
        }
    );

};

exports.getStartlist = (competitionId, categoryId, callback) => {
    db.all(`
    SELECT * FROM startlist
    WHERE competition_id = ? AND category_id = ?
    ORDER BY lane
  `, [competitionId, categoryId], (err, rows) => {
        if (err) return callback(err, []);
        callback(null, rows);
    });
};

exports.getCategoryById = (id, callback) => {
db.get('SELECT id, name FROM categories WHERE id = ?', [id], (err, row) => {
    if (err) return callback(err);
    callback(null, row);
  });
}
exports.saveResult = (payload) => {
    return new Promise((resolve, reject) => {
      const {
        startlist_id,
        discipline,
        time_lp,
        time_pp,
        is_n,
        time_first,
        time_second,
        is_n_first,
        is_n_second,
        final_time,
        place
      } = payload;
  
      let sql, values;
  
      if (discipline === 'Požární útok') {
        sql = `
          INSERT INTO results
            (startlist_id, time_lp, time_pp, is_n, final_time)
          VALUES (?, ?, ?, ?, ?)
        `;
        values = [startlist_id, time_lp, time_pp, is_n ? 1 : 0, final_time];
  
      } else if (discipline === 'Běh') {
        sql = `
          INSERT INTO results
            (startlist_id, time_first, time_second, is_n_first, is_n_second, final_time, place)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        values = [
          startlist_id,
          time_first,
          time_second,
          is_n_first ? 1 : 0,
          is_n_second ? 1 : 0,
          final_time,
          place
        ];
      } else {
        return reject(new Error("Neznámá disciplína"));
      }
  
      db.run(sql, values, function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      });
    });
  };
  

exports.getResults = (competitionId, categoryId, callback) => {
    db.all(`
    SELECT s.*, r.time, r.is_n
    FROM startlist s
    LEFT JOIN results r ON r.startlist_id = s.id
    WHERE s.competition_id = ? AND s.category_id = ?
    ORDER BY s.lane
  `, [competitionId, categoryId], (err, rows) => {
        if (err) return callback(err, []);
        callback(null, rows);
    });
};

exports.updateStartlistEntry = (id, updatedFields) => {
    return new Promise((resolve, reject) => {
        const keys = Object.keys(updatedFields);
        const values = Object.values(updatedFields);

        if (keys.length === 0) return resolve({ changes: 0 });

        const setClause = keys.map(k => `${k} = ?`).join(', ');
        values.push(id);

        db.run(
            `UPDATE startlist SET ${setClause} WHERE id = ?`,
            values,
            function (err) {
                if (err) return reject(err);
                resolve({ changes: this.changes });
            }
        );
    });
};



exports.deleteStartlistEntry = (id, cb) => {
    db.run(`DELETE FROM startlist WHERE id = ?`, [id], cb);
};

exports.getResultsForCategory = (competitionId, categoryId) => {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT s.*, r.*
        FROM startlist s
        LEFT JOIN results r ON r.startlist_id = s.id
        WHERE s.competition_id = ? AND s.category_id = ?
      `, [competitionId, categoryId], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  };


exports.getResultsByStartlistIds = (startlistIds, callback) => {
  const placeholders = startlistIds.map(() => '?').join(',');
  const sql = `SELECT * FROM results WHERE startlist_id IN (${placeholders})`;
  db.all(sql, startlistIds, callback);
}
