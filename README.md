# SQLite Benchmark: better-sqlite3 vs Knex.js

This project benchmarks the performance difference between using native better-sqlite3 and using it through the Knex.js query builder.

## Setup

```bash
npm install
```

## Running the Benchmark

```bash
npm run benchmark
```

## Benchmark Details

The benchmark compares the following operations:
- Insert operations
- Select operations
- Update operations
- Delete operations
- Complex queries

Each operation is performed multiple times to get accurate performance measurements.

  Native better-sqlite3 - Select All: 66,962 ops/sec ±0.83% (96 runs sampled)
  Knex.js - Select All: 39,541 ops/sec ±0.26% (83 runs sampled)
  Native better-sqlite3 - Select By Id: 289,709 ops/sec ±0.82% (99 runs sampled)
  Knex.js - Select By Id: 70,172 ops/sec ±2.48% (91 runs sampled)
  Native better-sqlite3 - Select By Condition: 65,512 ops/sec ±0.13% (96 runs sampled)
  Knex.js - Select By Condition: 37,683 ops/sec ±0.27% (89 runs sampled)

Update Operations:
  Native better-sqlite3 - Update Single Record: 5,804 ops/sec ±4.99% (86 runs sampled)
  Knex.js - Update Single Record: 6,017 ops/sec ±3.51% (80 runs sampled)

Delete Operations:
  Native better-sqlite3 - Delete Single Record: 222,482 ops/sec ±3.47% (100 runs sampled)
  Knex.js - Delete Single Record: 91,537 ops/sec ±0.22% (89 runs sampled)

Complex Operations:
  Native better-sqlite3 - Complex Query: 171 ops/sec ±0.27% (89 runs sampled)
  Knex.js - Complex Query: 187 ops/sec ±0.25% (89 runs sampled)

Benchmark complete!

