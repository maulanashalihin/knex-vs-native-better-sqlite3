const Benchmark = require('benchmark');
const fs = require('fs');
const path = require('path');

// File paths
const LOG_FILE_PATH = path.join(__dirname, 'benchmark-log.txt');
const SYNC_LOG_FILE_PATH = path.join(__dirname, 'benchmark-sync-log.txt');

// Clean up existing log files
if (fs.existsSync(LOG_FILE_PATH)) fs.unlinkSync(LOG_FILE_PATH);
if (fs.existsSync(SYNC_LOG_FILE_PATH)) fs.unlinkSync(SYNC_LOG_FILE_PATH);

// Create empty log files
fs.writeFileSync(LOG_FILE_PATH, '');
fs.writeFileSync(SYNC_LOG_FILE_PATH, '');

// Benchmark suite
const appendSuite = new Benchmark.Suite('File Append Operations');

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

// Generate random log entry
function generateLogEntry() {
  const timestamp = new Date().toISOString();
  const randomId = Math.floor(Math.random() * 1000000);
  return `[${timestamp}] User ${randomId} performed action: ${Math.random() < 0.5 ? 'login' : 'logout'}\n`;
}

// Setup append benchmarks
function setupAppendBenchmarks() {
  appendSuite
    .add('fs.promises.appendFile - Single Append', {
      minSamples: 5,
      ...benchmarkAsync(async () => {
        const logEntry = generateLogEntry();
        await fs.promises.appendFile(LOG_FILE_PATH, logEntry);
      })
    })
    .add('fs.appendFileSync - Single Append', {
      minSamples: 5,
      fn: function() {
        const logEntry = generateLogEntry();
        fs.appendFileSync(SYNC_LOG_FILE_PATH, logEntry);
      }
    })
    .add('fs.promises.appendFile - Multiple Appends', {
      minSamples: 5,
      ...benchmarkAsync(async () => {
        const promises = [];
        for (let i = 0; i < 5; i++) {
          const logEntry = generateLogEntry();
          promises.push(fs.promises.appendFile(LOG_FILE_PATH, logEntry));
        }
        await Promise.all(promises);
      })
    })
    .add('fs.appendFileSync - Multiple Appends', {
      minSamples: 5,
      fn: function() {
        for (let i = 0; i < 5; i++) {
          const logEntry = generateLogEntry();
          fs.appendFileSync(SYNC_LOG_FILE_PATH, logEntry);
        }
      }
    })
    .add('fs.promises.appendFile - Fire and Forget', {
      minSamples: 5,
      fn: function() {
        const logEntry = generateLogEntry();
        fs.promises.appendFile(LOG_FILE_PATH, logEntry).catch(err => {
          console.error('Error writing to log file:', err);
        });
      }
    });
}

// Display benchmark results
function displayResults(suite) {
  console.log(`\n${suite.name}:`);
  suite.forEach(benchmark => {
    console.log(`  ${benchmark.name}: ${Math.round(benchmark.hz).toLocaleString()} ops/sec`);
    if (benchmark.error) {
      console.error(`  Error: ${benchmark.error}`);
    }
  });
}

// Run all benchmarks
async function runBenchmarks() {
  try {
    console.log('Setting up benchmarks...');
    setupAppendBenchmarks();
    
    console.log('\nRunning benchmarks...');
    console.log('This may take a while...');
    
    // Run the suite
    appendSuite
      .on('complete', function() {
        displayResults(this);
        console.log('\nBenchmark complete!');
        
        // Display file sizes
        const asyncFileSize = fs.statSync(LOG_FILE_PATH).size;
        const syncFileSize = fs.statSync(SYNC_LOG_FILE_PATH).size;
        console.log(`\nAsync log file size: ${(asyncFileSize / 1024).toFixed(2)} KB`);
        console.log(`Sync log file size: ${(syncFileSize / 1024).toFixed(2)} KB`);
      })
      .run({ async: true });
    
  } catch (error) {
    console.error('Error running benchmarks:', error);
  }
}

// Run the benchmarks
runBenchmarks();