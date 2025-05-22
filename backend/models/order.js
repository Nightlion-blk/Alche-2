const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Design snapshot schema for preserving cake design state at order time
const designSnapshotSchema = new Schema({
  name: String,
  description: String,
  previewImage: String,
  cakeModel: {
    path: String,
    color: {
      primary: String,
      cream: String,
      batter: String
    }
  },
  elements: [{
    path: String,
    position: [Number],
    rotation: [Number],
    scale: [Number],
    color: {
      primary: String
    },
    uniqueId: String
  }],
  message: String,
  messageColor: String,
  messageFont: String
});

// Order details schema (embedded)
const orderDetailSchema = new Schema({
  cartItemID: {
    type: Schema.Types.ObjectId,
    ref: 'CartItem',
    required: true
  },
  
  // Item type to distinguish between products and cake designs
  itemType: {
    type: String,
    enum: ['product', 'cake_design', 'unknown'],
    default: 'product',
    required: true
  },
  
  // Product reference - required only for regular products
  ProductID: {
    type: Schema.Types.ObjectId,
    ref: 'Products',
    required: function() {
      return this.itemType === 'product';
    }
  },
  
  // Cake design reference - required only for cake designs
  cakeDesignID: {
    type: Schema.Types.ObjectId,
    ref: 'CakeDesign',
    required: function() {
      return this.itemType === 'cake_design';
    }
  },
  
  // Design snapshot for cake designs - preserves design state at order time
  designSnapshot: designSnapshotSchema,
  
  // Cake customization options
  cakeOptions: {
    size: String,
    flavor: String,
    additionalNotes: String
  },
  
  ProductImage: {
    type: String,
    required: true
  },
  
  ProductName: {
    type: String,
    required: true
  },
  
  Quantity: {
    type: Number,
    required: true,
    min: 1
  },
  
  SubTotal: {
    type: Number,
    required: true,
    min: 0
  }
});

// Payment schema (embedded)
const paymentSchema = new Schema({
  PaymentMethod: {
    type: String,
    enum: ['Maya', 'Gcash', 'COD', 'Pending', 'Bank Transfer'],
    required: true
  },
  
  PaymentStatus: {
    type: String,
    enum: ['Paid', 'Unpaid', 'Refunded', 'Pending', 'Partially Paid'],
    default: 'Unpaid'
  },
  
  PaymentDate: {
    type: Date
  },
  
  PaymentReference: {
    type: String
  },
  
  PaymentID: {
    type: String
  }
});

const deliverySchema = new Schema({
  ShippingAddress: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true }
  },
  
  ShippingStatus: {
    type: String,
    enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Returned', 'Canceled', 'Completed'],
    default: 'Pending'
  },
  
  EstimatedDeliveryDate: {
    type: Date
  },
  
  TrackingNumber: String,
  
  DeliveryNotes: String
});

// Main order schema
const orderSchema = new Schema({
  cartHeaderID: {
    type: String,
    ref: 'CartHeader',
    required: true
  },

  OrderID: {
    type: String,
    required: true,
    unique: true,
    default: () => "ORD_" + Date.now()
  },

  accID: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    required: true
  },

  CheckoutID: {
    type: Schema.Types.ObjectId,
    unique: true,
    required: true
  },

  // Customer information
  customerName: {
    Fullname: { type: String, required: true },
  },
  
  customerEmail: {
    type: String,
    required: true,
    lowercase: true
  },
  
  customerContact: {
    type: String,
    required: false
  },

  OrderDate: {
    type: Date,
    default: Date.now
  },

  TotalAmount: {
    type: Number,
    required: true,
    min: 0
  },

  Status: {
    type: String,
    enum: ['Pending', 'Processing', 'Baking', 'Shipped', 'Delivered', 'Canceled', 'Completed'],
    default: 'Pending'
  },
  
  // Cake design flags
  hasCustomCakes: {
    type: Boolean,
    default: false
  },
  
  customCakeCount: {
    type: Number,
    default: 0
  },
  
  OrderDetails: [orderDetailSchema],
  Payment: paymentSchema,
  Delivery: deliverySchema
}, {
  timestamps: true
});

// Pre-save middleware to update cake design flags
orderSchema.pre('save', function(next) {
  // Calculate if order has custom cakes and count them
  const cakeDesigns = this.OrderDetails.filter(item => item.itemType === 'cake_design');
  this.customCakeCount = cakeDesigns.length;
  this.hasCustomCakes = this.customCakeCount > 0;
  next();
});

// Add index for efficient queries
orderSchema.index({ OrderID: 1 });
orderSchema.index({ accID: 1, OrderDate: -1 });
orderSchema.index({ hasCustomCakes: 1 });
orderSchema.index({ Status: 1, OrderDate: -1 });

module.exports = mongoose.model('Orders', orderSchema);