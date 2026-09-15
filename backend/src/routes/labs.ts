import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole, requireMinRole, ROLES } from '../middleware/rbac';
import {
  listLabs,
  getLab,
  createLab,
  updateLab,
  deactivateLab,
} from '../controllers/labController';

const router = Router();
router.use(authenticate);

// SA + LA can list/get (scoped in controller)
router.get('/',    requireMinRole(ROLES.LAB_ADMIN), listLabs);
router.get('/:id', requireMinRole(ROLES.LAB_ADMIN), getLab);

// SA only can create/update/deactivate labs
router.post('/',                     requireRole(ROLES.SUPER_ADMIN), createLab);
router.patch('/:id',                 requireRole(ROLES.SUPER_ADMIN), updateLab);
router.patch('/:id/deactivate',      requireRole(ROLES.SUPER_ADMIN), deactivateLab);

export default router;
