const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { verifyCsrfToken } = require('../controllers/authController');
const { setupBusiness, createProducts } = require('../controllers/onboardingController');

const router = express.Router();
router.use(requireAuth, verifyCsrfToken);
router.post('/business/setup', setupBusiness);
router.post('/products', createProducts);

module.exports = router;
