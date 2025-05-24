const Benchmark = require('benchmark');
const { Pool } = require('pg');
const Knex = require('knex');
require('dotenv').config();

// Supabase connection information
const password = "-w@G8n8i%reY*&%";
const supabaseUrl = `postgresql://postgres:${password}@db.adcllhmqvqfpdzivdmtj.supabase.co:5432/postgres`;

// Initialize database connections
const pgPool = new Pool({
  connectionString: supabaseUrl,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait for a connection to become available
});

// Initialize Knex with PostgreSQL
const knexPg = Knex({
  client: 'pg',
  connection: supabaseUrl,
  pool: { min: 2, max: 10 }
});

// Benchmark suites
const insertSuite = new Benchmark.Suite('Insert Operations');
const selectSuite = new Benchmark.Suite('Select Operations');
const updateSuite = new Benchmark.Suite('Update Operations');
const deleteSuite = new Benchmark.Suite('Delete Operations');
const complexSuite = new Benchmark.Suite('Complex Operations');

// Number of records to use in benchmarks
const NUM_RECORDS = 100;

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

// Generate random user data
function generateUser(i) {
  return {
    name: `User ${i}`,
    email: `user${i}@example.com`,
    age: Math.floor(Math.random() * 50) + 18
  };
}

// Create tables
async function setupDatabases() {
  console.log('Dropping existing tables if they exist...');
  
  // Drop tables if they exist - using separate try/catch blocks for each operation
  try {
    await pgPool.query('DROP TABLE IF EXISTS users');
    console.log('Dropped users table from pg connection');
  } catch (error) {
    console.error('Error dropping pg users table:', error.message);
  }
  
  try {
    await knexPg.schema.dropTableIfExists('users');
    console.log('Dropped users table from knex connection');
  } catch (error) {
    console.error('Error dropping knex users table:', error.message);
  }

  // Wait a moment to ensure tables are fully dropped
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('Creating tables...');
  
  // Create tables - using separate try/catch blocks
  try {
    // Native pg setup
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        age INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created users table with pg');
  } catch (pgError) {
    console.error('Error creating pg users table:', pgError.message);
    // Continue execution instead of throwing
  }

  try {
    // Check if table exists first with knex
    const tableExists = await knexPg.schema.hasTable('users');
    
    if (!tableExists) {
      await knexPg.schema.createTable('users', table => {
        table.increments('id');
        table.string('name').notNullable();
        table.string('email').notNullable();
        table.integer('age');
        table.timestamp('created_at').defaultTo(knexPg.fn.now());
      });
      console.log('Created users table with knex');
    } else {
      console.log('Users table already exists for knex, skipping creation');
    }
  } catch (knexError) {
    console.error('Error with knex table operations:', knexError.message);
    // Continue execution instead of throwing
  }
  
  // Wait a moment to ensure tables are fully created
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('Database setup complete');

}

