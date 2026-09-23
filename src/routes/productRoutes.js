const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { verifyCsrfToken } = require('../controllers/authController');
const { addProduct, deleteProduct, adjustStock } = require('../controllers/productController');

const router = express.Router();
router.use(requireAuth);
router.post('/products/add', verifyCsrfToken, addProduct);
router.delete('/products/:id', verifyCsrfToken, deleteProduct);
router.patch('/products/:id/stock', verifyCsrfToken, adjustStock);

module.exports = router;
