# ClickHouse Cheat Sheet

## Showing Databases and Tables

```sql
show databases
use default
show tables
show create table my_table
show create table my_table
```

## Table Creation and Basic Queries

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
