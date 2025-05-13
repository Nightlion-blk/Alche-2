const mongoose = require('mongoose');
const { CartHeader, CartItem } = require('../models/cart');// Check capitalization
const Products = require('../models/product'); // Check capitalization
const Orders = require('../models/order'); // Check capitalization
const payMongoServices = require('../config/payMongoServices');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
/**
 * Format phone number to E.164 format for PayMongo
 * @param {string} phone - Phone number to format
 * @returns {string} - Formatted phone number
 */
const formatPhone = (phone) => {
  // Remove any non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // If starts with 0, replace with +63 (Philippines)
  if (digits.startsWith('0')) {
    return '+63' + digits.substring(1);
  }
  
  // If no country code, assume Philippines
  if (!digits.startsWith('+')) {
    return '+63' + digits;
  }
  
  return digits;
};

/**
 * Calculate total amount from cart items
 * @param {Array} cartItems - Array of cart items
 * @returns {Number} - Total amount
 */
const calculateTotalAmount = (cartItems) => {
  return cartItems.reduce((total, item) => {
    const price = item.productId.Price || item.productId.price || 0;
    return total + (price * item.quantity);
  }, 0);
};

/**
 * Generate order details from cart items
 * @param {Array} cartItems - Array of cart items
 * @returns {Array} - Array of order details
 */
const generateOrderDetails = (cartItems) => {
  return cartItems.map(item => ({
    cartItemID: item._id,
    ProductID: item.productId._id,
    Quantity: item.quantity,
    SubTotal: (item.productId.Price || item.productId.price) * item.quantity
  }));
};

/**
 * Create delivery schema object from shipping details
 * @param {Object} shippingDetails - Shipping details from request
 * @returns {Object} - Delivery schema object
 */
const createDeliveryObject = (shippingDetails) => {
  return {
    ShippingAddress: {
      street: shippingDetails.address,
      city: shippingDetails.city,
      state: shippingDetails.state || shippingDetails.city, // Fallback to city if state not provided
      postalCode: shippingDetails.postalCode,
      country: shippingDetails.country || 'PH'
    },
    ShippingStatus: 'Pending',
    EstimatedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
  };
};

/**
 * Create payment schema object 
 * @param {String} paymentMethod - Payment method
 * @returns {Object} - Payment schema object
 */
const createPaymentObject = (paymentMethod) => {
  // Map PayMongo payment methods to our schema's payment methods
  const paymentMethodMap = {
    'card': 'Maya', // Assuming card payments go through Maya
    'gcash': 'Gcash',
    'grab_pay': 'Maya', // Map Grab to Maya in our system
    'paymaya': 'Maya',
    'cod': 'Cash on Delivery'
  };

  return {
    PaymentMethod: paymentMethodMap[paymentMethod] || 'Maya',
    PaymentStatus: 'Unpaid',
    PaymentDate: null, // Will be set when payment is confirmed
    PaymentReference: null // Will be set when payment is confirmed
  };
};

