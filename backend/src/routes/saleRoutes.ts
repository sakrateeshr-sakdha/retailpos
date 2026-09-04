import { Router } from 'express';
import {
  createSale,
  getSales,
  getSalesSummary,
  getSaleById,
  syncSales,
} from '../controllers/saleController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', getSales);
router.get('/summary', getSalesSummary);
router.get('/:id', getSaleById);
router.post('/', createSale);
router.post('/sync', syncSales);

export default router;
