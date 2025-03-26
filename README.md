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

## Results

### Insert Operations:
```
Native better-sqlite3 - Single Insert: 5,648 ops/sec ±2.94% (89 runs sampled)
Knex.js - Single Insert: 5,296 ops/sec ±2.99% (82 runs sampled)
Native better-sqlite3 - Batch Insert (Transaction): 5,190 ops/sec ±4.31% (85 runs sampled)
Knex.js - Batch Insert: 5,012 ops/sec ±4.01% (80 runs sampled)
```

### Select Operations:
```
Native better-sqlite3 - Select All: 66,962 ops/sec ±0.83% (96 runs sampled)
Knex.js - Select All: 39,541 ops/sec ±0.26% (83 runs sampled)
Native better-sqlite3 - Select By Id: 289,709 ops/sec ±0.82% (99 runs sampled)
Knex.js - Select By Id: 70,172 ops/sec ±2.48% (91 runs sampled)
Native better-sqlite3 - Select By Condition: 65,512 ops/sec ±0.13% (96 runs sampled)
Knex.js - Select By Condition: 37,683 ops/sec ±0.27% (89 runs sampled)
```

### Update Operations:
```
Native better-sqlite3 - Update Single Record: 5,804 ops/sec ±4.99% (86 runs sampled)
Knex.js - Update Single Record: 6,017 ops/sec ±3.51% (80 runs sampled)
```

### Delete Operations:
```
Native better-sqlite3 - Delete Single Record: 222,482 ops/sec ±3.47% (100 runs sampled)
Knex.js - Delete Single Record: 91,537 ops/sec ±0.22% (89 runs sampled)
```

### Complex Operations:
```
Native better-sqlite3 - Complex Query: 171 ops/sec ±0.27% (89 runs sampled)
Knex.js - Complex Query: 187 ops/sec ±0.25% (89 runs sampled)
```

## Analisis Hasil Benchmark

### 1. Insert Operations
- Native better-sqlite3: 5,648 ops/sec
- Knex.js: 5,296 ops/sec
- **Kesimpulan**: Keduanya memiliki performa yang hampir sama, dengan native sedikit lebih cepat (~7% lebih cepat).

### 2. Select Operations
- **Select All**:
  - Native better-sqlite3: 66,962 ops/sec
  - Knex.js: 39,541 ops/sec
  - Native ~1.7x lebih cepat

- **Select By Id**:
  - Native better-sqlite3: 289,709 ops/sec
  - Knex.js: 70,172 ops/sec
  - Native ~4.1x lebih cepat

- **Select By Condition**:
  - Native better-sqlite3: 65,512 ops/sec
  - Knex.js: 37,683 ops/sec
  - Native ~1.7x lebih cepat

- **Kesimpulan**: Native better-sqlite3 secara konsisten lebih cepat untuk operasi select, dengan peningkatan performa yang signifikan terutama untuk query dengan kondisi sederhana (select by id).

### 3. Update Operations
- Native better-sqlite3: 5,804 ops/sec
- Knex.js: 6,017 ops/sec
- **Kesimpulan**: Knex.js sedikit lebih cepat untuk update (~3.7% lebih cepat), tetapi perbedaannya kecil dan mungkin tidak signifikan secara statistik.

### 4. Delete Operations
- Native better-sqlite3: 222,482 ops/sec
- Knex.js: 91,537 ops/sec
- **Kesimpulan**: Native ~2.4x lebih cepat untuk operasi delete.

### 5. Complex Operations
- Native better-sqlite3: 171 ops/sec
- Knex.js: 187 ops/sec
- **Kesimpulan**: Knex.js sedikit lebih cepat (~9.4% lebih cepat) untuk query kompleks yang melibatkan agregasi.

## Kesimpulan Umum

1. **Native better-sqlite3** umumnya lebih cepat untuk operasi read (select) dan delete, dengan peningkatan performa yang signifikan (1.7x hingga 4.1x lebih cepat).

2. **Knex.js** memiliki performa yang sebanding atau sedikit lebih baik untuk operasi write (insert, update) dan query kompleks.

3. **Trade-off**:
   - **Native better-sqlite3**: Performa lebih baik, terutama untuk operasi read, tetapi kurang fleksibel dan hanya untuk SQLite.
   - **Knex.js**: Performa sedikit lebih rendah untuk sebagian besar operasi, tetapi lebih fleksibel, portable, dan menawarkan abstraksi yang lebih tinggi.

4. **Rekomendasi**:
   - Jika kecepatan adalah prioritas utama dan Anda hanya menggunakan SQLite, native better-sqlite3 adalah pilihan yang baik.
   - Jika Anda membutuhkan fleksibilitas, portabilitas database, dan kemudahan pengembangan, Knex.js adalah pilihan yang solid dengan performa yang masih baik.
   - Untuk aplikasi dengan beban kerja read-heavy, pertimbangkan untuk menggunakan native better-sqlite3.
   - Untuk aplikasi dengan beban kerja write-heavy atau query kompleks, perbedaan performa antara keduanya tidak signifikan.