exports.createCheckoutSession = async (req, res) => {
  try {
    // Extract necessary data from request
    const { cartId, shippingDetails, billingDetails, userId, cancelUrl, failureUrl } = req.body;
    console.log('Delivery object:', shippingDetails.fullName);
    const cart = await CartHeader.findOne({ cartId });
    
    if (!cart) {
      console.log('❌ No cart found with ID:', cartId);
      return res.status(404).json({ 
        success: false, 
        message: 'Cart not found with ID: ' + cartId 
      });
    }
    
    // Convert both to strings to ensure consistent comparison
    if (String(cart.accID) !== String(userId)) {
      console.log('❌ Cart belongs to a different user');
      console.log('Cart owner ID:', String(cart.accID));
      console.log('Request user ID:', String(userId));
      return res.status(403).json({ 
        success: false, 
        message: 'Cart not found or does not belong to user' 
      });
    }
    
    console.log('✅ Cart found and belongs to user');

    // Check the cart status
    if (cart.status !== 'active' && cart.status !== 'saved') {
      console.log('❌ Cart has invalid status:', cart.status);
      return res.status(400).json({ 
        success: false,
        message: 'Cart is not available for checkout (status: ' + cart.status + ')'
      });
    }
    
    console.log('✅ Cart has valid status for checkout');
    
    // Use the validated cart
    const cartHeader = cart;
    
    // Fetch cart items with product details
    const cartItems = await CartItem.find({ cartId: cartHeader.cartId }).populate('productId');
    
    if (!cartItems.length) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }
    
    // Calculate total amount
    const totalAmount = calculateTotalAmount(cartItems);
    
    // Generate a reference number for this checkout
    const referenceNumber = `CART-${cartId}-${Date.now().toString().slice(-6)}`;
   
   // console.log('Generated reference number:', referenceNumber);
    
    // Create order details from cart items
    const orderDetails = cartItems.map(item => ({
      cartItemID: item._id,
      ProductID: item.productId._id,
      Quantity: item.quantity,
      ProductName: item.ProductName || item.productId.Name || item.productId.name, // First check if cart item has ProductName
      ProductImage: item.ProductImage || // First check if cart item has ProductImage
                   (item.productId.image && item.productId.image.length > 0 ? item.productId.image[0] : // Then check product images array
                   (item.productId.Image?.url || 'default-product-image.jpg')), // Then check Image.url or use default
      SubTotal: item.quantity * (item.productId.Price || item.productId.price || 0)
    }));

    // Store checkout data in CartHeader
    cartHeader.checkoutData = {
      shippingDetails,
      billingDetails,
      orderDetails,
      totalAmount,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
    };
    
    // Format data for PayMongo checkout
    const lineItems = cartItems.map(item => {
      // Extract image URL
      const imageUrl = item.productId.Image?.url 
        ? [item.productId.Image.url]
        : ["https://via.placeholder.com/150"]; // Fallback image
    
      return {
        currency: 'PHP',
        amount: Math.round((item.productId.Price || item.productId.price) * 100), 
        name: item.productId.Name || item.productId.name || 'Product',
        quantity: item.quantity,
        images: imageUrl
      };
    });
    
    const checkoutData = {
      lineItems,
      referenceNumber: `CART-${cartId}-${Date.now().toString().slice(-6)}`,
      paymentMethodTypes: ['card', 'gcash', 'grab_pay', 'paymaya'],
      success_url: `${process.env.FRONTEND_URL}/payment/success?checkout_id={CHECKOUT_SESSION_ID}`,
      failure_url: `${process.env.FRONTEND_URL}/payment/failed?checkout_id={CHECKOUT_SESSION_ID}`,
      cancel_return_url: cancelUrl || `${process.env.FRONTEND_URL}/checkout/cancel`,
      billing: {
        name: billingDetails.fullName || billingDetails.name,
        email: billingDetails.email,
        phone: formatPhone(billingDetails.phone),
        address: {
          line1: billingDetails.address,
          city: billingDetails.city,
          state: billingDetails.state || billingDetails.city,
          postal_code: billingDetails.postalCode,
          country: billingDetails.country || 'PH'
        }
      },
      shipping: {
        name: shippingDetails.fullName || shippingDetails.name,
        email: shippingDetails.email,
        phone: formatPhone(shippingDetails.phone),
        address: {
          line1: shippingDetails.address,
          city: shippingDetails.city,
          state: shippingDetails.state || shippingDetails.city,
          postal_code: shippingDetails.postalCode,
          country: shippingDetails.country || 'PH'
        }
      }
    };
    
    // Create checkout session with PayMongo
    const checkoutSession = await payMongoServices.createCheckout(checkoutData);
    
    // Update cart status
    cartHeader.checkoutId = checkoutSession.data.id;
    cartHeader.status = 'checkout';
    cartHeader.updated_at = new Date();
    await cartHeader.save();

    res.status(200).json({
      success: true,
      data: {
        checkoutId: checkoutSession.data.id,
        checkoutUrl: checkoutSession.data.attributes.checkout_url,
        referenceNumber: checkoutData.referenceNumber
      }
    });
    
  } catch (error) {
    console.error('Checkout creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session',
      error: error.message
    });
  }
};

// Payment cancel handler
exports.handlePaymentCancel = async (req, res) => {
  try {
    const { checkout_id: checkoutId } = req.query;

    if (!checkoutId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Checkout ID is required' 
      });
    }

    // 1. Get the cart reference number (assuming you can retrieve it from PayMongo or your database)
    const checkoutSession = await payMongoServices.retrieveCheckout(checkoutId);
    if (!checkoutSession) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid checkout session' 
      });
    }

    const cartId = checkoutSession.data.attributes.reference_number.replace('ORDER-', '');

    const cartHeader = await CartHeader.findOne({ cartId });
    if (cartHeader) {
      cartHeader.status = 'active';
      await cartHeader.save();
    }

    // 3. Return response
    return res.status(200).json({
      success: true,
      message: 'Payment cancelled',
      cartId
    });

  } catch (error) {
    console.error('Payment cancel handler error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process payment cancellation',
      error: error.message
    });
  }
};

