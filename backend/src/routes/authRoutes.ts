import { Router } from 'express';
import { login, getMe, createCashier, getCashiers } from '../controllers/authController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.post('/login', login);
router.get('/me', authenticate, getMe);
router.get('/cashiers', authenticate, requireAdmin, getCashiers);
router.post('/cashiers', authenticate, requireAdmin, createCashier);

export default router;
