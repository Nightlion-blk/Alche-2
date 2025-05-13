const mongoose = require('mongoose');
const { CartHeader, CartItem } = require('../models/cart');
const Orders = require('../models/order');

exports.handlePayMongoWebhook = async (req, res) => {
  console.log('💰 Webhook received at:', new Date().toISOString());
  
  try {
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const payload = req.body;
    
    // Extract event type
    const eventType = payload.data?.attributes?.type || payload.data?.type || 'unknown';
    console.log('Event type detected:', eventType);
    
    // Only proceed for successful payments
    if (eventType === 'checkout_session.payment.paid') {
      // Extract checkout session data from payload
      const checkoutData = payload.data?.attributes?.data;
      if (!checkoutData) {
        console.log('❌ Missing checkout data in webhook payload');
        return res.status(200).send('Webhook processed - missing checkout data');
      }
      
      const checkoutId = checkoutData.id;
      const checkoutAttrs = checkoutData.attributes || {};
      
      // Extract reference number which should contain your cart ID
      const referenceNumber = checkoutAttrs.reference_number;
      console.log('Reference number:', referenceNumber);
      
      // Format changed to match your actual reference format
      let cartId = null;
      if (referenceNumber && referenceNumber.startsWith('CART-')) {
        // Get the part between "CART-" and the last "-"
        const parts = referenceNumber.split('-');
        if (parts.length >= 2) {
          cartId = parts[1];
        }
      }
      
      if (!cartId) {
        console.log('❌ Could not extract cart ID from reference:', referenceNumber);
        return res.status(200).send('Invalid reference format');
      }
      
      console.log('Extracted cart ID:', cartId);
      
      // Find the cart to get user ID and update status
      const cartHeader = await CartHeader.findOne({ cartId });
      if (!cartHeader) {
        console.log(`❌ No cart found with ID: ${cartId}`);
        return res.status(200).send('Cart not found');
      }
      
      // Get cart items for additional information
      const cartItems = await CartItem.find({ cartId }).populate('productId');
      
      // Extract payment details
      const paymentMethod = checkoutAttrs.payment_method_used || 'unknown';
      let mappedPaymentMethod = 'COD'; // Default to COD
      if (paymentMethod === 'paymaya') mappedPaymentMethod = 'Maya';
      if (paymentMethod === 'gcash') mappedPaymentMethod = 'Gcash';
      if (paymentMethod === 'grab_pay') mappedPaymentMethod = 'GrabPay';
      if (paymentMethod === 'card') mappedPaymentMethod = 'Credit Card';
      
      // Extract line items for order details
      const lineItems = checkoutAttrs.line_items || [];
      
      // Extract billing/shipping info
      const billing = checkoutAttrs.billing || {};
      const shipping = checkoutAttrs.shipping || billing; // Fallback to billing if shipping is not available
      
      // Check if order already exists
      const existingOrder = await Orders.findOne({ "Payment.PaymentReference": checkoutId });
      
      if (existingOrder) {
        console.log(`⚠️ Order already exists: ${existingOrder.OrderID}`);
        
        // Update payment status
        existingOrder.Payment.PaymentStatus = 'Paid';
        existingOrder.Payment.PaymentDate = new Date();
        existingOrder.Status = 'Pending'; // Use a value from your enum
        await existingOrder.save();
        
        // Update cart status
        cartHeader.status = 'completed';
        cartHeader.updated_at = new Date();
        await cartHeader.save();
        
        return res.status(200).send('Order updated successfully');
      }
      
      // Create order details with required cartItemID
      const orderDetails = lineItems.map(item => {
        // Find matching cart item, using name for matching
        const matchingCartItem = cartItems.find(cartItem => 
          cartItem.productId.Name === item.name || 
          cartItem.productId.name === item.name
        );
        
        // Get product image from your database first
        let productImage = 'default-product-image.jpg';
        
        if (matchingCartItem?.productId) {
          if (matchingCartItem.productId.Image && 
              Array.isArray(matchingCartItem.productId.Image) && 
              matchingCartItem.productId.Image.length > 0) {
            productImage = matchingCartItem.productId.Image[0].url || matchingCartItem.productId.Image[0];
          } else if (matchingCartItem.productId.image) {
            productImage = matchingCartItem.productId.image;
          }
        }
        
        // Only use PayMongo image as final fallback
        if (productImage === 'default-product-image.jpg' && item.images?.[0]) {
          productImage = item.images[0];
        }
        
        // FIXED - Use correct PascalCase field names that match your schema
        return {
          cartItemID: matchingCartItem?._id || new mongoose.Types.ObjectId(),
          ProductID: matchingCartItem?.productId?._id || new mongoose.Types.ObjectId(),
          ProductName: item.name || 'Product',
          Quantity: parseInt(item.quantity) || 1,
          SubTotal: (item.amount / 100) * (parseInt(item.quantity) || 1),
          ProductImage: productImage,
          Description: item.description || ""
        };
      });
      
      // Calculate total from line items
      const totalAmount = lineItems.reduce((sum, item) => 
        sum + (item.amount / 100 * item.quantity), 0);
      
      // Create new order directly from webhook data
      // Using values that match your schema's enum options
      const newOrder = new Orders({
        OrderID: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        cartHeaderID: cartHeader.cartId,
        accID: cartHeader.accID,
        ProductImage: orderDetails[0]?.ProductImage || 'default-product-image.jpg',
        CheckoutID: new mongoose.Types.ObjectId(),
        customerName: {
          Fullname: shipping.name || billing.name || 'Customer'
        },
        customerEmail: shipping.email || billing.email,
        customerContact: shipping.phone || billing.phone,
        TotalAmount: totalAmount,
        Status: 'Pending', // Changed from 'Processing' to 'Pending' to match enum
        OrderDetails: orderDetails,
        Payment: {
          PaymentMethod: mappedPaymentMethod,
          PaymentStatus: 'Paid',
          PaymentDate: new Date(),
          PaymentReference: checkoutId
        },
        Delivery: {
          ShippingAddress: {
            street: shipping.address?.line1 || billing.address?.line1 || 'Not provided',
            city: shipping.address?.city || billing.address?.city || 'Not provided',
            state: shipping.address?.state || billing.address?.state || 'Not provided', 
            postalCode: shipping.address?.postal_code || billing.address?.postal_code || '00000',
            country: shipping.address?.country || billing.address?.country || 'PH'
          },
          ShippingStatus: 'Pending', // Changed from 'Preparing' to 'Pending' to match enum
          EstimatedDeliveryDate: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000))
        }
      });
      
      await newOrder.save();
      console.log(`✅ Created new order: ${newOrder.OrderID}`);
      
      // Update cart status to completed
      cartHeader.status = 'completed';
      cartHeader.updated_at = new Date();
      await cartHeader.save();
      
      console.log(`✅ Updated cart ${cartHeader.cartId} status to completed`);
      
      // Update product sales data and inventory
      for (const detail of orderDetails) {
        try {
          // Find product by ID
          const productId = detail.ProductID;
          if (!mongoose.Types.ObjectId.isValid(productId)) continue;
          
          const product = await require('../models/product').findById(productId);
          if (!product) {
            console.log(`⚠️ Product not found: ${productId}`);
            continue;
          }
          
          // Initialize salesData if it doesn't exist
          if (!product.salesData) {
            product.salesData = {
              totalSold: 0,
              lastMonthSold: 0,
              lastWeekSold: 0,
              bestSellerRank: null,
              bestSellerSince: null,
              isBestSeller: false
            };
          }
          
          const quantity = detail.Quantity || 1;
          
          // Update inventory
          product.StockQuantity = Math.max(0, product.StockQuantity - quantity);
          
          // Update sales counters
          product.salesData.totalSold += quantity;
          
          // Update monthly and weekly sales
          const oneMonthAgo = new Date();
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
          
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
          
          product.salesData.lastMonthSold += quantity;
          product.salesData.lastWeekSold += quantity;
          
          // Save changes
          await product.save();
          console.log(`✅ Updated sales data for product: ${product.Name || product.ProductID}`);
          
        } catch (err) {
          console.error(`Error updating product sales data: ${err.message}`);
          // Continue processing other products even if one fails
        }
      }
    } 
    
    // Always return 200 for webhooks
    res.status(200).send('Webhook processed successfully');
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Return 200 even on error to prevent PayMongo from retrying
    res.status(200).send('Webhook received with error');
  }
};