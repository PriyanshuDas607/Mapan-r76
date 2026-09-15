import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireMinRole, requireRole, ROLES } from '../middleware/rbac';
import {
  getAll,
  getById,
  createInstrument,
  updateInstrument,
  deleteInstrument,
} from '../controllers/instrumentController';

const router = Router();
router.use(authenticate);

// All authenticated roles can list/get instruments (filtered by lab in controller)
router.get('/',    getAll);
router.get('/:id', getById);

// TEST_ENGINEER+ can create instruments
router.post('/', requireMinRole(ROLES.TEST_ENGINEER), createInstrument);

// LAB_ADMIN+ can update/delete instruments
router.patch('/:id',  requireMinRole(ROLES.LAB_ADMIN), updateInstrument);
router.delete('/:id', requireMinRole(ROLES.LAB_ADMIN), deleteInstrument);

export default router;
