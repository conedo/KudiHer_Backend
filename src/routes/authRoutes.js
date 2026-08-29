const express = require('express');
const passport = require('passport');
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
const loginAttempts = new Map();

const hasGoogleConfig = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const requireGoogleConfig = (req, res, next) => {
  if (!hasGoogleConfig) {
    return res.redirect('/login?error=oauth_config');
  }
  next();
};

const rateLimitLogin = (req, res, next) => {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const attempt = loginAttempts.get(ip) || { count: 0, resetAt: now + LOGIN_LIMIT_WINDOW_MS };

  if (attempt.resetAt <= now) {
    attempt.count = 0;
    attempt.resetAt = now + LOGIN_LIMIT_WINDOW_MS;
  }

  if (attempt.count >= LOGIN_LIMIT_MAX_ATTEMPTS) {
    res.set('Retry-After', Math.ceil((attempt.resetAt - now) / 1000));
    return res.status(429).json({ success: false, message: 'Too many login attempts. Please try again later.' });
  }

  res.on('finish', () => {
    if (res.statusCode === 401) {
      attempt.count += 1;
      loginAttempts.set(ip, attempt);
      return;
    }

    if (res.statusCode < 400) {
      loginAttempts.delete(ip);
    }
  });

  next();
};

router.get('/csrf', issueCsrfToken);
router.post('/register', verifyCsrfToken, signup);
router.post('/signup', verifyCsrfToken, signup);
router.post('/login', verifyCsrfToken, rateLimitLogin, login);
router.post('/refresh', verifyCsrfToken, refresh);
router.get('/logout', logout);
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
