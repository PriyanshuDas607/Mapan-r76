import { Router } from 'express';
import { verifyReport } from '../controllers/verifyController';

const router = Router();

/**
 * GET /api/v1/verify/:reportId
 * Public endpoint — no authentication required.
 * Used when someone scans the QR code on a printed report.
 */
router.get('/:reportId', verifyReport);

export default router;
