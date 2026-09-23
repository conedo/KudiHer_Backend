const mongoose = require('mongoose');
const Business = require('../models/Business');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const { EXPENSE_CATEGORIES } = require('../models/Expense');

const getBusiness = (req) => Business.findOne({ owner: req.user._id });
const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const parseEndDate = (value) => {
  const date = parseDate(value);
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) date.setUTCHours(23, 59, 59, 999);
  return date;
};
const dateRange = (req, res) => {
  const startDate = req.query.startDate ? parseDate(req.query.startDate) : null;
  const endDate = req.query.endDate ? parseEndDate(req.query.endDate) : null;
  if ((req.query.startDate && !startDate) || (req.query.endDate && !endDate)) {
    res.status(400).json({ success: false, message: 'Enter valid start and end dates.' });
    return null;
  }
  if (startDate && endDate && startDate > endDate) {
    res.status(400).json({ success: false, message: 'Start date cannot be after end date.' });
    return null;
  }
  const range = {};
  if (startDate) range.$gte = startDate;
  if (endDate) range.$lte = endDate;
  return Object.keys(range).length ? range : null;
};

exports.listProducts = async (req, res) => {
  try {
    const business = await getBusiness(req);
    if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });
    const products = await Product.find({ business: business._id, is_active: { $ne: false } }).select('name sku costPrice sellingPrice stockQuantity openingQuantity').sort({ name: 1 });
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to load products.' });
  }
};

exports.listInventoryStatus = async (req, res) => {
  try {
    const business = await getBusiness(req);
    if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sales = await Sale.aggregate([
      { $match: { business: business._id, created_at: { $gte: since } } },
      { $group: { _id: '$product', quantity: { $sum: '$quantity' } } }
    ]);
    const salesByProduct = new Map(sales.map((sale) => [sale._id.toString(), sale.quantity]));
    const products = await Product.find({ business: business._id, is_active: { $ne: false } })
      .select('name sku costPrice sellingPrice stockQuantity openingQuantity')
      .sort({ name: 1 })
      .lean();

    const data = products.map((product) => {
      const quantitySold = salesByProduct.get(product._id.toString()) || 0;
      const averageSales = quantitySold / 7;
      const stockQuantity = product.stockQuantity ?? product.openingQuantity;
      const daysLeft = averageSales > 0 ? stockQuantity / averageSales : null;
      const status = averageSales === 0
        ? 'grey'
        : daysLeft > 7 ? 'green' : daysLeft >= 3 ? 'yellow' : 'red';
      const margin = product.sellingPrice > 0
        ? ((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100
        : 0;
      const marginStatus = margin > 30 ? 'green' : margin >= 10 ? 'yellow' : 'red';

      return {
        _id: product._id,
        name: product.name,
        sku: product.sku,
        stockQuantity,
        averageSales: Number(averageSales.toFixed(2)),
        daysLeft: daysLeft === null ? null : Number(daysLeft.toFixed(2)),
        status,
        statusLabel: status === 'grey' ? 'No recent sales' : status,
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        margin: Number(margin.toFixed(2)),
        marginStatus
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to load inventory status.' });
  }
};

exports.updateProduct = async (req, res) => {
  const productId = String(req.params.productId || '');
  if (!mongoose.isValidObjectId(productId)) {
    return res.status(400).json({ success: false, message: 'Select a valid product.' });
  }

  const updates = {};
  for (const field of ['costPrice', 'sellingPrice']) {
    if (req.body[field] !== undefined) {
      const value = Number(req.body[field]);
      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({ success: false, message: 'Prices must be valid non-negative numbers.' });
      }
      updates[field] = value;
    }
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ success: false, message: 'Provide a cost price or selling price to update.' });
  }

  try {
    const business = await getBusiness(req);
    if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });
    const product = await Product.findOneAndUpdate(
      { _id: productId, business: business._id, is_active: { $ne: false } },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('name sku costPrice sellingPrice stockQuantity openingQuantity');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to update product.' });
  }
};

exports.createSale = async (req, res) => {
  const productId = String(req.body.productId || '');
  const quantity = Number(req.body.quantity);
  if (!mongoose.isValidObjectId(productId) || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ success: false, message: 'Select a product and enter a positive whole-number quantity.' });
  }

  let session;
  try {
    const business = await getBusiness(req);
    if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });
    session = await mongoose.startSession();
    session.startTransaction();
    const product = await Product.findOne({ _id: productId, business: business._id, is_active: { $ne: false } }).session(session);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    const currentStock = product.stockQuantity ?? product.openingQuantity;
    if (quantity > currentStock) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: `Quantity cannot exceed available stock (${currentStock}).` });
    }
    if (product.stockQuantity === undefined) {
      product.stockQuantity = product.openingQuantity;
      await product.save({ session });
    }
    const revenue = quantity * product.sellingPrice;
    const profit = quantity * (product.sellingPrice - product.costPrice);
    const sale = await Sale.create([{
      business: business._id,
      product: product._id,
      productName: product.name,
      quantity,
      unitPrice: product.sellingPrice,
      unitCost: product.costPrice,
      revenue,
      profit,
      created_at: new Date()
    }], { session });
    const stockUpdate = await Product.updateOne(
      { _id: product._id, stockQuantity: { $gte: quantity } },
      { $inc: { stockQuantity: -quantity } },
      { session }
    );
    if (stockUpdate.modifiedCount !== 1) throw new Error('Stock changed before sale was recorded.');
    await session.commitTransaction();
    res.status(201).json({ success: true, data: sale[0] });
  } catch (error) {
    if (session?.inTransaction()) await session.abortTransaction().catch(() => {});
    res.status(500).json({ success: false, message: 'Unable to record sale.' });
  } finally {
    if (session) await session.endSession();
  }
};

