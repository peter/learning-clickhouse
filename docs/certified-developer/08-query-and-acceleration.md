# Module 8: Query and Acceleration Techniques

[Module 8: Query and Acceleration Techniques](https://learn.clickhouse.com/learner_module/show/1914307?lesson_id=10274293)

Part of [Real-time analytics with ClickHouse](https://clickhouse.com/learn/real-time-analytics)

Lab solutions
https://github.com/ClickHouse/clickhouse-academy/tree/main/realtime-analytics/08-query-acceleration

## Query Acceleration Techniques

There are many techniques for query acceleration:

* Materialized views - very common
* Aggregations in materialized views
* Projections (aka secondary indexes)
* Skipping indexes (secondary indexes)

## Views

The contents of a view is the result of a SELECT query. Creating a normal view does not materialize the view immediately:

```sql
CREATE VIEW uk_terraced_propery
AS
    SELECT *
    FROM uk_prices_3
    WHERE type = 'terraced';
```

If you run a query against the view it replaced the view name with a nested sub query:

```sql
SELECT count() FROM (
    SELECT *
    FROM uk_prices_3
    WHERE type = 'terraced';
)
```

Normal views are not used often but you can use them if:

* The result of the view changes often
* The view is not used very often (relative to rate of result change)
* The query is not resource intensive (it is not expensive to run the view over and over)

## Materialized Views

Suppose we have a frequently executed query that requires a full table scan:

```sql
SELECT
    town,
    avg(price),
    max(price)
FROM uk_prices_3
WHERE town = 'DURHAM'
GROUP BY town;
-- town is not in the PRIMARY KEY
```

We could run the query periodically (10m, 1h etc.) and save the result.

## Refreshable Materialized Views

[Refreshable materialized view docs](https://clickhouse.com/docs/materialized-view/refreshable-materialized-view)

* Results are stored in target table
* Yields faster SELECT queries

* Allow pre calculating query
* Periodic execution of query against the entire dataset
* Great for update and delete use cases

```sql
-- target table
CREATE TABLE uk_prices_town_stats (
    town LowCardinality(String),
    average_price Decimal64(10),
    max_price UInt32
)
ENGINE = MergeTree
ORDER BY (town);

CREATE MATERIALIZED VIEW uk_prices_town_stats_mv
-- If you don't have a refresh clause then it's an incremental materialized view
REFRESH EVERY 1 HOUR
TO uk_prices_town_stats AS
SELECT
    town,
    avg(price),
    max(price)
FROM uk_prices_3
GROUP BY town;
```

## Incremental Materialized Views

An insert trigger where the target table immediately gets new data from the source table. Those views only trigger on inserts, not updates or deletes. Works only for append-only use cases.

* Results are stored in target table
* Yields faster SELECT queries

* Shifts cost of computation from query to insert time
* It's an insert trigger only executed on new rows
* Great for append-only use cases

[Incremental materialized view docs](https://clickhouse.com/docs/materialized-view/incremental-materialized-view)

Incremental Materialized Views (Materialized Views) allow users to shift the cost of computation from query time to insert time, resulting in faster SELECT queries. Unlike in transactional databases like Postgres, a ClickHouse materialized view is just a trigger that runs a query on blocks of data as they are inserted into a table. The result of this query is inserted into a second "target" table

```sql
CREATE TABLE votes
(
    `Id` UInt32,
    `PostId` Int32,
    `VoteTypeId` UInt8,
    `CreationDate` DateTime64(3, 'UTC'),
    `UserId` Int32,
    `BountyAmount` UInt8
)
ENGINE = MergeTree
ORDER BY (VoteTypeId, CreationDate, PostId)

CREATE TABLE up_down_votes_per_day
(
  `Day` Date,
  `UpVotes` UInt32,
  `DownVotes` UInt32
)
ENGINE = SummingMergeTree
ORDER BY Day

CREATE MATERIALIZED VIEW up_down_votes_per_day_mv TO up_down_votes_per_day AS
SELECT toStartOfDay(CreationDate)::Date AS Day,
       countIf(VoteTypeId = 2) AS UpVotes,
       countIf(VoteTypeId = 3) AS DownVotes
FROM votes
GROUP BY Day
```

## Aggregations in Incremental Materialized Views

Query that we would like to cache:

```sql
SELECT town,
       avg(price) as avg_price
FROM uk_price_paid
GROUP BY town
ORDER BY avg_price DESC
```

Problem - averages don't aggregate, you need the sum and the count.

[AggregatingMergeTree docs](https://clickhouse.com/docs/engines/table-engines/mergetree-family/aggregatingmergetree)

The engine inherits from MergeTree, altering the logic for data parts merging. ClickHouse replaces all rows with the same primary key (or more accurately, with the same sorting key) with a single row (within a single data part) that stores a combination of states of aggregate functions.

You can use AggregatingMergeTree tables for incremental data aggregation, including for aggregated materialized views.

Rows with the same primary key collapse into the same row. The rows that are not in the primary key will be aggregated.

## Using an AggregatingMergeTree

[Using Aggregate Combinators in ClickHouse](https://clickhouse.com/blog/aggregate-functions-combinators-in-clickhouse-for-arrays-maps-and-states)

* [AggregateFunction docs](https://clickhouse.com/docs/sql-reference/data-types/aggregatefunction)
* [SimpleAggregateFunction docs](https://clickhouse.com/docs/sql-reference/data-types/simpleaggregatefunction) - The SimpleAggregateFunction data type stores the intermediate state of an aggregate function, but not its full state as the AggregateFunction type does. Condition: the result of applying a function f to a row set S1 UNION ALL S2 can be obtained by applying f to parts of the row set separately, and then again applying f to the results: f(S1 UNION ALL S2) = f(f(S1) UNION ALL f(S2)).

When querying the columns of an AggregatingMergeTree table, you should always GROUP BY the sort key and use the appropriate -Merge function, in case there are multiple rows in the table with the same sort key that have not collapsed yet into a single row.

```sql
CREATE TABLE uk_aggregated_prices
(
    district String,
    avg_price AggregateFunction(avg, UInt32),
    max_price SimpleAggregateFunction(max, UInt32,
    quant90 AggregateFunction(quantile(0.90), UInet32)
)
ENGINE = AggregatingMergeTree
PRIMARY KEY district;

SELECT uniq(district) FROM uk_prices_3;

CREATE MATERIALIZED VIEW uk_aggregated_prices_view
TO uk_aggregated_prices
    AS
    SELECT
        district,
        avgState(price) as avg_price,
        maxSimpleState(prices) as max_price,
        qauntilesState(0.90)(price) as quant90
    FROM uk_prices_3
    GROUP BY district;
```

Viewing the results:

```sql
SELECT
    district,
    avgMerge(avg_price),
    max(max_price),
    quantilesMerge(0.90)(quant90)
FROM uk_aggregated_prices
GROUP BY district;
```

## Projections

Materialized views store data in a separate table. With projections the client making the query doesn't need to know about the projection, it's transparent. The projection stores data in a separate table behind the scenes.

Projections are useful when you run queries on a column that is not in the primary key. ClickHouse decides at query time which projections to use if any.

```sql
ALTER TABLE uk_price_paid
    ADD PROJECTION town_sort_projection (
        SELECT town, date, street, locality
        ORDER BY town
    );

ALTER TABLE uk_price_paid
MATERIALIZE PROJECTION town_sort_projection;

ALTER TABLE uk_price_paid
    ADD PROJECTION max_town_price_projection (
        SELECT town, max(price)
        GROUP BY town
    );

SHOW CREATE TABLE uk_price_paid FORMAT Pretty;

EXPLAIN indexes=1 SELECT max(price) FROM uk_price_paid;
```

Projections can get out of sync when you make deletes or updates.

## Skipping Indexes

The primary index is a pointer to a granule

```sql
ALTER TABLE uk_price_paid
    ADD INDEX town_set_index town
    TYPE set(10)
    GRANULARITY 3;

SELECT avg(price)
FROM uk_price_paid
WHERE town = 'DURHAM'
SETTINGS use_skip_indexes=0; -- disable index

SELECT avg(price)
FROM uk_price_paid
WHERE town = 'DURHAM'
SETTINGS use_skip_indexes=1; -- enable index (default)
```

Alternatives to skipping indexes:

* Choose a better primary key
* Define a projection
* Define a materialized view

Bloom filter:

```sql
ALTER TABLE uk_price_paid
    ADD INDEX town_bf_index town
    TYPE bloom_filter(0.025)
    GRANULARITY 1;

ALTER TABLE uk_price_paid
    MATERIALIZE INDEX town_bf_index;

SELECT * FROM system.mutations;
```

[Skipping Indexes docs](https://clickhouse.com/docs/optimize/skipping-indexes)

## Lab 8.1 Incremental Materialized Views

Database tables:

https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/08-query-acceleration/setup.sql

```sql
CREATE TABLE uk_prices_2
(
    `id` Nullable(String),
    `price` Nullable(String),
    `date` DateTime,
    `postcode` String,
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
PRIMARY KEY (postcode, date);

INSERT INTO uk_prices_2
    SELECT * 
    FROM s3('https://learn-clickhouse.s3.us-east-2.amazonaws.com/uk_property_prices/uk_prices.csv.zst')
    SETTINGS date_time_input_format='best_effort';
-- https://stackoverflow.com/questions/71921644/parse-error-with-a-simple-csv-import-into-clickhouse
-- Cannot parse input: expected '"' before: 'NE4 9DN","S","N","F","8","","MATFEN PLACE","FENHAM","NEWCASTLE UPON TYNE","NEWCASTLE UPON TYNE","TYNE AND WEAR","A","A"\n"{20E2441A-0F16-49AB-97D4-8737E62A5D93}"': (at row 1)

CREATE TABLE uk_prices_3
(
    id UUID,
    price UInt32,
    date DateTime,
    postcode1 String,
    postcode2 String,
    type Enum8('terraced' = 1, 'semi-detached' = 2, 'detached' = 3, 'flat' = 4, 'other' = 0),
    is_new UInt8,
    duration Enum8('freehold' = 1, 'leasehold' = 2, 'unknown' = 0),
    addr1 String,
    addr2 String,
    street String,
    locality LowCardinality(String),
    town LowCardinality(String),
    district LowCardinality(String),
    county LowCardinality(String)
)
ENGINE = MergeTree
PRIMARY KEY (postcode1, postcode2);

INSERT INTO uk_prices_3
    WITH
        splitByChar(' ', postcode) AS postcodes
    SELECT
        replaceRegexpAll(id,'[{}]','') AS id,
        toUInt32(price) AS price,
        date,
        postcodes[1] AS postcode1,
        postcodes[2] AS postcode2,
        transform(type, ['T', 'S', 'D', 'F', 'O'], ['terraced', 'semi-detached', 'detached', 'flat', 'other'],'other') AS type,
        is_new = 'Y' AS is_new,
        transform(duration, ['F', 'L', 'U'], ['freehold', 'leasehold', 'unknown'],'unknown') AS duration,
        addr1,
        addr2,
        street,
        locality,
        town,
        district,
        county
    FROM uk_prices_2;
```

In this lab, you will define an incremental materialized view on the uk_prices_3 table that stores the property prices partitioned by year.

Write a single query on the uk_prices_3 table that computes the number of properties sold and the average price of all the properties sold for the year 2020. Notice your query needs to process all the rows in the table.

```sql
SELECT count(*) as n_properties_sold,
       avg(price) as avg_price
FROM uk_prices_3
WHERE toYear(date) = 2020
--    ┌─n_properties_sold─┬──────────avg_price─┐
-- 1. │            895168 │ 377777.77140715485 │
--    └───────────────────┴────────────────────┘

-- 1 row in set. Elapsed: 0.035 sec. Processed 30.03 million rows, 179.80 MB (853.06 million rows/s., 5.11 GB/s.)

SELECT toYear(date) as year,
       count(*) as n_properties_sold,
       avg(price) as avg_price
FROM uk_prices_3
GROUP BY year
ORDER BY year;
```

Suppose you want to run queries frequently on the yearly historical data of uk_prices_3. Let's define an incremental materialized view that partitions the data by year and sorts the data by town, so that our queries do not need to scan every row each time we run our queries. Let's start by defining the destination table. Define a new MergeTree table that satisfies the following requirements:

```sql
CREATE TABLE prices_by_year_dest (
    date DateTime,
    price UInt32,
    addr1 String,
    addr2 String,
    street String,
    town LowCardinality(String),
    district LowCardinality(String),
    county LowCardinality(String)
)
ENGINE = MergeTree
PARTITION BY toYear(date)
PRIMARY KEY (town, date);
```

Create a materialized view named prices_by_year_view that sends the date, price, addr1, addr2, street, town, district and county columns to the prices_by_year_dest table.

```sql
CREATE MATERIALIZED VIEW prices_by_year_view TO prices_by_year_dest AS
SELECT date,
       price,
       addr1,
       addr2,
       street,
       town,
       district,
       county
FROM uk_prices_3;

INSERT INTO prices_by_year_dest
SELECT date,
       price,
       addr1,
       addr2,
       street,
       town,
       district,
       county
FROM uk_prices_3;
```

```sql
SELECT * FROM system.parts
WHERE table='prices_by_year_dest';
-- 2048 rows in set. Elapsed: 0.328 sec. Processed 2.05 thousand rows, 1.62 MB (6.25 thousand rows/s., 4.94 MB/s.)

SELECT * FROM system.parts
WHERE table='uk_prices_3';
-- 42 rows in set. Elapsed: 0.005 sec. 
```

Note: Notice that partitioning by year created a lot of parts. At a minimum, you need at least one part for each year from 1995 to 2025, but it is possible that some of those years have multiple part folders. This is a cautionary tale about partitioning! Be careful with it - especially when you only have 30M rows. There is really no need for us to partition this dataset by year except for educational purposes. Only for very large datasets do we recommend partitioning, in which case partitioning by month is recommended.

```sql
SELECT count(*) as n_properties_sold,
       avg(price) as avg_price
FROM prices_by_year_dest
WHERE toYear(date) = 2020
-- 1 row in set. Elapsed: 0.007 sec. Processed 895.17 thousand rows, 7.16 MB (128.60 million rows/s., 1.03 GB/s.)
```

Use prices_by_year_dest to count how many properties were sold and the maximum, average, and 90th quantile of the price of properties sold in June of 2005 in the county of Staffordshire.

```sql
SELECT count(*) as n_properties_sold,
       min(price) as min_price,
       max(price) as max_price,
       avg(price) as avg_price,
       quantile(0.90)(price) as p90_price
FROM prices_by_year_dest
-- formatDateTime(date, '%Y-%m') = '2005-06'
WHERE toYYYYMM(date) = 200506
AND county = upper('Staffordshire');
--    ┌─n_properties_sold─┬─min_price─┬─max_price─┬──────────avg_price─┬──────────p90_price─┐
-- 1. │              1322 │     23000 │    745000 │ 160241.94402420576 │ 269670.00000000006 │
--    └───────────────────┴───────────┴───────────┴────────────────────┴────────────────────┘

-- 1 row in set. Elapsed: 0.010 sec. Processed 1.06 million rows, 2.50 MB (106.36 million rows/s., 250.47 MB/s.)
```

Let's verify that the insert trigger for your materialized view is working properly. Run the following command, which inserts 3 rows into uk_prices_3 for properties in the year 1994. (Right now your uk_prices_3 table doesn't contain any transactions from 1994.)

```sql
INSERT INTO uk_prices_3 VALUES
    ('51f279f5-ef5f-46e1-bd8e-b6c4159d8fa7', 125000, '1994-03-07', 'B77', '4JT', 'semi-detached', 0, 'freehold', 10,'',	'CRIGDON','WILNECOTE','TAMWORTH','TAMWORTH','STAFFORDSHIRE'),
    ('a0d2f609-b6f9-4972-857c-8e4266d146ae', 440000000, '1994-07-29', 'WC1B', '4JB', 'other', 0, 'freehold', 'VICTORIA HOUSE', '', 'SOUTHAMPTON ROW', '','LONDON','CAMDEN', 'GREATER LONDON'),
    ('1017aff1-6f1e-420a-aad5-7d03ce60c8c5', 2000000, '1994-01-22','BS40', '5QL', 'detached', 0, 'freehold', 'WEBBSBROOK HOUSE','', 'SILVER STREET', 'WRINGTON', 'BRISTOL', 'NORTH SOMERSET', 'NORTH SOMERSET');

SELECT *
FROM prices_by_year_dest
WHERE toYear(date) = 1994;
--    ┌────────────────date─┬─────price─┬─addr1────────────┬─addr2─┬─street──────────┬─town─────┬─district───────┬─county─────────┐
-- 1. │ 1994-01-22 00:00:00 │   2000000 │ WEBBSBROOK HOUSE │       │ SILVER STREET   │ BRISTOL  │ NORTH SOMERSET │ NORTH SOMERSET │
-- 2. │ 1994-07-29 00:00:00 │ 440000000 │ VICTORIA HOUSE   │       │ SOUTHAMPTON ROW │ LONDON   │ CAMDEN         │ GREATER LONDON │
-- 3. │ 1994-03-07 00:00:00 │    125000 │ 10               │       │ CRIGDON         │ TAMWORTH │ TAMWORTH       │ STAFFORDSHIRE  │
--    └─────────────────────┴───────────┴──────────────────┴───────┴─────────────────┴──────────┴────────────────┴────────────────┘

SELECT * FROM system.parts
WHERE table='prices_by_year_dest';
```

## Lab 8.2 Refreshable Materialized Views

Introduction: In this lab, you will define a refreshable materialized view on the uk_prices_3 table. You are going to compute the average price of properties sold each day from January 1, 2025, to the end of the dataset, and configure the MV to refresh twice per day.

```sql
CREATE TABLE uk_averages_by_day (
    date DateTime,
    avg_price Decimal64(10)
)
ENGINE = MergeTree
PRIMARY KEY (date);

CREATE MATERIALIZED VIEW uk_averages_by_day_mv
REFRESH EVERY 12 HOUR
TO uk_averages_by_day AS
SELECT date,
       avg(price) as avg_price
FROM uk_prices_3
GROUP BY date
ORDER BY date;

INSERT INTO uk_averages_by_day
SELECT date,
       avg(price) as avg_price
FROM uk_prices_3
WHERE date >= '2025-01-01'
GROUP BY date
ORDER BY date;
```

## Lab 8.3 Using SummingMergeTree

Introduction:  In this lab, you will keep a running total of the prices spent per town on property in the UK.

```sql
SELECT
    town,
    sum(price) AS sum_price,
    formatReadableQuantity(sum_price)
FROM uk_prices_3
GROUP BY town
ORDER BY sum_price DESC;
-- 1172 rows in set. Elapsed: 0.095 sec. Processed 30.03 million rows, 180.20 MB (315.04 million rows/s., 1.89 GB/s.)

CREATE TABLE prices_sum_dest (
    town LowCardinality(String),
    sum_price UInt64
)
ENGINE = SummingMergeTree
ORDER BY town;

CREATE MATERIALIZED VIEW prices_sum_view TO prices_sum_dest AS
SELECT
    town,
    sum(price) AS sum_price
FROM uk_prices_3
GROUP BY town;

INSERT INTO prices_sum_dest
SELECT
    town,
    sum(price) AS sum_price
FROM uk_prices_3
GROUP BY town;

select count(*) from prices_sum_dest
-- 1172

SELECT
    town,
    sum(price) AS sum_price,
    formatReadableQuantity(sum_price)
FROM uk_prices_3
WHERE town = 'LONDON'
GROUP BY town;
--    ┌─town───┬─────sum_price─┬─formatReadab⋯(sum_price)─┐
-- 1. │ LONDON │ 1168482666946 │ 1.17 trillion            │
--    └────────┴───────────────┴──────────────────────────┘

-- 1 row in set. Elapsed: 0.019 sec. Processed 30.03 million rows, 70.25 MB (1.55 billion rows/s., 3.62 GB/s.)

SELECT
    town,
    sum_price AS sum,
    formatReadableQuantity(sum)
FROM prices_sum_dest
WHERE town = 'LONDON';
--    ┌─town───┬───────────sum─┬─formatReadableQuantity(sum)─┐
-- 1. │ LONDON │ 1168482666946 │ 1.17 trillion               │
--    └────────┴───────────────┴─────────────────────────────┘

-- 1 row in set. Elapsed: 0.003 sec. Processed 1.17 thousand rows, 31.94 KB (458.32 thousand rows/s., 12.49 MB/s.)
```

Do you see a problem with the second query? What happens if you insert the sale of a new property in London as below and re-run the queries?


```sql
INSERT INTO uk_prices_3 (price, date, town, street)
VALUES
    (4294967295, toDate('1994-01-01'), 'LONDON', 'My Street1');

SELECT
    town,
    sum_price AS sum,
    formatReadableQuantity(sum)
FROM prices_sum_dest
WHERE town = 'LONDON';
--    ┌─town───┬───────────sum─┬─formatReadableQuantity(sum)─┐
-- 1. │ LONDON │    4294967295 │ 4.29 billion                │
-- 2. │ LONDON │ 1168482666946 │ 1.17 trillion               │
--    └────────┴───────────────┴─────────────────────────────┘

-- 2 rows in set. Elapsed: 0.003 sec. Processed 1.17 thousand rows, 31.97 KB (431.24 thousand rows/s., 11.75 MB/s.)
```

Write a query on prices_sum_dest that returns the top 10 towns in terms of total price spent on property. Remember that when you query a SummingMergeTree, there might be multiple rows with the same primary key that should be aggregated (i.e., you should always have the sum and the GROUP BY in the query).

```sql
SELECT town,
       sum(sum_price) as total_sum
FROM prices_sum_dest
GROUP BY town
ORDER BY total_sum DESC
LIMIT 10;
--     ┌─town────────┬─────total_sum─┐
--  1. │ LONDON      │ 1172777634241 │
--  2. │ BRISTOL     │  106751852358 │
--  3. │ MANCHESTER  │   78969795030 │
--  4. │ BIRMINGHAM  │   71523003207 │
--  5. │ NOTTINGHAM  │   64789399075 │
--  6. │ LEEDS       │   59362200532 │
--  7. │ READING     │   54383678177 │
--  8. │ SOUTHAMPTON │   50919754843 │
--  9. │ LIVERPOOL   │   46751129698 │
-- 10. │ SHEFFIELD   │   45610732113 │
--     └─────────────┴───────────────┘

-- 10 rows in set. Elapsed: 0.004 sec. Processed 1.17 thousand rows, 31.97 KB (331.80 thousand rows/s., 9.04 MB/s.)
```

## Lab 8.4 AggregatingMergeTree

Introduction:  In this lab, you will define a Materialized View that maintains "running" aggregate values on the UK property prices dataset. 

```sql
-- max/min
WITH
    toStartOfMonth(date) AS month
SELECT
    month,
    min(price) AS min_price,
    max(price) AS max_price
FROM uk_prices_3
GROUP BY month
ORDER BY month DESC;
-- 365 rows in set. Elapsed: 0.055 sec. Processed 30.03 million rows, 240.27 MB (545.97 million rows/s., 4.37 GB/s.)

-- avg
WITH
    toStartOfMonth(date) AS month
SELECT
    month,
    avg(price)
FROM uk_prices_3
GROUP BY month
ORDER BY month DESC;

-- number of sales
WITH
    toStartOfMonth(date) AS month
SELECT
    month,
    count()
FROM uk_prices_3
GROUP BY month
ORDER BY month DESC;
```

In ClickHouse, it's a best practice to minimize the number of materialized views on a table. Define a single incremental materialized view that computes and maintains all of the aggregations in step 1 above. Here are some guidelines:

```sql
CREATE TABLE uk_prices_aggs_dest (
    month DateTime,
    min_price SimpleAggregateFunction(min, UInt32),
    max_price SimpleAggregateFunction(max, UInt32),
    avg_price AggregateFunction(avg, UInt32),
    n_sales AggregateFunction(count, UInt32),
)
ENGINE = AggregatingMergeTree
ORDER BY (month);

-- Populate the destination table with all the existing rows in uk_prices_3 where the date is after January 1, 1995.
INSERT INTO uk_prices_aggs_dest
SELECT toStartOfMonth(date) AS month,
       minSimpleState(price) AS min_price,
       maxSimpleState(price) AS max_price,
       avgState(price) as avg_price,
       countState(*) as n_sales
FROM uk_prices_3
WHERE date > '1995-01-01'
GROUP BY month

SELECT * FROM uk_prices_aggs_dest;

CREATE MATERIALIZED VIEW uk_prices_aggs_view TO uk_prices_aggs_dest AS
SELECT toStartOfMonth(date) AS month,
       minSimpleState(price) AS min_price,
       maxSimpleState(price) AS max_price,
       avgState(price) as avg_price,
       countState(*) as n_sales
FROM uk_prices_3
WHERE date > '1995-01-01'
GROUP BY month

SELECT month,
       min(min_price),
       max(max_price)
FROM uk_prices_aggs_dest
WHERE toYear(month) = 2023
GROUP BY month
ORDER BY month

select min(price), max(price), avg(price) from uk_prices_3 where toStartOfMonth(date) = '2023-01-01'
--    ┌─min(price)─┬─max(price)─┬─────────avg(price)─┐
-- 1. │        100 │  149717670 │ 396048.90585436847 │
--    └────────────┴────────────┴────────────────────┘

select * from uk_prices_aggs_dest where month = '2023-01-01'
--    ┌───────────────month─┬─min_price─┬─max_price─┬─avg_price─┬─n_sales─┐
-- 1. │ 2023-01-01 00:00:00 │       100 │ 149717670 │ ?:x???        │ ??        │
--    └─────────────────────┴───────────┴───────────┴───────────┴─────────┘
```

```sql
SELECT
    month,
    countMerge(n_sales),
    min(min_price),
    max(max_price)
FROM uk_prices_aggs_dest
WHERE toYYYYMM(month) = '199408'
GROUP BY month;

INSERT INTO uk_prices_3 (date, price, town) VALUES
    ('1994-08-01', 10000, 'Little Whinging'),
    ('1994-08-01', 1, 'Little Whinging');

SELECT
    month,
    countMerge(n_sales),
    min(min_price),
    max(max_price)
FROM uk_prices_aggs_dest
WHERE toYYYYMM(month) = '199408'
GROUP BY month;
--    ┌───────────────month─┬─countMerge(n_sales)─┬─min(min_price)─┬─max(max_price)─┐
-- 1. │ 1994-08-01 00:00:00 │                   2 │              1 │          10000 │
--    └─────────────────────┴─────────────────────┴────────────────┴────────────────┘


SELECT count(*)
FROM uk_prices_aggs_dest
WHERE toYYYYMM(month) = '199408';

SELECT count(*)
FROM uk_prices_3
WHERE toYYYYMM(date) = '199408';
-- 0

SELECT count(*)
FROM uk_prices_3
WHERE toYYYYMM(date) = '199408';
-- 2
```

## Lab 8.5 Projections

In this lab, you will define a projection on the uk_prices_3 table.

```sql
-- Run the following query - and notice every row is read because town is not a part of the primary key:
SELECT
    toYear(date) AS year,
    count(),
    avg(price),
    max(price),
    formatReadableQuantity(sum(price))
FROM uk_prices_3
WHERE town = 'LIVERPOOL'
GROUP BY year
ORDER BY year DESC;
-- 31 rows in set. Elapsed: 0.013 sec. Processed 30.03 million rows, 63.89 MB (2.28 billion rows/s., 4.85 GB/s.)

-- Disk space usage
SELECT
    formatReadableSize(sum(bytes_on_disk)),
    count() AS num_of_parts
FROM system.parts
WHERE table = 'uk_prices_3' AND active = 1;
--    ┌─formatReadab⋯s_on_disk))─┬─num_of_parts─┐
-- 1. │ 697.71 MiB               │            4 │
--    └──────────────────────────┴──────────────┘
```

Define a new projection on uk_prices_3 named town_date_projection that satisfies the following requirements:

* a. Contains only the town, date, and price columns
* b. The data is sorted by town, then date

Materialize the  town_date_projection and wait for the mutation to complete.

```sql
ALTER TABLE uk_prices_3
    ADD PROJECTION town_date_projection (
        SELECT town, date, price
        ORDER BY (town, date)
    );

ALTER TABLE uk_prices_3
MATERIALIZE PROJECTION town_date_projection;

EXPLAIN indexes=1 SELECT
    toYear(date) AS year,
    count(),
    avg(price),
    max(price),
    formatReadableQuantity(sum(price))
FROM uk_prices_3
WHERE town = 'LIVERPOOL'
GROUP BY year
ORDER BY year DESC;

-- Now run the query from step 1 again. How many rows were read this time?
SELECT
    toYear(date) AS year,
    count(),
    avg(price),
    max(price),
    formatReadableQuantity(sum(price))
FROM uk_prices_3
WHERE town = 'LIVERPOOL'
GROUP BY year
ORDER BY year DESC;
-- 31 rows in set. Elapsed: 0.012 sec. Processed 319.49 thousand rows, 3.19 MB (26.49 million rows/s., 264.86 MB/s.)

-- Run the query from step 2 again. How much disk space did your projection add to the table storage?
SELECT
    formatReadableSize(sum(bytes_on_disk)),
    count() AS num_of_parts
FROM system.parts
WHERE table = 'uk_prices_3' AND active = 1;
--    ┌─formatReadab⋯s_on_disk))─┬─num_of_parts─┐
-- 1. │ 808.45 MiB               │            4 │
--    └──────────────────────────┴──────────────┘
```

Define a new projection on uk_prices_3 named handy_aggs_projection that satisfies the following requirements:

```sql
ALTER TABLE uk_prices_3
    ADD PROJECTION handy_aggs_projection (
        SELECT town,
               avg(price),
               max(price),
               sum(price)
        GROUP BY town
    );

ALTER TABLE uk_prices_3
MATERIALIZE PROJECTION handy_aggs_projection;

SELECT
    avg(price),
    max(price),
    formatReadableQuantity(sum(price))
FROM uk_prices_3
WHERE town = 'LIVERPOOL';
-- 1 row in set. Elapsed: 0.004 sec. Processed 1.18 thousand rows, 88.42 KB (299.48 thousand rows/s., 22.54 MB/s.)

-- Add EXPLAIN to the front of the query in the previous step. Notice in the output that you can see the data is being read from the hidden table built from your handy_aggs_projection (instead of the uk_prices_3 table).
EXPLAIN SELECT
    avg(price),
    max(price),
    formatReadableQuantity(sum(price))
FROM uk_prices_3
WHERE town = 'LIVERPOOL';
--    ┌─explain─────────────────────────────────────────┐
-- 1. │ Expression ((Project names + Projection))       │
-- 2. │   Aggregating                                   │
-- 3. │     Filter                                      │
-- 4. │       ReadFromMergeTree (handy_aggs_projection) │
--    └─────────────────────────────────────────────────┘
```

## Lab 8.6 Skipping Indexes

Introduction:  In this lab, you will define a skipping index for the uk_prices_3 table.

Write a query that lists all the distinct values of county in the uk_prices_3 table. Notice there are only 133 unique values.

```sql
select distinct county
from uk_prices_3
order by county;
-- 133 rows in set. Elapsed: 0.088 sec. Processed 30.03 million rows, 30.03 MB (343.06 million rows/s., 343.06 MB/s.)
```

The county column is not in the primary key of uk_prices_3, so filtering by county requires an entire table scan, as you can see by running the following query:

```sql
SELECT
    formatReadableQuantity(count()),
    avg(price)
FROM uk_prices_3
WHERE county = 'GREATER LONDON';
-- 1 row in set. Elapsed: 0.032 sec. Processed 30.03 million rows, 47.75 MB (927.37 million rows/s., 1.47 GB/s.)
```

This seems like a good scenario for a skipping index. Define a new skipping index named county_index on the uk_prices_3 table that satisfies the following requirements:

a. It is a bloom filter index on the county column

b. The granularity of the index is 1

```sql
ALTER TABLE uk_prices_3
ADD INDEX idx_county_bloom (county)
TYPE bloom_filter() -- 0.025 default false positive rate
GRANULARITY 1;

ALTER TABLE uk_prices_3
MATERIALIZE INDEX idx_county_bloom;

EXPLAIN indexes = 1
SELECT avg(price)
FROM uk_prices_3
WHERE county = 'GREATER LONDON';
--     ┌─explain────────────────────────────────────────────────────────────────┐
--  1. │ Expression ((Project names + Projection))                              │
--  2. │   Aggregating                                                          │
--  3. │     Expression (Before GROUP BY)                                       │
--  4. │       Expression ((WHERE + Change column names to column identifiers)) │
--  5. │         ReadFromMergeTree (learning.uk_prices_3)                       │
--  6. │         Indexes:                                                       │
--  7. │           PrimaryKey                                                   │
--  8. │             Condition: true                                            │
--  9. │             Parts: 4/4                                                 │
-- 10. │             Granules: 3671/3671                                        │
-- 11. │           Skip                                                         │
-- 12. │             Name: idx_county_bloom                                     │
-- 13. │             Description: bloom_filter GRANULARITY 1                    │
-- 14. │             Parts: 2/4                                                 │
-- 15. │             Granules: 690/3671                                         │
-- 16. │           Ranges: 111                                                  │
--     └────────────────────────────────────────────────────────────────────────┘

SELECT 
    database,
    table,
    mutation_id,
    command,
    create_time,
    is_done,
    parts_to_do,
    parts_to_do_names,
    latest_failed_part,
    latest_fail_reason
FROM system.mutations
WHERE database = 'learning' 
  AND table = 'uk_prices_3'
ORDER BY create_time DESC;
```

A Bloom filter is a data structure that allows space-efficient testing of set membership at the cost of a slight chance of false positives. A false positive is not a significant concern in the case of skip indexes because the only disadvantage is reading a few unnecessary blocks. However, the potential for false positives does mean that the indexed expression should be expected to be true, otherwise valid data may be skipped.


GRANULARITY 1: This creates one Bloom filter for every 1 granule of the primary index. Since the default primary index granularity is usually 8,192 rows, this creates one filter entry for every 8,192 rows.

When the mutation is complete, run the following query to see the size of data skipping indexes (aka secondary indexes).

```sql
SELECT
    table,
    formatReadableSize(data_compressed_bytes) as data_compressed,
    formatReadableSize(secondary_indices_compressed_bytes) as index_compressed,
    formatReadableSize(primary_key_size) as primary_key
FROM
    system.parts
ORDER BY secondary_indices_uncompressed_bytes DESC
LIMIT 5;

-- Query with index
SELECT
    formatReadableQuantity(count()),
    avg(price)
FROM uk_prices_3
WHERE county = 'GREATER LONDON';
-- 1 row in set. Elapsed: 0.012 sec. Processed 5.64 million rows, 23.40 MB (459.63 million rows/s., 1.91 GB/s.)

EXPLAIN indexes=1 SELECT
    formatReadableQuantity(count()),
    avg(price)
FROM uk_prices_3
WHERE county = 'GREATER LONDON';
```