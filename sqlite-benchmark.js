const Benchmark = require('benchmark');
const Database = require('better-sqlite3');
const Knex = require('knex');
const { Kysely, SqliteDialect } = require('kysely');
const Sqlite = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Database file paths
const NATIVE_DB_PATH = path.join(__dirname, 'native.db');
const NATIVE_WAL_DB_PATH = path.join(__dirname, 'native-wal.db');
const KNEX_WAL_DB_PATH = path.join(__dirname, 'knex-wal.db');
const KYSELY_WAL_DB_PATH = path.join(__dirname, 'kysely-wal.db');
const KYSELY_GENERIC_WAL_DB_PATH = path.join(__dirname, 'kysely-generic-wal.db');

// Clean up existing database files
function cleanupFiles() {
  [NATIVE_DB_PATH, NATIVE_WAL_DB_PATH, KNEX_WAL_DB_PATH, KYSELY_WAL_DB_PATH, KYSELY_GENERIC_WAL_DB_PATH].forEach(file => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    // Also clean up WAL and SHM files
    if (fs.existsSync(file + '-wal')) fs.unlinkSync(file + '-wal');
    if (fs.existsSync(file + '-shm')) fs.unlinkSync(file + '-shm');
  });
}

cleanupFiles();

// Initialize databases
// Native better-sqlite3 (DELETE journal mode - default)
const nativeDb = new Database(NATIVE_DB_PATH);

// Native better-sqlite3 (WAL mode)
const nativeWalDb = new Database(NATIVE_WAL_DB_PATH);
nativeWalDb.pragma('journal_mode = WAL');

const knexDb = Knex({
  client: 'better-sqlite3',
  connection: { filename: KNEX_WAL_DB_PATH },
  useNullAsDefault: true
});

// Set WAL mode for Knex - need to run PRAGMA on the actual connection
const knexDbConnection = new Sqlite(KNEX_WAL_DB_PATH);
knexDbConnection.pragma('journal_mode = WAL');
knexDbConnection.close();

// For Kysely, we need to use a connection to run raw queries
// We'll create the table using Kysely's schema builder alternative - raw SQL through better-sqlite3
const kyselyDbConnection = new Sqlite(KYSELY_WAL_DB_PATH);
kyselyDbConnection.pragma('journal_mode = WAL');

const kyselyDb = new Kysely({
  dialect: new SqliteDialect({
    database: kyselyDbConnection
  })
});

const kyselyGenericDbConnection = new Sqlite(KYSELY_GENERIC_WAL_DB_PATH);
kyselyGenericDbConnection.pragma('journal_mode = WAL');

const kyselyGenericDb = new Kysely({
  dialect: new SqliteDialect({
    database: kyselyGenericDbConnection
  })
});

// Database schema interface for Kysely
/**
 * @typedef {Object} UsersTable
 * @property {number} id
 * @property {string} name
 * @property {string} email
 * @property {number} age
 * @property {string} created_at
 */

/**
 * @typedef {Object} Database
 * @property {UsersTable} users
 * @property {UsersTable} cw_users
 */

// Create tables
async function setupDatabases() {
  const createTableSQL = `
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      age INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Native better-sqlite3 (DELETE journal mode - default)
  nativeDb.exec(createTableSQL);

  // Native better-sqlite3 (WAL mode)
  nativeWalDb.exec(createTableSQL);

  // Knex.js
  await knexDb.schema.createTable('users', table => {
    table.increments('id');
    table.string('name').notNullable();
    table.string('email').notNullable();
    table.integer('age');
    table.timestamp('created_at').defaultTo(knexDb.fn.now());
  });

  // Kysely - use raw SQLite connection for DDL
  kyselyDbConnection.exec(createTableSQL);

  // Kysely Generic - use raw SQLite connection for DDL
  kyselyGenericDbConnection.exec(createTableSQL);
}

// Generate random user data
function generateUser(i) {
  return {
    name: `User ${i}`,
    email: `user${i}@example.com`,
    age: Math.floor(Math.random() * 50) + 18
  };
}

// Benchmark suites
const insertSuite = new Benchmark.Suite('Insert Operations');
const selectSuite = new Benchmark.Suite('Select Operations');
const updateSuite = new Benchmark.Suite('Update Operations');
const deleteSuite = new Benchmark.Suite('Delete Operations');
const complexSuite = new Benchmark.Suite('Complex Operations');

// Number of records to use in benchmarks
const NUM_RECORDS = 100;

async function setupConcurrentTables() {
  const createConcurrentTableSQL = `
    CREATE TABLE IF NOT EXISTS cw_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      age INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  nativeDb.exec(createConcurrentTableSQL);
  nativeWalDb.exec(createConcurrentTableSQL);

  const knexExists = await knexDb.schema.hasTable('cw_users');
  if (!knexExists) {
    await knexDb.schema.createTable('cw_users', table => {
      table.increments('id');
      table.string('name').notNullable();
      table.string('email').notNullable();
      table.integer('age');
      table.timestamp('created_at').defaultTo(knexDb.fn.now());
    });
  }

  // Kysely - use raw SQLite connection for DDL
  kyselyDbConnection.exec(createConcurrentTableSQL);
  
  // Kysely Generic - use raw SQLite connection for DDL
  kyselyGenericDbConnection.exec(createConcurrentTableSQL);
}

