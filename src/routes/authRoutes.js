const express = require('express');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const MongoStore = require('rate-limit-mongo');
const router = express.Router();
const {
  signup,
  login,
  logout,
  getCurrentUser,
  googleCallback,
  refresh,
  issueCsrfToken,
  verifyCsrfToken
} = require('../controllers/authController');

const LOGIN_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT_MAX_ATTEMPTS = 5;

const hasGoogleConfig = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const requireGoogleConfig = (req, res, next) => {
  if (!hasGoogleConfig) {
    return res.redirect('/login?error=oauth_config');
  }
  next();
};

const rateLimitLogin = rateLimit({
  windowMs: LOGIN_LIMIT_WINDOW_MS,
  limit: LOGIN_LIMIT_MAX_ATTEMPTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new MongoStore({
    uri: process.env.MONGO_URI,
    collectionName: 'loginRateLimitRecords',
    expireTimeMs: LOGIN_LIMIT_WINDOW_MS,
    errorHandler: (error) => console.error('Login rate-limit store error:', error)
  }),
  message: { success: false, message: 'Too many login attempts. Please try again later.' }
});

router.get('/csrf', issueCsrfToken);
router.post('/register', verifyCsrfToken, signup);
router.post('/signup', verifyCsrfToken, signup);
router.post('/login', verifyCsrfToken, rateLimitLogin, login);
router.post('/refresh', verifyCsrfToken, refresh);
router.post('/logout', verifyCsrfToken, logout);
router.get('/current', getCurrentUser);

router.get(
  '/google',
  requireGoogleConfig,
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
  })
);

router.get(
  '/google/callback',
  requireGoogleConfig,
  passport.authenticate('google', {
    failureRedirect: '/login?error=oauth',
    session: false
  }),
  googleCallback
);

module.exports = router;
