const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { app } = require('electron');
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'database.db');
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
  const sql = `
    SELECT
      s.*,
      COALESCE(
        json_group_array(
          json_object(
            'id', r.id,
            'startlist_id', r.startlist_id,
            'time_first', r.time_first,
            'time_second', r.time_second,
            'is_n_first', r.is_n_first,
            'is_n_second', r.is_n_second,
            'final_time', r.final_time,
            'place', r.place,
            'time_lp', r.time_lp,
            'time_pp', r.time_pp,
            'is_n', r.is_n
          )
        ),
        '[]'
      ) AS results
    FROM startlist s
    LEFT JOIN results r ON r.startlist_id = s.id
    WHERE s.competition_id = ? AND s.category_id = ?
    GROUP BY s.id
    ORDER BY s.lane
  `;

  db.all(sql, [competitionId, categoryId], (err, rows) => {
    if (err) return callback(err, []);
    for (const row of rows) {
      try { row.results = JSON.parse(row.results || '[]'); }
      catch { row.results = []; }
    }
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

    if (!startlist_id) return reject(new Error('startlist_id je povinné'));

    const toNum = v => {
      if (v === '' || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;   // nikdy nevracej NaN
    };

    if (discipline === 'Požární útok') {
      const lp = toNum(time_lp);
      const pp = toNum(time_pp);
      const n  = is_n ? 1 : 0;

      const finalPU = n
        ? 999.999
        : ([lp, pp].filter(v => v != null).length ? Math.max(lp ?? -Infinity, pp ?? -Infinity) : 999.999);

      db.get(`SELECT id FROM results WHERE startlist_id = ?`, [startlist_id], (err, row) => {
        if (err) return reject(err);

        if (row) {
          const sql = `
            UPDATE results
            SET time_lp = ?, time_pp = ?, is_n = ?, final_time = ?, place = COALESCE(?, place)
            WHERE id = ?
          `;
          const values = [lp, pp, n, finalPU, place ?? null, row.id];
          console.log('[DB] UPDATE results ->', values);
          db.run(sql, values, function (uErr) {
            if (uErr) return reject(uErr);
            return resolve({ success: true, id: row.id, updated: true, final_time: finalPU });
          });
          return;
        }

        const insertSql = `
          INSERT INTO results (startlist_id, time_lp, time_pp, is_n, final_time, place)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        const insertValues = [startlist_id, lp, pp, n, finalPU, place ?? null];
        console.log('[DB] INSERT results ->', insertValues);
        db.run(insertSql, insertValues, function (iErr) {
          if (iErr) return reject(iErr);
          return resolve({ success: true, id: this.lastID, inserted: true, final_time: finalPU });
        });
      });

      return; // ⬅ důležité
    }

    if (discipline === 'Běh') {
      const computeFinal = (t1, n1, t2, n2) => {
        const v1 = (n1 ? null : toNum(t1));
        const v2 = (n2 ? null : toNum(t2));
        if (v1 == null && v2 == null) return 999.999;
        if (v1 == null) return v2;
        if (v2 == null) return v1;
        return Math.min(v1, v2);
      };

      db.get(
        `SELECT id, time_first, time_second, is_n_first, is_n_second FROM results WHERE startlist_id = ?`,
        [startlist_id],
        (err, row) => {
          if (err) return reject(err);

          if (row && (time_second !== undefined && time_second !== null)) {
            const newTimeSecond = toNum(time_second);
            const newIsNSecond = is_n_second ? 1 : 0;

            const currentFirst = toNum(row.time_first);
            const currentIsN1 = row.is_n_first ? 1 : 0;

            const newFinal = computeFinal(currentFirst, currentIsN1, newTimeSecond, newIsNSecond);

            const sql = `
              UPDATE results
              SET time_second = ?, is_n_second = ?, final_time = ?, place = COALESCE(?, place)
              WHERE id = ?
            `;
            const values = [newTimeSecond, newIsNSecond, newFinal, place ?? null, row.id];
            console.log('[DB] UPDATE běh-2 ->', values);
            return db.run(sql, values, function (uErr) {
              if (uErr) return reject(uErr);
              return resolve({ success: true, id: row.id, updated: true, which: 'second', final_time: newFinal });
            });
          }

          if (row && (time_first !== undefined && time_first !== null)) {
            const newTimeFirst = toNum(time_first);
            const newIsNFirst = is_n_first ? 1 : 0;

            const currentSecond = toNum(row.time_second);
            const currentIsN2 = row.is_n_second ? 1 : 0;

            const newFinal = computeFinal(newTimeFirst, newIsNFirst, currentSecond, currentIsN2);

            const sql = `
              UPDATE results
              SET time_first = ?, is_n_first = ?, final_time = ?, place = COALESCE(?, place)
              WHERE id = ?
            `;
            const values = [newTimeFirst, newIsNFirst, newFinal, place ?? null, row.id];
            console.log('[DB] UPDATE běh-1 ->', values);
            return db.run(sql, values, function (uErr) {
              if (uErr) return reject(uErr);
              return resolve({ success: true, id: row.id, updated: true, which: 'first', final_time: newFinal });
            });
          }

          const t1 = toNum(time_first);
          const n1 = is_n_first ? 1 : 0;
          const t2 = toNum(time_second);
          const n2 = is_n_second ? 1 : 0;
          const final = (t1 !== null || t2 !== null)
            ? computeFinal(t1, n1, t2, n2)
            : (toNum(final_time));

          const insertSql = `
            INSERT INTO results (startlist_id, time_first, time_second, is_n_first, is_n_second, final_time, place)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `;
          const insertValues = [startlist_id, t1, t2, n1, n2, final, place ?? null];
          console.log('[DB] INSERT běh ->', insertValues);
          return db.run(insertSql, insertValues, function (iErr) {
            if (iErr) return reject(iErr);
            return resolve({ success: true, id: this.lastID, inserted: true, final_time: final });
          });
        }
      );

      return;
    }

    // neznámá disciplína
    reject(new Error('Neznámá discipline: ' + discipline));
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
