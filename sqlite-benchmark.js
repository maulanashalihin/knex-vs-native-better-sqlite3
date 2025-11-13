const Benchmark = require('benchmark');
const Database = require('better-sqlite3');
const Knex = require('knex');
const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

// Database file paths
const NATIVE_DB_PATH = path.join(__dirname, 'native.db');
const KNEX_DB_PATH = path.join(__dirname, 'knex.db');
const LIBSQL_DB_PATH = path.join(__dirname, 'libsql.db');
const NATIVE_WAL_DB_PATH = path.join(__dirname, 'native-wal.db');
const KNEX_WAL_DB_PATH = path.join(__dirname, 'knex-wal.db');

// Clean up existing database files
if (fs.existsSync(NATIVE_DB_PATH)) fs.unlinkSync(NATIVE_DB_PATH);
if (fs.existsSync(KNEX_DB_PATH)) fs.unlinkSync(KNEX_DB_PATH);
if (fs.existsSync(LIBSQL_DB_PATH)) fs.unlinkSync(LIBSQL_DB_PATH);
if (fs.existsSync(NATIVE_WAL_DB_PATH)) fs.unlinkSync(NATIVE_WAL_DB_PATH);
if (fs.existsSync(KNEX_WAL_DB_PATH)) fs.unlinkSync(KNEX_WAL_DB_PATH);

// Initialize databases
const nativeDb = new Database(NATIVE_DB_PATH);
const knexDb = Knex({
  client: 'better-sqlite3',
  connection: {
    filename: KNEX_DB_PATH
  },
  useNullAsDefault: true
});
const libsqlDb = createClient({ url: `file:${LIBSQL_DB_PATH}` });
const nativeWalDb = new Database(NATIVE_WAL_DB_PATH);
nativeWalDb.pragma('journal_mode = WAL');
const knexWalDb = Knex({
  client: 'better-sqlite3',
  connection: { filename: KNEX_WAL_DB_PATH },
  useNullAsDefault: true
});

