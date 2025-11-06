## Running ClickHouse Locally

ClickHouse is open source and is easy to install and run on your laptop or server.

* [ClickHouse OSS quick start](https://clickhouse.com/docs/getting-started/quick-start/oss)
* [Installing ClickHouse on Mac](https://clickhouse.com/docs/install/macOS)

```sh
# Starting the clickhouse server:
# The server process will save files in the current directory by default
mkdir -p ~/clickhouse-server && cd ~/clickhouse-server && clickhouse server
# Ports:
# 9000  # Native protocol (TCP) - default for clickhouse-client
# 8123  # HTTP interface - for HTTP queries and integrations

# Connecting to the server (on port 9000)
clickhouse client
```

```sql
SHOW TABLES;
SHOW TABLES FROM system;

CREATE TABLE my_table
(
    user_id UInt32,
    message String,
    timestamp DateTime,
    metric Float32
)
ENGINE = MergeTree()
PRIMARY KEY (user_id, timestamp)

INSERT INTO my_table (user_id, message, timestamp, metric) VALUES
    (101, 'Hello, ClickHouse!',                                 now(),       -1.0    ),
    (102, 'Insert a lot of rows per batch',                     yesterday(), 1.41421 ),
    (102, 'Sort your data based on your commonly-used queries', today(),     2.718   ),
    (101, 'Granules are the smallest chunks of data read',      now() + 5,   3.14159 )

SELECT * FROM my_table ORDER BY timestamp;

DESCRIBE TABLE my_table;
SHOW CREATE TABLE my_table;
```

You can inspect the files the server creates:

```sh
du -sh ~/clickhouse-server
find clickhouse-server -type f
```