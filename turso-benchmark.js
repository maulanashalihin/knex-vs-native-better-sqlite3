const Benchmark = require('benchmark');
const { createClient } = require('@libsql/client');
const dotenv = require('dotenv');

dotenv.config();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables');
  process.exit(1);
}

const turso = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
});

function logSuiteResults(suite) {
  console.log(`\n${suite.name}:`);
  suite.forEach(b => {
    console.log(`  ${b.name}: ${Math.round(b.hz).toLocaleString()} ops/sec ±${b.stats.rme.toFixed(2)}% (${b.stats.sample.length} runs sampled)`);
  });
}

async function setupDatabase() {
  await turso.batch([
    'DROP TABLE IF EXISTS users',
    `CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      age INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  ], 'write');
}

function user(i) {
  return {
    name: `User ${i}`,
    email: `user${i}@example.com`,
    age: Math.floor(Math.random() * 50) + 18,
  };
}

const NUM_RECORDS = 100;

async function seed() {
  const users = Array.from({ length: NUM_RECORDS }, (_, i) => user(i));
  const stmts = users.map(u => ({ sql: 'INSERT INTO users (name, email, age) VALUES (?, ?, ?)', args: [u.name, u.email, u.age] }));
  await turso.batch(stmts, 'write');
}

function setupInsertSuite() {
  const s = new Benchmark.Suite('Insert Operations (Turso libSQL)');
  s
    .add('libSQL - Single Insert', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const u = user(Math.random());
        turso.execute({ sql: 'INSERT INTO users (name, email, age) VALUES (?, ?, ?)', args: [u.name, u.email, u.age] })
          .then(() => deferred.resolve())
          .catch(err => { console.error('Benchmark error:', err); deferred.resolve(); });
      },
    })
    .add('libSQL - Batch Insert (5)', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const batch = Array.from({ length: 5 }, (_, i) => user(i));
        const stmts = batch.map(u => ({ sql: 'INSERT INTO users (name, email, age) VALUES (?, ?, ?)', args: [u.name, u.email, u.age] }));
        turso.batch(stmts, 'write')
          .then(() => deferred.resolve())
          .catch(err => { console.error('Benchmark error:', err); deferred.resolve(); });
      },
    });
  return s;
}

function setupSelectSuite() {
  const s = new Benchmark.Suite('Select Operations (Turso libSQL)');
  s
    .add('libSQL - Select All', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        turso.execute('SELECT * FROM users LIMIT 20')
          .then(() => deferred.resolve())
          .catch(err => { console.error('Benchmark error:', err); deferred.resolve(); });
      },
    })
    .add('libSQL - Select By Id', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        turso.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] })
          .then(() => deferred.resolve())
          .catch(err => { console.error('Benchmark error:', err); deferred.resolve(); });
      },
    })
    .add('libSQL - Select By Condition', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        turso.execute({ sql: 'SELECT * FROM users WHERE age > ? LIMIT 20', args: [30] })
          .then(() => deferred.resolve())
          .catch(err => { console.error('Benchmark error:', err); deferred.resolve(); });
      },
    });
  return s;
}

function setupUpdateSuite() {
  const s = new Benchmark.Suite('Update Operations (Turso libSQL)');
  s
    .add('libSQL - Update Single Record', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        const age = Math.floor(Math.random() * 50) + 18;
        turso.execute({ sql: 'UPDATE users SET age = ? WHERE id = ?', args: [age, id] })
          .then(() => deferred.resolve())
          .catch(err => { console.error('Benchmark error:', err); deferred.resolve(); });
      },
    });
  return s;
}

function setupDeleteSuite() {
  const s = new Benchmark.Suite('Delete Operations (Turso libSQL)');
  s
    .add('libSQL - Delete Single Record', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        turso.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] })
          .then(() => deferred.resolve())
          .catch(err => { console.error('Benchmark error:', err); deferred.resolve(); });
      },
    });
  return s;
}

function setupComplexSuite() {
  const s = new Benchmark.Suite('Complex Operations (Turso libSQL)');
  s
    .add('libSQL - Aggregate Query', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        turso.execute({
          sql: 'SELECT COUNT(*) as count, AVG(age) as average_age, MIN(age) as min_age, MAX(age) as max_age FROM users WHERE age > ?',
          args: [30],
        })
          .then(() => deferred.resolve())
          .catch(err => { console.error('Benchmark error:', err); deferred.resolve(); });
      },
    });
  return s;
}

async function run() {
  console.log('Setting up Turso database...');
  await setupDatabase();
  console.log(`Seeding ${NUM_RECORDS} records...`);
  await seed();
  console.log('Preparing benchmark suites...');
  const insertSuite = setupInsertSuite();
  const selectSuite = setupSelectSuite();
  const updateSuite = setupUpdateSuite();
  const deleteSuite = setupDeleteSuite();
  const complexSuite = setupComplexSuite();

  console.log('\nRunning Turso libSQL benchmarks...');
  insertSuite
    .on('complete', function() { logSuiteResults(this); selectSuite.run({ async: true }); })
    .run({ async: true });

  selectSuite
    .on('complete', function() { logSuiteResults(this); updateSuite.run({ async: true }); });

  updateSuite
    .on('complete', function() { logSuiteResults(this); deleteSuite.run({ async: true }); });

  deleteSuite
    .on('complete', function() { logSuiteResults(this); complexSuite.run({ async: true }); });

  complexSuite
    .on('complete', function() {
      logSuiteResults(this);
      console.log('\nBenchmark complete!');
    });
}

run().catch(err => {
  console.error('Error running Turso benchmark:', err);
});

