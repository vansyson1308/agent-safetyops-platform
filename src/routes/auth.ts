import { Router } from 'express';
import { prisma } from '../lib/prisma.ts';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { generateToken, requireAuth } from '../middleware/auth.ts';
import { writeAuditEvent } from '../services/auditService.ts';

const router = Router();

// Open sign-up is off unless ALLOW_REGISTRATION=true. The first account on
// an empty instance can always register and becomes its owner.
function registrationOpen() {
  return process.env.ALLOW_REGISTRATION === 'true';
}

// Tells the login page whether to offer first-time setup or sign-up.
router.get('/status', async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({ needsSetup: userCount === 0, registrationOpen: registrationOpen() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch auth status' });
  }
});

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(8).max(128),
});

router.post('/register', async (req, res) => {
  try {
    const parsed = registerSchema.parse(req.body);

    const isFirstUser = (await prisma.user.count()) === 0;
    if (!isFirstUser && !registrationOpen()) {
      return res.status(403).json({ error: 'Registration is disabled. Ask an administrator for an account.' });
    }

    const existing = await prisma.user.findUnique({ where: { email: parsed.email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(parsed.password, 12);
    const user = await prisma.user.create({
      data: {
        email: parsed.email,
        name: parsed.name,
        passwordHash,
        role: isFirstUser ? 'owner' : 'viewer',
      },
    });

    await writeAuditEvent({
      eventType: 'user_registered',
      resourceType: 'user',
      resourceId: user.id,
      actorId: user.id,
      details: { email: parsed.email, role: user.role },
    });

    const token = generateToken(user.id);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to register' });
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: parsed.email } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await writeAuditEvent({
      eventType: 'user_login',
      resourceType: 'user',
      resourceId: user.id,
      actorId: user.id,
    });

    const token = generateToken(user.id);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to login' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;
