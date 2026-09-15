import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireMinRole, requireRole, ROLES } from '../middleware/rbac';
import {
  listUsers,
  getUser,
  createUser,
  updateUserRecord,
  deleteUserRecord,
} from '../controllers/userController';

const router = Router();
router.use(authenticate);

// LAB_ADMIN+ can list and get users
router.get('/',    requireMinRole(ROLES.LAB_ADMIN), listUsers);
router.get('/:id', getUser); // self-access handled in controller

// LAB_ADMIN+ can create/update; role validation in controller
router.post('/',     requireMinRole(ROLES.LAB_ADMIN), createUser);
router.patch('/:id', requireMinRole(ROLES.LAB_ADMIN), updateUserRecord);

// LAB_ADMIN+ can delete
router.delete('/:id', requireMinRole(ROLES.LAB_ADMIN), deleteUserRecord);

export default router;
