const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { verifyCsrfToken } = require('../controllers/authController');
const {
  listProducts,
  listInventoryStatus,
  updateProduct,
  createSale,
  createExpense,
  updateSale,
  voidSale,
  updateExpense,
  deleteExpense,
  getDashboard,
  listSales,
  listExpenses
} = require('../controllers/transactionController');

const router = express.Router();
router.use(requireAuth);
router.get('/products', listProducts);
router.get('/inventory/status', listInventoryStatus);
router.patch('/products/:productId', verifyCsrfToken, updateProduct);
router.get('/sales', listSales);
router.get('/expenses', listExpenses);
router.get('/dashboard', getDashboard);
router.post('/sales', verifyCsrfToken, createSale);
router.post('/expenses', verifyCsrfToken, createExpense);
router.put('/sales/:id', verifyCsrfToken, updateSale);
router.delete('/sales/:id', verifyCsrfToken, voidSale);
router.put('/expenses/:id', verifyCsrfToken, updateExpense);
router.delete('/expenses/:id', verifyCsrfToken, deleteExpense);

module.exports = router;