async function runConcurrentWriteTest() {
  const WRITERS = 8;
  const WRITES_PER_WRITER = 200;
  
  function user(i) {
    return {
      name: `CW ${i}`,
      email: `cw${i}@example.com`,
      age: Math.floor(Math.random() * 50) + 18
    };
  }

  async function runEngine(name, createClients, insertOne) {
    const clients = createClients(WRITERS);
    const start = Date.now();
    let errors = 0;
    
    await Promise.all(clients.map((client, idx) => (async () => {
      for (let j = 0; j < WRITES_PER_WRITER; j++) {
        const u = user(idx * WRITES_PER_WRITER + j);
        try {
          await insertOne(client, u);
        } catch (e) {
          errors++;
        }
      }
    })()));
    
    const ms = Date.now() - start;
    const total = WRITERS * WRITES_PER_WRITER;
    const throughput = Math.round((total / ms) * 1000);
    console.log(`\nConcurrent Write (${name})`);
    console.log(`  total: ${total}, errors: ${errors}, ~${throughput.toLocaleString()} ops/sec`);
  }

  await setupConcurrentTables();

  await runEngine(
    'native (DELETE)',
    n => Array.from({ length: n }, () => new Database(NATIVE_DB_PATH)),
    async (db, u) => {
      db.prepare('INSERT INTO cw_users (name, email, age) VALUES (?, ?, ?)').run(u.name, u.email, u.age);
    }
  );

  await runEngine(
    'native-wal',
    n => Array.from({ length: n }, () => {
      const d = new Database(NATIVE_WAL_DB_PATH);
      d.pragma('journal_mode = WAL');
      return d;
    }),
    async (db, u) => {
      db.prepare('INSERT INTO cw_users (name, email, age) VALUES (?, ?, ?)').run(u.name, u.email, u.age);
    }
  );

  await runEngine(
    'knex-wal',
    n => Array.from({ length: n }, () => Knex({
      client: 'better-sqlite3',
      connection: { filename: KNEX_WAL_DB_PATH },
      useNullAsDefault: true
    })),
    async (k, u) => {
      await k('cw_users').insert(u);
    }
  );

  await runEngine(
    'kysely-wal',
    n => Array.from({ length: n }, () => {
      const conn = new Sqlite(KYSELY_WAL_DB_PATH);
      return new Kysely({
        dialect: new SqliteDialect({
          database: conn
        })
      });
    }),
    async (k, u) => {
      await k.insertInto('cw_users').values({ name: u.name, email: u.email, age: u.age }).execute();
    },
    k => k.destroy()
  );

  await runEngine(
    'kysely-generic-wal',
    n => Array.from({ length: n }, () => {
      const conn = new Sqlite(KYSELY_GENERIC_WAL_DB_PATH);
      return new Kysely({
        dialect: new SqliteDialect({
          database: conn
        })
      });
    }),
    async (k, u) => {
      await k.insertInto('cw_users').values({ name: u.name, email: u.email, age: u.age }).execute();
    },
    k => k.destroy()
  );
}

async function clearConcurrentTables() {
  try { nativeDb.exec('DELETE FROM cw_users'); } catch {}
  try { nativeWalDb.exec('DELETE FROM cw_users'); } catch {}
  try { await knexDb('cw_users').delete(); } catch {}
  try { kyselyDbConnection.exec('DELETE FROM cw_users'); } catch {}
  try { kyselyGenericDbConnection.exec('DELETE FROM cw_users'); } catch {}
}

