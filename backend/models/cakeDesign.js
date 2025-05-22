const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CakeDesignSchema = new Schema({
  // User information
  userId: {
    type: String,
    required: true,
    index: true
  },
  username: String,
  
  // Metadata
  name: {
    type: String,
    required: true
  },
  description: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  previewImage: {
    type: String,  // For storing data URLs
    // Optional: validate base64 image format
    validate: {
      validator: function(v) {
        return v === null || v === undefined || 
               v.startsWith('data:image/');
      },
      message: 'Preview image must be a valid data URL'
    }
  },
  // Cake model
  cakeModel: {
    path: String,
    position: {
      type: [Number],
      default: [0, 0, 0]
    },

    color: {
      primary: String,
      cream: String,
      batter: String
    },
    // Flavor colors with enhanced schema
    flavor: {
      primary: String,
      secondary: String,
      name: String  // Store the flavor name (e.g., "Chocolate", "Vanilla")
    },
    textureMap: {
      type: Map,
      of: String
    },

    targetedMeshName: Schema.Types.Mixed,
    creamMeshes: [String],
    batterMeshes: [String]
  },
  
  // Cake placement
  cakePlacement: {
    topY: Number,
    centerX: Number,
    centerZ: Number,
    radius: Number
  },
  
  // Elements
  elements: [{
    path: String,
    position: [Number],
     rotation: {
    type: Array,  // Change from [Number] to Array
    default: [0, 0, 0]
  },
  rotationType: String,
    scale: {
      type: [Number],
      default: [1, 1, 1]
    },
    color: {
      primary: String
    },
    textureMap: {
      type: Map,
      of: String
    },
    targetedMeshName: Schema.Types.Mixed,
    uniqueId: String
  }],
  
  // Text message
  message: String,
  messageColor: String,
  messageFont: String,
  messagePosition: [Number],
  messageRotation: [Number],
  messageScale: {
    type: [Number],
    default: [1, 1, 1]
  },
});

// Auto-update the updatedAt field
CakeDesignSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});
// Create indexes for faster queries
CakeDesignSchema.index({ userId: 1, createdAt: -1 });
CakeDesignSchema.index({ isPublic: 1, createdAt: -1 });

module.exports = mongoose.model('CakeDesign', CakeDesignSchema);