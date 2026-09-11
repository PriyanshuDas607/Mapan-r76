import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getAll, createInstrument } from '../controllers/instrumentController';

const router = Router();
router.use(authenticate);
router.get('/', getAll);
router.post('/', createInstrument);
export default router;
