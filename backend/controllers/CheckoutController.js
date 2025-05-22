const mongoose = require('mongoose');
const { CartHeader, CartItem } = require('../models/cart');
const Product = require('../models/product'); // Changed from Product to Products
const CakeDesign = require('../models/cakeDesign'); // Changed from cakeDesign to CakeDesign (proper casing)
const Orders = require('../models/order');
const payMongoServices = require('../config/payMongoServices');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Format phone number to E.164 format for PayMongo
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
    // Handle both product and cake design items
    if (item.itemType === 'product' && item.productId) {
      const price = item.productId.Price || item.productId.price || item.price || 0;
      return total + (price * item.quantity);
    } 
    else if (item.itemType === 'cake_design' && item.cakeDesignId) {
      // Use the price stored in the cart item for custom cakes
      return total + (item.price * item.quantity);
    }
    // Fallback to item price if neither is properly defined
    return total + (item.price * item.quantity);
  }, 0);
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
      return res.status(403).json({ 
        success: false, 
        message: 'Cart not found or does not belong to user' 
      });
    }

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
    
    // FIX 2: Ensure proper populate with model specifications
    const cartItems = await CartItem.find({ cartId: cartHeader.cartId })
      .populate({
        path: 'productId',
        model: 'Products'  // Explicitly specify the model name
      })
      .populate({
        path: 'cakeDesignId',
        model: 'CakeDesign'  // Explicitly specify the model name
      });
    
    if (!cartItems.length) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }
    
    // Calculate total amount
    const totalAmount = calculateTotalAmount(cartItems);
    
    // Generate a reference number for this checkout
    const referenceNumber = `CART-${cartId}-${Date.now().toString().slice(-6)}`;
   
    // Map cart items to order details (unchanged)
    const orderDetails = cartItems.map(item => {
      // Handle different item types
      if (item.itemType === 'product' && item.productId) {
        // Check if productId exists and is a valid object
        const product = item.productId || {};
        return {
          cartItemID: item._id,
          ProductID: product._id,
          Quantity: item.quantity,
          ProductName: item.ProductName || product.Name || product.name || 'Product',
          ProductImage: item.ProductImage || 
                      (product.image && Array.isArray(product.image) && product.image.length > 0 ? product.image[0] : 
                      (product.Image && Array.isArray(product.Image) && product.Image.length > 0 ? product.Image[0].url || product.Image[0] : 
                      (typeof product.image === 'string' ? product.image : 
                      (typeof product.Image === 'string' ? product.Image : 'default-product-image.jpg')))),
          SubTotal: item.quantity * (product.Price || product.price || item.price || 0),
          itemType: 'product'
        };
      } else if (item.itemType === 'cake_design' && item.cakeDesignId) {
        // Check if cakeDesignId exists and is a valid object
        const design = item.cakeDesignId || {};
        return {
          cartItemID: item._id,
          cakeDesignID: design._id,
          Quantity: item.quantity,
          ProductName: item.ProductName || `Custom Cake: ${design.name || 'Untitled Design'}`,
          ProductImage: item.ProductImage || design.previewImage || 'default-cake-image.jpg',
          SubTotal: item.quantity * item.price,
          itemType: 'cake_design',
          cakeOptions: item.cakeOptions || {},
          designSnapshot: {
            name: design.name || 'Untitled Design',
            description: design.description || '',
            previewImage: design.previewImage || '',
            cakeModel: design.cakeModel || {},
            elements: design.elements || [],
            message: design.message || '',
            messageColor: design.messageColor || '',
            messageFont: design.messageFont || ''
          }
        };
      } else {
        // Fallback for potentially malformed items
        return {
          cartItemID: item._id,
          ProductName: item.ProductName || 'Unknown Item',
          ProductImage: item.ProductImage || 'default-product-image.jpg',
          Quantity: item.quantity,
          SubTotal: item.quantity * item.price,
          itemType: item.itemType || 'unknown'
        };
      }
    });

    // Store checkout data in CartHeader
    cartHeader.checkoutData = {
      shippingDetails,
      billingDetails,
      orderDetails,
      totalAmount,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
    };
    
    // Create line items for PayMongo (unchanged)
    const lineItems = cartItems.map(item => {
      try {
        // Handle different item types
        if (item.itemType === 'product' && item.productId) {
          // Regular product
          const product = item.productId || {};
          
          // Safely get product image URL - REMOVE DATA URIs
          let imageUrl;
          
          if (product.Image && Array.isArray(product.Image) && product.Image.length > 0) {
            // Get image URL but check if it's not a data URI
            const imgSrc = product.Image[0].url || product.Image[0];
            imageUrl = imgSrc && !imgSrc.startsWith('data:') ? [imgSrc] : ["https://via.placeholder.com/150"];
          } else if (product.image && typeof product.image === 'string' && !product.image.startsWith('data:')) {
            imageUrl = [product.image];
          } else {
            // Use placeholder if no valid image or image is data URI
            imageUrl = ["https://via.placeholder.com/150"];
          }
          
          return {
            currency: 'PHP',
            amount: Math.round((product.Price || product.price || item.price || 0) * 100), 
            name: product.Name || product.name || 'Product',
            quantity: item.quantity,
            images: imageUrl
          };
        } else if (item.itemType === 'cake_design' && item.cakeDesignId) {
          // Custom cake design
          const design = item.cakeDesignId || {};
          
          let cakeOptions = '';
          if (item.cakeOptions) {
            const { size, flavor, additionalNotes } = item.cakeOptions;
            cakeOptions = [
              size ? `Size: ${size}` : '',
              flavor ? `Flavor: ${flavor}` : '',
              additionalNotes ? `Notes: ${additionalNotes}` : ''
            ].filter(Boolean).join(', ');
          }
          
          const itemName = `Custom Cake: ${design.name || 'Design'} ${cakeOptions ? `(${cakeOptions})` : ''}`;
          
          // Always use placeholder for custom cakes - NEVER use data URIs
          const cakeImageUrl = ['https://via.placeholder.com/150/FF88CC/FFFFFF?text=Custom+Cake'];
          
          return {
            currency: 'PHP',
            amount: Math.round(item.price * 100),
            name: itemName,
            quantity: item.quantity,
            images: cakeImageUrl
          };
        } else {
          // Fallback for malformed items
          return {
            currency: 'PHP',
            amount: Math.round(item.price * 100),
            name: item.ProductName || 'Item',
            quantity: item.quantity,
            images: ['https://via.placeholder.com/150']
          };
        }
      } catch (err) {
        console.error('Error processing line item:', err);
        // Return a default item if there's any error
        return {
          currency: 'PHP',
          amount: Math.round(item.price * 100),
          name: 'Item',
          quantity: item.quantity,
          images: ['https://via.placeholder.com/150']
        };
      }
    });

    // Create checkout data object for PayMongo
    const checkoutData = {
      lineItems,
      referenceNumber,
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
    
    // REMOVED: Update cart status - don't change status, just store checkoutId
    cartHeader.checkoutId = checkoutSession.data.id;
    await cartHeader.save();

    res.status(200).json({
      success: true,
      data: {
        checkoutId: checkoutSession.data.id,
        checkoutUrl: checkoutSession.data.attributes.checkout_url,
        referenceNumber
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

/**
 * Update product sales data with new purchase quantities
 * @param {Array} orderDetails - Order details with product IDs and quantities
 */
const updateProductSalesData = async (orderDetails) => {
  try {
    for (const item of orderDetails) {
      // Handle different item types
      if (item.itemType === 'product' && item.ProductID) {
        const productId = item.ProductID;
        const quantitySold = item.Quantity;
        
        // Find the product - CHANGED from Products to Product 
        const product = await Product.findById(productId);
        
        if (product) {
          // Update total sales
          if (!product.salesData) {
            product.salesData = {
              totalSold: 0,
              lastWeekSold: 0,
              lastMonthSold: 0,
              isBestSeller: false
            };
          }
          
          product.salesData.totalSold += quantitySold;
          product.salesData.lastWeekSold += quantitySold;
          product.salesData.lastMonthSold += quantitySold;
          
          // If this is a first sale or significant sale, update best seller status
          if (!product.salesData.bestSellerSince && product.salesData.totalSold > 10) {
            product.salesData.bestSellerSince = new Date();
            product.salesData.isBestSeller = true;
          }
          
          // Update stock quantity if it exists
          if (typeof product.StockQuantity === 'number') {
            product.StockQuantity = Math.max(0, product.StockQuantity - quantitySold);
          }
          
          // Save the updated product
          await product.save();
          console.log(`✅ Updated sales data for product ${product.Name || product.name || product._id}`);
        }
      }
    }
    
    // Optionally recalculate best seller rankings across products
    if (typeof updateBestSellerRankings === 'function') {
      await updateBestSellerRankings();
    }
    
  } catch (error) {
    console.error('Error updating product sales data:', error);
  }
};

/**
 * Get checkout session details by ID
 */
exports.getCheckoutSession = async (req, res) => {
  try {
    const { checkoutId } = req.params;
    
    if (!checkoutId) {
      return res.status(400).json({
        success: false,
        message: 'Checkout ID is required'
      });
    }
    
    const cart = await CartHeader.findOne({ checkoutId });
    
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Checkout session not found'
      });
    }
    
    // Get cart items with product and cake design details - add explicit model specifications
    const cartItems = await CartItem.find({ cartId: cart.cartId })
      .populate({
        path: 'productId',
        model: 'Product'  // Explicitly specify the model name
      })
      .populate({
        path: 'cakeDesignId',
        model: 'CakeDesign'  // Explicitly specify the model name
      });
    
    res.status(200).json({
      success: true,
      data: {
        cartId: cart.cartId,
        checkoutId,
        status: cart.status,
        checkoutData: cart.checkoutData,
        items: cartItems
      }
    });
  } catch (error) {
    console.error('Error fetching checkout session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch checkout session',
      error: error.message
    });
  }
};

// The remainder of your controller should work with minimal changes
// since it deals with the cart header rather than individual items

// Keep all your existing functions:
// - expireCheckoutSession
// - updateBestSellerRankings
// - handlePaymentCancel
// - cancelCheckout
// - markCheckoutAbandoning
// - markCheckoutAbandoningBeacon
// - recoverCheckout