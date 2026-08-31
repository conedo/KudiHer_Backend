const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 60 },
    costPrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    openingQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'Opening quantity must be a whole number' }
    },
    stockQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'Stock quantity must be a whole number' }
    }
  },
  { timestamps: true }
);

productSchema.index({ business: 1, sku: 1 }, { unique: true });

module.exports = mongoose.model('Product', productSchema);
