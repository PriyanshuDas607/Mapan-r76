import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { login, refresh } from '../controllers/authController';

const router = Router();
router.post('/login', login);
router.post('/refresh', refresh);
export default router;
