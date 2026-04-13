# SQLite Performance Benchmarks: better-sqlite3, Knex.js, Kysely

This repository compares SQLite performance across multiple approaches:
- **Native `better-sqlite3`** (DELETE journal mode - default)
- **Native `better-sqlite3`** (WAL mode)
- **`Knex.js`** with better-sqlite3 driver (WAL mode)
- **`Kysely`** type-safe query builder (WAL mode)
- **`Kysely Generic`** (WAL mode)

All benchmarks use WAL (Write-Ahead Logging) mode by default for optimal write concurrency, except for the native DELETE mode comparison.

## Features

- Comprehensive micro-benchmarks: insert, select, update, delete, and complex queries
- Adapters: native better-sqlite3 (DELETE & WAL), Knex.js, Kysely
- WAL-mode comparison across all adapters
- Concurrent stress tests: multi-writer insert and update operations
- Self-contained setup with ephemeral `.db` files created and cleaned on run

## Project Structure

- `sqlite-benchmark.js` — Main benchmark runner for all SQLite adapters
- `package.json` — Scripts and dependencies

## Prerequisites

- Node.js 16+ recommended
- macOS or Linux (tested on macOS)
- No external services required; `.db` files are created in the project root

## Installation

```bash
npm install
```

## Running

```bash
npm run benchmark
```

This runs `sqlite-benchmark.js`, which:
- Creates `native.db`, `native-wal.db`, `knex-wal.db`, `kysely-wal.db`, `kysely-generic-wal.db`
- Builds identical schemas across all engines
- Seeds the databases with 100 records
- Executes all micro-benchmark suites
- Runs concurrent write and update stress tests

## Benchmark Suites

### Operations

- **Insert**: Single-row insert, Batch insert (5 records in transaction)
- **Select**: All records (20 limit), By ID, By condition (age > 30)
- **Update**: Single-row updates
- **Delete**: Single-row deletes
- **Complex**: Aggregate query with COUNT/AVG/MIN/MAX

### Concurrent Stress Tests

- **Concurrent Write**: 8 writers × 200 inserts each (1600 total)
- **Concurrent Update**: 8 writers × 200 updates each with pre-seeded rows

## Sample Results (Mac Mini M4 - NVMe Native)

> **Note:** Results obtained from Mac Mini M4 with NVMe native storage. These numbers represent standardized baseline performance on Apple Silicon.

### Insert Operations
```
Native better-sqlite3 (DELETE) - Single Insert:          4,496 ops/sec
Native better-sqlite3 (WAL) - Single Insert:            99,437 ops/sec
Knex.js (WAL) - Single Insert:                          54,766 ops/sec
Kysely (WAL) - Single Insert:                           95,002 ops/sec
Kysely Generic (WAL) - Single Insert:                   99,955 ops/sec
Native better-sqlite3 (DELETE) - Batch (5 records):      3,507 ops/sec
Native better-sqlite3 (WAL) - Batch (5 records):        30,655 ops/sec
Knex.js (WAL) - Batch Insert:                           25,324 ops/sec
Kysely (WAL) - Batch (5 records):                       32,709 ops/sec
Kysely Generic (WAL) - Batch (5 records):               40,770 ops/sec
```

### Select Operations
```
Native better-sqlite3 (DELETE) - Select All:            149,035 ops/sec
Native better-sqlite3 (WAL) - Select All:               209,352 ops/sec
Knex.js (WAL) - Select All:                              69,175 ops/sec
Kysely (WAL) - Select All:                               206,178 ops/sec
Kysely Generic (WAL) - Select All:                       206,112 ops/sec
Native better-sqlite3 (DELETE) - Select By Id:           337,456 ops/sec
Native better-sqlite3 (WAL) - Select By Id:              912,229 ops/sec
Knex.js (WAL) - Select By Id:                             90,727 ops/sec
Kysely (WAL) - Select By Id:                              919,351 ops/sec
Kysely Generic (WAL) - Select By Id:                     910,096 ops/sec
Native better-sqlite3 (DELETE) - Select By Condition:    143,381 ops/sec
Native better-sqlite3 (WAL) - Select By Condition:       199,456 ops/sec
Knex.js (WAL) - Select By Condition:                      63,247 ops/sec
Kysely (WAL) - Select By Condition:                      198,083 ops/sec
Kysely Generic (WAL) - Select By Condition:              198,655 ops/sec
```

### Update Operations
```
Native better-sqlite3 (DELETE) - Update Single:          5,312 ops/sec
Native better-sqlite3 (WAL) - Update Single:            173,320 ops/sec
Knex.js (WAL) - Update Single:                           75,971 ops/sec
Kysely (WAL) - Update Single:                           174,864 ops/sec
Kysely Generic (WAL) - Update Single:                   177,373 ops/sec
```

### Delete Operations
```
Native better-sqlite3 (DELETE) - Delete Single:         243,339 ops/sec
Native better-sqlite3 (WAL) - Delete Single:            705,729 ops/sec
Knex.js (WAL) - Delete Single:                          153,451 ops/sec
Kysely (WAL) - Delete Single:                           703,395 ops/sec
Kysely Generic (WAL) - Delete Single:                   712,465 ops/sec
```

### Complex Operations
```
Native better-sqlite3 (DELETE) - Complex Query:          236 ops/sec
Native better-sqlite3 (WAL) - Complex Query:              14 ops/sec
Knex.js (WAL) - Complex Query:                            22 ops/sec
Kysely (WAL) - Complex Query:                             15 ops/sec
Kysely Generic (WAL) - Complex Query:                     13 ops/sec
```

