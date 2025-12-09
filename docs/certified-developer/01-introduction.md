# Module 1: Introduction to ClickHouse

[Module 1: Introduction to ClickHouse](https://learn.clickhouse.com/learner_module/show/1872073?lesson_id=10037878&section_id=90616375)

Part of [Real-time analytics with ClickHouse](https://clickhouse.com/learn/real-time-analytics)

## What is ClickHouse?

ClickHouse is:

* An OLAP database (Analytical Database, i.e. not an OLTP database and not optimized for transactions)
* A column oriented SQL database
* Designed for fast ingestion and fast analytics queries
* Open Source with over 40k stars on Github
* Timeline of ClickHouse:
    * 2009 - developed for clickstream analytics at Yandex
    * 2012 - used in production
    * 2016 - open sources
    * 2021 - ClickHouse Inc was founded
    * 2022 - ClickHouse cloud was launched

## ClickHouse Use Cases

see: https://clickhouse.com/use-cases

* Real-time analytics. This is the most popular use case (i.e. Disney+, Cloudflare etc.). Queries take milliseconds. CloudFlare ingests hundreds of millions of rows per second.
* Observability. Migrations from more expensive or slower tools like Datadog, Splunk, ElasticSearch. ClickHouse has an observability offering called [ClickStack](https://clickhouse.com/use-cases/observability) (based on [HyperDX](https://www.hyperdx.io)). The ClickHouse Cloud internal observability platform has over 100 Peta Bytes of data.
* Data warehousing
* Machine Learning and GenAI

## Running ClickHouse

Two main options:

* ClickHouse Cloud
* Self Managed

You can easily install and [run ClickHouse locally](./running-locally.md) on your machine with commands like:

* `brew install --cask clickhouse`
* `clickhouse server`
* `clickhouse client`

Out of the box ClickHouse comes with four databases:

```sql
show databases
--    ┌─name───────────────┐
-- 1. │ INFORMATION_SCHEMA │
-- 2. │ default            │
-- 3. │ information_schema │
-- 4. │ system             │
--    └────────────────────┘

show tables from default
-- no tables until you create some

show tables from system
-- errors
-- merges
-- parts
-- query_log
-- tables
-- trace_log
-- settings
-- ... 293 tables

select name from system.settings order by name;
-- 1369 rows in set.
select * from system.settings order by name format vertical
```

[Analytics for PyPI packages](https://clickpy.clickhouse.com/) ([Github](https://github.com/ClickHouse/clickpy)) contains over 2000 billion rows with downloads across over 800k Python packages. We can query data in that dataset directly from Parquet files:

```sql
select *
from s3('https://datasets-documentation.s3.eu-west-3.amazonaws.com/pypi/2023/pypi_0_0_0.snappy.parquet')
limit 100
format vertical

select PROJECT,
       count()
from s3('https://datasets-documentation.s3.eu-west-3.amazonaws.com/pypi/2023/pypi_0_0_0.snappy.parquet')
group by PROJECT
order by 2 desc
limit 40
-- 40 rows in set. Elapsed: 0.142 sec. Processed 1.68 million rows, 148.74 MB (11.84 million rows/s., 1.05 GB/s.)

-- Querying 30 s3 files in parallel
select PROJECT,
       count()
from s3Cluster('default', 'https://datasets-documentation.s3.eu-west-3.amazonaws.com/pypi/2023/pypi_0_0_*.snappy.parquet')
group by PROJECT
order by 2 desc
limit 40
-- 40 rows in set. Elapsed: 1.326 sec. Processed 64.91 million rows, 5.71 GB (48.94 million rows/s., 4.30 GB/s.)
```

Parquet files are efficient and column oriented.

[The UK property prices dataset](https://clickhouse.com/docs/getting-started/example-datasets/uk-price-paid):

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
-- 0 rows in set. Elapsed: 62.926 sec. Processed 30.63 million rows, 5.36 GB (486.77 thousand rows/s., 85.15 MB/s.)

select count() from uk.uk_price_paid
-- 30 million
select * from uk.uk_price_paid limit 100 format vertical;
select min(date),
       max(date)
from uk.uk_price_paid;
-- 30 years of data
```

ClickHouse will insert around 500 thousand up to 1 million rows per second in this case depending on network speed and server capacity.

ClickHouse has over 1500 [functions](https://clickhouse.com/docs/sql-reference/functions)

Query to see compression ratio of table:

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

Visualizations (Charts) are available in the ClickHouse console and you can also create Dashboards there. Example query using the [bar function](https://clickhouse.com/docs/sql-reference/functions/other-functions#bar):

```sql
SELECT  toYear(date) as year,
        round(avg(price)) as price,
        bar(price, 0, 1000000, 80)
FROM uk.uk_price_paid
GROUP BY year
ORDER BY year
-- 31 rows in set. Elapsed: 0.057 sec. Processed 30.63 million rows, 183.78 MB (535.83 million rows/s., 3.21 GB/s.)

SELECT town,
       district,
       round(avg(price)) as price
FROM uk.uk_price_paid
WHERE date >= '2020-01-01'
GROUP BY town,
         district
ORDER BY price DESC
LIMIT 20
-- 20 rows in set. Elapsed: 0.074 sec. Processed 30.63 million rows, 245.48 MB (413.72 million rows/s., 3.32 GB/s.)
```

## Lab 1.1 Starting a ClickHouse Cloud Service

1. Go to http://clickhouse.cloud(opens in a new tab) and log in. If you do not have a ClickHouse account yet, create one.
2. If this is your first time logging into ClickHouse Cloud, you will automatically start an "onboarding" process that walks you through creating a new service.
3. Enter a service name of your choice and pick a cloud provider and region – it doesn’t matter which you choose for the labs - then. click the Create Service button. This will start provisioning a new service. The provisioning can take several minutes.

## Lab 1.2: Define and Populate a Table

The UK property prices are in a CSV file at:
'https://learn-clickhouse.s3.us-east-2.amazonaws.com/uk_property_prices/uk_prices.csv.zst'(opens in a new tab).
Run a query that selects 1000 rows from the file using the s3 table function.

The CSV file has a header row. Notice the s3 table function used that header row to determine column names. It also reads thousands of rows to infer a schema. View the inferred schema using DESC:

```sql
DESC s3('https://learn-clickhouse.s3.us-east-2.amazonaws.com/uk_property_prices/uk_prices.csv.zst');
```

```sql
CREATE OR REPLACE TABLE uk_prices_temp 
ENGINE = Memory
AS 
    SELECT * 
    FROM s3('https://learn-clickhouse.s3.us-east-2.amazonaws.com/uk_property_prices/uk_prices.csv.zst')
    LIMIT 100;

SHOW CREATE TABLE uk_prices_temp;
-- CREATE TABLE default.uk_prices_temp
-- (
--     `id` Nullable(String),
--     `price` Nullable(String),
--     `date` Nullable(DateTime),
--     `postcode` Nullable(String),
--     `type` Nullable(String),
--     `is_new` Nullable(String),
--     `duration` Nullable(String),
--     `addr1` Nullable(String),
--     `addr2` Nullable(String),
--     `street` Nullable(String),
--     `locality` Nullable(String),
--     `town` Nullable(String),
--     `district` Nullable(String),
--     `county` Nullable(String),
--     `column15` Nullable(String),
--     `column16` Nullable(String)
-- )
-- ENGINE = Memory
```

```sql
CREATE TABLE uk_prices_1
(
    `id` Nullable(String),
    `price` Nullable(String),
    `date` DateTime,
    `postcode` Nullable(String),
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
PRIMARY KEY date;

INSERT INTO uk_prices_1
    SELECT * 
    FROM s3('https://learn-clickhouse.s3.us-east-2.amazonaws.com/uk_property_prices/uk_prices.csv.zst');

select count(*) from uk_prices_1;
-- 30,033,199

SELECT avg(toUInt32(price))
FROM uk_prices_1;

SELECT avg(toUInt32(price))
FROM uk_prices_1
WHERE toYear(date) >= '2020';

SELECT avg(toUInt32(price))
FROM uk_prices_1
WHERE town = 'LONDON';
```

A .zst file is a file compressed using Zstandard (also called zstd), a fast compression algorithm developed by Facebook/Meta. You can install it on Mac with `brew install zstd` and use it with `zstd -d file.zst`

## Lab 1.3 Using the ClickHouse Command-Line Client

See [ClickHouse CLI Documentation](https://clickhouse.com/docs/interfaces/cli)

## Lab Solutions

https://github.com/ClickHouse/clickhouse-academy/tree/main/realtime-analytics/01_introduction_to_clickhouse

## Quiz

