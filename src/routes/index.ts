import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import healthRouter from './health.ts';
import authRouter from './auth.ts';
import agentsRouter from './agents.ts';
import policiesRouter from './policies.ts';
import runsRouter from './runs.ts';
import approvalsRouter from './approvals.ts';
import incidentsRouter from './incidents.ts';
import browserSessionsRouter from './browser-sessions.ts';
import auditEventsRouter from './audit-events.ts';
import dashboardRouter from './dashboard.ts';
import sdkRouter from './sdk.ts';

const router = Router();

// Public routes
router.use('/health', healthRouter);
router.use('/auth', authRouter);

// SDK routes (authenticated via API key)
router.use('/v1/sdk', sdkRouter);

// Everything below requires a signed-in user
router.use(requireAuth);
router.use('/agents', agentsRouter);
router.use('/policies', policiesRouter);
router.use('/runs', runsRouter);
router.use('/approvals', approvalsRouter);
router.use('/incidents', incidentsRouter);
router.use('/browser-sessions', browserSessionsRouter);
router.use('/audit-events', auditEventsRouter);
router.use('/dashboard', dashboardRouter);

export default router;
