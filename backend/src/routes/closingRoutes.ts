import { Router } from 'express';
import { getClosingSummary, closeDay, getClosingHistory } from '../controllers/closingController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/summary', getClosingSummary);
router.post('/', closeDay);
router.get('/history', getClosingHistory);

export default router;