// Seed the databases with initial data
async function seedDatabases() {
  console.log(`Seeding databases with ${NUM_RECORDS} records...`);
  
  // First, clear existing data
  try {
    console.log('Clearing existing data...');
    await pgPool.query('TRUNCATE TABLE users RESTART IDENTITY');
    console.log('Cleared pg users table');
  } catch (error) {
    console.error('Error clearing pg users table:', error.message);
    // Continue execution
  }
  
  try {
    await knexPg('users').truncate();
    console.log('Cleared knex users table');
  } catch (error) {
    console.error('Error clearing knex users table:', error.message);
    // Continue execution
  }
  
  // Generate users
  const users = Array.from({ length: NUM_RECORDS }, (_, i) => generateUser(i));
  
  // Native pg seeding
  console.log('Seeding pg users table...');
  let pgSeedingSuccessful = false;
  try {
    const pgClient = await pgPool.connect();
    try {
      await pgClient.query('BEGIN');
      
      for (const user of users) {
        await pgClient.query(
          'INSERT INTO users (name, email, age) VALUES ($1, $2, $3)',
          [user.name, user.email, user.age]
        );
      }
      
      await pgClient.query('COMMIT');
      pgSeedingSuccessful = true;
      console.log('Successfully seeded pg users table');
    } catch (e) {
      await pgClient.query('ROLLBACK');
      console.error('Error in pg transaction:', e.message);
    } finally {
      pgClient.release();
    }
  } catch (error) {
    console.error('Error connecting to pg pool:', error.message);
  }
  
  // Knex.js seeding - insert in smaller batches to avoid errors
  console.log('Seeding knex users table...');
  let knexSeedingSuccessful = false;
  try {
    const BATCH_SIZE = 20;
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      await knexPg('users').insert(batch);
    }
    knexSeedingSuccessful = true;
    console.log('Successfully seeded knex users table');
  } catch (error) {
    console.error('Error seeding knex users table:', error.message);
  }
  
  if (pgSeedingSuccessful || knexSeedingSuccessful) {
    console.log('Seeding complete - at least one database was successfully seeded');
    return true;
  } else {
    console.warn('Warning: Failed to seed both databases, benchmarks may not work correctly');
    // Continue execution instead of throwing
    return false;
  }
}

