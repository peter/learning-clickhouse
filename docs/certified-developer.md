## ClickHouse Certified Developer

Recommended for ClickHouse experts who handle app creation, data ingestion, modeling, query efficiency, and optimization.

* Recommended training: [Real-time analytics with ClickHouse](https://clickhouse.com/learn/real-time-analytics) (10 modules and 10 hours with Rich Raposa).
* [Guide for how to prepare and what to expect (Video)](https://www.youtube.com/watch?si=T8Gp9OX8GnVZUmtH&v=bLXCYhf5G8Q&feature=youtu.be)

## Real-time Analytics with ClickHouse: Level 1

https://learn.clickhouse.com/visitor_catalog_class/show/1872073/Real-time-Analytics-with-ClickHouse-Level-1

### Module 1: Introduction to ClickHouse

https://learn.clickhouse.com/learner_module/show/1872073?lesson_id=10037878&section_id=90616375

What is ClickHouse? ClickHouse is:

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

ClickHouse Use Cases (see: https://clickhouse.com/use-cases):

* Real-time analytics. This is the most popular use case (i.e. Disney+, Cloudflare etc.). Queries take milliseconds. CloudFlare ingests hundreds of millions of rows per second.
* Observability. Migrations from more expensive or slower tools like Datadog, Splunk, ElasticSearch. ClickHouse has an observability offering called [ClickStack](https://clickhouse.com/use-cases/observability) (based on [HyperDX](https://www.hyperdx.io)). The ClickHouse Cloud internal observability platform has over 100 Peta Bytes of data.
* Data warehousing
* Machine Learning and GenAI

Running ClickHouse

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

### Module 2: Deep dive into ClickHouse Architecture

TODO

### Module 3: Inserting Data into ClickHouse

TODO

## Real-time Analytics with ClickHouse: Level 2

https://learn.clickhouse.com/visitor_catalog_class/show/1896608/Real-time-Analytics-with-ClickHouse-Level-2

### Module 4: Modeling Data with ClickHouse

TODO

### Module 5: Analyzing Data with ClickHouse

TODO

### Module 6: Joining Data

TODO

### Module 7: Deleting and Updating Data

TODO

## Real-time Analytics with ClickHouse: Level 3

https://learn.clickhouse.com/visitor_catalog_class/show/1914307/Real-time-Analytics-with-ClickHouse-Level-3

### Module 8: Query and Acceleration Techniques

TODO

### Module 9: Sharding and Replication

TODO

### Module 10: Managing Data in ClickHouse

TODO
