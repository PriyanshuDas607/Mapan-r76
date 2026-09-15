import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireMinRole, requireRole, ROLES } from '../middleware/rbac';
import {
  listSessions,
  getSession,
  startSession,
  addObservation,
  executeCalculation,
  submitSession,
  approveSession,
  rejectSession,
  generateReport,
} from '../controllers/testController';

const router = Router();
router.use(authenticate);

// List & get — filtered per role in controller
router.get('/sessions',    listSessions);
router.get('/sessions/:id', getSession);

// TEST_ENGINEER+ can start sessions and add observations
router.post('/sessions',                      requireMinRole(ROLES.TEST_ENGINEER), startSession);
router.post('/sessions/:id/observations',     requireMinRole(ROLES.TEST_ENGINEER), addObservation);
router.post('/sessions/:id/calculate',        requireMinRole(ROLES.TEST_ENGINEER), executeCalculation);
router.post('/sessions/:id/submit',           requireMinRole(ROLES.TEST_ENGINEER), submitSession);
router.post('/sessions/:id/report',           requireMinRole(ROLES.TEST_ENGINEER), generateReport);

// SUPERVISOR+ can approve/reject
router.patch('/sessions/:id/approve',         requireMinRole(ROLES.SUPERVISOR), approveSession);
router.patch('/sessions/:id/reject',          requireMinRole(ROLES.SUPERVISOR), rejectSession);

export default router;