async function seedConcurrentTables(rows) {
  const users = Array.from({ length: rows }, (_, i) => ({
    name: `Seed ${i + 1}`,
    email: `seed${i + 1}@example.com`,
    age: Math.floor(Math.random() * 50) + 18
  }));

  // Native (DELETE)
  const ni = nativeDb.prepare('INSERT INTO cw_users (name, email, age) VALUES (?, ?, ?)');
  const nt = nativeDb.transaction(arr => {
    for (const u of arr) {
      ni.run(u.name, u.email, u.age);
    }
  });
  nt(users);

  // Native (WAL)
  const niw = nativeWalDb.prepare('INSERT INTO cw_users (name, email, age) VALUES (?, ?, ?)');
  const ntw = nativeWalDb.transaction(arr => {
    for (const u of arr) {
      niw.run(u.name, u.email, u.age);
    }
  });
  ntw(users);

  // Knex
  const BATCH = 500;
  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    await knexDb('cw_users').insert(batch);
  }

  // Kysely - use raw SQLite for batch inserts
  const ki = kyselyDbConnection.prepare('INSERT INTO cw_users (name, email, age) VALUES (?, ?, ?)');
  const kt = kyselyDbConnection.transaction(arr => {
    for (const u of arr) {
      ki.run(u.name, u.email, u.age);
    }
  });
  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    kt(batch);
  }

  // Kysely Generic
  const kgi = kyselyGenericDbConnection.prepare('INSERT INTO cw_users (name, email, age) VALUES (?, ?, ?)');
  const kgt = kyselyGenericDbConnection.transaction(arr => {
    for (const u of arr) {
      kgi.run(u.name, u.email, u.age);
    }
  });
  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    kgt(batch);
  }
}

async function runConcurrentUpdateTest() {
  const WRITERS = 8;
  const WRITES_PER_WRITER = 200;
  const TOTAL_ROWS = WRITERS * WRITES_PER_WRITER;
  
  function randId() { return Math.floor(Math.random() * TOTAL_ROWS) + 1; }
  function randAge() { return Math.floor(Math.random() * 50) + 18; }
  
  async function runEngine(name, createClients, updateOne, cleanup) {
    const clients = createClients(WRITERS);
    const start = Date.now();
    let errors = 0;
    
    await Promise.all(clients.map((client) => (async () => {
      for (let j = 0; j < WRITES_PER_WRITER; j++) {
        const id = randId();
        const age = randAge();
        try {
          await updateOne(client, id, age);
        } catch (e) {
          errors++;
        }
      }
    })()));
    
    const ms = Date.now() - start;
    const total = WRITERS * WRITES_PER_WRITER;
    const throughput = Math.round((total / ms) * 1000);
    console.log(`\nConcurrent Update (${name})`);
    console.log(`  total: ${total}, errors: ${errors}, ~${throughput.toLocaleString()} ops/sec`);
    if (cleanup) clients.forEach(c => cleanup(c));
  }

  await setupConcurrentTables();
  await clearConcurrentTables();
  await seedConcurrentTables(TOTAL_ROWS);

  await runEngine(
    'native (DELETE)',
    n => Array.from({ length: n }, () => new Database(NATIVE_DB_PATH)),
    async (db, id, age) => {
      db.prepare('UPDATE cw_users SET age = ? WHERE id = ?').run(age, id);
    },
    db => db.close()
  );

  await runEngine(
    'native-wal',
    n => Array.from({ length: n }, () => {
      const d = new Database(NATIVE_WAL_DB_PATH);
      d.pragma('journal_mode = WAL');
      return d;
    }),
    async (db, id, age) => {
      db.prepare('UPDATE cw_users SET age = ? WHERE id = ?').run(age, id);
    },
    db => db.close()
  );

  await runEngine(
    'knex-wal',
    n => Array.from({ length: n }, () => Knex({
      client: 'better-sqlite3',
      connection: { filename: KNEX_WAL_DB_PATH },
      useNullAsDefault: true
    })),
    async (k, id, age) => {
      await k('cw_users').where('id', id).update({ age });
    },
    k => k.destroy()
  );

  await runEngine(
    'kysely-wal',
    n => Array.from({ length: n }, () => {
      const k = new Kysely({
        dialect: new SqliteDialect({
          database: new Sqlite(KYSELY_WAL_DB_PATH)
        })
      });
      return k;
    }),
    async (k, id, age) => {
      await k.updateTable('cw_users').set({ age }).where('id', '=', id).execute();
    },
    k => k.destroy()
  );

  await runEngine(
    'kysely-generic-wal',
    n => Array.from({ length: n }, () => {
      const k = new Kysely({
        dialect: new SqliteDialect({
          database: new Sqlite(KYSELY_GENERIC_WAL_DB_PATH)
        })
      });
      return k;
    }),
    async (k, id, age) => {
      await k.updateTable('cw_users').set({ age }).where('id', '=', id).execute();
    },
    k => k.destroy()
  );
}

