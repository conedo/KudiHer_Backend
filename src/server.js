const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
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
const viewsDirectory = path.join(__dirname, 'views');
const publicDirectory = path.join(__dirname, 'public');
const allowedFrontendOrigin = process.env.FRONTEND_URL;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin === allowedFrontendOrigin) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());

app.use(passport.initialize());

app.use('/public', express.static(publicDirectory, {
  maxAge: '7d',
  immutable: process.env.NODE_ENV === 'production',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', process.env.NODE_ENV === 'production'
      ? 'public, max-age=604800, immutable'
      : 'public, max-age=3600');
  }
}));

app.get('/', (req, res) => res.sendFile(path.join(viewsDirectory, 'home.html')));
app.get('/home', (req, res) => res.sendFile(path.join(viewsDirectory, 'home.html')));
app.get('/auth/signin', (req, res) => res.sendFile(path.join(viewsDirectory, 'login.html')));
app.get('/auth/signup', (req, res) => res.sendFile(path.join(viewsDirectory, 'register.html')));
app.get('/login', (req, res) => res.redirect('/auth/signin'));
app.get('/register', (req, res) => res.redirect('/auth/signup'));
app.get('/signup', (req, res) => res.redirect('/auth/signup'));
app.get('/onboarding', requirePageAuth, (req, res) => {
  res.redirect(req.user.onboardingComplete ? '/dashboard' : '/onboarding/business');
});
app.get('/onboarding/business', requirePageAuth, (req, res) => {
  if (req.user.onboardingComplete) return res.redirect('/dashboard');
  res.sendFile(path.join(viewsDirectory, 'onboarding-business.html'));
});
app.get('/onboarding/products', requirePageAuth, (req, res) => {
  if (req.user.onboardingComplete) return res.redirect('/dashboard');
  res.sendFile(path.join(viewsDirectory, 'onboarding-products.html'));
});
app.get('/dashboard', requirePageAuth, requireCompletedOnboarding, (req, res) =>
  res.sendFile(path.join(viewsDirectory, 'dashboard.html'))
);

// Serve frontend assets and legacy .html URLs.
app.use(express.static(viewsDirectory));

app.get('/health', (req, res) => res.status(200).json({ success: true, status: 'ok' }));
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'KudiHer API is running', status: 'ok' });
});

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);
app.use('/api/home', require('./routes/homeRoutes'));
app.use('/api', require('./routes/onboardingRoutes'));
app.use('/api', require('./routes/businessRoutes'));
app.use('/api', require('./routes/productRoutes'));
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