// Add a specific cancel endpoint
exports.cancelCheckout = async (req, res) => {
  try {
    const { checkoutId, cartId } = req.body;
    
    if (!checkoutId && !cartId) {
      return res.status(400).json({
        success: false,
        message: 'Checkout ID or Cart ID is required'
      });
    }
    
    // Find cart by ID and reset its status
    if (cartId) {
      const cartHeader = await CartHeader.findOne({ cartId });
      if (cartHeader) {
        // Reset cart status back to active
        cartHeader.status = 'active';
        await cartHeader.save();
      }
    }
    
    // If you need to cancel the checkout session with PayMongo API
    if (checkoutId) {
      try {
        await payMongoServices.cancelCheckout(checkoutId);
      } catch (pmError) {
        // Just log the error but don't fail the request
        console.warn('Failed to cancel PayMongo checkout:', pmError.message);
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'Checkout cancelled successfully',
      cartId
    });
  } catch (error) {
    console.error('Error cancelling checkout:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel checkout',
      error: error.message
    });
  }
};

// Helper function to determine payment method from checkout session
function getPaymentMethodFromCheckout(checkoutSession) {
  const paymentIntent = checkoutSession.data.attributes.payment_intent;
  
  if (!paymentIntent || !paymentIntent.data || !paymentIntent.data.attributes) {
    return 'Cash on Delivery'; // Default fallback
  }

  const paymentMethod = paymentIntent.data.attributes.payment_method_used;
  
  // Map PayMongo payment methods to your schema's enum values
  switch (paymentMethod) {
    case 'paymaya':
      return 'Maya';
    case 'gcash':
      return 'Gcash';
    default:
      return 'Cash on Delivery'; // Default fallback
  }
}
// Retrieve checkout session
exports.getCheckoutSession = async (req, res) => {
  try {
    const { checkoutId } = req.params;
    
    // Get checkout details from PayMongo
    const checkoutSession = await payMongoServices.retrieveCheckout(checkoutId);
    
    // Return checkout details
    res.status(200).json({
      success: true,
      data: checkoutSession.data
    });
    
  } catch (error) {
    console.error('Checkout retrieval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve checkout session',
      error: error.message
    });
  }
};

// Expire checkout session
exports.expireCheckoutSession = async (req, res) => {
  try {
    const { checkoutId } = req.params;
    const userId = req.user._id; // Assuming you have authentication middleware
    
    // Get checkout details from PayMongo
    const checkoutSession = await payMongoServices.retrieveCheckout(checkoutId);
    
    // Get reference number from checkout session
    const referenceNumber = checkoutSession.data.attributes.reference_number;
    const cartId = referenceNumber.replace('ORDER-', '');
    
    // Verify cart belongs to user
    const cartHeader = await CartHeader.findOne({ cartId, accID: userId });
    
    if (!cartHeader) {
      return res.status(404).json({ message: 'Cart not found' });
    }
    
    // Expire the checkout
    await payMongoServices.expireCheckout(checkoutId);
    
    // Update cart status back to active
    cartHeader.status = 'active';
    cartHeader.updated_at = new Date();
    await cartHeader.save();
    
    // Return success
    res.status(200).json({
      success: true,
      message: 'Checkout session expired successfully'
    });
    
  } catch (error) {
    console.error('Checkout expiration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to expire checkout session',
      error: error.message
    });
  }
};

/**
 * Update product sales data with new purchase quantities
 * @param {Array} orderDetails - Order details with product IDs and quantities
 */
const updateProductSalesData = async (orderDetails) => {
  try {
    for (const item of orderDetails) {
      const productId = item.ProductID;
      const quantitySold = item.Quantity;
      
      // Find the product
      const product = await Products.findById(productId);
      
      if (product) {
        // Update total sales
        product.salesData.totalSold += quantitySold;
        
        // Update last week and month sales
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        product.salesData.lastWeekSold += quantitySold;
        product.salesData.lastMonthSold += quantitySold;
        
        // If this is a first sale or significant sale, update best seller status
        if (!product.salesData.bestSellerSince && product.salesData.totalSold > 10) {
          product.salesData.bestSellerSince = new Date();
          product.salesData.isBestSeller = true;
        }
        
        // Update stock quantity
        product.StockQuantity = Math.max(0, product.StockQuantity - quantitySold);
        
        // Save the updated product
        await product.save();
        console.log(`✅ Updated sales data for product ${product.Name || product._id}`);
      }
    }
    
    // Optionally recalculate best seller rankings across products
    await updateBestSellerRankings();
    
  } catch (error) {
    console.error('Error updating product sales data:', error);
  }
};

