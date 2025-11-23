import { config } from 'dotenv';
import Redis, { type RedisOptions } from 'ioredis';

// Load environment variables
config();

const url = process.env.REDIS_URL || "rediss://default:AWS-AAIncDJkNjYxN2EzZTdlM2E0MTRmOTRhZGExZGIwYTBhZmE3NXAyMjU3OTA@excited-humpback-25790.upstash.io:6379";

// Create options shared across constructors
// FIX: Use 'RedisOptions' directly, not 'Redis.RedisOptions'
const baseOpts: RedisOptions = {
  // Allow offline queueing to avoid throwing on short network blips
  enableOfflineQueue: true,
  // Don't throw for each command failure while starting
  maxRetriesPerRequest: null,
  // Sensible connect timeout
  connectTimeout: 5000,
  // Reconnect strategy
  retryStrategy(times: number) {
    // times is number of attempts so far
    // Linear backoff: 50ms, 100ms, 150ms ... capped at 2000ms
    const delay = Math.min(50 + times * 50, 2000);
    return delay;
  }
};

let client: Redis;

// FIX: Logic to ensure client is always initialized
if (url) {
  // If you have an Upstash/Remote URL
  console.log('[redis] Initializing with remote URL');
  client = new Redis(url, {
    ...baseOpts,
    // Explicitly handle TLS if the URL is rediss:// (ioredis usually does this auto, but this is safer)
    tls: url.startsWith('rediss://') ? {} : undefined
  });
} else {
  // Fallback to localhost default (127.0.0.1:6379) if no URL is provided
  // This prevents 'client is undefined' errors later in the code
  console.log('[redis] Initializing with default localhost settings');
  client = new Redis(baseOpts);
}

// Event handlers — log, but don't crash app on Redis errors
client.on('connect', () => {
  console.info(`[redis] connected`);
});

client.on('ready', () => {
  console.info('[redis] ready');
});

// FIX: Typed 'err' as Error instead of custom object with 'any'
client.on('error', (err: Error) => {
  // Log error details; do not rethrow — prevents unhandled error events that crash Node
  console.error('[redis] error', err.message || err);
});

client.on('close', () => {
  console.warn('[redis] connection closed');
});

// FIX: Typed 'delay' as number
client.on('reconnecting', (delay: number) => {
  console.warn(`[redis] reconnecting, delay=${delay}ms`);
});

export { client as redis };