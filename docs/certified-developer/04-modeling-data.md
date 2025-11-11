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
