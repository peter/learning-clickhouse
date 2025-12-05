# Module 10: Managing Data in ClickHouse

[Module 10: Managing Data in ClickHouse](https://learn.clickhouse.com/learner_module/show/1914307?from=%2Flearner_module%2Fshow%2F1914307%3Flesson_id%3D10274294%26section_id%3D90752968&lesson_id=10274295)

Part of [Real-time analytics with ClickHouse](https://clickhouse.com/learn/real-time-analytics)

## Data Compression

Algorithms:

* lz4 - fast but low compression ratio
* lz4hc - higher compression ratio, slower
* zstd - high compression ratio (30% better), slower. This is the default

You can configure compression in a config file. You can also specify compression per column (since each column is stored separately):

```sql
CREATE TABLE codec_example
(
    column1 UInt64 CODEC(DoubleDelta, LZ4), -- stores diffs
    column2 String CODEC(LZ4HC),
    column3 Float32 CODEC(NONE),
    column4 Float64 CODEC(LZ4HC(9))
)
```

You get the best query speed without compression and this will use the most disk space.

See compression ratio per column:

```sql
SELECT
    name,
    formatReadableSize(data_compressed_bytes),
    formatReadableSize(data_uncompressed_bytes)
FROM system.columns
WHERE table = 'my_table';
```

[Compression Codecs Docs](https://clickhouse.com/docs/data-compression/compression-in-clickhouse)

Before worrying about compression, focus on the data types and the primary key then get a lot of data in so you know what you are working with.

## TTL

You can configure a lifetime for rows of a MergeTree table (rows will be deleted after a certain time).

```sql
CREATE TABLE ttl_demo_1
(
    id Int,
    message String,
    timestamp DateTime DEFAULT now()
)
ENGINE = MergeTree
ORDER BY id
TTL timestamp + INTERVAL 1 MONTH
```

Data will eventually be deleted after expiry, it will not happen immediately. There is a `merge_with_ttl_timeout` setting - minimum seconds before repeating merge with delete TTL (14400). Every 4 hours ClickHouse will apply TTL rules to your tables and re-write parts. You can use `ttl_only_drop_parts` `(0)` by setting it to `1` for more efficient expiry of old data (dropping parts instead of delete rows). Dropping a part is deleting a folder. If you partition by month then that also helps.

You can also use TTL to move data around.

```sql
CREATE TABLE ttl_demo_2
(
    timestamp DateTime,
    id Int,
    message String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY timestamp
TTL timestamp TO VOLUME 'hot'
    timestamp + INTERVAL 1 HOUR TO VOLUME 'warm',
    timestamp + INTERVAL 1 DAY TO VOLUME 'cold',
    timestamp + INTERVAL 1 WEEK TO VOLUME 'frozen',
    timestamp + INTERVAL 1 MONTH
```

A volume is a collection of disks that you need to configure for ClickHouse.

TTL on columns

When a column times out it is replaced by the default value
If all column values time out then the column file will be dropped from the part

```sql
CREATE TABLE ttl_demo_3
(
    timestamp DateTime,
    x Int TTL timestamp + INTERVAL 1 WEEK,
    y Int TTL timestamp + INTERVAL 2 WEEK,
    z String
)
Engine = MergeTree
ORDER BY timestamp
```

If you have columns that take up a lot of storage column TTL could make sense
To apply a new TTL rule to a table:

```sql
ALTER TABLE my_table MATERIALIZE TTL
```

## Lab 10.1 Configuring Compression

Introduction:  In this lab, you will modify the default compression settings of a table in an attempt to optimize disk space.

Compression ratio of the entire table:

```sql
SELECT
    formatReadableSize(sum(data_uncompressed_bytes) AS u) AS uncompressed,
    formatReadableSize(sum(data_compressed_bytes) AS c) AS compressed,
    round(u / c, 2) AS compression_ratio,
    count() AS num_of_parts
FROM system.parts
WHERE table = 'uk_prices_3' AND active = 1;
```

Notice that the default compression (LZ4) did a pretty good job of compressing this data - basically 3.5 times. That was the overall compression of the entire table. Run the following query, which shows the compression of each column:

```sql
SELECT
    column,
    formatReadableSize(sum(column_data_uncompressed_bytes) AS u) AS uncompressed,
    formatReadableSize(sum(column_data_compressed_bytes) AS c) AS compressed,
    round(u / c, 2) AS compression_ratio
FROM system.parts_columns
WHERE table = 'uk_prices_3' AND active = 1
GROUP BY column;
```

ClickHouse uses columnar storage - it stores the data of each column in a separate file. This is referred to as the Wide format of a MergeTree table. For smaller tables, ClickHouse simply stores all the data in a single file - referred to as the Compact format. Your uk_prices_3 table is small enough that ClickHouse Cloud is storing it in the Compact format, so attempting to view the per-column compression doesn't make sense - there are no separate column files.

Define the following table named prices_1 and insert all of the rows from uk_prices_3 into prices_1. Notice that prices_1 sets min_rows_for_wide_part to 0 and min_bytes_for_wide_part to 0, which basically forces ClickHouse to store the table in the wide format:

```sql
CREATE TABLE prices_1
(
    `id`    UUID,
    `price` UInt32,
    `date` Date,
    `postcode1` LowCardinality(String) ,
    `postcode2` LowCardinality(String),
    `type` Enum8('other' = 0, 'terraced' = 1, 'semi-detached' = 2, 'detached' = 3, 'flat' = 4),
    `is_new` UInt8,
    `duration` Enum8('unknown' = 0, 'freehold' = 1, 'leasehold' = 2),
    `addr1` String,
    `addr2` String,
    `street` LowCardinality(String),
    `locality` LowCardinality(String),
    `town` LowCardinality(String),
    `district` LowCardinality(String),
    `county` LowCardinality(String)
)
ENGINE = MergeTree
ORDER BY (postcode1, postcode2, date)
SETTINGS min_rows_for_wide_part=0,min_bytes_for_wide_part=0;

INSERT INTO prices_1
    SELECT * FROM uk_prices_3;
```

Run the query from Step 2 above again, but this time run it on the prices_1 table.

```sql
SELECT
    column,
    formatReadableSize(sum(column_data_uncompressed_bytes) AS u) AS uncompressed,
    formatReadableSize(sum(column_data_compressed_bytes) AS c) AS compressed,
    round(u / c, 2) AS compression_ratio
FROM system.parts_columns
WHERE table = 'uk_prices_3' AND active = 1
GROUP BY column;
```

Notice postcode1 has a compression of ~600 times, and town has a compression of ~240 times - which is amazing. Why are those two columns so nicely compressed?

```sql
INSERT INTO prices_2
    SELECT price, date, postcode1, postcode2, is_new FROM uk_prices_3;
```

## Lab 10.2 Configuring TTL
