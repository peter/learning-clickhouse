# Module 2: Deep dive into ClickHouse Architecture

[Module 2: Deep dive into ClickHouse Architecture](https://learn.clickhouse.com/learner_module/show/1872073?lesson_id=10038995)

Part of [Real-time analytics with ClickHouse](https://clickhouse.com/learn/real-time-analytics)

## Handling Data

In ClickHouse tables are organized in databases

```sql
SHOW DATABASES
CREATE DATABASE my_db
SHOW TABLES FROM my_db
```

Every table needs to have an engine

```sql
CREATE TABLE my_table
(
    column1 String
)
ENGINE = MergeTree;
```

See [ClickHouse Table Engines](https://clickhouse.com/docs/engines/table-engines).

There are table engines for reading data from files on S3 or Cloud Storage and table engines for fetching data from other databases.

If you are storing data in ClickHouse you typically use an engine in the [MergeTree family](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree).

## Data Storage

How does ClickHouse store data? The MergeTree table engine family has:

* AggregatingMergeTree - roll-up
* ReplacingMergeTree - upsert
* SharedMergeTree - used in ClickHouse cloud
* ReplicatedMergeTree - for on-prem replication

## Column-Oriented Database

With traditional RDBMS OLTP databases like Postgres/MySQL etc. you always fetch entire rows. In ClickHouse you can fetch columns individually and each column is stored in a compressed and optimized file.

Typical analytical query:

```sql
SELECT avg(price)
FROM phones
```

## MergeTree

Example MergeTree table where primary key is required:

```sql
CREATE table my_table
(
    column1 FixedString(1),
    column2 UInt32,
    column3 String
)
ENGINE = MergeTree
PRIMARY KEY (column1, column2)
```

Every time you do an insert in ClickHouse the data becomes a "part" in ClickHouse. Inserts should be peformed in batches (where each batch is thousands or millions of rows).

```sql
INSERT INTO my_table VALUES
    ('B', 1, 'How to partitions work?'),
    ('A', 1, 'Blocks are compressed'),
    ('B', 2, 'Small inserts not great'),
    ('A', 3, 'Primary index is sparse'),
    ('B', 4, 'Batch inserts are good');
```

For more efficient small inserts you can enable [async inserts](https://clickhouse.com/docs/optimize/asynchronous-inserts) so small inserts are batched. This is especially valuable in observability workloads, where hundreds or thousands of agents send data continuously.

```sql
ALTER USER default SETTINGS async_insert = 1
```

Each insert creates a part. A part is an immutable folder with column and metadata files. Eventually the parts will get merged (a hundred small part becomes one big part). Inserting one million rows per seconds requires a certain amount of compute power as does 200 concurrent queries. Small parts that have been merged will get deleted. By default, when a part gets to 150 GB compressed then it will not merge anymore (this could be a billion rows).

```sql
select *
from system.parts
where active = 1
format vertical;

select *
from system.parts
where table = 'uk_price_paid'
format vertical;

-- bytes
-- partition
-- bytes_on_disk
```

You can [partition a table](https://clickhouse.com/docs/partitions) by a time period like month or day or hour.

## Data Parts

Each column in a part is stored in its own immutable file.
The primary key determines the sort order and has nothing to do with uniqueness. ClickHouse doesn't care about uniqueness.

For the most part PRIMARY KEY and ORDER BY are identical and they determine the sort order on disk.

```sql
CREATE TABLE my_table
(
    column1 FixedString(1),
    column2 UInt32,
    column3 String
)
ENGINE = MergeTree
PRIMARY KEY (column1, column2)
```

Every MergeTree table has a primary index which has a key per granule (8192 rows by default, i.e. it's a sparse index). You can have millions of rows but only hundreds of entries in the primary key.

A granule is the smallest indivisible amount of data that ClickHouse reads when searching for data. When writing a query you want to avoid a full table scan and skip as many granules as possible. THe primary index contains the primary key for the first row of every granule.

Once ClickHouse knows the granules that need to be searched it sends the granules to a thread for processing. Granules are processed concurrently. You can throttle the amount of compute resources (RAM and cores) that a query consumes but by default it will use as much as it needs to serve the query as fast as possible.

```sql
-- 1 granule - both columns in primary key
SELECT avg(price)
from uk.uk_price_paid
WHERE postcode1 = 'AL1'
AND   postcode2 = '1AJ'
-- 1 row in set. Elapsed: 0.258 sec. Processed 8.19 thousand rows, 60.60 KB (31.77 thousand rows/s., 235.01 KB/s.)
-- 1 row in set. Elapsed: 0.004 sec. Processed 8.19 thousand rows, 60.60 KB (1.86 million rows/s., 13.78 MB/s.)

-- 3 granules - first column in primary key
SELECT avg(price)
from uk.uk_price_paid
WHERE postcode1 = 'AL1'
-- 1 row in set. Elapsed: 0.004 sec. Processed 32.77 thousand rows, 163.87 KB (7.62 million rows/s., 38.11 MB/s.)

EXPLAIN indexes=1 SELECT avg(price)
from uk.uk_price_paid
WHERE postcode1 = 'AL1'
AND   postcode2 = '1AJ'

-- second column in primary key
SELECT avg(price)
from uk.uk_price_paid
WHERE postcode2 = '1AJ'
-- 1 row in set. Elapsed: 0.459 sec. Processed 17.86 million rows, 60.26 MB (38.91 million rows/s., 131.30 MB/s.)
```

Every column in the primary key comes at a cost in sorting and cost of inserts and merges. Unique / high cardinality columns should not be in the primary key.

## Primary Key

The PRIMARY KEY is the sort order and is the same as ORDER BY.
The PRIMARY KEY can be different from ORDER BY if it is a prefix of it (i.e. ORDER BY can extend the PRIMARY KEY). The primary key should be based on the queries you make. Only add a column there is you query by it frequently.

The most important decision in a MergeTree table is the primary key and has a huge effect on performance. Lower cardinality columns should come first in the primary key.

```sql
CREATE TABLE property_prices
(
    price UInt32,
    date Date,
    postcode String,
    address String,
    town String,
    county String
)
ENGINE = MergeTree
ORDER BY ???
```

If you query by date then put that in the primary key. If you query by town then make town the primary key. What do you do if you filter by date and town? Then use town and date and put town first as there are fewer towns than dates. You cannot change primary key and you can only have one primary key.

Sometimes you will wish you had multiple primary keys and there are multiple solutions available:

* Create two tables for the same data
* Use a projection
* Use a materialized view
* Define a [skipping index](https://clickhouse.com/docs/optimize/skipping-indexes)

Summary:

* granule - logical breakdown of rows in an uncompressed block, by default 8192 rows
* primary key - sort order of table
* priary index - in-memory index containing values in primary key pointing to first row of each granule
* part - a folder of files containing the column files and index files of a subset of table data

## Lab 2.1: Understanding Primary Keys in ClickHouse

```sql
SELECT * 
FROM system.parts
WHERE table = 'uk_prices_1'
AND active = 1;
-- 7 parts across 30 million rows, that is roughly 500 granules per part:
-- 30033199/7/8192
-- number of granules: 30033199/8192 ~ 3666

SELECT
    formatReadableSize(sum(data_compressed_bytes)) AS compressed_size,
    formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed_size
FROM system.parts
WHERE table = 'uk_prices_1' AND active = 1;
--    ┌─compressed_size─┬─uncompressed_size─┐
-- 1. │ 1.17 GiB        │ 4.05 GiB          │
--    └─────────────────┴───────────────────┘

SELECT avg(toUInt32(price))
FROM uk_prices_1
WHERE town = 'LONDON';
-- 1 row in set. Elapsed: 0.854 sec. Processed 30.03 million rows, 973.60 MB (35.17 million rows/s., 1.14 GB/s.)
SHOW CREATE TABLE uk_prices_1
-- PRIMARY KEY date
EXPLAIN indexes=1 SELECT avg(toUInt32(price))
FROM uk_prices_1
WHERE town = 'LONDON';
--     ┌─explain────────────────────────────────────────────────────────────────┐
--  1. │ Expression ((Project names + Projection))                              │
--  2. │   Aggregating                                                          │
--  3. │     Expression (Before GROUP BY)                                       │
--  4. │       Expression ((WHERE + Change column names to column identifiers)) │
--  5. │         ReadFromMergeTree (default.uk_prices_1)                        │
--  6. │         Indexes:                                                       │
--  7. │           PrimaryKey                                                   │
--  8. │             Condition: true                                            │
--  9. │             Parts: 7/7                                                 │
-- 10. │             Granules: 3665/3665                                        │
-- 11. │             Ranges: 7                                                  │
--     └────────────────────────────────────────────────────────────────────────┘
EXPLAIN indexes=1 SELECT avg(toUInt32(price))
FROM uk_prices_1
WHERE date = '2025-01-01';
--     ┌─explain────────────────────────────────────────────────────────────────┐
--  1. │ Expression ((Project names + Projection))                              │
--  2. │   Aggregating                                                          │
--  3. │     Expression (Before GROUP BY)                                       │
--  4. │       Expression ((WHERE + Change column names to column identifiers)) │
--  5. │         ReadFromMergeTree (default.uk_prices_1)                        │
--  6. │         Indexes:                                                       │
--  7. │           PrimaryKey                                                   │
--  8. │             Keys:                                                      │
--  9. │               date                                                     │
-- 10. │             Condition: (date in [1735689600, 1735689600])              │
-- 11. │             Parts: 1/7                                                 │
-- 12. │             Granules: 1/3665                                           │
-- 13. │             Search Algorithm: binary search                            │
-- 14. │             Ranges: 1                                                  │
--     └────────────────────────────────────────────────────────────────────────┘


SELECT avg(toUInt32(price))
FROM uk_prices_1
WHERE toYYYYMM(date) = '202207';
-- 1 row in set. Elapsed: 0.008 sec. Processed 114.69 thousand rows, 2.06 MB (14.42 million rows/s., 259.46 MB/s.)

CREATE TABLE uk_prices_2
(
    `id` Nullable(String),
    `price` Nullable(String),
    `date` DateTime,
    `postcode` String,
    `type` Nullable(String),
    `is_new` Nullable(String),
    `duration` Nullable(String),
    `addr1` Nullable(String),
    `addr2` Nullable(String),
    `street` Nullable(String),
    `locality` Nullable(String),
    `town` Nullable(String),
    `district` Nullable(String),
    `county` Nullable(String),
    `column15` Nullable(String),
    `column16` Nullable(String)
)
ENGINE = MergeTree
PRIMARY KEY (postcode, date);

INSERT INTO uk_prices_2
SELECT * from uk_prices_1;

-- What is the most expensive property sold in uk_prices_2 where postcode equals 'LU1 5FT'? How many granules were processed to run this query?
SELECT argMax(street, price)
FROM uk_prices_2
WHERE postcode = 'LU1 5FT'
-- DUMFRIES STREET 
-- 1 row in set. Elapsed: 0.006 sec. Processed 73.73 thousand rows, 3.54 MB (12.14 million rows/s., 583.30 MB/s.)

-- What is the average price of all properties in uk_prices_2 sold in 2020 and after? How many granules were skipped in this query, considering that date is the second column in the primary key? Notice that adding date to the primary key did not help in skipping granules.
SELECT avg(toUInt32(price))
FROM uk_prices_2
WHERE toYear(date) >= 2020
-- 1 row in set. Elapsed: 0.080 sec. Processed 30.03 million rows, 562.02 MB (373.73 million rows/s., 6.99 GB/s.)
-- Full table scan

SELECT
    formatReadableSize(sum(data_compressed_bytes)) AS compressed_size,
    formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed_size,
    100 - ((100 * sum(data_compressed_bytes)) / sum(data_uncompressed_bytes)) AS compression_rate
FROM system.parts
WHERE (`table` = 'uk_prices_2') AND (active = 1)
--    ┌─compressed_size─┬─uncompressed_size─┬──compression_rate─┐
-- 1. │ 747.59 MiB      │ 4.02 GiB          │ 81.85170578015085 │
--    └─────────────────┴───────────────────┴───────────────────┘

-- ANSWER: The postcode is a String, and sorting by a String column can greatly improve compression. We will see in a future module that you can do better though by storing these strings as numbers using LowCardinality when feasible.

-- Your choice for the primary key in a MergeTree table may increase or decrease compression, thereby affecting disk space usage and query performance.

-- A tables primary index must fit in memory

-- Summary: You now have the UK property prices stored in two tables, each with a different primary key. As you saw in the lab, a good primary key can make all the difference in regards to how much data is read for a specific query.
```