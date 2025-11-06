# ClickHouse Speed Demo

From:
https://www.youtube.com/watch?v=sh5EBqrrwEU

ClickHouse Cloud Hardware Setup (see resulting numbers in comments below):

1. 1 Replica, 8 GB, 2 vCPU
2. 2 Replicas, 32 GB, 8 vCPU
3. 2 Replicas, 64 GB, 16 vCPU
4. 5 Replicas, 64 GB, 16 vCPU
5. 2 Replicas, 120 GB, 30 vCPU

## Speed Test - 100 Million Rows

```sql
CREATE OR REPLACE TABLE id_x
(
    id UInt32,
    x UInt32
)
ENGINE = MergeTree
PRIMARY KEY x;

INSERT INTO id_x
SELECT
  number,
  rand()
FROM numbers_mt(100_000_000);
-- 1. 0 rows in set. Elapsed: 22.052 sec. Processed 100.00 million rows, 800.00 MB (4.53 million rows/s., 36.28 MB/s.)
-- 2. 0 rows in set. Elapsed: 5.883 sec. Processed 100.00 million rows, 800.00 MB (17.00 million rows/s., 135.98 MB/s.)
-- 3. 0 rows in set. Elapsed: 7.264 sec. Processed 100.00 million rows, 800.00 MB (13.77 million rows/s., 110.13 MB/s.)

SELECT x
FROM id_x
ORDER BY x
LIMIT 3;
-- 1. 3 rows in set. Elapsed: 0.004 sec. Processed 24.58 thousand rows, 98.30 KB (6.59 million rows/s., 26.38 MB/s.)
-- 2. 3 rows in set. Elapsed: 0.004 sec. Processed 65.54 thousand rows, 262.14 KB (18.36 million rows/s., 73.45 MB/s.)
-- 3. 3 rows in set. Elapsed: 0.004 sec. Processed 73.73 thousand rows, 294.91 KB (20.32 million rows/s., 81.28 MB/s.)

SELECT id
FROM id_x
ORDER BY id DESC
LIMIT 3;
-- 1. 3 rows in set. Elapsed: 0.457 sec. Processed 100.00 million rows, 400.00 MB (218.90 million rows/s., 875.62 MB/s.)
-- 2. 3 rows in set. Elapsed: 0.113 sec. Processed 100.00 million rows, 400.00 MB (882.78 million rows/s., 3.53 GB/s.)
-- 3. 3 rows in set. Elapsed: 0.063 sec. Processed 100.00 million rows, 400.00 MB (1.59 billion rows/s., 6.38 GB/s.)

SELECT avg(x)
from id_x;
-- 1. 1 row in set. Elapsed: 0.340 sec. Processed 100.00 million rows, 400.00 MB (293.80 million rows/s., 1.18 GB/s.)
-- 2. 1 row in set. Elapsed: 0.092 sec. Processed 100.00 million rows, 400.00 MB (1.08 billion rows/s., 4.34 GB/s.)
-- 3. 1 row in set. Elapsed: 0.051 sec. Processed 100.00 million rows, 400.00 MB (1.96 billion rows/s., 7.86 GB/s.)
```

## Speed Test - 1 Billion Rows