/**
 * Update best seller rankings across all products
 */
const updateBestSellerRankings = async () => {
  try {
    // Get all products sorted by sales
    const products = await Products.find({ 'salesData.totalSold': { $gt: 0 } })
      .sort({ 'salesData.totalSold': -1 })
      .limit(50);  // Consider only top 50 products
    
    // Update rankings
    for (let i = 0; i < products.length; i++) {
      products[i].salesData.bestSellerRank = i + 1;
      
      // Mark top 10 as best sellers
      products[i].salesData.isBestSeller = i < 10;
      
      // Set bestSellerSince if not already set
      if (products[i].salesData.isBestSeller && !products[i].salesData.bestSellerSince) {
        products[i].salesData.bestSellerSince = new Date();
      }
      
      await products[i].save();
    }
  } catch (error) {
    console.error('Error updating best seller rankings:', error);
  }
};

/**
 * Mark a checkout as potentially abandoned
 */
exports.markCheckoutAbandoning = async (req, res) => {
  try {
    const { cartId, checkoutId, reason } = req.body;
    
    if (!cartId || !checkoutId) {
      return res.status(400).json({
        success: false,
        message: 'Cart ID and Checkout ID are required'
      });
    }
    
    // Find the cart and update it with abandonment tracking
    const cart = await CartHeader.findOne({ cartId });
    
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }
    
    // Track abandonment data
    cart.abandonmentData = {
      timestamp: new Date(),
      reason: reason || 'unknown',
      checkoutStage: 'payment_gateway', // Could be more specific if you track checkout steps
      recoveryAttempts: cart.abandonmentData?.recoveryAttempts || 0
    };
    
    await cart.save();
    
    return res.status(200).json({
      success: true,
      message: 'Checkout marked as potentially abandoned'
    });
  } catch (error) {
    console.error('Error marking checkout as abandoning:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark checkout as abandoning',
      error: error.message
    });
  }
};

/**
 * Beacon API endpoint for abandonment tracking
 * This uses a different approach that's more reliable during page unload
 */
exports.markCheckoutAbandoningBeacon = async (req, res) => {
  // Respond immediately to the beacon request
  res.status(202).send();
  
  try {
    const { checkoutId, cartId, reason } = req.body;
    
    if (!cartId || !checkoutId) {
      console.error('Missing cartId or checkoutId in beacon request');
      return;
    }
    
    // Find the cart and update it with abandonment tracking
    const cart = await CartHeader.findOne({ cartId });
    
    if (!cart) {
      console.error(`Cart not found: ${cartId}`);
      return;
    }
    
    // Track abandonment data
    cart.abandonmentData = {
      timestamp: new Date(),
      reason: reason || 'unknown',
      checkoutStage: 'payment_gateway',
      recoveryAttempts: cart.abandonmentData?.recoveryAttempts || 0
    };
    
    await cart.save();
    console.log(`Checkout ${checkoutId} marked as potentially abandoned via beacon`);
  } catch (error) {
    console.error('Error in beacon abandonment handler:', error);
  }
};

/**
 * Recover an abandoned checkout
 */
exports.recoverCheckout = async (req, res) => {
  try {
    const { cartId } = req.params;
    const userId = req.user._id; // Assuming authentication middleware
    
    // Find the cart
    const cart = await CartHeader.findOne({ 
      cartId,
      accID: userId // Ensure cart belongs to user
    });
    
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }
    
    // If cart is in checkout status, reset it to active
    if (cart.status === 'checkout') {
      cart.status = 'active';
      
      // Track recovery attempt
      if (cart.abandonmentData) {
        cart.abandonmentData.recoveryAttempts = (cart.abandonmentData.recoveryAttempts || 0) + 1;
        cart.abandonmentData.lastRecoveryAttempt = new Date();
      }
      
      await cart.save();
    }
    
    return res.status(200).json({
      success: true,
      message: 'Cart recovered successfully',
      cartId: cart.cartId
    });
  } catch (error) {
    console.error('Error recovering checkout:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to recover checkout',
      error: error.message
    });
  }
};