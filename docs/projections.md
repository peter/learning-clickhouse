# Projections

Usage example:

```sql
CREATE TABLE daily
(
    day UInt16,
    tracker String,
    event_id UInt16,
    count_total UInt32,
)
ENGINE = MergeTree()
ORDER BY (tracker, event_id)
SETTINGS index_granularity = 8192;

ALTER TABLE daily ADD PROJECTION day_projection (SELECT * ORDER BY day, event_id);
ALTER TABLE daily MATERIALIZE PROJECTION day_projection;

ALTER TABLE daily ADD PROJECTION event_projection (SELECT * ORDER BY event_id, day);
ALTER TABLE daily MATERIALIZE PROJECTION event_projection;

ALTER TABLE daily ADD PROJECTION campaign_projection (SELECT * ORDER BY d_3, day);
ALTER TABLE daily MATERIALIZE PROJECTION campaign_projection;

ALTER TABLE daily ADD PROJECTION order_projection (SELECT * ORDER BY d_16, day);
ALTER TABLE daily MATERIALIZE PROJECTION order_projection;

-- List projections for table
SELECT 
    database,
    table,
    name as projection_name,
    type,
    sorting_key,
    query
FROM system.projections
WHERE database = 'default' 
  AND table = 'daily';

-- Check if there are ongoing mutations for projection materialization
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
WHERE database = 'default' 
  AND table = 'daily'
  AND command LIKE '%MATERIALIZE%PROJECTION%'
ORDER BY create_time DESC;

-- To verify that a query is using the projection, we could review the system.query_log table. On the projections field we have the name of the projection used or empty if none has been used:
SELECT query, projections FROM system.query_log WHERE query_id='<query_id>'

-- You can also see projection usage with EXPLAIN:
EXPLAIN indexes=1 SELECT ....

-- To check disk space usage of projections:
SELECT
    formatReadableSize(sum(bytes_on_disk)),
    count() AS num_of_parts
FROM system.parts
WHERE table = 'daily' AND active = 1;
```

You can also use projections for aggregations:

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
```

