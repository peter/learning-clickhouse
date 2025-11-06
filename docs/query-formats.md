# ClickHouse Query Result Formats

You can select output format for a ClickHouse query with the [FORMAT clause](https://clickhouse.com/docs/sql-reference/statements/select/format).

Examples:

```sql
select * from my_table limit 100 FORMAT Vertical;
```