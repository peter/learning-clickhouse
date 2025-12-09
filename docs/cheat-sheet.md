# ClickHouse Cheat Sheet

Most of this material has been drawn from the excellent course [Real-time analytics with ClickHouse](https://clickhouse.com/learn/real-time-analytics)

<!-- toc -->

- [Showing Databases and Tables](#showing-databases-and-tables)
- [Table Creation and Basic Queries](#table-creation-and-basic-queries)
- [Primary Keys, Order By, and Granules](#primary-keys-order-by-and-granules)
- [Data Types](#data-types)
- [Data Parts](#data-parts)
- [Explain](#explain)
- [The System Database and Settings](#the-system-database-and-settings)
- [Query Formats](#query-formats)
- [Importing Data from S3](#importing-data-from-s3)
- [ClickHouse Built-in Functions](#clickhouse-built-in-functions)
- [User Defined Functions](#user-defined-functions)
- [Query to see Compression Ratio of Table](#query-to-see-compression-ratio-of-table)
- [Partitioning](#partitioning)
- [Joins](#joins)
- [Dictionaries](#dictionaries)
- [Deleting and Updating Data](#deleting-and-updating-data)
- [Lab Solutions from Real-time analytics with ClickHouse Course](#lab-solutions-from-real-time-analytics-with-clickhouse-course)

<!-- tocstop -->

## Showing Databases and Tables

```sql
show databases
use default
show tables
show create table my_table
show create table my_table
```

## Table Creation and Basic Queries

Every table needs to have an engine, see [ClickHouse Table Engines](https://clickhouse.com/docs/engines/table-engines) and [MergeTree family](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree).

```sql
CREATE DATABASE uk;

CREATE TABLE uk.uk_price_paid
(
    price UInt32,
    date Date,
    postcode1 LowCardinality(String),
    postcode2 LowCardinality(String),
    type Enum8('terraced' = 1, 'semi-detached' = 2, 'detached' = 3, 'flat' = 4, 'other' = 0),
    is_new UInt8,
    duration Enum8('freehold' = 1, 'leasehold' = 2, 'unknown' = 0),
    addr1 String,
    addr2 String,
    street LowCardinality(String),
    locality LowCardinality(String),
    town LowCardinality(String),
    district LowCardinality(String),
    county LowCardinality(String)
)
ENGINE = MergeTree
ORDER BY (postcode1, postcode2, addr1, addr2);

select count() from uk.uk_price_paid

select * from uk.uk_price_paid limit 100 format vertical;

select min(date),
       max(date)
from uk.uk_price_paid;
```

```sql
DROP TABLE IF EXISTS series;
CREATE TABLE series
(
    i UInt32,
    x_value Float64,
    y_value Float64
)
ENGINE = Memory;
INSERT INTO series(i, x_value, y_value) VALUES (1, 5.6, -4.4),(2, -9.6, 3),(3, -1.3, -4),(4, 5.3, 9.7),(5, 4.4, 0.037),(6, -8.6, -7.8),(7, 5.1, 9.3),(8, 7.9, -3.6),(9, -8.2, 0.62),(10, -3, 7.3);
SELECT corr(x_value, y_value)
FROM series;
```

## Primary Keys, Order By, and Granules

The primary key determines the sort order and has nothing to do with uniqueness. For the most part `PRIMARY KEY` and `ORDER BY` are identical and they determine the sort order on disk.

Every MergeTree table has a primary index which has a key per granule (8192 rows by default, i.e. it's a sparse index). You can have millions of rows but only hundreds of entries in the primary key.

A granule is the smallest indivisible amount of data that ClickHouse reads when searching for data. When writing a query you want to avoid a full table scan and skip as many granules as possible. THe primary index contains the primary key for the first row of every granule.

Once ClickHouse knows the granules that need to be searched it sends the granules to a thread for processing. Granules are processed concurrently. You can throttle the amount of compute resources (RAM and cores) that a query consumes but by default it will use as much as it needs to serve the query as fast as possible.

Every column in the primary key comes at a cost in sorting and cost of inserts and merges. Unique / high cardinality columns should not be in the primary key.

The PRIMARY KEY can be different from ORDER BY if it is a prefix of it (i.e. ORDER BY can extend the PRIMARY KEY). The primary key should be based on the queries you make. Only add a column there is you query by it frequently.

The most important decision in a MergeTree table is the primary key and has a huge effect on performance. Lower cardinality columns should come first in the primary key.

If you query by date then put that in the primary key. If you query by town then make town the primary key. What do you do if you filter by date and town? Then use town and date and put town first as there are fewer towns than dates. You cannot change primary key and you can only have one primary key.

Sometimes you will wish you had multiple primary keys and there are multiple solutions available:

* Create two tables for the same data
* Use a projection
* Use a materialized view
* Define a [skipping index](https://clickhouse.com/docs/optimize/skipping-indexes)

```sql
CREATE TABLE my_table
(
    column1 FixedString(1),
    column2 UInt32,
    column3 String
)
ENGINE = MergeTree
PRIMARY KEY (column1, column2)

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
```

## Data Types

ClickHouse has its own data types. The ANSI SQL standard data types are represented as aliases in ClickHouse.

* UInt8, UInt16, UInt32, UInt64, UInt256
* Int8, Int16, Int32, Int64, Int256
* Float32, Float64, Decimal
* String, FixedString(N)
* Date, Date32, DateTime, DateTime64
* Nullable(typename)
* JSON, LowCardinality, Array, UUID, Geo, Map etc.

Where are VARCHAR, INT, and FLOAT? They are aliases to ClickHouse data types.

```sql
-- There are 138 data types in total but more than half are aliases
SELECT *
FROM system.data_type_families
WHERE alias_to = 'String';
-- VARCHAR -> String
-- FLOAT -> Float32
-- INT -> Int32
```

The selection of data types is very important in ClickHouse as it affects storage and performance. Even small optimizations add up across billions of rows.

Data Types from [ClickHouse Data Types Reference Docs](https://clickhouse.com/docs/sql-reference/data-types):

* [Int/UInt](https://clickhouse.com/docs/sql-reference/data-types/int-uint) - fixed-length integers
* [Float32/Float64](https://clickhouse.com/docs/sql-reference/data-types/float) - float and double. For accurate calculations in finance etc. - use Decimal instead
* [Decimal](https://clickhouse.com/docs/sql-reference/data-types/decimal). Signed fixed-point numbers that keep precision during add, subtract and multiply operations. Precision is number of decimal digits and the default is `Decimal(10, 0)`
* [String](https://clickhouse.com/docs/sql-reference/data-types/string) - Strings of an arbitrary length. The length is not limited. The value can contain an arbitrary set of bytes, including null bytes. The String type replaces the types VARCHAR, BLOB, CLOB, and others from other DBMSs
* [FixedString(N)](https://clickhouse.com/docs/sql-reference/data-types/fixedstring) - fixed length string
* [DateTime](https://clickhouse.com/docs/sql-reference/data-types/datetime) - calendar time with second precision
* [DateTime64](https://clickhouse.com/docs/sql-reference/data-types/datetime64) - precise calendar time with typical precision 3 (milliseconds), 6 (microseconds), 9 (nanoseconds).
* [Enum](https://clickhouse.com/docs/sql-reference/data-types/enum) - example: `Enum('hello' = 1, 'world' = 2)`
* [LowCardinality(T)](https://clickhouse.com/docs/sql-reference/data-types/lowcardinality) - dictionary encoding that stores integers for when you have few unique values (less than 10 thousand unique values). The advantage of Enum is that it's easier to add new values i.e. you don't need to know all the unique values at table creation time. Storing billions of numbers rather than billions of strings can have a huge impact on performance. You can count unique values with the `uniq` function
* [Nullable(T)](https://clickhouse.com/docs/sql-reference/data-types/nullable) - allows column to have null values. Nullable columns can not be part of the primary key. ClickHouse will store 0 for Nullable(UInt64) and needs to store an extra column to keep track of the null value and there is a cost associated with that. NOTE: null values are omitted from calculations, i.e. if you calculate an average (`avg(my_column)`) then null values are not counted towards the average but zero values are. Note that you use a default value instead of Nullable, i.e. `metric Int64 DEFAULT -1` and then do `SELECT avg(metric) FROM my_table WHERE metric > -1`.
* [JSON](https://clickhouse.com/docs/sql-reference/data-types/newjson) - any nested JSON data, doesn't need to adhere to a fixed schema, i.e. `CREATE TABLE my_json_table (raw JSON) ENGINE = MergeTree ORDER BY tuple()` and `SELECT raw.a.b from my_json_table`. The JSON query performance is really good, see [The billion docs JSON Challenge](https://clickhouse.com/blog/json-bench-clickhouse-vs-mongodb-elasticsearch-duckdb-postgresql) and [Accelerating ClickHouse queries on JSON data for faster Bluesky insights](https://clickhouse.com/blog/accelerating-clickhouse-json-queries-for-fast-bluesky-dashboards)
* [Array(T)](https://clickhouse.com/docs/sql-reference/data-types/array)

## Data Parts

Every time you do an insert in ClickHouse the data becomes a "part" in ClickHouse. Inserts should be peformed in batches (where each batch is thousands or millions of rows). A part is an immutable folder with column and metadata files. For more efficient small inserts you can enable [async inserts](https://clickhouse.com/docs/optimize/asynchronous-inserts) so small inserts are batched

Each column in a part is stored in its own immutable file.

```sql
select *
from system.parts
where table = 'uk_price_paid'
format vertical;
```

## Explain

```sql
EXPLAIN indexes=1 SELECT avg(price)
from uk.uk_price_paid
WHERE postcode1 = 'AL1'
AND   postcode2 = '1AJ'
```

## The System Database and Settings

```sql
show tables from system
select name from system.settings order by name;
select * from system.settings order by name format vertical
```

## Query Formats

[Query format docs](https://clickhouse.com/docs/sql-reference/formats)

```sql
-- Example query formats: vertical, csv, json etc.
select * from system.settings order by name format vertical
```

## Importing Data from S3

```sql
--------------------------------------------------------
-- Querying S3 or GCS files
--------------------------------------------------------

select PROJECT,
       count()
from s3('https://datasets-documentation.s3.eu-west-3.amazonaws.com/pypi/2023/pypi_0_0_0.snappy.parquet')
group by PROJECT
order by 2 desc
limit 40

--------------------------------------------------------
-- Querying 30 s3 files in parallel
--------------------------------------------------------

select PROJECT,
       count()
from s3Cluster('default', 'https://datasets-documentation.s3.eu-west-3.amazonaws.com/pypi/2023/pypi_0_0_*.snappy.parquet')
group by PROJECT
order by 2 desc
limit 40

--------------------------------------------------------
-- Create database and table and insert data from S3
--------------------------------------------------------

CREATE DATABASE uk;

-- CREATE OR REPLACE TABLE
-- CREATE TABLE IF NOT EXISTS
CREATE TABLE uk.uk_price_paid
(
    price UInt32,
    date Date,
    postcode1 LowCardinality(String),
    postcode2 LowCardinality(String),
    type Enum8('terraced' = 1, 'semi-detached' = 2, 'detached' = 3, 'flat' = 4, 'other' = 0),
    is_new UInt8,
    duration Enum8('freehold' = 1, 'leasehold' = 2, 'unknown' = 0),
    addr1 String,
    addr2 String,
    street LowCardinality(String),
    locality LowCardinality(String),
    town LowCardinality(String),
    district LowCardinality(String),
    county LowCardinality(String)
)
ENGINE = MergeTree
ORDER BY (postcode1, postcode2, addr1, addr2);

INSERT INTO uk.uk_price_paid
SELECT
    toUInt32(price_string) AS price,
    parseDateTimeBestEffortUS(time) AS date,
    splitByChar(' ', postcode)[1] AS postcode1,
    splitByChar(' ', postcode)[2] AS postcode2,
    transform(a, ['T', 'S', 'D', 'F', 'O'], ['terraced', 'semi-detached', 'detached', 'flat', 'other']) AS type,
    b = 'Y' AS is_new,
    transform(c, ['F', 'L', 'U'], ['freehold', 'leasehold', 'unknown']) AS duration,
    addr1,
    addr2,
    street,
    locality,
    town,
    district,
    county
FROM url(
    'http://prod1.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-complete.csv',
    'CSV',
    'uuid_string String,
    price_string String,
    time String,
    postcode String,
    a String,
    b String,
    c String,
    addr1 String,
    addr2 String,
    street String,
    locality String,
    town String,
    district String,
    county String,
    d String,
    e String'
) SETTINGS max_http_get_redirects=10;

--------------------------------------------------------
-- CSV formats and schema_inference_hints
--------------------------------------------------------

SELECT
    formatReadableQuantity(sum(approved_amount)),
    formatReadableQuantity(sum(recommended_amount))
FROM s3('https://learn-clickhouse.s3.us-east-2.amazonaws.com/operating_budget.csv')
SETTINGS
format_csv_delimiter='~',
schema_inference_hints='approved_amount UInt32, recommended_amount UInt32';
```

## ClickHouse Built-in Functions

ClickHouse has over 1500 [functions](https://clickhouse.com/docs/sql-reference/functions)

Examples of aggregate functions:

* any
* argMax
* uniq/uniqExact
* count
* min/max
* sum
* avg
* median
* quantile/quantileExact - `quantile(0.9)(price)` (approximate)
* corr
* topK - `topK(10)street` (10 most frequently occuring streets)

There is an `If` aggregate function combinator that you can add as a function suffic to aggregate functions i.e.:

* `sumIf`
* `countIf`
* `topKIf(10)(street, street != '')`

Regular functions:

* [Arithmetic](https://clickhouse.com/docs/sql-reference/functions/arithmetic-functions)
* [Arrays](https://clickhouse.com/docs/sql-reference/functions/array-functions) - `has(array_column, 'value')`
* [Dates and time](https://clickhouse.com/docs/sql-reference/functions/date-time-functions) - `toStartOfMonth`, `addWeeks`, `now()` etc.
* String, String replacement, String search - `position(haystack, needle) > 0`, `positionCaseInsensitive(haystack, needle) > 0`

Date functions:

```sql
SELECT
    toDateTime('2016-06-15 23:12:00') AS time,
    toDate(time) AS date_local,
    toStartOfMonth(time) as date_start_of_month,
    toStartOfWeek(time) as date_start_of_week,
    toStartOfDay(time) as date_start_of_day,
    toStartOfHour(time) as date_start_of_hour,
    toYYYYMM(time) as date_yyyy_mm,
    toYYYYMMDD(time) as date_yyyy_mm_dd,
    toYear(time) as date_year,
    toMonth(time) as date_month,
    toDate(time, 'Asia/Yekaterinburg') AS date_yekat,
    toString(time, 'US/Samoa') AS time_samoa,
    time + INTERVAL 1 DAY as date_plus_1_day,
    addDays(time, 7) as date_add_7_days,
    addMonths(time, 1) as date_add_1_month,
    formatDateTime(time, '%Y-%m-%dT%H:%M:%S') as date_formatted,
    parseDateTimeBestEffort('2025-01-20 20:00') as parsed_best_effort,
    toDate('2024-01-15') as to_date,
    toDateTime('2024-01-15 10:30:00') as to_datetime,
    dateDiff('day', time, addDays(time, 7)) as date_diff
FORMAT VERTICAL;
-- time:                2016-06-15 23:12:00
-- date_local:          2016-06-15
-- date_start_of_month: 2016-06-01
-- date_start_of_week:  2016-06-12
-- date_start_of_day:   2016-06-15 00:00:00
-- date_start_of_hour:  2016-06-15 23:00:00
-- date_yyyy_mm:        201606
-- date_yyyy_mm_dd:     20160615 -- 20.16 million
-- date_year:           2016
-- date_month:          6
-- date_yekat:          2016-06-16
-- time_samoa:          2016-06-15 12:12:00
-- date_plus_1_day:     2016-06-16 23:12:00
-- date_add_7_days:     2016-06-22 23:12:00
-- date_add_1_month:    2016-07-15 23:12:00
-- date_formatted:      2016-06-15T23:June:00
-- parsed_best_effort:  2025-01-20 20:00:00
-- to_date:             2024-01-15
-- to_datetime:         2024-01-15 10:30:00
-- date_diff:           7
```

`argMax` example:

```sql
-- What is the most expensive property sold in uk_prices_2 where postcode equals 'LU1 5FT'?
SELECT argMax(street, price)
FROM uk_prices_2
WHERE postcode = 'LU1 5FT'
```

Example usage for a few math aggregate functions:

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

SELECT min(x)/pow(2,32) as min,
       max(x)/pow(2,32) as max,
       avg(x)/pow(2,32) as avg,
       median(x)/pow(2,32) as median,
       quantile(0.5)(x)/pow(2,32) as p50,
       quantile(0.9)(x)/pow(2,32) as p90,
       quantile(0.99)(x)/pow(2,32) as p99
FROM id_x
FORMAT vertical;
```

## User Defined Functions

[User Defined Functions Docs](https://clickhouse.com/docs/sql-reference/statements/create/function)

SQL User Defined Functions:

```sql
SELECT count() FROM system.functions
-- 1720
CREATE FUNCTION mergePostcode AS (p1, p2) -> concat(p1, p2)
SELECT count() FROM system.functions
-- 1721

SELECT mergePostcode(postcode1, postcode2) as postcode,
       count()
FROM uk_prices_3
WHERE postcode1 != '' AND postcode2 != ''
GROUP BY postcode
ORDER BY count() DESC
LIMIT 100;
```

## Query to see Compression Ratio of Table

```sql
SELECT
    formatReadableSize(total_bytes),
    formatReadableSize(total_bytes_uncompressed),
    total_bytes_uncompressed/total_bytes as compression_ratio
FROM system.tables
WHERE name = 'uk_price_paid';
--    ┌─formatReadab⋯otal_bytes)─┬─formatReadab⋯compressed)─┬─compression_ratio─┐
-- 1. │ 193.23 MiB               │ 709.94 MiB               │ 3.674015729339304 │
--    └──────────────────────────┴──────────────────────────┴───────────────────┘
-- Compare to 4 GB CSV size
```

## Partitioning

You have to be careful that you don't get too many parts in a table. If you have more than 10 thousand parts in ClickHouse Cloud it will stop working. A partition is a part. You should avoid partitioning on high cardinality columns. Without partitioning all the parts of a table may merge into a single part. Merging only happens per partition. The recommendation is to partition by month. You can easily drop single partitions, i.e. `ALTER TABLE DROP PARTITION '2024-01'` and this is the typical use case for partitioning, being able to delete old data.

## Joins

All standards joins are supported

```sql
SELECT n.name,
       g.genre
FROM movies as m
INNER JOIN genres g on m.id = g.movie_id
```

What if my table has billions of rows? ClickHouse has six different join algorithms:

* direct - not memory bound, right hand table is dictionary in memory
* hash - memory bound, in memory hash table of right hand table
* parallel hash - memory bound, similar to hash but splits right table
* grace hash - similar to hash but does not need to fit in memory
* full sorting merge - classic sort merge join
* partial merge - similar to sort merge but minimizes memory usage

Joining billions of rows with billions of rows will require lots of resources regardless of which system you are using

There is a trade-off between memory usage of the join and execution time

```sql
SELECT *
FROM actors a
JOIN roles r on a.id = r.actor_id
-- Default join_algorithm is 'direct'
SETTINGS join_algorithm = 'grace_hash'
```

The `hash` and `parallel_hash` algorithms are fast but use a lot of memory whereas `grace_hash` and `partial_merge` are slower but use less memory

## Dictionaries

[Dictionaries](https://clickhouse.com/docs/sql-reference/dictionaries) are in memory key-value mappings, stored on every replica

```sql
CREATE DICTIONARY uk_populations (
    city String,
    population UInt32
)
PRIMARY KEY city
SOURCE(
    HTTP(
        url 'https://...',
        format 'TabSeparatedWithNames'
    )
)
LAYOUT(HASHED())
LIFETIME(86400) -- update interval in seconds
```

Dictionary functions:

* dictGet()
* dictGet<dataType>()
* dictHas

```sql
CREATE TABLE uk_mortgage_rates_table (
    date DateTime64,
    variable Decimal32(2),
    fixed Decimal32(2),
    bank Decimal32(2)
)
ENGINE = MergeTree()
PRIMARY KEY date;

INSERT INTO uk_mortgage_rates_table
select *
from s3('https://learnclickhouse.s3.us-east-2.amazonaws.com/datasets/mortgage_rates.csv')

CREATE DICTIONARY uk_mortgage_rates
(
    date Date,
    variable Decimal32(2),
    fixed Decimal32(2),
    bank Decimal32(2)
)
PRIMARY KEY date
SOURCE(CLICKHOUSE(TABLE 'uk_mortgage_rates_table'))
-- SOURCE(HTTP(
--     url 'https://learnclickhouse.s3.us-east-2.amazonaws.com/datasets/mortgage_rates.csv'
--     format 'CSV'
-- ))
LAYOUT(COMPLEX_KEY_HASHED())
LIFETIME(2628000000)

-- Check the rows in your dictionary to see if it worked. You should see 220 rows.
select * from uk_mortgage_rates
select count(*) from uk_mortgage_rates
```

## Deleting and Updating Data

Parts in ClickHouse are immutable files. Lets say you have 25 columns and 1 billion rows and you want to delete a row. This is very difficult for ClickHouse. You can do deletes and updates though but it won't happen immediately, instead a mutation is created and it will complete eventually.

```sql
ALTER TABLE random DELETE WHERE y != 'hello';
ALTER TABLE random UPDATE y = 'hello' WHERE x > 10;
```

```sql
SELECT * FROM system.mutations
```

* Mutations execute in order
* Data inserted after is not mutated
* If the mutation gets stuck you can kill it
* Clients can wait by setting mutation_sync = 1 or 2 (default is 0)

Lightweight deletes:

```sql
DELETE FROM my_table WHERE y != 'hello'
```

* The deleted rows are marked as deleted with a hidden column.
* The deleted rows are eventually deleted when parts merge

## Lab Solutions from Real-time analytics with ClickHouse Course

* [Lab 1.2 - Create Table, S3 Import, Basic Queries](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/01_introduction_to_clickhouse/lab_1.2.sql)
* [Lab 2.1 - System Parts, Compression Ratio](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/02_clickhouse_architecture/lab_2.1.sql)
* [Lab 3.1](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/03_inserting_data/lab_3.1.sql)
* [Lab 3.2](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/03_inserting_data/lab_3.2.sql)
* [Lab 4.1 - Setup](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/04_modeling_data/setup.sql)
* [Lab 4.1](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/04_modeling_data/lab_4.1.sql)
* [Lab 5.1](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/05_analyzing_data/lab_5.1.sql)
* [Lab 6.1 - Joins](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/06_joining_data/lab_6.1.sql)
* [Lab 7.1 - ReplacingMergeTree](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/07_deleting_and_updating_data/lab_7.1.sql)
* [Lab 7.2 - CollapsingMergeTree](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/07_deleting_and_updating_data/lab_7.2.sql)
* [Lab 8.1 - Setup](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/08-query-acceleration/setup.sql)
* [Lab 8.1 - MATERIALIZED VIEW](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/08-query-acceleration/lab_8.1.sql)
* [Lab 8.2 - MATERIALIZED VIEW REFRESH](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/08-query-acceleration/lab_8.2.sql)
* [Lab 8.3 - MATERIALIZED VIEW SummingMergeTree](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/08-query-acceleration/lab_8.3.sql)
* [Lab 8.4 - MATERIALIZED VIEW AggregatingMergeTree](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/08-query-acceleration/lab_8.4.sql)
* [Lab 8.5 - ADD PROJECTION](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/08-query-acceleration/lab_8.5.sql)
* [Lab 8.6 - ADD INDEX bloom_filter](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/08-query-acceleration/lab_8.6.sql)
