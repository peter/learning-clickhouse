# Module 4: Modeling Data with ClickHouse

[Module 4: Modeling Data with ClickHouse](https://learn.clickhouse.com/learner_module/show/1896608?lesson_id=10185592&section_id=91495752)

Part of [Real-time analytics with ClickHouse](https://clickhouse.com/learn/real-time-analytics)

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

## Default Column Values

```sql
CREATE TABLE logs
(
    id UInt32,
    message String,
    timestamp DateTime DEFAULT now()
)
ENGINE = MergeTre()
PRIMARY KEY id
```

You can mark a column as `EPHEMERAL` which means it will not store any values and this can be useful for materialized views where you don't need the original value but just some transformed (i.e. `MATERIALIZED`) value:

```sql
CREATE OR REPLACE TABLE logs
(
    id UInt32,
    message String EPHEMERAL,
    -- NOTE: arrays in clickhouse are 1-based
    level String MATERIALIZED splitByChar(':', message)[1],
    timestamp DateTime DEFAULT now()
)
ENGINE = MergeTre()
PRIMARY KEY id
```

## Partitioning

You have to be careful that you don't get too many parts in a table. If you have more than 10 thousand parts in ClickHouse Cloud it will stop working. A partition is a part. You should avoid partitioning on high cardinality columns. Without partitioning all the parts of a table may merge into a single part. Merging only happens per partition. The recommendation is to partition by month. You can easily drop single partitions, i.e. `ALTER TABLE DROP PARTITION '2024-01'` and this is the typical use case for partitioning, being able to delete old data.

## Lab 4.1 Using Appropriate Data Types

Introduction: When dealing with massive amounts of data, it is important to choose the right data type for your specific data - both in terms of saving disk space and in optimizing the reading and writing of your data. In this lab, you will greatly improve the performance of the UK property prices tables by choosing better data types.

```sql
SELECT 
    id,
    replaceRegexpAll(id,'[{}]','')
FROM uk_prices_2
LIMIT 100;

WITH
    splitByChar(' ', postcode) AS postcodes
SELECT
    postcodes[1] AS postcode1,
    postcodes[2] AS postcode2
FROM uk_prices_2
WHERE postcode != ''
LIMIT 100;
--      ┌─postcode1─┬─postcode2─┐
--   1. │ TA4       │ 1NU       │
--   2. │ TA4       │ 1NU       │
--   3. │ TA4       │ 1NU       │

SELECT
    uniq(postcode1),
    uniq(postcode2)
FROM (
    WITH
    splitByChar(' ', postcode) AS postcodes
    SELECT
        postcodes[1] AS postcode1,
        postcodes[2] AS postcode2
    FROM uk_prices_2
    WHERE postcode != ''
);
--    ┌─uniq(postcode1)─┬─uniq(postcode2)─┐
-- 1. │            2390 │            4006 │
--    └─────────────────┴─────────────────┘
```

Some of the other String columns in uk_prices_2 can definitely be LowCardinality. Let's figure out which ones by running a query that runs the uniq function on each of the following columns in uk_prices_2:

```sql
SELECT 
    uniq(postcode),
    uniq(addr1),
    uniq(addr2),
    uniq(street),
    uniq(locality),
    uniq(town),
    uniq(district),
    uniq(county) 
FROM uk_prices_2;
--    ┌─uniq(postcode)─┬─uniq(addr1)─┬─uniq(addr2)─┬─uniq(street)─┬─uniq(locality)─┬─uniq(town)─┬─uniq(district)─┬─uniq(county)─┐
-- 1. │        1324806 │      572122 │       68113 │       334811 │          23978 │       1172 │            467 │          132 │
--    └────────────────┴─────────────┴─────────────┴──────────────┴────────────────┴────────────┴────────────────┴──────────────┘
-- town
-- district
-- county
```

```sql
CREATE TABLE uk_prices_3
(
    id UUID,
    price UInt32,
    date DateTime,
    postcode1 String,
    postcode2 String,
    type Enum8('terraced' = 1, 'semi-detached' = 2, 'detached' = 3, 'flat' = 4, 'other' = 0),
    is_new UInt8,
    duration Enum8('freehold' = 1, 'leasehold' = 2, 'unknown' = 0),
    addr1 String,
    addr2 String,
    street String,
    locality LowCardinality(String),
    town LowCardinality(String),
    district LowCardinality(String),
    county LowCardinality(String)
)
ENGINE = MergeTree
PRIMARY KEY (postcode1, postcode2);

INSERT INTO uk_prices_3
    WITH
        splitByChar(' ', postcode) AS postcodes
    SELECT
        replaceRegexpAll(id,'[{}]','') AS id,
        toUInt32(price) AS price,
        date,
        postcodes[1] AS postcode1,
        postcodes[2] AS postcode2,
        transform(type, ['T', 'S', 'D', 'F', 'O'], ['terraced', 'semi-detached', 'detached', 'flat', 'other'],'other') AS type,
        is_new = 'Y' AS is_new,
        transform(duration, ['F', 'L', 'U'], ['freehold', 'leasehold', 'unknown'],'unknown') AS duration,
        addr1,
        addr2,
        street,
        locality,
        town,
        district,
        county
    FROM uk_prices_2;

SELECT count() FROM uk_prices_3;

-- Notice the uk_prices_3 table consumes about 13% less disk space than uk_prices_2:
SELECT
    table,
    formatReadableSize(sum(data_compressed_bytes)) AS compressed_size,
    formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed_size
FROM system.parts
WHERE table ilike 'uk_prices_%' AND active = 1
GROUP BY table
ORDER BY table;
--    ┌─table───────┬─compressed_size─┬─uncompressed_size─┐
-- 1. │ uk_prices_1 │ 1.17 GiB        │ 4.05 GiB          │
-- 2. │ uk_prices_2 │ 700.48 MiB      │ 4.02 GiB          │
-- 3. │ uk_prices_3 │ 608.63 MiB      │ 1.67 GiB          │
--    └─────────────┴─────────────────┴───────────────────┘

SELECT 
    town,
    max(price)
FROM uk_prices_3
GROUP BY town 
ORDER BY 2 DESC
LIMIT 25;

-- This query computes the average and maximum price of all properties within the given postcode1 and postcode2. Notice it only processes 1 - 6 granules (depending on how many parts your table has) - which is amazing but not surprising: those two columns define the primary key.
SELECT
    avg(price),
    max(price) 
FROM uk_prices_3 
WHERE postcode1 = 'BD16'
AND postcode2 = '1AE';

-- Notice how many rows need to be processed when only the second column of the primary key is used in the WHERE clause (it is over half the dataset):
SELECT
    avg(price),
    max(price) 
FROM uk_prices_3 
WHERE postcode2 = '1AE';
```

Summary: Hopefully you now have a better understanding of the various ClickHouse data types, and you are becoming more comfortable with defining tables that take advantage of the features of ClickHouse. For example, it is helpful to know when to use LowCardinality (which can really save a lot of space and improve query performance greatly) as well as when to use or not use Nullable (use it when the business logic requires it; otherwise don't use it!).

## Quiz

* Default database engine in ClickHouse is atomic (for ClickHouse Cloud it's something else)
* By default, missing values are set to the default value of the respective data type. For example, missing numbers are set to 0, and missing String columns are set to an empty string.  To set missing values to NULL, use the Nullable data type (e.g. Nullable(String)).
