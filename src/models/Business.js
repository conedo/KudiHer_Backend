const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120
    },
    industry: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      match: [/^[A-Z]{3}$/, 'Currency must be a three-letter ISO code'],
      default: 'NGN'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Business', businessSchema);
