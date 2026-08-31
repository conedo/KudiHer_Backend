const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { verifyCsrfToken } = require('../controllers/authController');
const { setupBusiness, createProducts } = require('../controllers/onboardingController');

const router = express.Router();
router.use(requireAuth);
router.post('/business/setup', verifyCsrfToken, setupBusiness);
router.post('/products', verifyCsrfToken, createProducts);

module.exports = router;
