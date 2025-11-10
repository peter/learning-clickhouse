# Module 3: Inserting Data into ClickHouse

[Module 3: Inserting Data into ClickHouse](https://learn.clickhouse.com/learner_module/show/1872073?lesson_id=10098871&section_id=89411677)

Part of [Real-time analytics with ClickHouse](https://clickhouse.com/learn/real-time-analytics)

## Inserting Data

There are many ways to get data into ClickHouse

* File upload
* ClickPipes for ClickHouse Cloud
* clickhouse client
* Kafka, RammitMQ, SQS
* Migrate from another db
* Client application (Java, Go, Python etc.)

* Wherever you data is, there is a [table function](https://clickhouse.com/docs/sql-reference/table-functions) ([s3](https://clickhouse.com/docs/sql-reference/table-functions/s3), [mongodb](https://clickhouse.com/docs/sql-reference/table-functions/mongodb) etc.) or table engine to read it. The table functions read the data ad hoc from where it sits and don't store it in ClickHouse.
* The [input file format](https://clickhouse.com/docs/interfaces/formats) of the data (CSV, JSON, Parquet etc.) is probably supported

## ClickPipes

ClickPipes is a feature of ClickHouse cloud that allows you to sync with other databases, listen to Kafka topics or pull data from various sources.

The [S3Queue table engine](https://clickhouse.com/docs/engines/table-engines/integrations/s3queue) will sync data from S3 into ClickHouse.

Technique for getting the ClickHouse table schema corresponding to an external data file on S3:

```sql
CREATE OR REPLACE TABLE pypi_temp
ENGINE = Memory
AS
  SELECT *
  FROM s3('https://datasets-documentation.s3.eu-west-3.amazonaws.com/pypi/2023/pypi_0_0_0.snappy.parquet')
  LIMIT 100
  SETTINGS schema_inference_make_columns_nullable = 0;

SHOW CREATE TABLE pypi_temp format raw;
-- CREATE TABLE default.pypi_temp
-- (
--     `TIMESTAMP` DateTime64(3, 'UTC'),
--     `COUNTRY_CODE` String,
--     `URL` String,
--     `PROJECT` String,
--     `FILE` String,
--     `INSTALLER` String,
--     `PYTHON` String,
--     `IMPLEMENTATION` String,
--     `DISTRO` String,
--     `SYSTEM` String,
--     `CPU` String,
--     `OPENSSL_VERSION` String,
--     `SETUPTOOLS_VERSION` String,
--     `RUSTC_VERSION` String,
--     `TLS_PROTOCOL` String,
--     `TLS_CIPHER` String
-- )
-- ENGINE = Memory

CREATE TABLE pypi
(
    `TIMESTAMP` DateTime64(3, 'UTC'),
    `COUNTRY_CODE` LowCardinality(String),
    `URL` LowCardinality(String),
    `PROJECT` LowCardinality(String),
    `FILE` LowCardinality(String),
    `INSTALLER` LowCardinality(String),
    `PYTHON` LowCardinality(String),
    `IMPLEMENTATION` LowCardinality(String),
    `DISTRO` LowCardinality(String),
    `SYSTEM` LowCardinality(String),
    `CPU` LowCardinality(String),
    `OPENSSL_VERSION` LowCardinality(String),
    `SETUPTOOLS_VERSION` LowCardinality(String),
    `RUSTC_VERSION` LowCardinality(String),
    `TLS_PROTOCOL` LowCardinality(String),
    `TLS_CIPHER` LowCardinality(String)
)
ENGINE = MergeTree
PRIMARY KEY (PROJECT, TIMESTAMP)

CREATE TABLE pypi_s3queue
AS pypi
ENGINE = S3Queue(
    'https://datasets-documentation.s3.eu-west-3.amazonaws.com/pypi/2023/pypi_0_0_*.snappy.parquet',
    'Parquet'
)
SETTINGS mode = 'unordered'

SELECT * FROM pypi
SELECT * FROM pypi_s3queue

CREATE MATERIALIZED VIEW pypi_s3queue_mv
TO pypi
AS
  SELECT *
  FROM pypi_s3queue;

SELECT count() FROM pypi

SELECT PROJECT,
       count()
FROM pypi
GROUP BY PROJECT
ORDER BY count() DESC
LIMIT 100
```

ClickPipes implements Change Data Capture (CDC) for a number of databases

There is Data Lake and Apache Iceberg integration (s3, Azure, HDFS) for ClickHouse

## Lab 3.1 Inserting the Weather Dataset

```sql
-- The Parquet file with the weather data is located at:
-- 'https://datasets-documentation.s3.eu-west-3.amazonaws.com/noaa/noaa_enriched.parquet(opens in a new tab)'
-- Use DESC and the s3 table function to view the schema of this dataset.
DESC s3('https://datasets-documentation.s3.eu-west-3.amazonaws.com/noaa/noaa_enriched.parquet')
SETTINGS schema_inference_make_columns_nullable=0;

CREATE TABLE weather_temp
ENGINE Memory
AS SELECT *
   FROM s3('https://datasets-documentation.s3.eu-west-3.amazonaws.com/noaa/noaa_enriched.parquet')
   LIMIT 100
   SETTINGS schema_inference_make_columns_nullable=0   

show create table weather_temp format raw
-- CREATE TABLE default.weather_temp
-- (
--     `station_id` String,
--     `date` Date32,
--     `tempAvg` Int32,
--     `tempMax` Int32,
--     `tempMin` Int32,
--     `precipitation` Int32,
--     `snowfall` Int32,
--     `snowDepth` Int32,
--     `percentDailySun` Int8,
--     `averageWindSpeed` Int32,
--     `maxWindSpeed` Int32,
--     `weatherType` UInt8,
--     `location` Tuple(
--         `1` Float64,
--         `2` Float64),
--     `elevation` Float32,
--     `name` String
-- )
-- ENGINE = Memory

CREATE TABLE weather
(
    `station_id` LowCardinality(String),
    `date` Date32,
    `tempAvg` Int32,
    `tempMax` Int32,
    `tempMin` Int32,
    `precipitation` Int32,
    `snowfall` Int32,
    `snowDepth` Int32,
    `percentDailySun` Int8,
    `averageWindSpeed` Int32,
    `maxWindSpeed` Int32,
    `weatherType` UInt8,
    `location` Tuple(
        `1` Float64,
        `2` Float64),
    `elevation` Float32,
    `name` LowCardinality(String)
)
ENGINE = MergeTree
PRIMARY KEY date

INSERT INTO weather
SELECT *
FROM s3('https://datasets-documentation.s3.eu-west-3.amazonaws.com/noaa/noaa_enriched.parquet')
WHERE toYear(date) >= 1995
-- 0 rows in set. Elapsed: 32.212 sec. Processed 305.93 million rows, 792.18 MB (9.50 million rows/s., 24.59 MB/s.)

SELECT
    tempMax / 10 AS maxTemp,
    location,
    name,
    date
FROM weather
WHERE tempMax > 500
ORDER BY
    tempMax DESC,
    date ASC
LIMIT 10;
-- 10 rows in set. Elapsed: 0.200 sec. Processed 305.04 million rows, 1.29 GB (1.52 billion rows/s., 6.41 GB/s.)

SELECT
    formatReadableSize(sum(data_compressed_bytes)) AS compressed_size,
    formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed_size
FROM system.parts
WHERE table = 'weather' AND active = 1;

-- Summary: What's nice about this lab is that you did not have to type the schema of the weather table. Using a Memory table is a clever way to let ClickHouse infer the schema and create a table for you, then copy-and-paste that schema and tweak it for your specific needs.
```

## Lab 3.2 Insert an Imperfect CSV File

```sql
-- Introduction: In this lab, you will learn how to deal with inserting files that have a few "issues" with the data - including parsing a string into two columns, casting data types, and skipping a few rows when necessary. We will provide guidance, but you will likely need to search the docs for assistance along the way.

-- The file is saved with a .csv extension, but notice the delimiter is a ~ character instead of a comma. Write a query that counts the number of rows in this file, which is found at https://learn-clickhouse.s3.us-east-2.amazonaws.com/operating_budget.csv (opens in a new tab).

NOTE: The data represents the operating budget for the state of South Dakota in the USA for the year 2022. Each row contains an amount of money being requested (the recommended_amount column), along with how much was approved (the approved_amount column), and how much money was actually funded (the actual_amount column).

SELECT COUNT()
FROM s3('https://learn-clickhouse.s3.us-east-2.amazonaws.com/operating_budget.csv')
SETTINGS format_csv_delimiter = '~'
-- 1 row in set. Elapsed: 0.935 sec. Processed 6.21 thousand rows, 1.03 MB (6.64 thousand rows/s., 1.10 MB/s.)

SELECT SUM(toUInt32(approved_amount))
FROM s3('https://learn-clickhouse.s3.us-east-2.amazonaws.com/operating_budget.csv')
SETTINGS format_csv_delimiter = '~'
--    ┌─SUM(toUInt32⋯ed_amount))─┐
-- 1. │              10011902489 │ -- 10.01 billion
--    └──────────────────────────┘
-- 1 row in set. Elapsed: 0.360 sec. Processed 6.21 thousand rows, 1.03 MB (17.24 thousand rows/s., 2.86 MB/s.)

DESCRIBE s3('https://learn-clickhouse.s3.us-east-2.amazonaws.com/operating_budget.csv')
SETTINGS format_csv_delimiter = '~'

-- One clever trick you can use is to cast the string column into a numeric value using a function like toUInt32OrZero. If one of the values in a row is not a valid integer, the function will return 0. Write a query that uses toUInt32OrZero to sum up the values of both the approved_amount and recommended_amount columns.
SELECT SUM(toUInt32OrZero(approved_amount)),
       SUM(toUInt32OrZero(recommended_amount))
FROM s3('https://learn-clickhouse.s3.us-east-2.amazonaws.com/operating_budget.csv')
SETTINGS format_csv_delimiter = '~'

SELECT approved_amount,
       recommended_amount
FROM s3('https://learn-clickhouse.s3.us-east-2.amazonaws.com/operating_budget.csv')
SETTINGS format_csv_delimiter = '~'

-- The issue with the approved_amount and recommended_amount columns is that a handful of rows contain "n/a" instead of a numeric value, so their inferred data type is String. Try running the following query, which uses the schema_inference_hints setting and suggests the data type for these two columns to be UInt32. Does it work? Why?
SELECT
    formatReadableQuantity(sum(approved_amount)),
    formatReadableQuantity(sum(recommended_amount))
FROM s3('https://learn-clickhouse.s3.us-east-2.amazonaws.com/operating_budget.csv')
SETTINGS
format_csv_delimiter='~',
schema_inference_hints='approved_amount UInt32, recommended_amount UInt32';

CREATE TABLE operating_budget
(
  fiscal_year LowCardinality(String),
  service LowCardinality(String),
  department LowCardinality(String),
  program LowCardinality(String),
  -- derived from program
  program_code LowCardinality(String),
  item_category LowCardinality(String),
  fund LowCardinality(String),
  description String,

  approved_amount UInt32,
  recommended_amount UInt32,

  actual_amount Decimal(12, 2),
  fund_type Enum('GENERAL FUNDS' = 1, 'FEDERAL FUNDS' = 2, 'OTHER FUNDS' = 3)
)
ENGINE = MergeTree
PRIMARY KEY (fiscal_year, program)

SELECT count()
FROM url('https://learn-clickhouse.s3.us-east-2.amazonaws.com/operating_budget.csv', 
         'CSV')
SETTINGS input_format_csv_skip_first_lines = 1,
         format_csv_delimiter='~';
-- 6205

SELECT *
FROM url('https://learn-clickhouse.s3.us-east-2.amazonaws.com/operating_budget.csv', 
         'CSV')
LIMIT 100
SETTINGS input_format_csv_skip_first_lines = 1,
         format_csv_delimiter='~';
-- CSV header names:

-- fiscal_year
-- service
-- department
-- program
-- description
-- item_category
-- approved_amount
-- recommended_amount
-- actual_amount
-- fund
-- fund_type

-- c1:  2021
-- c2:  SERVING AND SUPPORTING SD
-- c3:  AGRICULTURE & NAT. RESOURCES
-- c4:  RESOURCE CONSERVATION & FORESTRY (032)
-- c5:  SUPPLIES & MATERIALS
-- c6:  OPERATING EXPENSE
-- c7:  5225
-- c8:  5225
-- c9:  0
-- c10: AGRICULTURAL SERVICES
-- c11: OTHER FUNDS

-- NOTE/GOTCHA: column order needs to match with create table statement
INSERT INTO operating_budget
SELECT c1 as fiscal_year,
       c2 as service,
       c3 as department,
       c4 as program,
       replaceRegexpAll(program, '[^0-9]', '') as program_code,
       c6 as item_category,
       c10 as fund,
       c5 as description,
       toUInt32(c7) as approved_amount,
       toUInt32(c8) as recommended_amount,
       toDecimal64(toString(c9), 2)  as actual_amount,
       c11 as fund_type
FROM url('https://learn-clickhouse.s3.us-east-2.amazonaws.com/operating_budget.csv', 
         'CSV')
SETTINGS input_format_csv_skip_first_lines = 1,
         format_csv_delimiter='~';

select sum(approved_amount) from operating_budget where fiscal_year = '2022'

select sum(actual_amount)
from operating_budget
where fiscal_year = '2022'
and program_code = '031'
```