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
    const products = await Product.find({ business: business._id }).select('name sku costPrice sellingPrice stockQuantity openingQuantity').sort({ name: 1 });
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to load products.' });
  }
};

exports.createSale = async (req, res) => {
  const productId = String(req.body.productId || '');
  const quantity = Number(req.body.quantity);
  if (!mongoose.isValidObjectId(productId) || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ success: false, message: 'Select a product and enter a positive whole-number quantity.' });
  }

  const business = await getBusiness(req);
  if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const product = await Product.findOne({ _id: productId, business: business._id }).session(session);
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
    await session.abortTransaction().catch(() => {});
    res.status(500).json({ success: false, message: 'Unable to record sale.' });
  } finally {
    await session.endSession();
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
  const business = await getBusiness(req);
  if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });
  try {
    const expense = await Expense.create({ business: business._id, category, amount, description, date, created_at: new Date() });
    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to record expense.' });
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
