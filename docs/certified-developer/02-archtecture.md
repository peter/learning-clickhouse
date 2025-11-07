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

## MergeTree

## Data Parts

## Primary Key

## Lab 2.1: Understanding Primary Keys in ClickHouse
