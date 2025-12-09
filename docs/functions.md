# ClickHouse Functions

## Aggregate Functions

https://clickhouse.com/docs/sql-reference/aggregate-functions/reference

* min
* max
* avg
* median
* [quantile](https://clickhouse.com/docs/sql-reference/aggregate-functions/reference/quantile)
* argMin
* argMax

* abs
* [pow](https://clickhouse.com/docs/sql-reference/functions/math-functions#pow)
* [rand](https://clickhouse.com/docs/sql-reference/functions/random-functions#rand) - Returns a random UInt32 number with uniform distribution.

```sql
CREATE OR REPLACE TABLE id_x
(
    id UInt32,
    x UInt32
)
ENGINE = MergeTree
PRIMARY KEY x;

INSERT INTO id_x
SELECT
  number,
  rand()
FROM numbers_mt(100_000_000);

SELECT min(x)/pow(2,32) as min,
       max(x)/pow(2,32) as max,
       avg(x)/pow(2,32) as avg,
       median(x)/pow(2,32) as median,
       quantile(0.5)(x)/pow(2,32) as p50,
       quantile(0.9)(x)/pow(2,32) as p90,
       quantile(0.99)(x)/pow(2,32) as p99
FROM id_x
FORMAT vertical;
-- Row 1:
-- ──────
-- min:    1.3969838619232178e-8
-- max:    0.9999999913852662
-- avg:    0.5000067805043812
-- median: 0.49831025185994804
-- p50:    0.49831025185994804
-- p90:    0.8993216387927535
-- p99:    0.9900100289587863

-- 1 row in set. Elapsed: 0.141 sec. Processed 100.00 million rows, 400.00 MB (709.34 million rows/s., 2.84 GB/s.)
```

## Date and Time Functions

See [Date and Time Functions](https://clickhouse.com/docs/sql-reference/functions/date-time-functions)
