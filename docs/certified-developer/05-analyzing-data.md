# Module 5: Analyzing Data with ClickHouse

[Module 5: Analyzing Data with ClickHouse](https://learn.clickhouse.com/learner_module/show/1896608?lesson_id=10185593&section_id=91373742)

Part of [Real-time analytics with ClickHouse](https://clickhouse.com/learn/real-time-analytics)

## Writing Queries

```sql
SELECT count()
FROM uk_price_paid;

SELECT town,
       count()
FROM uk_prices_3
GROUP BY town
ORDER BY count() DESC
LIMIT 10;

-- Vertical output format
SELECT town,
       count()
FROM uk_prices_3
GROUP BY town
ORDER BY count() DESC
LIMIT 10
FORMAT VERTICAL;

-- JSON / JSONL output format
SELECT town,
       count()
FROM uk_prices_3
GROUP BY town
ORDER BY count() DESC
LIMIT 10
FORMAT JSONEachRow;
```

Common Table Expressions (CTEs) are supported:

```sql
WITH most_expensive AS (
    SELECT *
    FROM uk_prices_3
    ORDER BY price DESC
    LIMIT 10
)
SELECT avg(price)
FROM most_expensive
```

ClickHouse aspires to support standard SQL but:

* Queries will be different than with OLTP databases
* You want to take advantage of all the functions and features that ClickHouse offers that are not standardized

## Functions

Types of functions:

* [Regular](https://clickhouse.com/docs/sql-reference/functions/regular-functions) - `SELECT lower(town) FROM uk_prices_3`
* Aggregate - `SELECT quantile(0.90)(price) FROM uk_prices_3`
* Table - `SELECT * FROM url('https://www.example.com/some-data.csv', 'CSV')`
* Window

[ClickHouse function reference](https://clickhouse.com/docs/sql-reference/functions)

```sql
SELECT * from system.functions
SELECT name FROM system.functions WHERE is_aggregate = 0 ORDER BY name
```

Regular functions:

* [Arithmetic](https://clickhouse.com/docs/sql-reference/functions/arithmetic-functions)
* [Arrays](https://clickhouse.com/docs/sql-reference/functions/array-functions) - `has(array_column, 'value')`
* [Dates and time](https://clickhouse.com/docs/sql-reference/functions/date-time-functions) - `toStartOfMonth`, `addWeeks`, `now()` etc.
* String, String replacement, String search - `position(haystack, needle) > 0`, `positionCaseInsensitive(haystack, needle) > 0`

```sql
SELECT multiSearchAllPositions('Hello, World!', ['hello', '!', 'world'])
-- ┌─multiSearchAllPositions('Hello, World!', ['hello', '!', 'world'])─┐
-- │ [0,13,0]                                                          │
-- └───────────────────────────────────────────────────────────────────┘
```

```sql
SELECT
    toDateTime('2016-06-15 23:00:00') AS time,
    toDate(time) AS date_local,
    toDate(time, 'Asia/Yekaterinburg') AS date_yekat,
    toString(time, 'US/Samoa') AS time_samoa
--    ┌────────────────time─┬─date_local─┬─date_yekat─┬─time_samoa──────────┐
-- 1. │ 2016-06-15 23:00:00 │ 2016-06-15 │ 2016-06-16 │ 2016-06-15 12:00:00 │
--    └─────────────────────┴────────────┴────────────┴─────────────────────┘
```

```sql
WITH
    toStartOfMonth(date) as month
SELECT
    month,
    count()
FROM uk_prices_3
GROUP BY month
ORDER BY month DESC
-- 362 rows in set. Elapsed: 0.337 sec. Processed 30.03 million rows, 120.13 MB (89.21 million rows/s., 356.86 MB/s.)
```

## Aggregate Functions

* any
* argMax
* uniq/uniqExact
* count
* min/max
* sum
* avg
* median
* quantile/quantileExact - `quantile(0.9)(price)` (approximate)
* corr
* topK - `topK(10)street` (10 most frequently occuring streets)

```sql
DROP TABLE IF EXISTS series;
CREATE TABLE series
(
    i UInt32,
    x_value Float64,
    y_value Float64
)
ENGINE = Memory;
INSERT INTO series(i, x_value, y_value) VALUES (1, 5.6, -4.4),(2, -9.6, 3),(3, -1.3, -4),(4, 5.3, 9.7),(5, 4.4, 0.037),(6, -8.6, -7.8),(7, 5.1, 9.3),(8, 7.9, -3.6),(9, -8.2, 0.62),(10, -3, 7.3);
SELECT corr(x_value, y_value)
FROM series;
-- ┌─corr(x_value, y_value)─┐
-- │     0.1730265755453256 │
-- └────────────────────────┘
```

There is an `If` aggregate function combinator that you can add as a function prefix to aggregate functions i.e.:

* `sumIf`
* `countIf`
* `topKIf(10)(street, street != '')`

You can run multiple aggregations in a query all running on different subsets of the data

```sql
-- any example
SELECT town,
       count(),
       any(county)
FROM uk_prices_3
GROUP BY town
ORDER BY count() DESC
LIMIT 10

-- argMax
-- Could do the same thing with a nested sub query but would be slower
SELECT town,
       max(price),
       argMax(street, price)
FROM uk_prices_3
GROUP BY town
ORDER BY town
LIMIT 100
```

```sql
SELECT splitByChar(' ', street)
FROM uk_prices_3
LIMIT 100

-- Creates new rows!
SELECT arrayJoin(splitByChar(' ', street))
FROM uk_prices_3
LIMIT 100

SELECT arrayJoin(splitByChar(' ', street)) as token,
       count()
FROM uk_prices_3
GROUP BY token
ORDER BY count() DESC
LIMIT 100
--     ┌─token───────┬─count()─┐
--   1. │ ROAD        │ 9137149 │
--   2. │ CLOSE       │ 2909569 │
--   3. │ STREET      │ 2801642 │
--   4. │ AVENUE      │ 2138776 │
--   5. │ DRIVE       │ 1711655 │
--   6. │ LANE        │ 1582919 │
--   7. │ WAY         │ 1271868 │
--   8. │ GARDENS     │  685734 │
--   9. │ CRESCENT    │  679020 │
--  10. │ THE         │  635201 │
```

The [arrayJoin](https://clickhouse.com/docs/sql-reference/functions/array-join) function is unuaul. Normal functions do not change a set of rows, but just change the values in each row (map). Aggregate functions compress a set of rows (fold or reduce). The arrayJoin function takes each row and generates a set of rows (unfold).

## User Defined Functions

SQL User Defined Functions:

```sql
SELECT count() FROM system.functions
-- 1720
CREATE FUNCTION mergePostcode AS (p1, p2) -> concat(p1, p2)
SELECT count() FROM system.functions
-- 1721

SELECT mergePostcode(postcode1, postcode2) as postcode,
       count()
FROM uk_prices_3
WHERE postcode1 != '' AND postcode2 != ''
GROUP BY postcode
ORDER BY count() DESC
LIMIT 100;
```

## Lab 5.1 Writing Queries

Introduction:  In this lab, you will write some queries to analyze the UK property prices dataset. Keep in mind that the UK uses pounds for currency, and each row in the table represents a transaction when a piece of property was sold.

Run the following queries on the uk_prices_3 table created from Module 4.

```sql
-- Find all properties that sold for more than 100,000,000 pounds, sorted by descending price.
SELECT date,
       price,
       street,
       town
FROM uk_prices_3
WHERE price > 100000000
ORDER BY price DESC
LIMIT 10

-- How many properties were sold for over 1 million pounds in 2024?
SELECT count()
FROM uk_prices_3
WHERE price > 1000000
AND toYear(date) = 2024
--    ┌─count()─┐
-- 1. │   22471 │
--    └─────────┘

-- How many unique towns are in the dataset?
SELECT uniqExact(town)
FROM uk_prices_3
WHERE price > 1000000
AND toYear(date) = 2024
-- 879

-- Which town had the highest number of properties sold?
SELECT town,
       count()
FROM uk_prices_3
WHERE price > 1000000
AND toYear(date) = 2024
GROUP BY town
ORDER BY count() DESC
LIMIT 3
--    ┌─town────┬─count()─┐
-- 1. │ LONDON  │    8769 │
-- 2. │ BRISTOL │     236 │
-- 3. │ BATH    │     173 │
--    └─────────┴─────────┘

-- Using the topK function, write a query that returns the top 10 towns that are not London with the most properties sold.
SELECT topKIf(10)(town, town != 'LONDON')
FROM uk_prices_3
--    ┌─topKIf(10)(town, notEquals(town, 'LONDON'))───────────────────────────────────────────────────────────────────────────────┐
-- 1. │ ['MANCHESTER','NOTTINGHAM','SHEFFIELD','YORK','BRISTOL','LEEDS','STOKE-ON-TRENT','SOUTHAMPTON','BIRMINGHAM','WARRINGTON'] │
--    └───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

SELECT town,
       count()
FROM uk_prices_3
WHERE town != 'LONDON'
GROUP BY town
ORDER BY count() DESC
LIMIT 10
--     ┌─town────────┬─count()─┐
--  1. │ MANCHESTER  │  494068 │
--  2. │ BRISTOL     │  460438 │
--  3. │ BIRMINGHAM  │  437737 │
--  4. │ NOTTINGHAM  │  394000 │
--  5. │ LEEDS       │  337523 │
--  6. │ LIVERPOOL   │  316379 │
--  7. │ SHEFFIELD   │  286758 │
--  8. │ LEICESTER   │  261019 │
--  9. │ SOUTHAMPTON │  240431 │
-- 10. │ NORWICH     │  218285 │
--     └─────────────┴─────────┘

-- What are the top 10 most expensive towns to buy property in the UK, on average?

SELECT town,
       avg(price)
FROM uk_prices_3
GROUP BY town
ORDER BY avg(price) DESC
LIMIT 10
--     ┌─town──────────────┬─────────avg(price)─┐
--  1. │ GATWICK           │ 28232811.583333332 │
--  2. │ THORNHILL         │             985000 │
--  3. │ VIRGINIA WATER    │  974641.0336598845 │
--  4. │ CHALFONT ST GILES │  860482.2911235257 │
--  5. │ COBHAM            │  762432.8580569478 │
--  6. │ BEACONSFIELD      │  731470.6938687392 │
--  7. │ ESHER             │  676967.3573145462 │
--  8. │ KESTON            │  640199.8470171293 │
--  9. │ GERRARDS CROSS    │    627952.07022319 │
-- 10. │ ASCOT             │   596139.039403549 │
--     └───────────────────┴────────────────────┘

-- What is the address of the most expensive property in the dataset?  (Specifically, return the addr1, addr2, street and town columns.)
SELECT town,
       avg(price),
       argMax(addr1, price) as addr1_max_price,
       argMax(addr2, price) as addr2_max_price,
       argMax(street, price) as street_max_price
FROM uk_prices_3
GROUP BY town
ORDER BY avg(price) DESC
LIMIT 10
--     ┌─town──────────────┬─────────avg(price)─┬─addr1_max_price──────────────┬─addr2_max_price─┬─street_max_price─┐
--  1. │ GATWICK           │ 28232811.583333332 │ SOFITEL LONDON GATWICK HOTEL │                 │ NORTH TERMINAL   │
--  2. │ THORNHILL         │             985000 │ LOWER HAM FARM               │                 │                  │
--  3. │ VIRGINIA WATER    │  974641.0336598845 │ RAVEN MORROW                 │                 │ WEST DRIVE       │
--  4. │ CHALFONT ST GILES │  860482.2911235257 │ THE STONE                    │                 │ PHEASANT HILL    │
--  5. │ COBHAM            │  762432.8580569478 │ SILVERMERE CARE HOME         │                 │ REDHILL ROAD     │
--  6. │ BEACONSFIELD      │  731470.6938687392 │ BELL HOUSE HOTEL             │                 │ OXFORD ROAD      │
--  7. │ ESHER             │  676967.3573145462 │ COPSEM LODGE                 │                 │ COPSEM LANE      │
--  8. │ KESTON            │  640199.8470171293 │ 38                           │                 │ FOREST DRIVE     │
--  9. │ GERRARDS CROSS    │    627952.07022319 │ CHALFONT GROVE               │ DATA CENTRE     │ NARCOT LANE      │
-- 10. │ ASCOT             │   596139.039403549 │ ASCOT GRANGE                 │                 │ BAGSHOT ROAD     │
--     └───────────────────┴────────────────────┴──────────────────────────────┴─────────────────┴──────────────────┘

-- Write a single query that returns the average price of properties for each type. The distinct values of type are detached, semi-detached, terraced, flat, and other.
SELECT type,
       avg(price)
FROM uk_prices_3
GROUP BY type
ORDER BY avg(price) DESC
LIMIT 10
--    ┌─type──────────┬─────────avg(price)─┐
-- 1. │ other         │ 1206634.2717724007 │
-- 2. │ detached      │ 303381.50725730247 │
-- 3. │ flat          │ 209727.82009037115 │
-- 4. │ semi-detached │  181928.2250229724 │
-- 5. │ terraced      │ 165716.60715560857 │

-- What is the sum of the price of all properties sold in the counties of Avon, Essex, Devon, Kent, and Cornwall in the year 2024?
SELECT sum(price)
FROM uk_prices_3
WHERE county in ('AVON', 'ESSEX', 'DEVON', 'KENT', 'CORNWALL')
AND toYear(date) = 2024
--    ┌──sum(price)─┐
-- 1. │ 22539007297 │ -- 22.54 billion
--    └─────────────┘

-- What is the average price of properties sold per month from 2005 to 2010?
SELECT toStartOfMonth(date) as month,
       avg(price)
FROM uk_prices_3
WHERE toYear(date) >= 2005
AND toYear(date) <= 2010
GROUP BY month
ORDER BY month

-- How many properties were sold in Liverpool each day in 2020?
SELECT toStartOfDay(date) as day,
       count()
FROM uk_prices_3
WHERE toYear(date) = 2020
GROUP BY day
ORDER BY day
-- 366. │ 2020-12-31 00:00:00 │      93 │

-- Write a query that returns the price of the most expensive property in each town divided by the price of the most expensive property in the entire dataset. Sort the results in descending order of the computed result.
WITH max_price_total AS (select max(price) from uk_prices_3)
SELECT town,
       max(price) max_price,
       (SELECT MAX(price) FROM uk_prices_3) as max_price_total,
       max(price)/max_price_total as max_price_ratio
FROM uk_prices_3
GROUP BY town
ORDER BY max_price DESC
LIMIT 100
-- Or using a more efficient approach with a window function:
SELECT 
    town,
    MAX(price) as max_price_town,
    MAX(price) OVER () as max_price_overall,
    MAX(price) / MAX(price) OVER () as ratio
FROM uk_prices_3
GROUP BY town
ORDER BY ratio DESC;
-- With CTE for readability
WITH overall_max AS (
    SELECT MAX(price) as max_price
    FROM uk_prices_3
)
SELECT 
    town,
    MAX(price) as max_price_town,
    overall_max.max_price as max_price_overall,
    MAX(price) / overall_max.max_price as ratio
FROM uk_prices_3
CROSS JOIN overall_max
GROUP BY town, overall_max.max_price
ORDER BY ratio DESC;
```

## Lab 5.2 Building a Dashboard
