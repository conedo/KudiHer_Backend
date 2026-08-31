const mongoose = require('mongoose');

const EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Logistics', 'Other'];

const expenseSchema = new mongoose.Schema({
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  category: { type: String, required: true, enum: EXPENSE_CATEGORIES },
  amount: { type: Number, required: true, min: 0 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  date: { type: Date, required: true },
  created_at: { type: Date, default: Date.now, index: true }
});

expenseSchema.index({ business: 1, date: -1 });

module.exports = mongoose.model('Expense', expenseSchema);
module.exports.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