```sql
CREATE OR REPLACE TABLE id_x
(
    id UInt32,
    x UInt32
)
ENGINE = MergeTree
PRIMARY KEY x;

INSERT INTO id_x
SELECT
  number,
  rand()
FROM numbers_mt(1000_000_000);
-- 3. 0 rows in set. Elapsed: 48.874 sec. Processed 1.00 billion rows, 8.00 GB (20.46 million rows/s., 163.69 MB/s.)
-- 4. 0 rows in set. Elapsed: 46.817 sec. Processed 1.00 billion rows, 8.00 GB (21.36 million rows/s., 170.88 MB/s.)
-- 5. 0 rows in set. Elapsed: 48.966 sec. Processed 1.00 billion rows, 8.00 GB (20.42 million rows/s., 163.38 MB/s.)

SELECT x
FROM id_x
ORDER BY x
LIMIT 3;
-- 3. 3 rows in set. Elapsed: 0.005 sec. Processed 81.92 thousand rows, 327.68 KB (17.42 million rows/s., 69.69 MB/s.)
-- 4. 3 rows in set. Elapsed: 0.005 sec. Processed 81.92 thousand rows, 327.68 KB (17.25 million rows/s., 68.99 MB/s.)
-- 5. 3 rows in set. Elapsed: 0.003 sec. Processed 73.73 thousand rows, 294.91 KB (23.44 million rows/s., 93.75 MB/s.)

SELECT id
FROM id_x
ORDER BY id DESC
LIMIT 3;
-- 3. 3 rows in set. Elapsed: 0.495 sec. Processed 1.00 billion rows, 4.00 GB (2.02 billion rows/s., 8.09 GB/s.)
-- 4. 3 rows in set. Elapsed: 0.496 sec. Processed 1.00 billion rows, 4.00 GB (2.02 billion rows/s., 8.07 GB/s.)
-- 5. 3 rows in set. Elapsed: 0.283 sec. Processed 1.00 billion rows, 4.00 GB (3.53 billion rows/s., 14.11 GB/s.)

SELECT avg(x)
from id_x;
-- 3. 1 row in set. Elapsed: 0.367 sec. Processed 1.00 billion rows, 4.00 GB (2.72 billion rows/s., 10.90 GB/s.)
-- 4. 1 row in set. Elapsed: 0.370 sec. Processed 1.00 billion rows, 4.00 GB (2.70 billion rows/s., 10.80 GB/s.)
-- 5. 1 row in set. Elapsed: 0.214 sec. Processed 1.00 billion rows, 4.00 GB (4.67 billion rows/s., 18.69 GB/s.)
```

## Speed Test - 1 Billion Rows With Projection

```sql
CREATE OR REPLACE TABLE id_x
(
    id UInt32,
    x UInt32,
    category UInt32
)
ENGINE = MergeTree
PRIMARY KEY x;

INSERT INTO id_x
SELECT
  number,
  rand(),
  toUInt32(randUniform(1, 100))
FROM numbers_mt(1000_000_000);
-- 3. 0 rows in set. Elapsed: 57.722 sec. Processed 1.00 billion rows, 8.00 GB (17.32 million rows/s., 138.59 MB/s.)

-- Preview data
select *
from id_x
limit 500;

-- Select by primary key / order by index
SELECT x
FROM id_x
ORDER BY x
LIMIT 3;
-- 3. 3 rows in set. Elapsed: 0.006 sec. Processed 147.46 thousand rows, 589.82 KB (26.37 million rows/s., 105.49 MB/s.)

-- Full table scan sort
SELECT id
FROM id_x
ORDER BY id DESC
LIMIT 3;
-- 3. 3 rows in set. Elapsed: 0.542 sec. Processed 1.00 billion rows, 4.00 GB (1.84 billion rows/s., 7.37 GB/s.)

-- Select by non primary key
select x
from id_x
where category = 52
order by x
limit 3;
-- 3. 3 rows in set. Elapsed: 0.010 sec. Processed 1.31 million rows, 10.49 MB (124.93 million rows/s., 999.43 MB/s.)

-- Sort by two non primary keys - full table scan
select *
from id_x
order by category, x
limit 100;
-- 3. 100 rows in set. Elapsed: 10.844 sec. Processed 1.00 billion rows, 12.00 GB (92.21 million rows/s., 1.11 GB/s.)
-- 3. 100 rows in set. Elapsed: 1.508 sec. Processed 1.00 billion rows, 12.00 GB (662.97 million rows/s., 7.96 GB/s.)

-- Add category projection
ALTER TABLE id_x ADD PROJECTION category_projection (SELECT * ORDER BY category);
ALTER TABLE id_x MATERIALIZE PROJECTION category_projection;

-- Check projection status
SELECT 
    database,
    table,
    mutation_id,
    command,
    create_time,
    is_done,
    parts_to_do,
    parts_to_do_names,
    latest_failed_part,
    latest_fail_reason
FROM system.mutations
WHERE database = 'default' 
  AND table = 'id_x'
  AND command LIKE '%MATERIALIZE%PROJECTION%'
ORDER BY create_time DESC;

-- Sort by non primary key now uses projection?
select x
from id_x
order by category
limit 100;
-- 3. 10 seconds on first query
-- 3. 100 rows in set. Elapsed: 0.873 sec. Processed 1.00 billion rows, 8.00 GB (1.14 billion rows/s., 9.16 GB/s.)

SELECT query, projections FROM system.query_log WHERE query_id='<query_id>'
```
