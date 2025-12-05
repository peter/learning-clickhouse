# Module 9: Sharding and Replication

[Module 9: Sharding and Replication](https://learn.clickhouse.com/learner_module/show/1914307?lesson_id=10274294&section_id=90752968)

Part of [Real-time analytics with ClickHouse](https://clickhouse.com/learn/real-time-analytics)

Lab solutions
https://github.com/ClickHouse/clickhouse-academy/tree/main/realtime-analytics/09_sharding_and_replication

## Overview of Scaling

You normally want all your data to go into the MergeTree data. In production this only works
on a single node. In production you want replicas so that data is stored in multiple places
which yields better uptime when a server fails.

Two directions of scaling:

* Sharding for when your data doesn't fit on a single machine. If you can avoid sharding you should. CLickHouse Cloud doesn't need this as it uses blob storage (S3). In ClickHouse the shards don't talk to each other. You have to set up a proxy table on top of the shards.
* For reliability you need replication (i.e. copies of data / duplication)

You could for example have 3 shards (split data in 3 parts) with two replicas each (two copies each). Data is automatically copied to the replica.

ClickHouse keeper is a coordination system designed specifically for ClickHouse clusters. It handles data replication. Historically, ClickHouse relied on Apache ZooKeeper for this coordination. ClickHouse Keeper was built as a drop-in replacement to remove the dependency on Java and ZooKeeper. You can run ClickHouse keeper embedded in the clickhouse server process or as a separate standalone process.

Database host: a running instance of clickhouse server. Running ClickHouse server on four hosts dons not automatically create a cluster. Replicas Need to live on different hosts.

Purpose of replication in ClickHouse:

* High Availability (HA) and Fault Tolerance (handling hardware failure etc.)
* Scaling Read Throughput
* Zero downtime maintenance

## Implementing Scaling

MergeTree doesn't work for the scaling setup. Instead you can use `ReplicatedMergeTree` or another table engine with the `Replicated` name prefix.

* A cluster is one ore more shards
* Shards consist of one or more replicas

You put an XML config file with a `<remove_servers>` tag that you put on `all your hosts.

```sql
-- You can run this on any of the hosts in the cluster
CREATE DATABASE my_db ON CLUSTER cluster1;

-- {shard} and {replica} are parameters that you define on each host in the config file in <macros>
CREATE TABLE my_db.my_table ON CLUSTER cluster1
(
    user_id UInt32,
    message String,
    timestamp DateTime,
    metric FLoat32
)
ENGINE = ReplicatedMergeTree(
    '/clickhouse/tables/{uuid}/{shard}',
    '{replica}'
)
ORDER BY (user_id, timestamp)

-- This is the proxy table, sharding by user_id, you will insert into this table and query it
-- Queries are forwarded to all the shards
-- The replication within the shards happens automatically behind the scenes
CREATE TABLE my_distributed_table
    AS my_db.my_table
    ENGINE = Distributed (cluster1, my_db, my_table, user_id);
```

## Scaling in ClickHouse Cloud

Transparently uses SharedMergeTree behind the scenes when you specify MergeTree for your tables. This is a replacement for ReplicatedMergeTree and that works with S3, GCS, Azure Blob Storage etc. No sharding is required. Provides separation of compute and storage. There is no data replication happening in ClickHouse Cloud and this makes things faster. The replicates are there for compute power. You can have some replicas for inserts and some for queries.

The system database is not replicated and does not contain the same information in each host in a cluster.

## Lab 9.1 Querying the System Tables

ntroduction:  In this lab, you will search the system tables, which appear on all the nodes in a cluster but do not have a distributed table that queries them directly. NOTE: This lab will not make sense unless you are running the queries on ClickHouse Cloud or some other multi-node cluster.

```sql
SELECT
    cluster,
    shard_num,
    replica_num,
    database_shard_name,
    database_replica_name
FROM system.clusters;

SELECT event_time, query
FROM system.query_log
ORDER BY event_time DESC
LIMIT 20;

-- Use the clusterAllReplicas function to invoke the query from step 2 on all nodes in the default cluster.

-- Write a query that returns all queries executed on the default.uk_prices_3 table. (Check out what's in the tables column in the system.query_log table.)

-- Calculate the number of queries executed on the default cluster that contain the substring 'insert' (case insensitive).

-- Run the following query, which counts the number of parts on whichever node handles the request:
SELECT count()
FROM system.parts;

-- Now write a query that returns the number of all parts in your default cluster.

SELECT
    instance,
    * EXCEPT instance APPLY formatReadableSize
FROM (
    SELECT
        hostname() AS instance,
        sum(primary_key_size),
        sum(primary_key_bytes_in_memory),
        sum(primary_key_bytes_in_memory_allocated)
    FROM clusterAllReplicas(default, system.parts)
    GROUP BY instance
);
```

## Lab 9.2 Parallel Processing of Files

Introduction:  In this lab, you will take advantage of your Cloud cluster to download files from a cloud storage in parallel across the nodes in your cluster.

Run the following query, which returns the top 20 Python libraries in terms of downloads. Notice the filename has an asterisk (there are 38 Parquet files in S3):

```sql
SELECT 
    PROJECT,
    count()
FROM s3('https://datasets-documentation.s3.eu-west-3.amazonaws.com/pypi/2023/pypi_0_0_*.snappy.parquet')
GROUP BY PROJECT
ORDER BY 2 DESC
LIMIT 20;
-- 20 rows in set. Elapsed: 2.363 sec. Processed 64.91 million rows, 5.71 GB (27.47 million rows/s., 2.42 GB/s.)

-- Modify the previous query so that it uses the s3Cluster table function instead of s3. The cluster name in ClickHouse Cloud is default. Your query should run much faster now.
```
