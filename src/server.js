const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const connectDB = require('./config/db.js');
const { requirePageAuth, requireCompletedOnboarding } = require('./middleware/auth');

const { webcrypto } = require('crypto');
globalThis.crypto = webcrypto;

// Load env vars
dotenv.config();

// Passport config
require('./config/passport')(passport);

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());

app.use(passport.initialize());

app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'views', 'register.html')));
app.get('/signup', (req, res) => res.redirect('/register'));
app.get('/onboarding', requirePageAuth, (req, res) => {
  res.redirect(req.user.onboardingComplete ? '/dashboard' : '/onboarding/business');
});
app.get('/onboarding/business', requirePageAuth, (req, res) => {
  if (req.user.onboardingComplete) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'views', 'onboarding-business.html'));
});
app.get('/onboarding/products', requirePageAuth, (req, res) => {
  if (req.user.onboardingComplete) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'views', 'onboarding-products.html'));
});
app.get('/dashboard', requirePageAuth, requireCompletedOnboarding, (req, res) =>
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'))
);

// Serve frontend assets and legacy .html URLs.
app.use(express.static(path.join(__dirname, 'views')));

app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'KudiHer API is running' });
});

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);
app.use('/api', require('./routes/onboardingRoutes'));
app.use('/api', require('./routes/transactionRoutes'));

app.use((err, req, res, next) => {
  console.error('Unhandled request error:', err);
  if (res.headersSent) return next(err);
  res.status(err.statusCode || err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error.'
      : (err.message || 'Internal server error.')
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
