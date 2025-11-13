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