// Setup insert benchmarks
function setupInsertBenchmarks() {
  const nativeInsert = nativeDb.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');
  const nativeWalInsert = nativeWalDb.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');

  // Kysely prepared statements
  const kyselyInsert = kyselyDbConnection.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');
  const kyselyGenericInsert = kyselyGenericDbConnection.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');

  insertSuite
    .add('Native better-sqlite3 (DELETE) - Single Insert', {
      minSamples: 5,
      fn: function() {
        const user = generateUser(Math.random());
        nativeInsert.run(user.name, user.email, user.age);
      }
    })
    .add('Native better-sqlite3 (WAL) - Single Insert', {
      minSamples: 5,
      fn: function() {
        const user = generateUser(Math.random());
        nativeWalInsert.run(user.name, user.email, user.age);
      }
    })
    .add('Knex.js (WAL) - Single Insert', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const user = generateUser(Math.random());
        knexDb('users').insert(user)
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Knex insert error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Kysely (WAL) - Single Insert', {
      minSamples: 5,
      fn: function() {
        const user = generateUser(Math.random());
        kyselyInsert.run(user.name, user.email, user.age);
      }
    })
    .add('Kysely Generic (WAL) - Single Insert', {
      minSamples: 5,
      fn: function() {
        const user = generateUser(Math.random());
        kyselyGenericInsert.run(user.name, user.email, user.age);
      }
    })
    .add('Native better-sqlite3 (DELETE) - Batch Insert (Transaction)', {
      minSamples: 5,
      fn: function() {
        const transaction = nativeDb.transaction((users) => {
          for (const user of users) {
            nativeInsert.run(user.name, user.email, user.age);
          }
        });
        const users = Array.from({ length: 5 }, (_, i) => generateUser(i));
        transaction(users);
      }
    })
    .add('Native better-sqlite3 (WAL) - Batch Insert (Transaction)', {
      minSamples: 5,
      fn: function() {
        const transaction = nativeWalDb.transaction((users) => {
          for (const user of users) {
            nativeWalInsert.run(user.name, user.email, user.age);
          }
        });
        const users = Array.from({ length: 5 }, (_, i) => generateUser(i));
        transaction(users);
      }
    })
    .add('Knex.js (WAL) - Batch Insert', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const users = Array.from({ length: 5 }, (_, i) => generateUser(i));
        knexDb('users').insert(users)
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Knex batch insert error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Kysely (WAL) - Batch Insert (Transaction)', {
      minSamples: 5,
      fn: function() {
        const transaction = kyselyDbConnection.transaction((users) => {
          for (const user of users) {
            kyselyInsert.run(user.name, user.email, user.age);
          }
        });
        const users = Array.from({ length: 5 }, (_, i) => generateUser(i));
        transaction(users);
      }
    })
    .add('Kysely Generic (WAL) - Batch Insert (Transaction)', {
      minSamples: 5,
      fn: function() {
        const transaction = kyselyGenericDbConnection.transaction((users) => {
          for (const user of users) {
            kyselyGenericInsert.run(user.name, user.email, user.age);
          }
        });
        const users = Array.from({ length: 5 }, (_, i) => generateUser(i));
        transaction(users);
      }
    });
}

