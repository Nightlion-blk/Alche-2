const mongoose = require('mongoose');

// Schema for the cake model
const CakeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Cake name is required'],
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  flavor: {
    type: Object,
    required: true
  },
  icing: {
    type: Object,
    required: true
  },
  // Store Layer1 model data
  Layer1: {
    type: Object,
    required: true
  },
  // Store all customization data (includes candles)
  customizeData: [{
    type: Object
  }],
  // Text placement
  placedTexts: [{
    type: Object
  }],
  // Text items
  textItems: [{
    type: Object
  }],
  // Placed candles
  placedCandles: [{
    type: Object
  }],
  // For user authentication in the future
  userId: {
    type: String
  },
  // Any additional metadata
  metadata: {
    type: Object,
    default: {}
  }
}, {
  // Enable storage of large objects
  strict: false,
  timestamps: true
});

// Create an index for faster lookups
CakeSchema.index({ name: 1, createdAt: -1 });

module.exports = mongoose.model('Cake', CakeSchema);