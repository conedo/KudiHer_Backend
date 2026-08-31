const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { verifyCsrfToken } = require('../controllers/authController');
const { listProducts, createSale, createExpense, listSales, listExpenses } = require('../controllers/transactionController');

const router = express.Router();
router.use(requireAuth);
router.get('/products', listProducts);
router.get('/sales', listSales);
router.get('/expenses', listExpenses);
router.post('/sales', verifyCsrfToken, createSale);
router.post('/expenses', verifyCsrfToken, createExpense);

module.exports = router;