// Create tables
async function setupDatabases() {
  // Native better-sqlite3 setup
  nativeDb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      age INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Knex.js setup
  await knexDb.schema.createTable('users', table => {
    table.increments('id');
    table.string('name').notNullable();
    table.string('email').notNullable();
    table.integer('age');
    table.timestamp('created_at').defaultTo(knexDb.fn.now());
  });
  await libsqlDb.execute(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      age INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await knexWalDb.raw('PRAGMA journal_mode = WAL');
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

// Helper function to properly benchmark async operations
function benchmarkAsync(fn) {
  return {
    defer: true,
    fn: function(deferred) {
      Promise.resolve(fn())
        .then(() => deferred.resolve())
        .catch(err => {
          console.error('Benchmark error:', err);
          deferred.resolve();
        });
    }
  };
}

// Number of records to use in benchmarks
const NUM_RECORDS = 100;

async function setupConcurrentTables() {
  nativeDb.exec(`
    CREATE TABLE IF NOT EXISTS cw_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      age INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await knexDb.schema.hasTable('cw_users').then(async exists => {
    if (!exists) {
      await knexDb.schema.createTable('cw_users', table => {
        table.increments('id');
        table.string('name').notNullable();
        table.string('email').notNullable();
        table.integer('age');
        table.timestamp('created_at').defaultTo(knexDb.fn.now());
      });
    }
  });
  await libsqlDb.execute(`
    CREATE TABLE IF NOT EXISTS cw_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      age INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  nativeWalDb.exec(`
    CREATE TABLE IF NOT EXISTS cw_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      age INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await knexWalDb.schema.hasTable('cw_users').then(async exists => {
    if (!exists) {
      await knexWalDb.schema.createTable('cw_users', table => {
        table.increments('id');
        table.string('name').notNullable();
        table.string('email').notNullable();
        table.integer('age');
        table.timestamp('created_at').defaultTo(knexWalDb.fn.now());
      });
    }
  });
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
    console.log(`  total: ${total}, errors: ${errors}, throughput: ${throughput} ops/sec`);
  }
  await setupConcurrentTables();
  await runEngine(
    'native',
    n => Array.from({ length: n }, () => new Database(NATIVE_DB_PATH)),
    async (db, u) => { db.prepare('INSERT INTO cw_users (name, email, age) VALUES (?, ?, ?)').run(u.name, u.email, u.age); }
  );
  await runEngine(
    'native-wal',
    n => Array.from({ length: n }, () => { const d = new Database(NATIVE_WAL_DB_PATH); d.pragma('journal_mode = WAL'); return d; }),
    async (db, u) => { db.prepare('INSERT INTO cw_users (name, email, age) VALUES (?, ?, ?)').run(u.name, u.email, u.age); }
  );
  await runEngine(
    'knex',
    n => Array.from({ length: n }, () => Knex({ client: 'better-sqlite3', connection: { filename: KNEX_DB_PATH }, useNullAsDefault: true })),
    async (k, u) => { await k('cw_users').insert(u); }
  );
  await runEngine(
    'knex-wal',
    n => Array.from({ length: n }, () => Knex({ client: 'better-sqlite3', connection: { filename: KNEX_WAL_DB_PATH }, useNullAsDefault: true })),
    async (k, u) => { await k('cw_users').insert(u); }
  );
  await runEngine(
    'libsql',
    n => Array.from({ length: n }, () => createClient({ url: `file:${LIBSQL_DB_PATH}` })),
    async (c, u) => { await c.execute({ sql: 'INSERT INTO cw_users (name, email, age) VALUES (?, ?, ?)', args: [u.name, u.email, u.age] }); }
  );
}

async function clearConcurrentTables() {
  try { nativeDb.exec('DELETE FROM cw_users'); } catch {}
  try { await knexDb('cw_users').delete(); } catch {}
  try { await libsqlDb.execute('DELETE FROM cw_users'); } catch {}
  try { nativeWalDb.exec('DELETE FROM cw_users'); } catch {}
  try { await knexWalDb('cw_users').delete(); } catch {}
}

async function seedConcurrentTables(rows) {
  const users = Array.from({ length: rows }, (_, i) => ({
    name: `Seed ${i + 1}`,
    email: `seed${i + 1}@example.com`,
    age: Math.floor(Math.random() * 50) + 18
  }));
  const ni = nativeDb.prepare('INSERT INTO cw_users (name, email, age) VALUES (?, ?, ?)');
  const nt = nativeDb.transaction(arr => { for (const u of arr) { ni.run(u.name, u.email, u.age); } });
  nt(users);
  const BATCH = 500;
  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    await knexDb('cw_users').insert(batch);
  }
  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    const stmts = batch.map(u => ({ sql: 'INSERT INTO cw_users (name, email, age) VALUES (?, ?, ?)', args: [u.name, u.email, u.age] }));
    await libsqlDb.batch(stmts, 'write');
  }
  const niw = nativeWalDb.prepare('INSERT INTO cw_users (name, email, age) VALUES (?, ?, ?)');
  const ntw = nativeWalDb.transaction(arr => { for (const u of arr) { niw.run(u.name, u.email, u.age); } });
  ntw(users);
  const knexWal = knexWalDb;
  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    await knexWal('cw_users').insert(batch);
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
    console.log(`  total: ${total}, errors: ${errors}, throughput: ${throughput} ops/sec`);
    if (cleanup) clients.forEach(c => cleanup(c));
  }
  await setupConcurrentTables();
  await clearConcurrentTables();
  await seedConcurrentTables(TOTAL_ROWS);
  await runEngine(
    'native',
    n => Array.from({ length: n }, () => new Database(NATIVE_DB_PATH)),
    async (db, id, age) => { db.prepare('UPDATE cw_users SET age = ? WHERE id = ?').run(age, id); },
    db => db.close()
  );
  await runEngine(
    'native-wal',
    n => Array.from({ length: n }, () => { const d = new Database(NATIVE_WAL_DB_PATH); d.pragma('journal_mode = WAL'); return d; }),
    async (db, id, age) => { db.prepare('UPDATE cw_users SET age = ? WHERE id = ?').run(age, id); },
    db => db.close()
  );
  await runEngine(
    'knex',
    n => Array.from({ length: n }, () => Knex({ client: 'better-sqlite3', connection: { filename: KNEX_DB_PATH }, useNullAsDefault: true })),
    async (k, id, age) => { await k('cw_users').where('id', id).update({ age }); },
    k => k.destroy()
  );
  await runEngine(
    'knex-wal',
    n => Array.from({ length: n }, () => { const k = Knex({ client: 'better-sqlite3', connection: { filename: KNEX_WAL_DB_PATH }, useNullAsDefault: true }); return k; }),
    async (k, id, age) => { await k('cw_users').where('id', id).update({ age }); },
    k => k.destroy()
  );
  await runEngine(
    'libsql',
    n => Array.from({ length: n }, () => createClient({ url: `file:${LIBSQL_DB_PATH}` })),
    async (c, id, age) => { await c.execute({ sql: 'UPDATE cw_users SET age = ? WHERE id = ?', args: [age, id] }); }
  );
}

// Setup insert benchmarks
function setupInsertBenchmarks() {
  // Prepare statements for native better-sqlite3
  const nativeInsert = nativeDb.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');

  insertSuite
    .add('Native better-sqlite3 - Single Insert', {
      minSamples: 5,
      fn: function() {
        const user = generateUser(Math.random());
        nativeInsert.run(user.name, user.email, user.age);
      }
    })
    .add('Knex.js - Single Insert', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const user = generateUser(Math.random());
        knexDb('users').insert(user)
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('libSQL (Turso embedded) - Single Insert', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const user = generateUser(Math.random());
        libsqlDb.execute({ sql: 'INSERT INTO users (name, email, age) VALUES (?, ?, ?)', args: [user.name, user.email, user.age] })
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Native better-sqlite3 - Batch Insert (Transaction)', {
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
    .add('Knex.js - Batch Insert', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const users = Array.from({ length: 5 }, (_, i) => generateUser(i));
        knexDb('users').insert(users)
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('libSQL (Turso embedded) - Batch Insert', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const users = Array.from({ length: 5 }, (_, i) => generateUser(i));
        const statements = users.map(u => ({ sql: 'INSERT INTO users (name, email, age) VALUES (?, ?, ?)', args: [u.name, u.email, u.age] }));
        libsqlDb.batch(statements, 'write')
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    });
}

// Setup select benchmarks
function setupSelectBenchmarks() {
  // Prepare statements for native better-sqlite3
  const nativeSelectAll = nativeDb.prepare('SELECT * FROM users LIMIT 20');
  const nativeSelectById = nativeDb.prepare('SELECT * FROM users WHERE id = ?');
  const nativeSelectByAge = nativeDb.prepare('SELECT * FROM users WHERE age > ? LIMIT 20');

  selectSuite
    .add('Native better-sqlite3 - Select All', {
      minSamples: 5,
      fn: function() {
        nativeSelectAll.all();
      }
    })
    .add('Knex.js - Select All', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        knexDb('users').limit(20).select('*')
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('libSQL (Turso embedded) - Select All', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        libsqlDb.execute('SELECT * FROM users LIMIT 20')
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Native better-sqlite3 - Select By Id', {
      minSamples: 5,
      fn: function() {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        nativeSelectById.get(id);
      }
    })
    .add('Knex.js - Select By Id', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        knexDb('users').where('id', id).first()
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('libSQL (Turso embedded) - Select By Id', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        libsqlDb.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] })
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Native better-sqlite3 - Select By Condition', {
      minSamples: 5,
      fn: function() {
        nativeSelectByAge.all(30);
      }
    })
    .add('Knex.js - Select By Condition', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        knexDb('users').where('age', '>', 30).limit(20).select('*')
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('libSQL (Turso embedded) - Select By Condition', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        libsqlDb.execute({ sql: 'SELECT * FROM users WHERE age > ? LIMIT 20', args: [30] })
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    });
}

// Setup update benchmarks
function setupUpdateBenchmarks() {
  // Prepare statements for native better-sqlite3
  const nativeUpdate = nativeDb.prepare('UPDATE users SET age = ? WHERE id = ?');

  updateSuite
    .add('Native better-sqlite3 - Update Single Record', {
      minSamples: 5,
      fn: function() {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        const age = Math.floor(Math.random() * 50) + 18;
        nativeUpdate.run(age, id);
      }
    })
    .add('Knex.js - Update Single Record', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        const age = Math.floor(Math.random() * 50) + 18;
        knexDb('users').where('id', id).update({ age })
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('libSQL (Turso embedded) - Update Single Record', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        const age = Math.floor(Math.random() * 50) + 18;
        libsqlDb.execute({ sql: 'UPDATE users SET age = ? WHERE id = ?', args: [age, id] })
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    });
}

// Setup delete benchmarks
function setupDeleteBenchmarks() {
  // Prepare statements for native better-sqlite3
  const nativeDelete = nativeDb.prepare('DELETE FROM users WHERE id = ?');

  deleteSuite
    .add('Native better-sqlite3 - Delete Single Record', {
      minSamples: 5,
      fn: function() {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        nativeDelete.run(id);
      }
    })
    .add('Knex.js - Delete Single Record', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        knexDb('users').where('id', id).delete()
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('libSQL (Turso embedded) - Delete Single Record', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        libsqlDb.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] })
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    });
}

// Setup complex query benchmarks
function setupComplexBenchmarks() {
  // Prepare statements for native better-sqlite3
  const nativeComplex = nativeDb.prepare(`
    SELECT 
      COUNT(*) as count, 
      AVG(age) as average_age, 
      MIN(age) as min_age, 
      MAX(age) as max_age 
    FROM users 
    WHERE age > ?
  `);

  complexSuite
    .add('Native better-sqlite3 - Complex Query', {
      minSamples: 5,
      fn: function() {
        nativeComplex.get(30);
      }
    })
    .add('Knex.js - Complex Query', {
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
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('libSQL (Turso embedded) - Complex Query', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        libsqlDb.execute({
          sql: 'SELECT COUNT(*) as count, AVG(age) as average_age, MIN(age) as min_age, MAX(age) as max_age FROM users WHERE age > ?',
          args: [30]
        })
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    });
}

// Seed the databases with initial data
async function seedDatabases() {
  console.log(`Seeding databases with ${NUM_RECORDS} records...`);
  
  // Native better-sqlite3 seeding
  const nativeInsert = nativeDb.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');
  const nativeTransaction = nativeDb.transaction((users) => {
    for (const user of users) {
      nativeInsert.run(user.name, user.email, user.age);
    }
  });
  
  const users = Array.from({ length: NUM_RECORDS }, (_, i) => generateUser(i));
  nativeTransaction(users);
  
  // Knex.js seeding - insert in smaller batches to avoid SQLite errors
  const BATCH_SIZE = 100;
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    await knexDb('users').insert(batch);
  }
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const statements = batch.map(u => ({ sql: 'INSERT INTO users (name, email, age) VALUES (?, ?, ?)', args: [u.name, u.email, u.age] }));
    await libsqlDb.batch(statements, 'write');
  }
  
  return Promise.resolve();
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
    console.log('Setting up databases...');
    await setupDatabases();
    
    console.log('Seeding databases...');
    await seedDatabases();
    
    console.log('Setting up benchmarks...');
    setupInsertBenchmarks();
    setupSelectBenchmarks();
    setupUpdateBenchmarks();
    setupDeleteBenchmarks();
    setupComplexBenchmarks();
    
    console.log('\nRunning benchmarks...');
    console.log('This may take a while...');
    
    // Run each suite
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
      .on('complete', function() {
        displayResults(this);
        
        console.log('\nRunning concurrent write test...');
        runConcurrentWriteTest()
          .then(() => {
            console.log('\nRunning concurrent update test...');
            return runConcurrentUpdateTest();
          })
          .then(() => {
            console.log('\nBenchmark complete!');
            nativeDb.close();
            knexDb.destroy();
            nativeWalDb.close();
            knexWalDb.destroy();
          })
          .catch(err => {
            console.error('Concurrent write test error:', err);
            nativeDb.close();
            knexDb.destroy();
            nativeWalDb.close();
            knexWalDb.destroy();
          });
      });
    
  } catch (error) {
    console.error('Error running benchmarks:', error);
    
    // Clean up
    nativeDb.close();
    knexDb.destroy();
  }
}

// Run the benchmarks
runBenchmarks();
