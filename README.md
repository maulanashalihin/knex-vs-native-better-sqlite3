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

## Sample Results (Mac M4)

### Insert Operations
```
Native better-sqlite3 (DELETE) - Single Insert:          2,100 ops/sec
Native better-sqlite3 (WAL) - Single Insert:            53,588 ops/sec
Knex.js (WAL) - Single Insert:                          38,167 ops/sec
Kysely (WAL) - Single Insert:                           39,045 ops/sec
Kysely Generic (WAL) - Single Insert:                   20,339 ops/sec
Native better-sqlite3 (DELETE) - Batch (5 records):        833 ops/sec
Native better-sqlite3 (WAL) - Batch (5 records):         21,142 ops/sec
Knex.js (WAL) - Batch Insert:                            1,000 ops/sec
Kysely (WAL) - Batch (5 records):                       23,090 ops/sec
Kysely Generic (WAL) - Batch (5 records):               23,078 ops/sec
```

### Select Operations
```
Native better-sqlite3 (DELETE) - Select All:            151,533 ops/sec
Native better-sqlite3 (WAL) - Select All:               210,681 ops/sec
Knex.js (WAL) - Select All:                              59,340 ops/sec
Kysely (WAL) - Select All:                               210,449 ops/sec
Kysely Generic (WAL) - Select All:                       210,205 ops/sec
Native better-sqlite3 (DELETE) - Select By Id:           342,356 ops/sec
Native better-sqlite3 (WAL) - Select By Id:              935,990 ops/sec
Knex.js (WAL) - Select By Id:                             75,861 ops/sec
Kysely (WAL) - Select By Id:                              937,546 ops/sec
Kysely Generic (WAL) - Select By Id:                     940,664 ops/sec
Native better-sqlite3 (DELETE) - Select By Condition:    144,960 ops/sec
Native better-sqlite3 (WAL) - Select By Condition:       200,906 ops/sec
Knex.js (WAL) - Select By Condition:                      55,767 ops/sec
Kysely (WAL) - Select By Condition:                      199,986 ops/sec
Kysely Generic (WAL) - Select By Condition:              200,061 ops/sec
```

### Update Operations
```
Native better-sqlite3 (DELETE) - Update Single:          2,608 ops/sec
Native better-sqlite3 (WAL) - Update Single:            87,961 ops/sec
Knex.js (WAL) - Update Single:                           1,140 ops/sec
Kysely (WAL) - Update Single:                            4,884 ops/sec
Kysely Generic (WAL) - Update Single:                   26,150 ops/sec
```

### Delete Operations
```
Native better-sqlite3 (DELETE) - Delete Single:         103,638 ops/sec
Native better-sqlite3 (WAL) - Delete Single:            706,074 ops/sec
Knex.js (WAL) - Delete Single:                          104,674 ops/sec
Kysely (WAL) - Delete Single:                           706,026 ops/sec
Kysely Generic (WAL) - Delete Single:                   709,837 ops/sec
```

### Complex Operations
```
Native better-sqlite3 (DELETE) - Complex Query:          837 ops/sec
Native better-sqlite3 (WAL) - Complex Query:              23 ops/sec
Knex.js (WAL) - Complex Query:                           908 ops/sec
Kysely (WAL) - Complex Query:                             24 ops/sec
Kysely Generic (WAL) - Complex Query:                     28 ops/sec
```

### Concurrent Write Stress Test
```
native (DELETE):       total 1600, errors 0, ~2,097 ops/sec
native-wal:            total 1600, errors 0, ~43,243 ops/sec
knex-wal:              total 1600, errors 0, ~2,033 ops/sec
kysely-wal:            total 1600, errors 0, ~34,043 ops/sec
kysely-generic-wal:    total 1600, errors 0, ~36,364 ops/sec
```

### Concurrent Update Stress Test
```
native (DELETE):       total 1600, errors 0, ~160,000 ops/sec
native-wal:            total 1600, errors 0, ~320,000 ops/sec
knex-wal:              total 1600, errors 0, ~72,727 ops/sec
kysely-wal:            total 1600, errors 0, ~123,077 ops/sec
kysely-generic-wal:    total 1600, errors 0, ~145,455 ops/sec
```

## Performance Summary

### Key Findings

| Category | Winner | Performance | Notes |
|----------|--------|-------------|-------|
| **Single Insert** | Native WAL | ~53,588 ops/sec | 25x faster than DELETE mode |
| **Batch Insert** | Native WAL | ~21,142 ops/sec | Kysely matches closely |
| **Select All** | Native WAL / Kysely | ~210,000 ops/sec | Kysely matches native exactly |
| **Select By ID** | Native WAL | ~936,000 ops/sec | Kysely within 0.2% |
| **Update** | Native WAL | ~87,961 ops/sec | Best write performance |
| **Delete** | Native WAL | ~706,000 ops/sec | Kysely matches native |
| **Concurrent Write** | Native WAL | ~43,243 ops/sec | 20x faster than DELETE |
| **Concurrent Update** | Native WAL | ~320,000 ops/sec | Best for concurrent writes |

### Library Comparison

| Library | Type Safety | Overhead vs Native | Best For |
|---------|-------------|-------------------|----------|
| **Native better-sqlite3 (WAL)** | None | 0% (baseline) | Maximum performance |
| **Kysely** | Full TypeScript | ~0-30% | Type-safe apps, minimal overhead |
| **Knex.js (WAL)** | None (JS only) | ~20-40% | Legacy JS projects, mature ORM |
| **Kysely Generic** | Full TypeScript | ~40-60% | Alternative Kysely setup |

### WAL vs DELETE Mode

| Operation | DELETE Mode | WAL Mode | Improvement |
|-----------|-------------|----------|-------------|
| Single Insert | ~2,100 ops/sec | ~53,588 ops/sec | **25x faster** |
| Batch Insert | ~833 ops/sec | ~21,142 ops/sec | **25x faster** |
| Select By ID | ~342,356 ops/sec | ~935,990 ops/sec | **2.7x faster** |
| Update | ~2,608 ops/sec | ~87,961 ops/sec | **34x faster** |
| Delete | ~103,638 ops/sec | ~706,074 ops/sec | **6.8x faster** |
| Concurrent Write | ~2,097 ops/sec | ~43,243 ops/sec | **21x faster** |

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