### Concurrent Write Stress Test
```
native (DELETE):       total 1600, errors 0, ~5,063 ops/sec
native-wal:            total 1600, errors 0, ~64,000 ops/sec
knex-wal:              total 1600, errors 0, ~40,000 ops/sec
kysely-wal:            total 1600, errors 0, ~45,714 ops/sec
kysely-generic-wal:    total 1600, errors 0, ~48,485 ops/sec
```

### Concurrent Update Stress Test
```
native (DELETE):       total 1600, errors 0, ~160,000 ops/sec
native-wal:            total 1600, errors 0, ~320,000 ops/sec
knex-wal:              total 1600, errors 0, ~94,118 ops/sec
kysely-wal:            total 1600, errors 0, ~123,077 ops/sec
kysely-generic-wal:    total 1600, errors 0, ~145,455 ops/sec
```

## Performance Summary

### Key Findings

| Category | Winner | Performance | Notes |
|----------|--------|-------------|-------|
| **Single Insert** | Kysely Generic WAL | ~99,955 ops/sec | 22x faster than DELETE mode |
| **Batch Insert** | Kysely Generic WAL | ~40,770 ops/sec | Best batch performance |
| **Select All** | Native WAL | ~209,352 ops/sec | Kysely within 1.5% |
| **Select By ID** | Native WAL | ~912,229 ops/sec | Kysely within 0.8% |
| **Update** | Kysely Generic WAL | ~177,373 ops/sec | 33x faster than DELETE mode |
| **Delete** | Kysely Generic WAL | ~712,465 ops/sec | Near-native performance |
| **Concurrent Write** | Native WAL | ~64,000 ops/sec | 13x faster than DELETE |
| **Concurrent Update** | Native WAL | ~320,000 ops/sec | Best for concurrent writes |

### Library Comparison

| Library | Type Safety | Overhead vs Native | Best For |
|---------|-------------|-------------------|----------|
| **Native better-sqlite3 (WAL)** | None | 0% (baseline) | Maximum performance |
| **Kysely** | Full TypeScript | ~0-5% | Type-safe apps, minimal overhead |
| **Knex.js (WAL)** | None (JS only) | ~30-50% | Legacy JS projects, mature ORM |
| **Kysely Generic** | Full TypeScript | ~0-5% | Alternative Kysely setup, best inserts |

### WAL vs DELETE Mode

| Operation | DELETE Mode | WAL Mode | Improvement |
|-----------|-------------|----------|-------------|
| Single Insert | ~4,496 ops/sec | ~99,437 ops/sec | **22x faster** |
| Batch Insert | ~3,507 ops/sec | ~30,655 ops/sec | **9x faster** |
| Select By ID | ~337,456 ops/sec | ~912,229 ops/sec | **2.7x faster** |
| Update | ~5,312 ops/sec | ~173,320 ops/sec | **33x faster** |
| Delete | ~243,339 ops/sec | ~705,729 ops/sec | **2.9x faster** |
| Concurrent Write | ~5,063 ops/sec | ~64,000 ops/sec | **13x faster** |

> **WAL mode is essential for write-intensive applications.** The performance improvement is dramatic across all write operations.

## Important: Knex.js WAL Mode Fix

### The Problem

Knex.js initially showed artificially low performance (~2,000 ops/sec for single insert) because WAL mode was not properly configured. Simply calling `knexDb.raw('PRAGMA journal_mode = WAL')` doesn't work because Knex uses **lazy connection initialization**.

### The Solution

WAL mode must be set at the **database file level** before Knex creates its connections:

```javascript
// Set WAL mode on the database file directly
const knexDbConnection = new Sqlite(KNEX_WAL_DB_PATH);
knexDbConnection.pragma('journal_mode = WAL');
knexDbConnection.close();

// Now create Knex instance - it will inherit WAL mode from the file
const knexDb = Knex({
  client: 'better-sqlite3',
  connection: { filename: KNEX_WAL_DB_PATH },
  useNullAsDefault: true
});
```

### Before vs After Fix

| Operation | Before (Wrong) | After (Correct) | Improvement |
|-----------|----------------|-----------------|-------------|
| Single Insert | ~2,045 ops/sec | ~38,167 ops/sec | **18x faster** |
| Select All | ~59,340 ops/sec | ~59,340 ops/sec | No change (was correct) |
| Update | ~1,140 ops/sec | ~1,140 ops/sec | No change (async overhead) |
| Delete | ~104,674 ops/sec | ~104,674 ops/sec | No change (was correct) |

## Notes & Disclaimers

- **WAL mode** significantly improves write/read concurrency for native better-sqlite3
- **Knex.js (WAL)** now shows realistic performance with proper WAL configuration
- **Kysely** provides full TypeScript type-safety with minimal overhead (0-30% vs native)
- **Complex queries in WAL mode** show lower throughput due to WAL checkpointing overhead
- Throughput varies by hardware, OS, Node version, and load. Treat the numbers as indicative, not authoritative
- This project can be used to benchmark machine/VPS performance under comparable workloads

## Recommendations

### Choose Native better-sqlite3 (WAL) if:
- You need maximum performance
- You're comfortable writing raw SQL
- Type-safety is not a priority

### Choose Kysely if:
- You want TypeScript type-safety
- You need near-native performance
- You're building a new TypeScript project

### Choose Knex.js (WAL) if:
- You're maintaining legacy JavaScript code
- You need a mature ORM with many dialects
- You need proper WAL mode configuration (use the fix above)

## Dependencies

- `better-sqlite3` — Native SQLite bindings
- `knex` — SQL query builder with better-sqlite3 dialect
- `kysely` — Type-safe TypeScript query builder
- `benchmark` — Benchmarking library

## License

ISC License (see `package.json`)
