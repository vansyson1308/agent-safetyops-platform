import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import apiRouter from './routes/index.ts';

// Builds the Express app with the API mounted. Serving the frontend (Vite in
// development, dist/ in production) and listening are left to server.ts, so
// tests can run the API on its own.
export function createApp() {
  const app = express();

  // The UI is served from the same origin, so cross-origin access is off
  // unless CORS_ORIGINS lists the origins that may call the API.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.length > 0) {
    app.use(cors({ origin: corsOrigins }));
  }
  app.use(express.json());

  app.use('/api', apiRouter);
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // express.json() raises on malformed bodies; answer in JSON, not HTML.
  app.use((err: Error & { status?: number; type?: string }, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON body' });
    }
    console.error(err);
    res.status(err.status ?? 500).json({ error: 'Internal server error' });
  });

  return app;
}
