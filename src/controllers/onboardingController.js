const Business = require('../models/Business');
const Product = require('../models/Product');

const currencyCode = /^[A-Z]{3}$/;
const text = (value) => String(value || '').trim();

exports.setupBusiness = async (req, res) => {
  const name = text(req.body.name);
  const industry = text(req.body.industry);
  const currency = text(req.body.currency || 'NGN').toUpperCase();

  if (name.length < 2 || name.length > 120 || industry.length < 2 || industry.length > 80 || !currencyCode.test(currency)) {
    return res.status(400).json({ success: false, message: 'Enter a valid business name, industry, and currency.' });
  }

  try {
    const business = await Business.findOneAndUpdate(
      { owner: req.user._id },
      { owner: req.user._id, name, industry, currency },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.status(200).json({ success: true, data: business });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to save business details.' });
  }
};

exports.createProducts = async (req, res) => {
  const products = req.body.products;
  if (!Array.isArray(products) || products.length === 0 || products.length > 100) {
    return res.status(400).json({ success: false, message: 'Add at least one product.' });
  }

  const business = await Business.findOne({ owner: req.user._id });
  if (!business) return res.status(400).json({ success: false, message: 'Complete your business details first.' });

  const normalized = products.map((product) => ({
    business: business._id,
    name: text(product.name),
    sku: text(product.sku).toUpperCase(),
    costPrice: Number(product.costPrice),
    sellingPrice: Number(product.sellingPrice),
    openingQuantity: Number(product.openingQuantity),
    hasNumericValues: ['costPrice', 'sellingPrice', 'openingQuantity'].every(
      (field) => product[field] !== undefined && product[field] !== null && String(product[field]).trim() !== ''
    )
  }));
  const valid = normalized.every((product) =>
    product.name.length >= 1 && product.name.length <= 120 &&
    product.sku.length >= 1 && product.sku.length <= 60 &&
    product.hasNumericValues &&
    Number.isFinite(product.costPrice) && product.costPrice >= 0 &&
    Number.isFinite(product.sellingPrice) && product.sellingPrice >= 0 &&
    Number.isInteger(product.openingQuantity) && product.openingQuantity >= 0
  );
  const skus = normalized.map((product) => product.sku);
  if (!valid || new Set(skus).size !== skus.length) {
    return res.status(400).json({ success: false, message: 'Check each product and use unique SKUs.' });
  }

  try {
    const created = await Product.insertMany(normalized.map(({ hasNumericValues, ...product }) => product), { ordered: true });
    req.user.onboardingComplete = true;
    await req.user.save();
    res.status(201).json({ success: true, data: created, redirect: '/dashboard' });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'A product SKU already exists.' });
    res.status(500).json({ success: false, message: 'Unable to save products.' });
  }
};
