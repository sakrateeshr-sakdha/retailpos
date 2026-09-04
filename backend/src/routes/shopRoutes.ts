import { Router } from 'express';
import { getShop, updateShop } from '../controllers/shopController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', getShop);
router.put('/', requireAdmin, updateShop);

export default router;
