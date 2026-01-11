import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import usersRouter from './routes/users';
import companiesRouter from './routes/companies';
import tradingRouter from './routes/trading';
import postsRouter from './routes/posts';

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// API routes
app.use('/api/users', usersRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/trading', tradingRouter);
app.use('/api/posts', postsRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