// Setup insert benchmarks
function setupInsertBenchmarks() {
  insertSuite
    .add('Native pg - Single Insert', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const user = generateUser(Math.random());
        pgPool.query(
          'INSERT INTO users (name, email, age) VALUES ($1, $2, $3)',
          [user.name, user.email, user.age]
        )
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Knex.js (pg) - Single Insert', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const user = generateUser(Math.random());
        knexPg('users').insert(user)
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Native pg - Batch Insert (Transaction)', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const users = Array.from({ length: 5 }, (_, i) => generateUser(i));
        
        (async () => {
          const client = await pgPool.connect();
          try {
            await client.query('BEGIN');
            
            for (const user of users) {
              await client.query(
                'INSERT INTO users (name, email, age) VALUES ($1, $2, $3)',
                [user.name, user.email, user.age]
              );
            }
            
            await client.query('COMMIT');
            deferred.resolve();
          } catch (e) {
            await client.query('ROLLBACK');
            console.error('Benchmark error:', e);
            deferred.resolve();
          } finally {
            client.release();
          }
        })();
      }
    })
    .add('Knex.js (pg) - Batch Insert', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const users = Array.from({ length: 5 }, (_, i) => generateUser(i));
        knexPg('users').insert(users)
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
  selectSuite
    .add('Native pg - Select All', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        pgPool.query('SELECT * FROM users LIMIT 20')
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Knex.js (pg) - Select All', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        knexPg('users').limit(20).select('*')
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Native pg - Select By Id', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        pgPool.query('SELECT * FROM users WHERE id = $1', [id])
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Knex.js (pg) - Select By Id', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        knexPg('users').where('id', id).first()
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Native pg - Select By Condition', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        pgPool.query('SELECT * FROM users WHERE age > $1 LIMIT 20', [30])
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Knex.js (pg) - Select By Condition', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        knexPg('users').where('age', '>', 30).limit(20).select('*')
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
  updateSuite
    .add('Native pg - Update Single Record', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        const age = Math.floor(Math.random() * 50) + 18;
        pgPool.query('UPDATE users SET age = $1 WHERE id = $2', [age, id])
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Knex.js (pg) - Update Single Record', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        const age = Math.floor(Math.random() * 50) + 18;
        knexPg('users').where('id', id).update({ age })
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
  deleteSuite
    .add('Native pg - Delete Single Record', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        pgPool.query('DELETE FROM users WHERE id = $1', [id])
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Knex.js (pg) - Delete Single Record', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        const id = Math.floor(Math.random() * NUM_RECORDS) + 1;
        knexPg('users').where('id', id).delete()
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
  complexSuite
    .add('Native pg - Complex Query', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        pgPool.query(`
          SELECT 
            COUNT(*) as count, 
            AVG(age) as average_age, 
            MIN(age) as min_age, 
            MAX(age) as max_age 
          FROM users 
          WHERE age > $1
        `, [30])
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
      }
    })
    .add('Knex.js (pg) - Complex Query', {
      minSamples: 5,
      defer: true,
      fn: function(deferred) {
        knexPg('users')
          .where('age', '>', 30)
          .select(
            knexPg.raw('COUNT(*) as count'),
            knexPg.raw('AVG(age) as average_age'),
            knexPg.raw('MIN(age) as min_age'),
            knexPg.raw('MAX(age) as max_age')
          )
          .then(() => deferred.resolve())
          .catch(err => {
            console.error('Benchmark error:', err);
            deferred.resolve();
          });
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

// Run all benchmarks
async function runBenchmarks() {
  try {
    console.log('Setting up databases...');
    try {
      await setupDatabases();
    } catch (setupError) {
      console.error('Database setup failed, but continuing with existing tables:', setupError.message);
    }
    
    console.log('Seeding databases...');
    const seedingSuccessful = await seedDatabases();
    if (!seedingSuccessful) {
      console.warn('Seeding was not fully successful. Some benchmarks might fail.');
    }
    
    // Wait a moment to ensure database operations are complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('Setting up benchmarks...');
    setupInsertBenchmarks();
    setupSelectBenchmarks();
    setupUpdateBenchmarks();
    setupDeleteBenchmarks();
    setupComplexBenchmarks();
    
    console.log('\nRunning benchmarks...');
    console.log('This may take a while...');
    
    // Run each suite with error handling
    const runSuiteWithErrorHandling = (suite, nextSuite) => {
      try {
        suite
          .on('error', function(error) {
            console.error(`Error in ${suite.name}:`, error.message);
            if (nextSuite) nextSuite.run({ async: true });
          })
          .on('complete', function() {
            try {
              displayResults(this);
              if (nextSuite) nextSuite.run({ async: true });
            } catch (error) {
              console.error(`Error displaying results for ${suite.name}:`, error.message);
              if (nextSuite) nextSuite.run({ async: true });
            }
          })
          .run({ async: true });
      } catch (error) {
        console.error(`Error starting ${suite.name}:`, error.message);
        if (nextSuite) nextSuite.run({ async: true });
      }
    };
    
    // Chain the suites with error handling
    runSuiteWithErrorHandling(insertSuite, selectSuite);
    
    // Add event handlers for the remaining suites
    selectSuite.on('complete', function() {
      displayResults(this);
      runSuiteWithErrorHandling(updateSuite, deleteSuite);
    });
    
    updateSuite.on('complete', function() {
      displayResults(this);
      runSuiteWithErrorHandling(deleteSuite, complexSuite);
    });
    
    deleteSuite.on('complete', function() {
      displayResults(this);
      runSuiteWithErrorHandling(complexSuite, null);
    });
    
    // Flag to track if cleanup has been performed
    let cleanupPerformed = false;
    
    complexSuite.on('complete', function() {
      displayResults(this);
      console.log('\nBenchmark complete!');
      
      // Clean up only once
      if (!cleanupPerformed) {
        cleanupPerformed = true;
        console.log('Cleaning up database connections...');
        try {
          pgPool.end();
          knexPg.destroy();
          console.log('Cleanup successful');
        } catch (cleanupError) {
          console.error('Error during cleanup:', cleanupError.message);
        }
      }
    });
    
  } catch (error) {
    console.error('Error running benchmarks:', error.message);
    
    // Clean up only if not already performed by the complexSuite handler
    if (typeof cleanupPerformed === 'undefined' || !cleanupPerformed) {
      console.log('Cleaning up database connections due to error...');
      try {
        pgPool.end();
        knexPg.destroy();
        console.log('Cleanup successful');
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError.message);
      }
    }
  }
}

// Run the benchmarks
runBenchmarks();
