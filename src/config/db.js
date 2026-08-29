const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`⚠️ MongoDB connection failed: ${error.message}`);
    console.log('Continuing without database for now. Auth routes will fail until MongoDB is configured.');
  }
};

module.exports = connectDB;