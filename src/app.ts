import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { logger } from './lib/logger';

import usersRouter from './routes/users';
import companiesRouter from './routes/companies';
import tradingRouter from './routes/trading';
import postsRouter from './routes/posts';
import botRouter from './routes/bot';
import adminRouter from './routes/admin';

const app = express();

const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin } : {}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// API routes
app.use('/api/users', usersRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/trading', tradingRouter);
app.use('/api/posts', postsRouter);
app.use('/api/bot', botRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
