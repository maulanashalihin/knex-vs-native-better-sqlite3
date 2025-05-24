const Benchmark = require('benchmark');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Database file paths
const DEFAULT_DB_PATH = path.join(__dirname, 'default-journal.db');
const WAL_DB_PATH = path.join(__dirname, 'wal-journal.db');

// Clean up existing database files
if (fs.existsSync(DEFAULT_DB_PATH)) fs.unlinkSync(DEFAULT_DB_PATH);
if (fs.existsSync(WAL_DB_PATH)) fs.unlinkSync(WAL_DB_PATH);

// Initialize databases
const defaultDb = new Database(DEFAULT_DB_PATH);
const walDb = new Database(WAL_DB_PATH);

// Set WAL mode for the second database
walDb.pragma('journal_mode = WAL');

// Log the journal modes
console.log('Default DB Journal Mode:', defaultDb.pragma('journal_mode', { simple: true }));
console.log('WAL DB Journal Mode:', walDb.pragma('journal_mode', { simple: true }));

// Create tables
function setupDatabases() {
  // Create the same table structure in both databases
  const createTableSQL = `
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      age INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  defaultDb.exec(createTableSQL);
  walDb.exec(createTableSQL);
  
  console.log('Tables created successfully');
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
const singleInsertSuite = new Benchmark.Suite('Single Insert Operations');
const batchInsertSuite = new Benchmark.Suite('Batch Insert Operations (100 records)');
const transactionInsertSuite = new Benchmark.Suite('Transaction Insert Operations (1000 records)');
const concurrentWriteSuite = new Benchmark.Suite('Concurrent Write Operations');

// Number of records for various tests
const BATCH_SIZE = 100;
const TRANSACTION_SIZE = 1000;
const CONCURRENT_OPS = 50;

// Setup single insert benchmarks
function setupSingleInsertBenchmarks() {
  // Prepare statements
  const defaultInsert = defaultDb.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');
  const walInsert = walDb.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');

  singleInsertSuite
    .add('Default Journal Mode - Single Insert', {
      minSamples: 5,
      fn: function() {
        const user = generateUser(Math.random());
        defaultInsert.run(user.name, user.email, user.age);
      }
    })
    .add('WAL Journal Mode - Single Insert', {
      minSamples: 5,
      fn: function() {
        const user = generateUser(Math.random());
        walInsert.run(user.name, user.email, user.age);
      }
    });
}

// Setup batch insert benchmarks
function setupBatchInsertBenchmarks() {
  // Prepare statements
  const defaultInsert = defaultDb.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');
  const walInsert = walDb.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');
  
  // Create transaction functions
  const defaultTransaction = defaultDb.transaction((users) => {
    for (const user of users) {
      defaultInsert.run(user.name, user.email, user.age);
    }
  });
  
  const walTransaction = walDb.transaction((users) => {
    for (const user of users) {
      walInsert.run(user.name, user.email, user.age);
    }
  });

  batchInsertSuite
    .add('Default Journal Mode - Batch Insert', {
      minSamples: 5,
      fn: function() {
        const users = Array.from({ length: BATCH_SIZE }, (_, i) => generateUser(i));
        defaultTransaction(users);
      }
    })
    .add('WAL Journal Mode - Batch Insert', {
      minSamples: 5,
      fn: function() {
        const users = Array.from({ length: BATCH_SIZE }, (_, i) => generateUser(i));
        walTransaction(users);
      }
    });
}

// Setup large transaction insert benchmarks
function setupTransactionInsertBenchmarks() {
  // Prepare statements
  const defaultInsert = defaultDb.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');
  const walInsert = walDb.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');
  
  // Create transaction functions
  const defaultTransaction = defaultDb.transaction((users) => {
    for (const user of users) {
      defaultInsert.run(user.name, user.email, user.age);
    }
  });
  
  const walTransaction = walDb.transaction((users) => {
    for (const user of users) {
      walInsert.run(user.name, user.email, user.age);
    }
  });

  transactionInsertSuite
    .add('Default Journal Mode - Large Transaction', {
      minSamples: 3,
      fn: function() {
        const users = Array.from({ length: TRANSACTION_SIZE }, (_, i) => generateUser(i));
        defaultTransaction(users);
      }
    })
    .add('WAL Journal Mode - Large Transaction', {
      minSamples: 3,
      fn: function() {
        const users = Array.from({ length: TRANSACTION_SIZE }, (_, i) => generateUser(i));
        walTransaction(users);
      }
    });
}

// Setup concurrent write benchmarks (simulating multiple connections)
function setupConcurrentWriteBenchmarks() {
  // For concurrent operations, we'll simulate by running multiple small transactions in sequence
  // This isn't truly concurrent but gives us a comparison of how each mode handles rapid sequential writes
  
  // Prepare statements
  const defaultInsert = defaultDb.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');
  const walInsert = walDb.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');
  
  // Create small transaction functions (5 inserts each)
  const defaultSmallTransaction = defaultDb.transaction((users) => {
    for (const user of users) {
      defaultInsert.run(user.name, user.email, user.age);
    }
  });
  
  const walSmallTransaction = walDb.transaction((users) => {
    for (const user of users) {
      walInsert.run(user.name, user.email, user.age);
    }
  });

  concurrentWriteSuite
    .add('Default Journal Mode - Simulated Concurrent Writes', {
      minSamples: 3,
      fn: function() {
        // Run multiple small transactions in sequence
        for (let i = 0; i < CONCURRENT_OPS; i++) {
          const users = Array.from({ length: 5 }, (_, j) => generateUser(i * 5 + j));
          defaultSmallTransaction(users);
        }
      }
    })
    .add('WAL Journal Mode - Simulated Concurrent Writes', {
      minSamples: 3,
      fn: function() {
        // Run multiple small transactions in sequence
        for (let i = 0; i < CONCURRENT_OPS; i++) {
          const users = Array.from({ length: 5 }, (_, j) => generateUser(i * 5 + j));
          walSmallTransaction(users);
        }
      }
    });
}

// Display benchmark results
function displayResults(suite) {
  console.log(`\n${suite.name}:`);
  suite.forEach(benchmark => {
    console.log(`  ${benchmark.name}: ${Math.round(benchmark.hz).toLocaleString()} ops/sec ±${benchmark.stats.rme.toFixed(2)}% (${benchmark.stats.sample.length} runs sampled)`);
  });
}

// Clean databases between tests
function cleanDatabases() {
  defaultDb.exec('DELETE FROM users');
  walDb.exec('DELETE FROM users');
  
  // Run VACUUM to reclaim space and reset the database
  defaultDb.exec('VACUUM');
  walDb.exec('VACUUM');
  
  console.log('Databases cleaned for next test');
}

// Run all benchmarks
async function runBenchmarks() {
  try {
    console.log('Setting up databases...');
    setupDatabases();
    
    console.log('\nRunning benchmarks...');
    console.log('This may take a while...');
    
    // Setup all benchmarks
    setupSingleInsertBenchmarks();
    setupBatchInsertBenchmarks();
    setupTransactionInsertBenchmarks();
    setupConcurrentWriteBenchmarks();
    
    // Run each suite
    singleInsertSuite
      .on('complete', function() {
        displayResults(this);
        cleanDatabases();
        batchInsertSuite.run({ async: true });
      })
      .run({ async: true });
    
    batchInsertSuite
      .on('complete', function() {
        displayResults(this);
        cleanDatabases();
        transactionInsertSuite.run({ async: true });
      });
    
    transactionInsertSuite
      .on('complete', function() {
        displayResults(this);
        cleanDatabases();
        concurrentWriteSuite.run({ async: true });
      });
    
    concurrentWriteSuite
      .on('complete', function() {
        displayResults(this);
        
        console.log('\nBenchmark complete!');
        
        // Print summary
        console.log('\n=== WAL MODE BENCHMARK SUMMARY ===');
        console.log('WAL mode is particularly beneficial for:');
        console.log('1. Concurrent write operations');
        console.log('2. Applications that need to read while writing');
        console.log('3. Reducing write contention');
        console.log('\nNote: WAL mode may use slightly more disk space due to the WAL file.');
        
        // Clean up
        defaultDb.close();
        walDb.close();
      });
    
  } catch (error) {
    console.error('Error running benchmarks:', error);
    
    // Clean up
    defaultDb.close();
    walDb.close();
  }
}

// Run the benchmarks
runBenchmarks();