// Setup select benchmarks
function setupSelectBenchmarks() {
  const nativeSelectAll = nativeDb.prepare('SELECT * FROM users LIMIT 20');
  const nativeSelectById = nativeDb.prepare('SELECT * FROM users WHERE id = ?');
  const nativeSelectByAge = nativeDb.prepare('SELECT * FROM users WHERE age > ? LIMIT 20');
  
  const nativeWalSelectAll = nativeWalDb.prepare('SELECT * FROM users LIMIT 20');
  const nativeWalSelectById = nativeWalDb.prepare('SELECT * FROM users WHERE id = ?');
  const nativeWalSelectByAge = nativeWalDb.prepare('SELECT * FROM users WHERE age > ? LIMIT 20');
  
  // Kysely prepared statements
  const kyselySelectAll = kyselyDbConnection.prepare('SELECT * FROM users LIMIT 20');
  const kyselySelectById = kyselyDbConnection.prepare('SELECT * FROM users WHERE id = ?');
  const kyselySelectByAge = kyselyDbConnection.prepare('SELECT * FROM users WHERE age > ? LIMIT 20');
  
  const kyselyGenericSelectAll = kyselyGenericDbConnection.prepare('SELECT * FROM users LIMIT 20');
  const kyselyGenericSelectById = kyselyGenericDbConnection.prepare('SELECT * FROM users WHERE id = ?');
  const kyselyGenericSelectByAge = kyselyGenericDbConnection.prepare('SELECT * FROM users WHERE age > ? LIMIT 20');

  selectSuite
    .add('Native better-sqlite3 (DELETE) - Select All', {
      minSamples: 5,
      fn: function() {
        nativeSelectAll.all();
      }
    })
    .add('Native better-sqlite3 (WAL) - Select All', {
      minSamples: 5,
      fn: function() {
        nativeWalSelectAll.all();
      }
    })
    .add('Knex.js (WAL) - Select All', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        knexDb('users').limit(20).select('*')
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Knex select all error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Kysely (WAL) - Select All', {
      minSamples: 5,
      fn: function() {
        kyselySelectAll.all();
      }
    })
    .add('Kysely Generic (WAL) - Select All', {
      minSamples: 5,
      fn: function() {
        kyselyGenericSelectAll.all();
      }
    })
    .add('Native better-sqlite3 (DELETE) - Select By Id', {
      minSamples: 5,
      fn: function() {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        nativeSelectById.get(id);
      }
    })
    .add('Native better-sqlite3 (WAL) - Select By Id', {
      minSamples: 5,
      fn: function() {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        nativeWalSelectById.get(id);
      }
    })
    .add('Knex.js (WAL) - Select By Id', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        knexDb('users').where('id', id).first()
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Knex select by id error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Kysely (WAL) - Select By Id', {
      minSamples: 5,
      fn: function() {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        kyselySelectById.get(id);
      }
    })
    .add('Kysely Generic (WAL) - Select By Id', {
      minSamples: 5,
      fn: function() {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        kyselyGenericSelectById.get(id);
      }
    })
    .add('Native better-sqlite3 (DELETE) - Select By Condition', {
      minSamples: 5,
      fn: function() {
        nativeSelectByAge.all(30);
      }
    })
    .add('Native better-sqlite3 (WAL) - Select By Condition', {
      minSamples: 5,
      fn: function() {
        nativeWalSelectByAge.all(30);
      }
    })
    .add('Knex.js (WAL) - Select By Condition', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        knexDb('users').where('age', '>', 30).limit(20).select('*')
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Knex select by condition error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Kysely (WAL) - Select By Condition', {
      minSamples: 5,
      fn: function() {
        kyselySelectByAge.all(30);
      }
    })
    .add('Kysely Generic (WAL) - Select By Condition', {
      minSamples: 5,
      fn: function() {
        kyselyGenericSelectByAge.all(30);
      }
    });
}

// Setup update benchmarks
function setupUpdateBenchmarks() {
  const nativeUpdate = nativeDb.prepare('UPDATE users SET age = ? WHERE id = ?');
  const nativeWalUpdate = nativeWalDb.prepare('UPDATE users SET age = ? WHERE id = ?');
  
  // Kysely prepared statements
  const kyselyUpdate = kyselyDbConnection.prepare('UPDATE users SET age = ? WHERE id = ?');
  const kyselyGenericUpdate = kyselyGenericDbConnection.prepare('UPDATE users SET age = ? WHERE id = ?');

  updateSuite
    .add('Native better-sqlite3 (DELETE) - Update Single Record', {
      minSamples: 5,
      fn: function() {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        const age = Math.floor(Math.random() * 50) + 18;
        nativeUpdate.run(age, id);
      }
    })
    .add('Native better-sqlite3 (WAL) - Update Single Record', {
      minSamples: 5,
      fn: function() {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        const age = Math.floor(Math.random() * 50) + 18;
        nativeWalUpdate.run(age, id);
      }
    })
    .add('Knex.js (WAL) - Update Single Record', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        const age = Math.floor(Math.random() * 50) + 18;
        knexDb('users').where('id', id).update({ age })
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Knex update error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Kysely (WAL) - Update Single Record', {
      minSamples: 5,
      fn: function() {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        const age = Math.floor(Math.random() * 50) + 18;
        kyselyUpdate.run(age, id);
      }
    })
    .add('Kysely Generic (WAL) - Update Single Record', {
      minSamples: 5,
      fn: function() {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        const age = Math.floor(Math.random() * 50) + 18;
        kyselyGenericUpdate.run(age, id);
      }
    });
}

