import { Router } from 'express';
import { getBackupStatus, exportBackup, restoreBackup } from '../controllers/backupController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/status', getBackupStatus);
router.get('/export', exportBackup);
router.post('/restore', restoreBackup);

export default router;
