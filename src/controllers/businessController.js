const Business = require('../models/Business');

const currencyCode = /^[A-Z]{3}$/;
const text = (value) => String(value || '').trim();

const validateBusiness = (body) => {
  const name = text(body.name);
  const industry = text(body.industry);
  const currency = text(body.currency || 'NGN').toUpperCase();

  if (
    name.length < 2 ||
    name.length > 120 ||
    industry.length < 2 ||
    industry.length > 80 ||
    !currencyCode.test(currency)
  ) {
    return null;
  }

  return { name, industry, currency };
};

exports.getBusiness = async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return res.status(404).json({ success: false, message: 'Business details not found.' });
    res.json({ success: true, data: business });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to load business details.' });
  }
};

exports.updateBusiness = async (req, res) => {
  const updates = validateBusiness(req.body);
  if (!updates) {
    return res.status(400).json({ success: false, message: 'Enter a valid business name, industry, and currency.' });
  }

  try {
    const business = await Business.findOneAndUpdate(
      { owner: req.user._id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!business) return res.status(404).json({ success: false, message: 'Business details not found.' });
    res.json({ success: true, data: business });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to update business details.' });
  }
};
