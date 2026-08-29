const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

module.exports = function(passport) {
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  const googleClientId = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID.trim();
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CLIENT_SECRET.trim();

  if (!googleClientId || !googleClientSecret) {
    console.warn('Google OAuth is disabled. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it.');
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID.trim(),
        clientSecret: process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CLIENT_SECRET.trim(),
        callbackURL:
          (process.env.GOOGLE_CALLBACK_URL && process.env.GOOGLE_CALLBACK_URL.trim()) ||
          '/api/auth/google/callback'
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('Google account did not provide an email.'));
          }

          let user = await User.findOne({ email });
          if (user) {
            user.googleId = user.googleId || profile.id;
            user.provider = 'google';
            user.picture = user.picture || profile.photos?.[0]?.value;
            user.name = user.name || profile.displayName || email;
            user.lastLogin = new Date();
            await user.save();
            return done(null, user);
          }

          user = await User.create({
            googleId: profile.id,
            email,
            name: profile.displayName || email,
            picture: profile.photos?.[0]?.value,
            provider: 'google',
            lastLogin: new Date()
          });

          done(null, user);
        } catch (error) {
          done(error);
        }
      }
    )
  );
};
