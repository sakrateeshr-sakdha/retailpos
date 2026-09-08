import { Router } from 'express';
import {
  getProducts,
  searchProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  importProducts,
} from '../controllers/productController.js';
import { authenticate, requireAdmin, requireAdminOrPinAuth } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', getProducts);
router.get('/search', searchProducts);
router.post('/import', requireAdmin, importProducts);
router.get('/:id', getProductById);
router.post('/', requireAdminOrPinAuth, createProduct);
router.put('/:id', requireAdmin, updateProduct);
router.delete('/:id', requireAdmin, deleteProduct);

export default router;
