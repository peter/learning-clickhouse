#!/usr/bin/env npx tsx

// npm install @clickhouse/client (1.12.1)
import { ClickHouseClient, createClient } from '@clickhouse/client'; // or '@clickhouse/client-web'

const CLICKHOUSE_ENV = process.env.CLICKHOUSE_ENV || 'cloud';

const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD || '';

function defaultClickhouseUrl() {
    if (CLICKHOUSE_ENV === 'cloud') {
        return 'https://u2a4rcb0v3.eu-west-1.aws.clickhouse.cloud:8443';
    } else if (CLICKHOUSE_ENV === 'local') {
        return 'http://127.0.0.1:8123';
    } else {
        throw new Error(`Invalid CLICKHOUSE_ENV: ${CLICKHOUSE_ENV}`);
    }
}

const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || defaultClickhouseUrl();

const initClickHouseClient = async (): Promise<ClickHouseClient> => {
    const client = createClient({
        url: CLICKHOUSE_URL,
        username: 'default',
        password: CLICKHOUSE_PASSWORD,
        database: 'default',
    });

    console.log('ClickHouse ping...');
    const pingResult = await client.ping();
    console.log('Ping result', JSON.stringify(pingResult, null, 2));
    if (!pingResult.success) {
        throw new Error(`failed to ping ClickHouse: ${pingResult.error}`);
    }
    return client;
};

const main = async () => {
    console.log('Initialising clickhouse client', JSON.stringify({ CLICKHOUSE_ENV, CLICKHOUSE_URL, CLICKHOUSE_PASSWORD }, null, 2));
    const client = await initClickHouseClient();
    const startTime = Date.now();
    const row = await client.query({
        query: `SELECT 1`,
        // query: `SELECT name FROM system.tables WHERE database='system'`,
    });
    const result = await row.json();
    const elapsed = Date.now() - startTime;
    console.log(`Query result received elapsed=${elapsed}ms`, JSON.stringify(result, null, 2));

    await client.close();
    console.log(`👋`);
};

main();
