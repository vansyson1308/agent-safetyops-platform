import { Router } from 'express';
import { isGeminiConfigured } from '../services/geminiService.ts';

const router = Router();

// Which optional integrations are configured on the server.
router.get('/integrations', (req, res) => {
  res.json({ gemini: isGeminiConfigured() });
});

export default router;
