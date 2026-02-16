# Query Log

[system.query_log](https://clickhouse.com/docs/operations/system-tables/query_log) stores metadata and statistics about executed queries, such as start time, duration, error messages, resource usage, and other execution details. It does not store the results of queries.

Slow queries:

```sql
SELECT
    query,
    query_duration_ms,
    memory_usage,
    read_rows,
    formatReadableSize(read_bytes) AS read_size
FROM system.query_log
WHERE 
    user = 'peter'
    AND type = 'QueryFinish'
    AND event_date >= now() - INTERVAL 7 DAY
    AND query like 'SELECT %'
    AND query not like '% FROM s3%'
ORDER BY query_duration_ms DESC
LIMIT 100
FORMAT VERTICAL;
```

Failed queries:

```sql
SELECT
    event_time,
    query,
    exception_code,
    exception
FROM system.query_log
WHERE type != 'QueryStart' 
  AND type != 'QueryFinish' -- Filters for ExceptionBeforeStart or ExceptionWhileProcessing
ORDER BY event_time DESC
LIMIT 10;
```
