const mongoose = require('mongoose');
const { CartHeader, CartItem } = require('../models/cart');
const Orders = require('../models/order');
const Products = require('../models/product'); // Note: match the actual model name (Products vs Product)
const CakeDesign = require('../models/cakeDesign'); // Add this for cake designs

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
      const cartItems = await CartItem.find({ cartId })
        .populate('productId')
        .populate('cakeDesignId');
      
      // Extract payment details
      const paymentMethod = checkoutAttrs.payment_method_used || 'unknown';
      let mappedPaymentMethod = 'COD'; // Default to COD
      if (paymentMethod === 'paymaya') mappedPaymentMethod = 'Maya';
      if (paymentMethod === 'gcash') mappedPaymentMethod = 'Gcash';
      if (paymentMethod === 'grab_pay') mappedPaymentMethod = 'GrabPay';
      if (paymentMethod === 'card') mappedPaymentMethod = 'Credit Card';
      
      // Extract line items for order details
      const lineItems = checkoutAttrs.line_items || [];
      
      // Extract billing/shipping info - Add these two lines to fix the error
      const billing = checkoutAttrs.billing || {};
      const shipping = checkoutAttrs.shipping || billing; // Fallback to billing if shipping is not available
      
      // Create order details
      const orderDetails = [];
      
      // Process each cart item (instead of PayMongo line items)
      for (const cartItem of cartItems) {
        let productName = 'Unknown Product';
        let productImage = 'default-product-image.jpg';
        let productId = null;
        let itemDescription = '';
        
        if (cartItem.itemType === 'product' && cartItem.productId) {
          // Handle regular product
          productName = cartItem.productId.Name || cartItem.ProductName || 'Product';
          productId = cartItem.productId._id;
          itemDescription = cartItem.productId.Description || '';
          
          // Get product image
          if (cartItem.productId.Image && 
              Array.isArray(cartItem.productId.Image) && 
              cartItem.productId.Image.length > 0) {
            productImage = cartItem.productId.Image[0].url || cartItem.productId.Image[0];
          } else if (cartItem.productId.image) {
            productImage = cartItem.productId.image;
          } else if (cartItem.ProductImage) {
            productImage = cartItem.ProductImage;
          }
          
        } else if (cartItem.itemType === 'cake_design' && cartItem.cakeDesignId) {
          // Handle cake design
          productName = cartItem.cakeDesignId.name || 'Custom Cake Design';
          productId = cartItem.cakeDesignId._id;
          itemDescription = cartItem.cakeDesignId.description || 'Custom cake design';
          
          // Get cake design preview image
          if (cartItem.cakeDesignId.previewImage) {
            productImage = cartItem.cakeDesignId.previewImage;
          } else if (cartItem.ProductImage) {
            productImage = cartItem.ProductImage;
          }
        }
        
        // Create order detail entry
        orderDetails.push({
          cartItemID: cartItem._id,
          ProductID: productId || new mongoose.Types.ObjectId(),
          ProductName: productName,
          Quantity: cartItem.quantity || 1,
          SubTotal: (cartItem.price || 0) * (cartItem.quantity || 1),
          ProductImage: productImage,
          Description: itemDescription,
          itemType: cartItem.itemType, // Store item type to identify cake designs
          
          // Add these conditional fields based on item type
          ...(cartItem.itemType === 'cake_design' ? {
            cakeDesignID: cartItem.cakeDesignId  // Add the required field for cake designs
          } : {})
        });
      }
      
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
      
      // After the order is created and saved successfully
      await newOrder.save();
      console.log(`✅ Created new order: ${newOrder.OrderID}`);
      
      // Enhanced cart cleanup - make sure it always runs
      let cartDeleted = false;
      
      try {
        // First verify the cart exists
        const cartExists = await CartHeader.findOne({ cartId: cartHeader.cartId });
        if (!cartExists) {
          console.log(`⚠️ Cart ${cartHeader.cartId} already deleted or not found`);
          cartDeleted = true;
        } else {
          // First delete all cart items associated with this cart
          const deletedItems = await CartItem.deleteMany({ cartId: cartHeader.cartId });
          console.log(`✅ Deleted ${deletedItems.deletedCount} cart items for cart: ${cartHeader.cartId}`);
          
          // Then delete the cart header
          const deletedHeader = await CartHeader.deleteOne({ cartId: cartHeader.cartId });
          console.log(`✅ Deleted cart header for cart: ${cartHeader.cartId} (${deletedHeader.deletedCount} records)`);
          
          cartDeleted = deletedHeader.deletedCount > 0;
        }
      } catch (deleteError) {
        console.error('Error deleting cart data:', deleteError);
        // We'll handle the fallback below
      }
      
      // If deletion failed, update the cart status instead
      if (!cartDeleted) {
        try {
          const cartToUpdate = await CartHeader.findOne({ cartId: cartHeader.cartId });
          if (cartToUpdate) {
            cartToUpdate.status = 'completed';
            cartToUpdate.updated_at = new Date();
            await cartToUpdate.save();
            console.log(`⚠️ Could not delete cart, updated status to completed instead`);
          }
        } catch (updateError) {
          console.error('Failed to update cart status as fallback:', updateError);
        }
      }
      
      // Update product sales data and inventory
      for (const detail of orderDetails) {
        try {
          // Find product by ID
          const productId = detail.ProductID;
          if (!mongoose.Types.ObjectId.isValid(productId)) continue;
          
          const product = await Products.findById(productId);
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