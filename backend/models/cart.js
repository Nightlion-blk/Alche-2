const mongoose = require('mongoose');
const Product = require('./product');

// Cart Header Schema (stores cart metadata)
const cartHeaderSchema = new mongoose.Schema({
    cartId: {
        type: String,
        default: () => `CART_${Date.now()}`, // Generates a unique cart ID
        unique: true,
    },
    checkoutId: {
        type: String,
        required: false,
    },
    accID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Users',
        required: true,
    },
    status: {
        type: String,
        enum: ['active', 'saved', 'checkout', 'completed', 'abandoned'],
        default: 'active'
    },
    created_at: {
        type: Date,
        default: Date.now,
    },
    updated_at: {
        type: Date,
        default: Date.now,
    },
    // Add temporary checkout data storage
    checkoutData: {
        shippingDetails: {
            fullName: String,
            email: String,
            phone: String,
            address: String,
            city: String,
            state: String,
            postalCode: String,
            country: String
        },
        billingDetails: {
            fullName: String,
            email: String,
            phone: String,
            address: String,
            city: String,
            state: String,
            postalCode: String,
            country: String
        },
        orderDetails: [{
            cartItemID: mongoose.Schema.Types.ObjectId,
            ProductID: mongoose.Schema.Types.ObjectId,
            ProductName: String,
            ProductImage: String,
            Quantity: Number,
            SubTotal: Number
        }],
        totalAmount: Number,
        paymentMethod: String,
        referenceNumber: String,
        createdAt: Date,
        expiresAt: Date
    },
    // Add abandonment tracking
    abandonmentData: {
        timestamp: Date,
        reason: String,
        checkoutStage: String,
        recoveryAttempts: {
            type: Number,
            default: 0
        },
        lastRecoveryAttempt: Date
    }
});

// Add index for finding carts by checkout ID
cartHeaderSchema.index({ checkoutId: 1 });
// Add index for finding abandoned carts
cartHeaderSchema.index({ status: 1, 'checkoutData.expiresAt': 1 });

// Cart Item Schema (stores individual items in a cart)
const cartItemSchema = new mongoose.Schema({
  cartId: {
    type: String,
    required: true
  },

  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Products',
    // Make it optional to support cake designs
    required: function() {
      return !this.cakeDesignId;
    }
  },

  cakeDesignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CakeDesign',
    required: function() {
      return !this.productId;
    }
  },

  itemType: {
    type: String,
    enum: ['product', 'cake_design'],
    required: true
  },

  ProductName: String,
  ProductImage: String,
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  // Store cake customization options if needed
  cakeOptions: {
    size: String,
    flavor: String,
    additionalNotes: String
  }
});

// Export the models
const CartHeader = mongoose.model('CartHeader', cartHeaderSchema);
const CartItem = mongoose.model('CartItem', cartItemSchema);
module.exports = {CartHeader, CartItem};