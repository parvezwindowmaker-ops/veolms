import express from 'express';
import type { Server } from 'http';
import cors from 'cors';
import { env } from './config/env';
import connectDB from './db/connection';
import { sequelize } from './db/sequelize';
import { redis } from './db/redis';
import router from './routes';
import { errorHandler, notFoundHandler } from './middleware/error-middleware';

/** '*' stays a wildcard; a comma list becomes an explicit allowlist. */
const corsOrigin: string | string[] =
  env.corsOrigin === '*'
    ? '*'
    : env.corsOrigin.split(',').map((origin) => origin.trim());

async function bootstrap(): Promise<void> {
  // Fail fast if Postgres is unreachable before binding the HTTP port.
  await connectDB();

  const app = express();

  // Trust one reverse proxy (Render/Railway/etc.) so req.ip is the real client
  // for rate limiting. Keep it minimal (1) because a permissive value lets clients
  // spoof X-Forwarded-For and evade the limiter.
  app.set('trust proxy', 1);

  app.use(cors({ origin: corsOrigin }));
  // The Razorpay webhook signature is verified against the RAW request bytes,
  // so capture them as a Buffer here BEFORE the JSON parser runs. express.raw
  // sets req._body, which makes the later express.json() skip this route. The
  // 16kb cap bounds webhook payloads (Razorpay events are small).
  app.use('/api/payment/webhook', express.raw({ type: '*/*', limit: '16kb' }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/api', router);

  // 404 + centralized error handler must come last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(env.port, () => {
    console.log(`VeoLMS API listening on port ${env.port} [${env.nodeEnv}]`);
  });

  setupGracefulShutdown(server);
}

function setupGracefulShutdown(server: Server): void {
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    server.close();
    try {
      await sequelize.close();
      redis.disconnect();
    } catch (error) {
      console.error('Error during shutdown:', error);
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Last-resort safety nets so a stray async error outside the request lifecycle
  // is logged (and surfaced) rather than silently swallowed.
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
  });
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