exports.createExpense = async (req, res) => {
  const category = String(req.body.category || '').trim();
  const amount = Number(req.body.amount);
  const description = String(req.body.description || '').trim();
  const date = parseDate(req.body.date);
  if (!EXPENSE_CATEGORIES.includes(category) || !Number.isFinite(amount) || amount <= 0 || description.length > 500 || !date) {
    return res.status(400).json({ success: false, message: 'Enter a valid category, positive amount, description, and date.' });
  }
  try {
    const business = await getBusiness(req);
    if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });
    const expense = await Expense.create({ business: business._id, category, amount, description, date, created_at: new Date() });
    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to record expense.' });
  }
};

exports.updateSale = async (req, res) => {
  const saleId = String(req.params.id || '');
  const notes = req.body.notes;
  if (!mongoose.isValidObjectId(saleId) || typeof notes !== 'string' || notes.trim().length > 500) {
    return res.status(400).json({ success: false, message: 'Enter valid sale notes.' });
  }

  try {
    const business = await getBusiness(req);
    if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });
    const sale = await Sale.findOneAndUpdate(
      { _id: saleId, business: business._id },
      { $set: { notes: notes.trim() } },
      { new: true, runValidators: true }
    );
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found.' });
    res.json({ success: true, data: sale });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to update sale.' });
  }
};

exports.voidSale = async (req, res) => {
  const saleId = String(req.params.id || '');
  if (!mongoose.isValidObjectId(saleId)) {
    return res.status(400).json({ success: false, message: 'Select a valid sale.' });
  }

  let session;
  try {
    const business = await getBusiness(req);
    if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });
    session = await mongoose.startSession();
    session.startTransaction();
    const sale = await Sale.findOneAndUpdate(
      { _id: saleId, business: business._id, voided: { $ne: true } },
      { $set: { voided: true, voided_at: new Date() } },
      { new: true, session }
    );
    if (!sale) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Sale not found or already voided.' });
    }
    const stockUpdate = await Product.updateOne(
      { _id: sale.product, business: business._id },
      { $inc: { stockQuantity: sale.quantity } },
      { session }
    );
    if (stockUpdate.modifiedCount !== 1) throw new Error('Product stock could not be restored.');
    await session.commitTransaction();
    res.json({ success: true, data: sale });
  } catch (error) {
    if (session?.inTransaction()) await session.abortTransaction().catch(() => {});
    res.status(500).json({ success: false, message: 'Unable to reverse sale.' });
  } finally {
    if (session) await session.endSession();
  }
};

