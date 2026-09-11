import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  startSession,
  addObservation,
  executeCalculation,
  generateReport,
} from '../controllers/testController';

const router = Router();
router.use(authenticate);
router.post('/sessions', startSession);
router.post('/sessions/:id/observations', addObservation);
router.post('/sessions/:id/calculate', executeCalculation);
router.post('/sessions/:id/report', generateReport);
export default router;
