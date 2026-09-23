const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { verifyCsrfToken } = require('../controllers/authController');
const { getBusiness, updateBusiness } = require('../controllers/businessController');

const router = express.Router();
router.use(requireAuth);
router.get('/business', getBusiness);
router.put('/business', verifyCsrfToken, updateBusiness);

module.exports = router;
