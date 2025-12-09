## ClickHouse Certified Developer

Recommended for ClickHouse experts who handle app creation, data ingestion, modeling, query efficiency, and optimization.

* Recommended training: [Real-time analytics with ClickHouse](https://clickhouse.com/learn/real-time-analytics) (10 modules and 10 hours with Rich Raposa).
* [Guide for how to prepare and what to expect (Video)](https://www.youtube.com/watch?si=T8Gp9OX8GnVZUmtH&v=bLXCYhf5G8Q&feature=youtu.be)

* [Real-time Analytics with ClickHouse: Level 1](https://learn.clickhouse.com/visitor_catalog_class/show/1872073/Real-time-Analytics-with-ClickHouse-Level-1)
* [Real-time Analytics with ClickHouse: Level 2](https://learn.clickhouse.com/visitor_catalog_class/show/1896608/Real-time-Analytics-with-ClickHouse-Level-2)
* [Real-time Analytics with ClickHouse: Level 3](https://learn.clickhouse.com/visitor_catalog_class/show/1914307/Real-time-Analytics-with-ClickHouse-Level-3)

## Course Module Notes

* [Module 1: Introduction to ClickHouse](certified-developer/01-introduction.md)
* [Module 2: Deep dive into ClickHouse Architecture](certified-developer/02-archtecture.md)
* [Module 3: Inserting Data into ClickHouse](certified-developer/03-inserting-data.md)
* [Module 4: Modeling Data with ClickHouse](certified-developer/04-modeling-data.md)
* [Module 5: Analyzing Data with ClickHouse](certified-developer/05-analyzing-data.md)
* [Module 6: Joining Data](certified-developer/06-joining-data.md)
* [Module 7: Deleting and Updating Data](certified-developer/07-deleting-and-updating.md)
* [Module 8: Query and Acceleration Techniques](certified-developer/08-query-and-acceleration.md)
* [Module 9: Sharding and Replication](certified-developer/09-sharding-and-replication.md)
* [Module 10: Managing Data in ClickHouse](certified-developer/10-managing-data.md)

## Scope of the Exam

You will be given 2 hours to successfully complete 10 to 12 hands-on tasks.

Modeling data:

* Create a new database
* Create a new table that satisfies a given criteria or matches a given file format
* Choose efficient data types for columns when appropriate
* Define an efficient primary key given a specific criteria of the types of queries that will be executed on a MergeTree table
* Define and query a Dictionary

Inserting data:

* Insert a local file into a table
* Insert a file from cloud storage into a table
* Insert a Parquet, CSV, or TSV file into a table
* Provide minor transformations to columns as they are being inserted
* Insert data from one table into another

Analyzing data:

* Write a query that satisfies a given criteria
* Write a query that uses regular functions. For example, searches for substrings within a String column, or converts a timestamp to the beginning of a time interval
* Write a query that uses aggregate functions. For example, find the max/min/sum/avg of a column, or the number of unique values, or a given quantile
* Use a GROUP BY to compute buckets of aggregated values given a specified timeframe or grouping criteria

Optimizing query performance

* Define a materialized view that stores the result of a non-aggregation query
* Define a materialized view that stores the result of an aggregate function using the AggregatingMergeTree or SummingMergeTree table engines
* Define a projection on a table
* Define a set or minmax skipping index on a table

Deduplication and mutations:

* Perform a lightweight delete operation on a table
* Implement an efficient upsert strategy using the ReplacingMergeTree table engine
* Implement an efficient strategy for performing frequent updates using the CollapsingMergeTree table engine
