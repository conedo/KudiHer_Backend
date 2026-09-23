const express = require('express');

const router = express.Router();

const features = [
  {
    title: 'Know your numbers',
    description: 'See your money clearly with simple tools built around your everyday goals.',
    icon: '/public/icons/chart.svg'
  },
  {
    title: 'Stay in control',
    description: 'Keep your transactions and business activity organized in one secure workspace.',
    icon: '/public/icons/shield.svg'
  },
  {
    title: 'Build with confidence',
    description: 'Turn better financial habits into momentum for the future you are building.',
    icon: '/public/icons/rocket.svg'
  }
];

router.get('/features', (req, res) => {
  res.status(200).json({ success: true, data: features });
});

module.exports = router;
