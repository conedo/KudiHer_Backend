const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please add a valid email']
  },
  name: {
    type: String,
    required: [true, 'Please add a name']
  },
  picture: {
    type: String
  },
  provider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  onboardingComplete: {
    type: Boolean,
    default: false
  },
  password: {
    type: String,
    required: function() {
      return this.provider === 'local';
    },
    minlength: [8, 'Password must be at least 8 characters'],
    match: [
      /^(?=.*[A-Z])(?=.*\d).{8,}$/,
      'Password must be at least 8 characters and include one uppercase letter and one number'
    ],
    select: false
  },
  refreshTokens: [
    {
      tokenHash: {
        type: String,
        required: true
      },
      expiresAt: {
        type: Date,
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }
  ],
  lastLogin: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.pre('save', async function() {
  if (!this || this.provider !== 'local') {
    return;
  }

  if (!this.isModified || !this.isModified('password') || !this.password) {
    return;
  }

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model('User', userSchema);