exports.updateExpense = async (req, res) => {
  const expenseId = String(req.params.id || '');
  const category = String(req.body.category || '').trim();
  const amount = Number(req.body.amount);
  const description = String(req.body.description || '').trim();
  const date = parseDate(req.body.date);
  if (!mongoose.isValidObjectId(expenseId) || !EXPENSE_CATEGORIES.includes(category) || !Number.isFinite(amount) || amount <= 0 || description.length > 500 || !date) {
    return res.status(400).json({ success: false, message: 'Enter a valid category, positive amount, description, and date.' });
  }

  try {
    const business = await getBusiness(req);
    if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });
    const expense = await Expense.findOneAndUpdate(
      { _id: expenseId, business: business._id },
      { $set: { category, amount, description, date } },
      { new: true, runValidators: true }
    );
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    res.json({ success: true, data: expense });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to update expense.' });
  }
};

exports.deleteExpense = async (req, res) => {
  const expenseId = String(req.params.id || '');
  if (!mongoose.isValidObjectId(expenseId)) {
    return res.status(400).json({ success: false, message: 'Select a valid expense.' });
  }

  try {
    const business = await getBusiness(req);
    if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });
    const expense = await Expense.findOneAndDelete({ _id: expenseId, business: business._id });
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    res.json({ success: true, data: expense });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to delete expense.' });
  }
};

const dashboardDateRange = (req, res) => {
  const now = new Date();
  const fromValue = req.query.from;
  const toValue = req.query.to;
  const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const from = fromValue ? validDate(fromValue) ? parseDate(fromValue) : null : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = toValue ? validDate(toValue) ? parseEndDate(toValue) : null : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  if ((fromValue && !from) || (toValue && !to) || (from && to && from > to)) {
    res.status(400).json({ success: false, message: 'Enter a valid from and to date range.' });
    return null;
  }
  return { $gte: from, $lte: to };
};

exports.getDashboard = async (req, res) => {
  try {
    const range = dashboardDateRange(req, res);
    if (!range) return;
    const business = await getBusiness(req);
    if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });

    const [salesSummary, expenseSummary] = await Promise.all([
      Sale.aggregate([
        { $match: { business: business._id, voided: { $ne: true }, created_at: range } },
        {
          $facet: {
            totals: [{ $group: { _id: null, total_revenue: { $sum: '$revenue' }, gross_profit: { $sum: '$profit' }, transaction_count: { $sum: 1 } } }],
            top_products: [
              { $group: { _id: '$product', product_name: { $first: '$productName' }, quantity: { $sum: '$quantity' }, revenue: { $sum: '$revenue' } } },
              { $sort: { quantity: -1, revenue: -1 } },
              { $limit: 5 },
              { $project: { _id: 0, product_id: '$_id', product_name: 1, quantity: 1, revenue: 1 } }
            ]
          }
        }
      ]),
      Expense.aggregate([
        { $match: { business: business._id, date: range } },
        { $group: { _id: null, total_expenses: { $sum: '$amount' }, transaction_count: { $sum: 1 } } }
      ])
    ]);

    const totals = salesSummary[0]?.totals[0] || {};
    const expenseTotals = expenseSummary[0] || {};
    const totalRevenue = totals.total_revenue || 0;
    const totalExpenses = expenseTotals.total_expenses || 0;
    const grossProfit = totals.gross_profit || 0;
    res.json({
      success: true,
      data: {
        total_revenue: totalRevenue,
        total_expenses: totalExpenses,
        gross_profit: grossProfit,
        net_profit: grossProfit - totalExpenses,
        top_5_products: salesSummary[0]?.top_products || [],
        transaction_count: (totals.transaction_count || 0) + (expenseTotals.transaction_count || 0)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to load dashboard summary.' });
  }
};

exports.listSales = async (req, res) => {
  try {
    const range = dateRange(req, res);
    if (range === null && (req.query.startDate || req.query.endDate) && res.headersSent) return;
    const business = await getBusiness(req);
    if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });
    const sales = await Sale.find({ business: business._id, ...(range ? { created_at: range } : {}) }).sort({ created_at: -1 });
    res.json({ success: true, data: sales });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to load sales.' });
  }
};

exports.listExpenses = async (req, res) => {
  try {
    const range = dateRange(req, res);
    if (range === null && (req.query.startDate || req.query.endDate) && res.headersSent) return;
    const business = await getBusiness(req);
    if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });
    const expenses = await Expense.find({ business: business._id, ...(range ? { date: range } : {}) }).sort({ date: -1, created_at: -1 });
    res.json({ success: true, data: expenses });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to load expenses.' });
  }
};
