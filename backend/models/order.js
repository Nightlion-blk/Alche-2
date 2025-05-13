const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Order details schema (embedded)
const orderDetailSchema = new Schema({
  cartItemID: {
    type: Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  }, 
  ProductID: {
    type: Schema.Types.ObjectId,
    ref: 'Products',
    required: true
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
    enum: ['Maya', 'Gcash', 'COD', 'Pending'],
    required: true
  },
  PaymentStatus: {
    type: String,
    enum: ['Paid', 'Unpaid', 'Refunded', 'Pending'],
    default: 'Unpaid'
  },
  PaymentDate: {
    type: Date
  },
  PaymentReference: {
    type: String
  },
  PaymentID: {
    type: String,
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
    enum: ['Pending', 'Returned', 'Canceled', 'Completed'],
    default: 'Pending'
  },
  EstimatedDeliveryDate: {
    type: Date
  }
});

// Add customer information fields to the order schema
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

  // Add customer information directly to the order
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
    required: false  // Not required as it's optional in the user schema
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
    enum: ['Pending', 'Shipped', 'Canceled', 'Completed'], // Add 'Paid'
    default: 'Pending'
  },
  OrderDetails: [orderDetailSchema],
  Payment: paymentSchema,
  Delivery: deliverySchema
}, {
  timestamps: true
});

module.exports = mongoose.model('Orders', orderSchema);