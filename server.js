const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./src/config/db.js');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors()); // Allows your Frontend to talk to this Backend
app.use(express.json()); // Allows the app to read JSON data

// Basic Test Route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: "KudiHer API is running and connected to Database"
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});