// Setup delete benchmarks
function setupDeleteBenchmarks() {
  const nativeDelete = nativeDb.prepare('DELETE FROM users WHERE id = ?');
  const nativeWalDelete = nativeWalDb.prepare('DELETE FROM users WHERE id = ?');
  
  // Kysely prepared statements
  const kyselyDelete = kyselyDbConnection.prepare('DELETE FROM users WHERE id = ?');
  const kyselyGenericDelete = kyselyGenericDbConnection.prepare('DELETE FROM users WHERE id = ?');

  deleteSuite
    .add('Native better-sqlite3 (DELETE) - Delete Single Record', {
      minSamples: 5,
      fn: function() {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        nativeDelete.run(id);
      }
    })
    .add('Native better-sqlite3 (WAL) - Delete Single Record', {
      minSamples: 5,
      fn: function() {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        nativeWalDelete.run(id);
      }
    })
    .add('Knex.js (WAL) - Delete Single Record', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        knexDb('users').where('id', id).delete()
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Knex delete error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Kysely (WAL) - Delete Single Record', {
      minSamples: 5,
      fn: function() {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        kyselyDelete.run(id);
      }
    })
    .add('Kysely Generic (WAL) - Delete Single Record', {
      minSamples: 5,
      fn: function() {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        kyselyGenericDelete.run(id);
      }
    });
}

// Setup complex query benchmarks
function setupComplexBenchmarks() {
  const nativeComplex = nativeDb.prepare(`
    SELECT
      COUNT(*) as count,
      AVG(age) as average_age,
      MIN(age) as min_age,
      MAX(age) as max_age
    FROM users
    WHERE age > ?
  `);
  
  const nativeWalComplex = nativeWalDb.prepare(`
    SELECT
      COUNT(*) as count,
      AVG(age) as average_age,
      MIN(age) as min_age,
      MAX(age) as max_age
    FROM users
    WHERE age > ?
  `);
  
  // Kysely prepared statements
  const kyselyComplex = kyselyDbConnection.prepare(`
    SELECT
      COUNT(*) as count,
      AVG(age) as average_age,
      MIN(age) as min_age,
      MAX(age) as max_age
    FROM users
    WHERE age > ?
  `);
  
  const kyselyGenericComplex = kyselyGenericDbConnection.prepare(`
    SELECT
      COUNT(*) as count,
      AVG(age) as average_age,
      MIN(age) as min_age,
      MAX(age) as max_age
    FROM users
    WHERE age > ?
  `);

  complexSuite
    .add('Native better-sqlite3 (DELETE) - Complex Query', {
      minSamples: 5,
      fn: function() {
        nativeComplex.get(30);
      }
    })
    .add('Native better-sqlite3 (WAL) - Complex Query', {
      minSamples: 5,
      fn: function() {
        nativeWalComplex.get(30);
      }
    })
    .add('Knex.js (WAL) - Complex Query', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        knexDb('users')
          .where('age', '>', 30)
          .select(
            knexDb.raw('COUNT(*) as count'),
            knexDb.raw('AVG(age) as average_age'),
            knexDb.raw('MIN(age) as min_age'),
            knexDb.raw('MAX(age) as max_age')
          )
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Knex complex query error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Kysely (WAL) - Complex Query', {
      minSamples: 5,
      fn: function() {
        kyselyComplex.get(30);
      }
    })
    .add('Kysely Generic (WAL) - Complex Query', {
      minSamples: 5,
      fn: function() {
        kyselyGenericComplex.get(30);
      }
    });
}

