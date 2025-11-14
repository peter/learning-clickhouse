# Module 6: Joining Data

[Module 6: Joining Data](https://learn.clickhouse.com/learner_module/show/1896608?from=%2Flearner_module%2Fshow%2F1896608%3Flesson_id%3D10185593%26page_router%3Dtrue%26section_id%3D91373742&lesson_id=10185638)

Part of [Real-time analytics with ClickHouse](https://clickhouse.com/learn/real-time-analytics)

## Joins

All standards joins are supported

```sql
SELECT n.name,
       g.genre
FROM movies as m
INNER JOIN genres g on m.id = g.movie_id
```

What if my table has billions of rows? ClickHouse has six different join algorithms:

* direct - not memory bound, right hand table is dictionary in memory
* hash - memory bound, in memory hash table of right hand table
* parallel hash - memory bound, similar to hash but splits right table
* grace hash - similar to hash but does not need to fit in memory
* full sorting merge - classic sort merge join
* partial merge - similar to sort merge but minimizes memory usage

Joining billions of rows with billions of rows will require lots of resources regardless of which system you are using

There is a trade-off between memory usage of the join and execution time

```sql
SELECT *
FROM actors a
JOIN roles r on a.id = r.actor_id
-- Default join_algorithm is 'direct'
SETTINGS join_algorithm = 'grace_hash'
```

## Hash Joins

The right hand table gets built in memory

The `hash` and `parallel_hash` algorithms are fast but use a lot of memory whereas `grace_hash` and `partial_merge` are slower but use less memory

See [Choosing the Right Join Algorithm
](https://clickhouse.com/blog/clickhouse-fully-supports-joins-how-to-choose-the-right-algorithm-part5)

```sql
SELECT ...
FROM uk_populations_table
JOIN uk_price_paid
ON
SETTINGS join_algorithm = 'hash'
-- Elapsed: 2.8 s
```

NOTE: put the bigger table on the right, if we swap it's 4 times slower

## Sort-merge Joins

* full sorting merge - both tables are sorted before merging
* partial merge - the right hand table is sorted by the join key before mering

The sorting happens in memory if possible

## Direct Joins

Dictionaries are in memory key-value mappings, stored on every replica

```sql
CREATE DICTIONARY uk_populations (
    city String,
    population UInt32
)
PRIMARY KEY city
SOURCE(
    HTTP(
        url 'https://...',
        format 'TabSeparatedWithNames'
    )
)
LAYOUT(HASHED())
LIFETIME(86400) -- update interval in seconds
```

Dictionary functions:

* dictGet()
* dictGet<dataType>()
* dictHas

A dictionary can be much faster than a join:

```sql
SELECT town,
       avg(price),
       dictGet('uk_populations', 'population', initCap(town)) as population
FROM uk_price_paid
GROUP BY town
LIMIT 100
-- 79 ms

-- Join syntax:
SELECT town,
       avg(price),
       any(population)
FROM uk_price_paid
JOIN uk_populations
ON lower(uk_price_paid.town) = lower(uk_populations.city)
GROUP BY town
LIMIT 100
-- 276 ms
```

# Join Table Engine

Join table engine is a special table engine intended for joins. Stored in RAM and similar to Dictionary but:

* Not tied to single source
* Multiple values per key allowed
* Do not auto update like Dictionary

```sql
CREATE TABLE uk_populations_join_table
(
    town String,
    population UInt32
)
ENGINE = JOIN(ANY, LEFT, town);
```

You can use the `joinGet()` function to get values from the join table or join it, i.e use `ANY LEFT JOIN uk_populations_join_table USING (town)`

## Lab 6.1 Using a Dictionary in a Join

Introduction:  In this lab, you see if there is a correlation between the number of properties sold and the mortgage interest rate in the United Kingdom. You will join the uk_prices_3 table with a Dictionary that you create from a CSV file in S3 containing historical mortgage rates.

```sql
CREATE TABLE uk_mortgage_rates_table (
    date DateTime64,
    variable Decimal32(2),
    fixed Decimal32(2),
    bank Decimal32(2)
)
ENGINE = MergeTree()
PRIMARY KEY date;

INSERT INTO uk_mortgage_rates_table
select *
from s3('https://learnclickhouse.s3.us-east-2.amazonaws.com/datasets/mortgage_rates.csv')

CREATE DICTIONARY uk_mortgage_rates
(
    date Date,
    variable Decimal32(2),
    fixed Decimal32(2),
    bank Decimal32(2)
)
PRIMARY KEY date
SOURCE(CLICKHOUSE(TABLE 'uk_mortgage_rates_table'))
-- SOURCE(HTTP(
--     url 'https://learnclickhouse.s3.us-east-2.amazonaws.com/datasets/mortgage_rates.csv'
--     format 'CSV'
-- ))
LAYOUT(COMPLEX_KEY_HASHED())
LIFETIME(2628000000)

-- Check the rows in your dictionary to see if it worked. You should see 220 rows.
select * from uk_mortgage_rates
select count(*) from uk_mortgage_rates

-- Let's try to find a correlation between the volume of properties sold and the interest rate. Using the uk_prices_3 table, write a query that returns the number of properties sold per month along with the variable interest rate for that month. You should get back 220 rows - one for each month in the dictionary.
SELECT toYYYYMM(date) as month,
       count() as n_properties_sold,
       dictGet('uk_mortgage_rates', 'variable', toYYYYMM(date)) as variable_interest_rate
FROM uk_prices_3
GROUP BY month
ORDER BY month

SELECT toYYYYMM(p.date) as month,
       count() as n_properties_sold,
       any(r.variable) as variable_interest_rate
FROM uk_prices_3 p
JOIN uk_mortgage_rates r ON toStartOfMonth(p.date) = toStartOfMonth(r.date)
GROUP BY month
ORDER BY month

SELECT toYYYYMM(p.date) as month,
       count() as n_properties_sold,
       any(r.variable) as variable_interest_rate
FROM uk_prices_3 p
JOIN uk_mortgage_rates r ON toStartOfMonth(p.date) = toStartOfMonth(r.date)
GROUP BY month
ORDER BY n_properties_sold DESC
--   1. │ 202106 │            191034 │                   2.36 │

-- https://clickhouse.com/docs/sql-reference/aggregate-functions/reference/corr
SELECT corr(toFloat32(n_properties_sold), toFloat32(variable_interest_rate))
FROM (SELECT toYYYYMM(p.date) as month,
       count() as n_properties_sold,
       any(r.variable) as variable_interest_rate
FROM uk_prices_3 p
JOIN uk_mortgage_rates r ON toStartOfMonth(p.date) = toStartOfMonth(r.date)
GROUP BY month
ORDER BY month);
--    ┌─corr(toFloat⋯rest_rate))─┐
-- 1. │               0.28658414 │
--    └──────────────────────────┘
-- Strength interpretation:
-- 0.00 to 0.19: Very weak correlation
-- 0.20 to 0.39: Weak correlation ← (your 0.28 falls here)
-- 0.40 to 0.59: Moderate correlation
-- 0.60 to 0.79: Strong correlation
-- 0.80 to 1.00: Very strong correlation

SELECT corr(toFloat32(n_properties_sold), toFloat32(fixed_interest_rate))
FROM (SELECT toYYYYMM(p.date) as month,
       count() as n_properties_sold,
       any(r.fixed) as fixed_interest_rate
FROM uk_prices_3 p
JOIN uk_mortgage_rates r ON toStartOfMonth(p.date) = toStartOfMonth(r.date)
GROUP BY month
ORDER BY month);
--    ┌─corr(toFloat⋯rest_rate))─┐
-- 1. │              -0.27119216 │
--    └──────────────────────────┘
```

[Lab solution](https://github.com/ClickHouse/clickhouse-academy/blob/main/realtime-analytics/06_joining_data/lab_6.1.sql)
