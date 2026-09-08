import { Router } from 'express';
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  recordCustomerPayment,
  deleteCustomer,
} from '../controllers/customerController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// All customer endpoints require authentication
router.use(authenticate);

router.get('/', getCustomers);
router.post('/', createCustomer);
router.get('/:id', getCustomerById);
router.put('/:id', updateCustomer);
router.post('/:id/payments', recordCustomerPayment);
router.delete('/:id', requireAdmin, deleteCustomer);

export default router;
