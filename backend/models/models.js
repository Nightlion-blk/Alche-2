const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the TextureMapSchema first before using it
const TextureMapSchema = new Schema({
  type: {
    type: String,
    enum: ['diffuse', 'normal', 'roughness', 'metalness', 'emissive', 'ao', 'displacement'],
    default: 'diffuse'
  },
  path: {
    type: String,
    required: true
  },
  tiling: {
    u: { type: Number, default: 1 },
    v: { type: Number, default: 1 }
  }
});

// Then use it in your main model schema
const Model3D = new Schema({
  name: {
    type: String,
    required: true,
    default: 'Layer1'
  },
  path: {
    type: String,
    required: true
  },
  position: {
    type: [Number],
    default: [0, 0, 0],
    validate: {
      validator: function(arr) {
        return arr.length === 3;
      },
      message: 'Position must be an array of 3 numbers [x, y, z]'
    }
  },
  color: {
    primary: {
      type: String,
      default: '#ffffff'
    },
    flavorName: {
      type: String,
      default: null
    }
  },
  targetedMeshName: {
    type: [String],
    default: []
  },
  textures: [TextureMapSchema], // Now TextureMapSchema is defined
  price: {
    type: Number,
    default: 0
  },
  category: {
    type: String,
    enum: ['cake', 'product', 'decoration', 'furniture', 'avatar', 'other'],
    default: 'other'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Model3D', Model3D);