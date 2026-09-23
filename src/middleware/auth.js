const jwt = require('jsonwebtoken');
const User = require('../models/User');

const getAccessSecret = () => process.env.JWT_ACCESS_SECRET || process.env.SESSION_SECRET || 'dev-access-secret';

const getUserFromRequest = async (req) => {
  const token = req.cookies?.accessToken;
  if (!token) return null;
  const payload = jwt.verify(token, getAccessSecret());
  if (payload.type !== 'access') return null;
  return User.findById(payload.sub);
};

const requireAuth = async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Not authenticated' });
  }
};

const requirePageAuth = async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.redirect('/auth/signin');
    req.user = user;
    next();
  } catch (error) {
    res.redirect('/auth/signin');
  }
};

const requireCompletedOnboarding = (req, res, next) => {
  if (!req.user.onboardingComplete) return res.redirect('/onboarding');
  next();
};

module.exports = { requireAuth, requirePageAuth, requireCompletedOnboarding };
