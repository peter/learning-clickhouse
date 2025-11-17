# Module 7: Deleting and Updating Data

[Module 7: Deleting and Updating Data](https://learn.clickhouse.com/learner_module/show/1896608?lesson_id=10185594&section_id=89647294)

Part of [Real-time analytics with ClickHouse](https://clickhouse.com/learn/real-time-analytics)

## Deleting and Updating Data

Parts in ClickHouse are immutable files. Lets say you have 25 columns and 1 billion rows and you want to delete a row. This is very difficult for ClickHouse. You can do deletes and updates though but it won't happen immediately, instead a mutation is created and it will complete eventually.

```sql
ALTER TABLE random DELETE WHERE y != 'hello';
ALTER TABLE random UPDATE y = 'hello' WHERE x > 10;
```

```sql
SELECT * FROM system.mutations
```

* Mutations execute in order
* Data inserted after is not mutated
* If the mutation gets stuck you can kill it
* Clients can wait by setting mutation_sync = 1 or 2 (default is 0)

Lightweight deletes:

```sql
DELETE FROM my_table WHERE y != 'hello'
```

* The deleted rows are marked as deleted with a hidden column.
* The deleted rows are eventually deleted when parts merge

On-the-fly updates:

```sql
SET apply_mutations_on_the_fly = 1;
-- ALTER TABLE
```

* SELECT queries automatically see the changes
* The updated rows will eventually be updated during next merge
* Can impact performance negatively

Lightweight updates:

```sql
SET apply_mutations_on_the_fly = 1;
-- UPDATE TABLE
```

## Deduplication

The traditional way to delete data in ClickHouse is through deduplication

* Sometimes you upsert data to overwrite old values
* Sometimes you are not sure an insert worked so you re-send it
* Sometimes you have to update data frequently

If you need to update data you have some options to deduplicate your data

* ReplacingMergeTree - remove duplicates with same merge key - upserts or updates
* CollapsingMergeTree - collapses pairs of rows if the sorting key is equivalent - frequent updates
* VersionedCollapsingMergeTree - has versioning for out of order inserts - frequent parallel updates

The primary key can be shorter than the sort key

```sql
CREATE TABLE duplicate_demo (
    x UInt32,
    y String
)
ENGINE = ReplacingMergeTree
ORDER BY x

-- Creates one part
INSERT INTO duplicate_demo VALUES
    (1, 'hello'),
    (2, 'world');

-- Creates another part
INSERT INTO duplicate_demo VALUES
    (1, 'goodbye');

-- Three rows - parts haven't merged
SELECT * FROM duplicate_demo

SELECT *
FROM system.parts
WHERE table = 'duplicate_demo'

-- Two rows
SELECT * FROM duplicate_demo FINAL

-- Merges the parts
OPTIMIZE TABLE duplicate_demo
```

[ReplacingMergeTree Docs](https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree)

Data deduplication occurs only during a merge. Merging occurs in the background at an unknown time, so you can't plan for it. Some of the data may remain unprocessed. Although you can run an unscheduled merge using the OPTIMIZE query, do not count on using it, because the OPTIMIZE query will read and write a large amount of data.

In general you should always put `FINAL` after the table name to get the latest values. However, using `FINAL` can have a negative performance impact. You may be able to avoid `FINAL` for example with an `argMax()` call on a timestamp column.

You can specify `ver` column that allows out of order inserts. ClickHouse will select the row with the highest `ver` column value, i.e. version number or timestamp.

You can specify that a column is deleted using an `is_deleted` column.

There is a new ClickHouse feature called "patched parts" that may replace ReplacingMergeTree.

CollapsingMergeTree deletes pairs of rows that have the same sort key and have different states, i.e. `sign` column values (-1 or 1).

```sql
CREATE TABLE url_hits (
    url String,
    hits UInt64,
    sign Int8
)
ENGINE=CollapsingMergeTree(sign)
ORDER BY (url);

-- sign=1 represents current state
INSERT INTO url_hits VALUES
    ('/index.html', 20, 1),
    ('/docs', 10, 1);

INSERT INTO url_hits VALUES
    ('/index.html', 20, -1),
    ('/index.html', 30, 1);

SELECT * from url_hits
--    ┌─url─────────┬─hits─┬─sign─┐
-- 1. │ /docs       │   10 │    1 │
-- 2. │ /index.html │   20 │    1 │
-- 3. │ /index.html │   20 │   -1 │
-- 4. │ /index.html │   30 │    1 │
--    └─────────────┴──────┴──────┘

select * from url_hits FINAL

-- Faster than FINAL. Requires having the old value:
SELECT url,
       SUM(sign*hits)
FROM url_hits
GROUP BY url
ORDER BY url

-- We know that hits is monotonically growing
SELECT url,
       MAX(hits)
FROM url_hits
GROUP BY url
ORDER BY url

-- Deleting a row (with FINAL)
INSERT INTO url_hits (url, sign) VALUES
    ('/docs', -1);
```

[CollapsingMergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/collapsingmergetree)

The CollapsingMergeTree engine inherits from MergeTree and adds logic for collapsing rows during the merge process. The CollapsingMergeTree table engine asynchronously deletes (collapses) pairs of rows if all the fields in a sorting key (ORDER BY) are equivalent except for the special field Sign, which can have values of either 1 or -1. Rows without a pair of opposite valued Sign are kept.


The [VersionedCollapsingMergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/versionedcollapsingmergetree) uses a `version` column to decide what the current state is.

The engine inherits from MergeTree and adds the logic for collapsing rows to the algorithm for merging data parts. VersionedCollapsingMergeTree serves the same purpose as CollapsingMergeTree but uses a different collapsing algorithm that allows inserting the data in any order with multiple threads. In particular, the Version column helps to collapse the rows properly even if they are inserted in the wrong order. In contrast, CollapsingMergeTree allows only strictly consecutive insertion.

## Lab 7.1 ReplacingMergeTree

In this lab, you will create a simple table of mortgage interest rates where existing rows can be replaced with new rows using the ReplacingMergeTree table engine. The mortgage rates are in a CSV file that looks like the following:

```csv
date,variable,fixed,bank
29/02/2004,5.02,4.9,4
31/03/2004,5.11,4.91,4
30/04/2004,5.07,4.92,4
31/05/2004,5.11,4.92,4.25
```

```sql
CREATE TABLE rates_monthly
(
    month Date,
    variable Decimal32(2),
    fixed Decimal32(2),
    bank Decimal32(2)
)
ENGINE = ReplacingMergeTree()
PRIMARY KEY (month)

INSERT INTO rates_monthly
    SELECT
        parseDateTime(date, '%d/%m/%Y') as month,
        variable,
        fixed,
        bank
    FROM s3(
        'https://learnclickhouse.s3.us-east-2.amazonaws.com/datasets/mortgage_rates.csv',
        'CSVWithNames');

SELECT * FROM rates_monthly
--    ┌──────month─┬─variable─┬─fixed─┬─bank─┐
--   1. │ 2004-02-29 │     5.01 │   4.9 │    4 │
--   2. │ 2004-03-31 │     5.11 │  4.91 │    4 │
--   3. │ 2004-04-30 │     5.07 │  4.92 │    4 │
--   4. │ 2004-05-31 │     5.11 │  4.92 │ 4.25 │
--   5. │ 2004-06-30 │     5.32 │  4.93 │  4.5 │
--   6. │ 2004-07-31 │     5.55 │  4.96 │  4.5 │
--   7. │ 2004-08-31 │     5.58 │  5.01 │ 4.75 │
-- ...
-- 216. │ 2022-01-31 │     2.42 │  1.92 │ 0.25 │
-- 217. │ 2022-02-28 │     2.52 │  1.92 │  0.5 │
-- 218. │ 2022-03-31 │     2.72 │  1.91 │ 0.75 │
-- 219. │ 2022-04-30 │     2.78 │  1.91 │ 0.75 │
-- 220. │ 2022-05-31 │     2.98 │  1.91 │    1 │

-- Change the interest rates for 2022-05-31 to 3.2, 3.0, and 1.1.
INSERT INTO rates_monthly VALUES ('2022-05-31', 3.2, 3.0, 1.1);
SELECT * FROM rates_monthly
SELECT * FROM rates_monthly FINAL

CREATE TABLE rates_monthly2
(
    month Date,
    variable Decimal32(2),
    fixed Decimal32(2),
    bank Decimal32(2),
    version UInt32
)
ENGINE = ReplacingMergeTree(version)
PRIMARY KEY (month)

INSERT INTO rates_monthly2
    SELECT
        parseDateTime(date, '%d/%m/%Y') as month,
        variable,
        fixed,
        bank,
        1 as version
    FROM s3(
        'https://learnclickhouse.s3.us-east-2.amazonaws.com/datasets/mortgage_rates.csv',
        'CSVWithNames');

SELECT * FROM rates_monthly2

INSERT INTO rates_monthly2 VALUES
    ('2022-04-30', 3.1, 2.6, 1.1, 10);
INSERT INTO rates_monthly2 VALUES
    ('2022-04-30', 2.9, 2.4, 0.9, 5);

SELECT * FROM rates_monthly2
SELECT * FROM rates_monthly2 FINAL
WHERE month = '2022-04-30';
--    ┌──────month─┬─variable─┬─fixed─┬─bank─┬─version─┐
-- 1. │ 2022-04-30 │      3.1 │   2.6 │  1.1 │      10 │
--    └────────────┴──────────┴───────┴──────┴─────────┘

OPTIMIZE TABLE rates_monthly2
SELECT * FROM rates_monthly2
```

## Lab 7.2 CollapsingMergeTree

```sql
CREATE TABLE messages
(
    id UInt32,
    day Date,
    message String,
    sign Int8
)
ENGINE = CollapsingMergeTree(sign)
PRIMARY KEY (id);

INSERT INTO messages VALUES
    (1, '2024-07-04', 'Hello', 1),
    (2, '2024-07-04', 'Hi', 1),
    (3, '2024-07-04', 'Bounjour', 1);

SELECT * FROM messages

-- "Update" the row with id equal to 2, setting the day to '2024-07-05' and changing the message to "Goodbye".  
INSERT INTO messages VALUES
    (2, '2024-07-04', 'Hi', -1),
    (2, '2024-07-04', 'Goodbye', 1),;

-- "Delete" the row where id equals 3.
INSERT INTO messages VALUES
    (3, '2024-07-04', 'Bounjour', -1);

SELECT * FROM messages

SELECT * FROM messages FINAL
--    ┌─id─┬────────day─┬─message─┬─sign─┐
-- 1. │  1 │ 2024-07-04 │ Hello   │    1 │
-- 2. │  2 │ 2024-07-04 │ Goodbye │    1 │
--    └────┴────────────┴─────────┴──────┘

INSERT INTO messages VALUES 
   (1, '2024-07-03', 'Adios', 1);

SELECT * FROM messages FINAL
```

Notice for row 1 you get the latest values. Why? The algorithm(opens in a new tab) used by CollapsingMergeTree is a best effort and tries to return the latest value in different situations. For example, when you have more state rows than cancel rows (this case), a FINAL query returns the last row inserted. That said, you should aim to insert a cancel row for every state row. From the documentation: "When there are at least 2 more “state” rows than “cancel” rows, or at least 2 more “cancel” rows then “state” rows, the merge continues, but ClickHouse treats this situation as a logical error and records it in the server log. This error can occur if the same data were inserted more than once."
