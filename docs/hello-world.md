# Hello World

From [ClickHouse Cloud quick start](https://clickhouse.com/docs/getting-started/quick-start/cloud):

You can sign up for a 30 day free trial at [ClickHouse Cloud](https://clickhouse.com/cloud) or [install ClickHouse](https://clickhouse.com/docs/install) on your on your server or laptop. Here is an example of how to connect to ClickHouse Cloud using the ClickHouse client in the terminal:

```sh
# Installation on Mac
brew install --cask clickhouse

# Connect to ClickHouse Cloud (get host and password from https://console.clickhouse.cloud)
export CLICKHOUSE_PASSWORD=...
export CLICKHOUSE_HOST=u2a4rcb0v3.eu-west-1.aws.clickhouse.cloud
clickhouse client
````

```sql
SHOW databases;
SHOW tables;

CREATE DATABASE IF NOT EXISTS helloworld

CREATE TABLE helloworld.my_first_table
(
    user_id UInt32,
    message String,
    timestamp DateTime,
    metric Float32
)
ENGINE = MergeTree()
PRIMARY KEY (user_id, timestamp)

INSERT INTO helloworld.my_first_table (user_id, message, timestamp, metric) VALUES
    (101, 'Hello, ClickHouse!',                                 now(),       -1.0    ),
    (102, 'Insert a lot of rows per batch',                     yesterday(), 1.41421 ),
    (102, 'Sort your data based on your commonly-used queries', today(),     2.718   ),
    (101, 'Granules are the smallest chunks of data read',      now() + 5,   3.14159 )

SELECT * FROM helloworld.my_first_table ORDER BY timestamp;

SHOW TABLES FROM helloworld
```
