import { Pool } from 'pg';
// import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// PostgreSQL 설정
const pgPool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
});

// Redis 설정 (주석처리)
/*
const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

// Redis Pub/Sub 클라이언트 (별도 연결)
const redisPubSub = redisClient.duplicate();
*/

// Redis 클라이언트 모킹 (기능 비활성화)
const redisClient = {
  hmset: async () => {},
  expire: async () => {},
  hset: async () => {},
  del: async () => {},
  sadd: async () => {},
  srem: async () => {},
  publish: async () => {},
  keys: async () => [],
  hgetall: async () => ({}),
  smembers: async () => [],
  quit: async () => {},
  duplicate: () => ({
    subscribe: async () => {},
    on: () => {},
    quit: async () => {}
  })
};

const redisPubSub = redisClient.duplicate();

export {
  pgPool,
  redisClient,
  redisPubSub
}; 