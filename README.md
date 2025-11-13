# SQLite Performance Benchmarks: better-sqlite3, Knex.js, libSQL (Turso)

This repository compares SQLite performance across three approaches:
- Native `better-sqlite3`
- `Knex.js` (using the `better-sqlite3` driver)
- `libSQL (Turso) embedded` via `@libsql/client`

It also includes stress tests for concurrent writes and updates, and WAL-mode variants for increased write concurrency.

## Features

- Comprehensive micro-benchmarks: insert, select, update, delete, and complex queries
- Adapters: native, Knex, libSQL (embedded)
- WAL-mode comparison: native-WAL and Knex-WAL
- Concurrent stress tests: multi-writer insert and update
- Self-contained setup with ephemeral `.db` files created and cleaned on run

## Project Structure

- `sqlite-benchmark.js` — Main benchmark runner for native, Knex, and libSQL
- `sqlite-wal-benchmark.js` — Focused WAL comparison for native better-sqlite3
- `append-file-benchmark.js` — File I/O benchmark (not DB-related)
- `supabase-benchmark.js` — PostgreSQL benchmark against Supabase (optional)
- `package.json` — Scripts and dependencies

## Prerequisites

- Node.js 16+ recommended
- macOS or Linux (tested on macOS)
- No external services required for embedded mode; `.db` files are created in the project root

## Installation

```bash
npm install
```

## Running

```bash
npm run benchmark
```

This runs `sqlite-benchmark.js`, which:
- Creates `native.db`, `knex.db`, `libsql.db`, `native-wal.db`, `knex-wal.db`
- Builds identical schemas across all engines
- Seeds the databases
- Executes all micro-benchmark suites
- Runs concurrent write and update stress tests at the end

## Benchmark Suites

- Insert: single-row, batch (transaction for native, bulk for Knex/libSQL)
- Select: all, by id, by condition
- Update: single-row updates
- Delete: single-row deletes
- Complex: aggregate query with COUNT/AVG/MIN/MAX

Implementation references:
- libSQL client init: `sqlite-benchmark.js:27`
- libSQL schema creation: `sqlite-benchmark.js:61`–`69`
- libSQL seeding with batch: `sqlite-benchmark.js:441`–`445`
- libSQL suite entries: `sqlite-benchmark.js:121`–`133`, `202`–`213`, `234`–`246`, `265`–`276`, `319`–`332`, `349`–`361`, `403`–`417`
- WAL setup (native): `sqlite-benchmark.js:32`–`34`
- WAL setup (Knex PRAGMA): `sqlite-benchmark.js:70`

## Concurrent Stress Tests

- Dedicated table `cw_users` created for all engines: `sqlite-benchmark.js:107`–`157`
- Concurrent write: 8 writers × 200 inserts each: `sqlite-benchmark.js:159`–`215`
- Concurrent update: 8 writers × 200 updates each with pre-seeded rows: `sqlite-benchmark.js:254`–`314`
- Tests are invoked automatically after micro-benchmarks: `sqlite-benchmark.js:729`–`736`

### Sample Results (Throughput)

Concurrent Write:
```
native:     total 1600, errors 0, ~4,103 ops/sec
native-wal: total 1600, errors 0, ~50,000 ops/sec
knex:       total 1600, errors 0, ~4,156 ops/sec
knex-wal:   total 1600, errors 0, ~38,095 ops/sec
libsql:     total 1600, errors 0, ~4,156 ops/sec
```

Concurrent Update:
```
native:     total 1600, errors 0, ~133,333 ops/sec
native-wal: total 1600, errors 0, ~266,667 ops/sec
knex:       total 1600, errors 0, ~66,667 ops/sec
knex-wal:   total 1600, errors 0, ~94,118 ops/sec
libsql:     total 1600, errors 0, ~72,727 ops/sec
```

## Notes & Disclaimers

- WAL mode improves write/read concurrency significantly for native and Knex.
- Throughput varies by hardware, OS, Node version, and load. Treat the numbers as indicative, not authoritative.
- The sample results were produced on a Mac M4 (Apple silicon). Your local machine or VPS will likely produce different numbers.
- This project can be used to benchmark machine/VPS performance under comparable workloads.

## Turso / libSQL (Optional)

- Embedded mode (`file:...`) needs no CLI or remote database.
- To test embedded replicas that sync from a remote Turso database, you can optionally:
  - Install Turso CLI: `curl -sSL tur.so/install | sh`
  - Configure `@libsql/client` with `syncUrl` and `authToken`
  - See Turso docs for `@libsql/client` options

## License

ISC License (see `package.json`)
