const Benchmark = require('benchmark');
const Database = require('better-sqlite3');
const Knex = require('knex');
const fs = require('fs');
const path = require('path');

// Database file paths
const NATIVE_DB_PATH = path.join(__dirname, 'native.db');
const KNEX_DB_PATH = path.join(__dirname, 'knex.db');

// Clean up existing database files
if (fs.existsSync(NATIVE_DB_PATH)) fs.unlinkSync(NATIVE_DB_PATH);
if (fs.existsSync(KNEX_DB_PATH)) fs.unlinkSync(KNEX_DB_PATH);

// Initialize databases
const nativeDb = new Database(NATIVE_DB_PATH);
const knexDb = Knex({
  client: 'better-sqlite3',
  connection: {
    filename: KNEX_DB_PATH
  },
  useNullAsDefault: true
});

// Create tables
function setupDatabases() {
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
  return knexDb.schema.createTable('users', table => {
    table.increments('id');
    table.string('name').notNullable();
    table.string('email').notNullable();
    table.integer('age');
    table.timestamp('created_at').defaultTo(knexDb.fn.now());
  });
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
        
        console.log('\nBenchmark complete!');
        
        // Clean up
        nativeDb.close();
        knexDb.destroy();
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
