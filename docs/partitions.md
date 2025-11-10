# Table partitions

You can [partition a table](https://clickhouse.com/docs/partitions) by a time period like month.

In ClickHouse, partitioning is primarily a data management feature. By organizing data logically based on a partition expression, each partition can be managed independently. For instance, the partitioning scheme in the example table above enables scenarios where only the last 12 months of data are retained in the main table by automatically removing older data using a TTL rule (see the added last row of the DDL statement):

```sql
CREATE TABLE uk.uk_price_paid_simple_partitioned
(
    date Date,
    town LowCardinality(String),
    street LowCardinality(String),
    price UInt32
)
ENGINE = MergeTree
PARTITION BY toStartOfMonth(date)
ORDER BY (town, street)
TTL date + INTERVAL 12 MONTH DELETE;
```

Partitions can assist with query performance, but this depends heavily on the access patterns. If queries target only a few partitions (ideally one), performance can potentially improve. This is only typically useful if the partitioning key is not in the primary key and you are filtering by it, as shown in the example query below.

```sql
SELECT MAX(price) AS highest_price
FROM uk.uk_price_paid_simple_partitioned
WHERE date >= '2020-12-01'
  AND date <= '2020-12-31'
  AND town = 'LONDON';
```