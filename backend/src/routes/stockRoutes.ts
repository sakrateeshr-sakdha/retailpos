import { Router } from 'express';
import {
  addStock,
  adjustStock,
  getMovements,
  getLowStockAlerts,
} from '../controllers/stockController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.post('/in', requireAdmin, addStock);
router.post('/adjust', requireAdmin, adjustStock);
router.get('/movements', getMovements);
router.get('/alerts', getLowStockAlerts);

export default router;