// Seed the databases with initial data
async function seedDatabases() {
  console.log(`Seeding databases with ${NUM_RECORDS} records...`);

  // Native (DELETE)
  const nativeInsert = nativeDb.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');
  const nativeTransaction = nativeDb.transaction((users) => {
    for (const user of users) {
      nativeInsert.run(user.name, user.email, user.age);
    }
  });

  // Native (WAL)
  const nativeWalInsert = nativeWalDb.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');
  const nativeWalTransaction = nativeWalDb.transaction((users) => {
    for (const user of users) {
      nativeWalInsert.run(user.name, user.email, user.age);
    }
  });

  const users = Array.from({ length: NUM_RECORDS }, (_, i) => generateUser(i));
  nativeTransaction(users);
  nativeWalTransaction(users);

  const BATCH_SIZE = 100;
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    await knexDb('users').insert(batch);
  }

  // Kysely - use raw SQLite for batch inserts
  const ki = kyselyDbConnection.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');
  const kt = kyselyDbConnection.transaction((arr) => {
    for (const user of arr) {
      ki.run(user.name, user.email, user.age);
    }
  });
  kt(users);

  // Kysely Generic
  const kgi = kyselyGenericDbConnection.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');
  const kgt = kyselyGenericDbConnection.transaction((arr) => {
    for (const user of arr) {
      kgi.run(user.name, user.email, user.age);
    }
  });
  kgt(users);
}

// Display benchmark results
function displayResults(suite) {
  console.log(`\n${suite.name}:`);
  suite.forEach(benchmark => {
    console.log(`  ${benchmark.name}: ${Math.round(benchmark.hz).toLocaleString()} ops/sec ±${benchmark.stats.rme.toFixed(2)}% (${benchmark.stats.sample.length} runs sampled)`);
  });
}

// Run all benchmarks
async function runBenchmarks() {
  try {
    console.log('Setting up databases (all WAL mode)...');
    await setupDatabases();

    // Verify journal modes
    console.log('\n=== Journal Mode Verification ===');
    console.log(`Native (DELETE): ${nativeDb.pragma('journal_mode', { simple: true })}`);
    console.log(`Native WAL: ${nativeWalDb.pragma('journal_mode', { simple: true })}`);
    
    const knexJournalMode = knexDb.raw('PRAGMA journal_mode').toSQL().toNative();
    const knexCheckDb = new Sqlite(KNEX_WAL_DB_PATH);
    console.log(`Knex WAL: ${knexCheckDb.pragma('journal_mode', { simple: true })}`);
    knexCheckDb.close();
    
    console.log(`Kysely WAL: ${kyselyDbConnection.pragma('journal_mode', { simple: true })}`);
    console.log(`Kysely Generic WAL: ${kyselyGenericDbConnection.pragma('journal_mode', { simple: true })}`);
    console.log('==============================\n');

    console.log('Seeding databases...');
    await seedDatabases();

    console.log('Setting up benchmarks...');
    setupInsertBenchmarks();
    setupSelectBenchmarks();
    setupUpdateBenchmarks();
    setupDeleteBenchmarks();
    setupComplexBenchmarks();

    console.log('\nRunning benchmarks...');
    console.log('This may take a while...\n');

    insertSuite
      .on('complete', function() {
        displayResults(this);
        selectSuite.run({ async: true });
      })
      .run({ async: true });

    selectSuite
      .on('complete', function() {
        displayResults(this);
        updateSuite.run({ async: true });
      });

    updateSuite
      .on('complete', function() {
        displayResults(this);
        deleteSuite.run({ async: true });
      });

    deleteSuite
      .on('complete', function() {
        displayResults(this);
        complexSuite.run({ async: true });
      });

    complexSuite
      .on('complete', async function() {
        displayResults(this);

        console.log('\n=== Running Concurrent Stress Tests ===');
        
        console.log('\nRunning concurrent write test...');
        await runConcurrentWriteTest();
        
        console.log('\nRunning concurrent update test...');
        await runConcurrentUpdateTest();

        console.log('\n=== Benchmark Complete! ===');

        // Cleanup
        nativeDb.close();
        nativeWalDb.close();
        await knexDb.destroy();
        kyselyDbConnection.close();
        kyselyGenericDbConnection.close();
      });

  } catch (error) {
    console.error('Error running benchmarks:', error);

    nativeDb.close();
    nativeWalDb.close();
    await knexDb.destroy();
    kyselyDbConnection.close();
    kyselyGenericDbConnection.close();
  }
}

// Run the benchmarks
runBenchmarks();
