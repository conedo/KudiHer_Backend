const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema({
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  unitCost: { type: Number, required: true, min: 0 },
  revenue: { type: Number, required: true, min: 0 },
  profit: { type: Number, required: true },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  voided: { type: Boolean, default: false, index: true },
  voided_at: { type: Date },
  created_at: { type: Date, default: Date.now, index: true }
});

saleSchema.index({ business: 1, created_at: -1 });

module.exports = mongoose.model('Sale', saleSchema);
