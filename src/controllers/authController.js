const User = require('../models/User');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_COOKIE = 'accessToken';
const REFRESH_COOKIE = 'refreshToken';
const CSRF_COOKIE = 'csrfToken';
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';
const REFRESH_TOKEN_MS = 7 * 24 * 60 * 60 * 1000;
const GENERIC_LOGIN_ERROR = 'Invalid email or password';
const WRONG_PASSWORD_ERROR = 'Wrong password. Please try again.';
const GENERIC_REGISTER_ERROR = 'Unable to register with the provided credentials';
const GENERIC_AUTH_ERROR = 'Authentication failed';
const ACCOUNT_NOT_FOUND_ERROR = "You don't have an account yet. Please create one to continue.";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

const getAccessSecret = () => process.env.JWT_ACCESS_SECRET || process.env.SESSION_SECRET || 'dev-access-secret';
const getRefreshSecret = () => process.env.JWT_REFRESH_SECRET || process.env.SESSION_SECRET || 'dev-refresh-secret';
const getCsrfSecret = () => process.env.CSRF_SECRET || process.env.SESSION_SECRET || 'dev-csrf-secret';

const cookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge
});

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const isValidPassword = (password) => PASSWORD_REGEX.test(String(password || ''));
const isValidEmail = (email) => EMAIL_REGEX.test(String(email || ''));
const isValidName = (name) => {
  const trimmedName = String(name || '').trim();
  return trimmedName.length >= 2 && trimmedName.length <= 120;
};

const signCsrfToken = (token) =>
  crypto.createHmac('sha256', getCsrfSecret()).update(token).digest('hex');

const signAccessToken = (user) =>
  jwt.sign({ sub: user._id.toString(), type: 'access' }, getAccessSecret(), {
    expiresIn: ACCESS_TOKEN_TTL
  });

const signRefreshToken = (user, tokenId) =>
  jwt.sign({ sub: user._id.toString(), jti: tokenId, type: 'refresh' }, getRefreshSecret(), {
    expiresIn: REFRESH_TOKEN_TTL
  });

const safeUser = (user) => ({
  id: user._id,
  email: user.email,
  name: user.name,
  picture: user.picture,
  provider: user.provider,
  onboardingComplete: user.onboardingComplete,
  lastLogin: user.lastLogin
});

const clearAuthCookies = (res) => {
  res.clearCookie(ACCESS_COOKIE, cookieOptions(0));
  res.clearCookie(REFRESH_COOKIE, cookieOptions(0));
};

const csrfCookieOptions = () => ({
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 1000
});

exports.issueCsrfToken = (req, res) => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const signedToken = `${rawToken}.${signCsrfToken(rawToken)}`;

  res.cookie(CSRF_COOKIE, signedToken, csrfCookieOptions());
  res.status(200).json({ success: true, csrfToken: signedToken });
};

exports.verifyCsrfToken = (req, res, next) => {
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get('x-csrf-token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ success: false, message: GENERIC_AUTH_ERROR });
  }

  const [rawToken, signature] = cookieToken.split('.');
  if (!rawToken || !signature) {
    return res.status(403).json({ success: false, message: GENERIC_AUTH_ERROR });
  }

  const expectedSignature = signCsrfToken(rawToken);
  const provided = Buffer.from(signature, 'hex');
  const expected = Buffer.from(expectedSignature, 'hex');

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(403).json({ success: false, message: GENERIC_AUTH_ERROR });
  }

  next();
};

const issueAuthCookies = async (res, user) => {
  const tokenId = crypto.randomUUID();
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, tokenId);
  const refreshTokenHash = hashToken(refreshToken);
  const now = Date.now();

  user.refreshTokens = (user.refreshTokens || []).filter(
    (token) => token.expiresAt && token.expiresAt.getTime() > now
  );
  user.refreshTokens.push({
    tokenHash: refreshTokenHash,
    expiresAt: new Date(now + REFRESH_TOKEN_MS)
  });
  await user.save();

  res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(15 * 60 * 1000));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(REFRESH_TOKEN_MS));
};

exports.signup = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim();

    if (!isValidName(name) || !isValidEmail(email) || !isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid name, email, and password (8+ characters with an uppercase letter and number).'
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: GENERIC_REGISTER_ERROR });
    }

    const user = await User.create({
      email,
      password,
      name,
      provider: 'local',
      lastLogin: new Date()
    });

    await issueAuthCookies(res, user);
    res.status(201).json({ success: true, message: 'Registration successful', data: safeUser(user), redirect: '/onboarding/business' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: GENERIC_REGISTER_ERROR });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Please check your registration details and try again.' });
    }

    res.status(500).json({ success: false, message: GENERIC_AUTH_ERROR });
  }
};

exports.login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!isValidEmail(email)) {
      return res.status(401).json({ success: false, message: GENERIC_LOGIN_ERROR });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: ACCOUNT_NOT_FOUND_ERROR,
        redirect: '/register'
      });
    }

    if (user.provider === 'google' || !user.password) {
      return res.status(401).json({ success: false, message: GENERIC_LOGIN_ERROR });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: WRONG_PASSWORD_ERROR });
    }

    user.lastLogin = new Date();
    await issueAuthCookies(res, user);
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: safeUser(user),
      redirect: user.onboardingComplete ? '/dashboard' : '/onboarding'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: GENERIC_AUTH_ERROR });
  }
};

exports.googleCallback = async (req, res) => {
  try {
    await issueAuthCookies(res, req.user);
    res.redirect(req.user.onboardingComplete ? '/dashboard' : '/onboarding');
  } catch (error) {
    res.redirect('/login?error=oauth');
  }
};

exports.refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: GENERIC_AUTH_ERROR });
    }

    const payload = jwt.verify(refreshToken, getRefreshSecret());
    if (payload.type !== 'refresh') {
      return res.status(401).json({ success: false, message: GENERIC_AUTH_ERROR });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({ success: false, message: GENERIC_AUTH_ERROR });
    }

    const incomingHash = hashToken(refreshToken);
    const matchingToken = (user.refreshTokens || []).find((token) => token.tokenHash === incomingHash);

    if (!matchingToken) {
      user.refreshTokens = [];
      await user.save();
      clearAuthCookies(res);
      return res.status(401).json({ success: false, message: GENERIC_AUTH_ERROR });
    }

    user.refreshTokens = user.refreshTokens.filter((token) => token.tokenHash !== incomingHash);
    await issueAuthCookies(res, user);

    res.status(200).json({ success: true, message: 'Token refreshed', data: safeUser(user) });
  } catch (error) {
    clearAuthCookies(res);
    res.status(401).json({ success: false, message: GENERIC_AUTH_ERROR });
  }
};

exports.logout = async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await User.updateOne({ 'refreshTokens.tokenHash': tokenHash }, { $pull: { refreshTokens: { tokenHash } } });
    }
  } catch (error) {
    // Logout should still clear local cookies even if token cleanup fails.
  }

  clearAuthCookies(res);
  res.redirect('/login');
};

exports.getCurrentUser = async (req, res) => {
  try {
    const accessToken = req.cookies?.[ACCESS_COOKIE];
    if (!accessToken) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const payload = jwt.verify(accessToken, getAccessSecret());
    if (payload.type !== 'access') {
      return res.status(401).json({ success: false, message: 'Invalid access token' });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    res.status(200).json({ success: true, data: safeUser(user) });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
};
