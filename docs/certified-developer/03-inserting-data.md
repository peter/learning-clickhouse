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
```

## Lab 3.2 Insert an Imperfect CSV File
