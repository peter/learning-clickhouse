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

show table from default
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
```

## Lab 1.1 Starting a ClickHouse Cloud Service

## Lab 1.2: Define and Populate a Table

## Lab 1.3 Using the ClickHouse Command-Line Client

## Lab Solutions

https://github.com/ClickHouse/clickhouse-academy/tree/main/realtime-analytics/01_introduction_to_clickhouse

## Quiz

