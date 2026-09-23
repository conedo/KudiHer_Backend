const mongoose = require('mongoose');
const Business = require('../models/Business');
const Product = require('../models/Product');

const text = (value) => String(value || '').trim();

const parseProduct = (body) => {
  if (!body || body.costPrice === undefined || body.costPrice === null ||
      body.sellingPrice === undefined || body.sellingPrice === null ||
      body.openingQuantity === undefined || body.openingQuantity === null) {
    return null;
  }

  const name = text(body.name);
  const sku = text(body.sku).toUpperCase();
  const costPrice = Number(body.costPrice);
  const sellingPrice = Number(body.sellingPrice);
  const openingQuantity = Number(body.openingQuantity);

  if (
    name.length < 1 ||
    name.length > 120 ||
    sku.length < 1 ||
    sku.length > 60 ||
    !Number.isFinite(costPrice) ||
    costPrice < 0 ||
    !Number.isFinite(sellingPrice) ||
    sellingPrice < 0 ||
    !Number.isInteger(openingQuantity) ||
    openingQuantity < 0
  ) {
    return null;
  }

  return { name, sku, costPrice, sellingPrice, openingQuantity, stockQuantity: openingQuantity };
};

const getBusiness = (req) => Business.findOne({ owner: req.user._id });

exports.addProduct = async (req, res) => {
  const productData = parseProduct(req.body);
  if (!productData) {
    return res.status(400).json({ success: false, message: 'Enter valid product details.' });
  }

  try {
    const business = await getBusiness(req);
    if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });

    const product = await Product.create({ ...productData, business: business._id });
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'A product SKU already exists.' });
    res.status(500).json({ success: false, message: 'Unable to add product.' });
  }
};

exports.deleteProduct = async (req, res) => {
  const productId = String(req.params.id || '');
  if (!mongoose.isValidObjectId(productId)) {
    return res.status(400).json({ success: false, message: 'Select a valid product.' });
  }

  try {
    const business = await getBusiness(req);
    if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });

    const product = await Product.findOneAndUpdate(
      { _id: productId, business: business._id, is_active: { $ne: false } },
      { $set: { is_active: false } },
      { new: true }
    ).select('name sku is_active');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to delete product.' });
  }
};

exports.adjustStock = async (req, res) => {
  const productId = String(req.params.id || '');
  const rawAdjustment = req.body?.adjustment ?? req.body?.quantity;
  if (rawAdjustment === undefined || rawAdjustment === null || String(rawAdjustment).trim() === '') {
    return res.status(400).json({ success: false, message: 'Enter a valid whole-number stock adjustment.' });
  }
  const adjustment = Number(rawAdjustment);
  if (!mongoose.isValidObjectId(productId) || !Number.isInteger(adjustment)) {
    return res.status(400).json({ success: false, message: 'Enter a valid whole-number stock adjustment.' });
  }

  try {
    const business = await getBusiness(req);
    if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });

    const product = await Product.findOne({ _id: productId, business: business._id, is_active: { $ne: false } });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    const currentStock = product.stockQuantity ?? product.openingQuantity;
    if (currentStock + adjustment < 0) {
      return res.status(400).json({ success: false, message: `Stock cannot be reduced below zero (current stock: ${currentStock}).` });
    }

    const updated = await Product.findOneAndUpdate(
      {
        _id: productId,
        business: business._id,
        is_active: { $ne: false },
        stockQuantity: { $gte: adjustment < 0 ? Math.abs(adjustment) : 0 }
      },
      { $inc: { stockQuantity: adjustment } },
      { new: true, runValidators: true }
    ).select('name sku stockQuantity openingQuantity');
    if (!updated) return res.status(400).json({ success: false, message: 'Stock changed before the adjustment was applied.' });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to adjust stock.' });
  }
};
