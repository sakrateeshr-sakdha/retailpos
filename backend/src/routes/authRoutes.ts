import { Router } from 'express';
import { login, onboardMerchant, getMe, createCashier, getCashiers, verifyAdminPin } from '../controllers/authController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.post('/login', login);
router.post('/onboard', onboardMerchant);
router.get('/me', authenticate, getMe);
router.post('/verify-admin-pin', authenticate, verifyAdminPin);
router.get('/cashiers', authenticate, requireAdmin, getCashiers);
router.post('/cashiers', authenticate, requireAdmin, createCashier);

export default router;
