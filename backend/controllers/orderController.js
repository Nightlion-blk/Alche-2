const { CartHeader, CartItem } = require('../models/cart');
const Orders = require('../models/order');
const Product = require('../models/product');
const CakeDesign = require('../models/cakeDesign');
const Users = require('../models/users');
const mongoose = require('mongoose');

// Create order from cart
const createOrderFromCart = async (req, res) => {
  try {
    const { 
      userId,
      cartId, 
      paymentMethod = 'COD', 
      paymentStatus = 'Pending', 
      paymentReference = null,
      shippingDetails,
      billingDetails,
      deliveryNotes = ''  // Add support for delivery notes
    } = req.body;
   
    const user = await Users.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!cartId || !shippingDetails) {
      return res.status(400).json({ 
        success: false,
        message: 'Cart ID and shipping details are required' 
      });
    }

    // Find cart and validate ownership
    const cartHeader = await CartHeader.findOne({ cartId, accID: userId });
    if (!cartHeader) {
      return res.status(404).json({ 
        success: false,
        message: 'Cart not found or does not belong to user' 
      });
    }
    
    // Check if order already exists for this cart
    const existingOrder = await Orders.findOne({ cartHeaderID: cartId });
    if (existingOrder) {
      return res.status(200).json({
        success: true,
        message: 'Order already exists for this cart',
        orderId: existingOrder.OrderID
      });
    }
    
    // Get cart items - populate both product and cake design references
    const cartItems = await CartItem.find({ cartId })
      .populate('productId')
      .populate('cakeDesignId');
      
    if (!cartItems.length) {
      return res.status(400).json({ 
        success: false,
        message: 'Cart is empty' 
      });
    }
    
    // Create order details with proper handling for different item types
    const orderDetails = cartItems.map(item => {
      // Common fields for both item types
      const baseItem = {
        cartItemID: item._id,
        Quantity: item.quantity || 1,
        itemType: item.itemType || 'product'
      };
      
      // Handle product items
      if (item.itemType === 'product' && item.productId) {
        return {
          ...baseItem,
          ProductID: item.productId._id,
          ProductName: item.ProductName || item.productId.Name || item.productId.name || 'Product',
          ProductImage: item.ProductImage || 
                      (item.productId.image && item.productId.image.length > 0 ? item.productId.image[0] : 
                      (item.productId.Image?.url || 'default-product-image.jpg')),
          SubTotal: (item.productId.Price || item.productId.price || item.price) * (item.quantity || 1)
        };
      } 
      // Handle cake design items
      else if (item.itemType === 'cake_design' && item.cakeDesignId) {
        return {
          ...baseItem,
          cakeDesignID: item.cakeDesignId._id,
          ProductName: item.ProductName || `Custom Cake: ${item.cakeDesignId.name || 'Untitled Design'}`,
          // Use preview image if available
          ProductImage: item.ProductImage || 
                     (item.cakeDesignId.previewImage || 'default-cake-image.jpg'),
          SubTotal: item.price * (item.quantity || 1),
          cakeOptions: item.cakeOptions || {},
          // Store design snapshot to preserve the design at time of order
          designSnapshot: {
            name: item.cakeDesignId.name,
            description: item.cakeDesignId.description,
            previewImage: item.cakeDesignId.previewImage,
            cakeModel: item.cakeDesignId.cakeModel,
            elements: item.cakeDesignId.elements,
            message: item.cakeDesignId.message,
            messageColor: item.cakeDesignId.messageColor,
            messageFont: item.cakeDesignId.messageFont
          }
        };
      }
      // Fallback for any other item types
      else {
        return {
          ...baseItem,
          ProductName: item.ProductName || 'Unknown Item',
          ProductImage: item.ProductImage || 'default-product-image.jpg',
          SubTotal: item.price * (item.quantity || 1)
        };
      }
    });
    
    // Calculate total
    const totalAmount = orderDetails.reduce((sum, item) => sum + item.SubTotal, 0);
    
    // The schema now has a pre-save hook that automatically calculates these
    // But we still set them for clarity and in case the hook isn't triggered
    const hasCustomCakes = orderDetails.some(item => item.itemType === 'cake_design');
    const customCakeCount = orderDetails.filter(item => item.itemType === 'cake_design').length;
    
    // Generate OrderID
    const orderId = "ORD_" + Date.now();
    console.log('Generated Order ID:', orderId);
    console.log('Cart ID:', cartId);
    console.log('User ID:', userId);
    console.log('Payment Method:', paymentMethod);
    console.log('CheckoutID:', cartHeader.checkoutId);
    console.log('Has custom cakes:', hasCustomCakes ? 'Yes' : 'No');
    
    // Create the order
    const newOrder = new Orders({
      OrderID: orderId,
      cartHeaderID: cartId,
      accID: userId,
      CheckoutID: cartHeader.checkoutId || new mongoose.Types.ObjectId(), // Use existing checkoutId if available
      OrderDate: new Date(),
      TotalAmount: totalAmount,
      OrderDetails: orderDetails,
      // Set initial status - use 'Baking' for orders with custom cakes
      Status: hasCustomCakes ? 'Baking' : 'Pending',
      
      customerEmail: shippingDetails.email || user.e_Mail || '',
      
      customerName: {
        Fullname: shippingDetails.fullName || user.fullName || user.username || 'Unknown'
      },
      
      customerContact: shippingDetails.phone || user.phone || '',
      
      // Add cake design tracking flags - these will be recalculated by pre-save hook
      hasCustomCakes,
      customCakeCount,
      
      Payment: {
        PaymentMethod: paymentMethod,
        PaymentStatus: paymentStatus,
        PaymentDate: new Date(),
        PaymentReference: paymentReference || `order_${Date.now()}`
      },

      Delivery: {
        ShippingAddress: {
          street: shippingDetails.address || '',
          city: shippingDetails.city || '',
          state: shippingDetails.state || '',
          postalCode: shippingDetails.postalCode || '',
          country: shippingDetails.country || 'PH'
        },
        ShippingStatus: 'Pending',
        EstimatedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        DeliveryNotes: deliveryNotes // Add delivery notes to the order
      }
    });
    
    // Save the order
    const savedOrder = await newOrder.save();
    
    // Update cart status - use 'ordered' for COD, keep as 'checkout' for online payment
    cartHeader.status = paymentMethod === 'COD' ? 'completed' : 'checkout';
    
    // If online payment, store checkout reference
    if (paymentReference && paymentMethod !== 'COD') {
      cartHeader.checkoutId = paymentReference;
    }
    
    cartHeader.updated_at = new Date();
    await cartHeader.save();
    
    // Update sales data and manage inventory
    for (const item of cartItems) {
      // Only update product inventory for regular products (not cake designs)
      if (item.itemType === 'product' && item.productId) {
        const product = await Product.findById(item.productId._id);
        if (product) {
          // Update stock quantity for COD orders
          if (paymentMethod === 'COD') {
            product.StockQuantity = Math.max(0, product.StockQuantity - item.quantity);
          }
          
          // Update sales data
          const quantity = item.quantity || 1;
          
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
          
          // Increment total sold count
          product.salesData.totalSold += quantity;
          
          // Check if sale happened within the last month
          const oneMonthAgo = new Date();
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
          if (new Date() >= oneMonthAgo) {
            product.salesData.lastMonthSold += quantity;
          }
          
          // Check if sale happened within the last week
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
          if (new Date() >= oneWeekAgo) {
            product.salesData.lastWeekSold += quantity;
          }
          
          // Save the updated product
          await product.save();
        }
      }
      // For cake designs - track popularity if needed
      else if (item.itemType === 'cake_design' && item.cakeDesignId) {
        // Optional: If you implement popularity tracking for cake designs
        // const cakeDesign = await CakeDesign.findById(item.cakeDesignId._id);
        // if (cakeDesign) {
        //   // Update popularity metrics
        //   await cakeDesign.save();
        // }
      }
    }
    
    return res.status(201).json({
      success: true,
      message: 'Order created successfully',
      orderId: savedOrder.OrderID,
      status: savedOrder.Status, // Include the status in the response
      hasCustomCakes: savedOrder.hasCustomCakes // Include this flag for the frontend
    });
  } catch (error) {
    console.error('Error creating order from cart:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to create order',
      error: error.message 
    });
  }
};

// Update order status and payment information
const updateOrderPaymentStatus = async (req, res) => {
  try {
    const { 
      orderId, 
      checkoutId, 
      status, // This comes from frontend as payment status
      orderStatus, // Order status
      trackingNumber, // Add tracking number
      deliveryNotes // Add delivery notes
    } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }
    
    const order = await Orders.findOne({ OrderID: orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // Valid order status values (from schema)
    const validOrderStatuses = ['Pending', 'Processing', 'Baking', 'Shipped', 'Delivered', 'Canceled', 'Completed'];
    
    // Update order status if provided and valid
    if (orderStatus) {
      if (validOrderStatuses.includes(orderStatus)) {
        order.Status = orderStatus;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid order status value'
        });
      }
    }

    // Update payment info - use 'status' from frontend as paymentStatus
    if (status) {
      order.Payment.PaymentStatus = status;
      // Update payment date if status is changing to Paid
      if (status === 'Paid') {
        order.Payment.PaymentDate = new Date();
      }
    }
    
    if (checkoutId) {
      order.Payment.PaymentReference = checkoutId;
    }

    // Update tracking number and delivery notes if provided
    if (trackingNumber) {
      order.Delivery.TrackingNumber = trackingNumber;
    }

    if (deliveryNotes) {
      order.Delivery.DeliveryNotes = deliveryNotes;
    }
    
    // Update shipping status if order status is related to shipping
    if (orderStatus === 'Shipped') {
      order.Delivery.ShippingStatus = 'Shipped';
    } else if (orderStatus === 'Delivered' || orderStatus === 'Completed') {
      order.Delivery.ShippingStatus = 'Delivered';
    } else if (orderStatus === 'Canceled') {
      order.Delivery.ShippingStatus = 'Canceled';
    }
    
    await order.save();
    
    // Only update product stock for online payments that are marked as paid
    // And only for regular products (not cake designs)
    if (status === 'Paid') {
      const cartItems = await CartItem.find({ cartId: order.cartHeaderID })
        .populate('productId')
        .populate('cakeDesignId');
      
      for (const item of cartItems) {
        // Only update inventory for regular products
        if (item.itemType === 'product' && item.productId) {
          const product = await Product.findById(item.productId._id);
          if (product) {
            product.StockQuantity = Math.max(0, product.StockQuantity - item.quantity);
            await product.save();
          }
        }
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'Order status and payment status updated',
      orderId: order.OrderID,
      status: order.Status,
      paymentStatus: order.Payment.PaymentStatus,
      deliveryStatus: order.Delivery.ShippingStatus,
      trackingNumber: order.Delivery.TrackingNumber
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update order status',
      error: error.message
    });
  }
};

// Get order by ID
const getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    // Check if orderId is a valid MongoDB ObjectId
    const isValidObjectId = mongoose.Types.ObjectId.isValid(orderId);
    
    // Create the appropriate query based on the ID format
    const query = isValidObjectId 
      ? { _id: orderId } 
      : { OrderID: orderId };

    // Find the order with proper field selection and populate both products and cake designs
    const order = await Orders.findOne(query)
      .populate({
        path: 'OrderDetails.ProductID',
        select: 'Name name Price price Image image Description description' 
      })
      .populate({
        path: 'OrderDetails.cakeDesignID',
        select: 'name description previewImage cakeModel elements message messageColor messageFont'
      })
      .populate('accID', 'username e_Mail fullName')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Process item details with better error handling
    const orderDetails = order.OrderDetails.map(item => {
      // Default image
      let productImage = 'default-product-image.jpg';
      let itemName = 'Unknown Item';
      let itemPrice = 0;
      let itemDescription = '';
      
      // Handle different item types
      if (item.itemType === 'product' && item.ProductID) {
        // Handle regular product images
        if (item.ProductImage) {
          productImage = item.ProductImage;
        } else if (item.ProductID) {
          if (item.ProductID.Image && Array.isArray(item.ProductID.Image) && item.ProductID.Image.length > 0) {
            productImage = item.ProductID.Image[0].url || item.ProductID.Image[0];
          } else if (item.ProductID.image && Array.isArray(item.ProductID.image) && item.ProductID.image.length > 0) {
            productImage = item.ProductID.image[0].url || item.ProductID.image[0];
          } else if (typeof item.ProductID.Image === 'string') {
            productImage = item.ProductID.Image;
          } else if (typeof item.ProductID.image === 'string') {
            productImage = item.ProductID.image;
          }
        }
        
        itemName = item.ProductName || item.ProductID?.Name || item.ProductID?.name || 'Unknown Product';
        itemPrice = item.ProductID?.Price || item.ProductID?.price || 0;
        itemDescription = item.ProductID?.Description || item.ProductID?.description || '';
      } 
      // Handle cake design items
      else if (item.itemType === 'cake_design' && (item.cakeDesignID || item.designSnapshot)) {
        // Try to get image from the cake design or its snapshot
        if (item.ProductImage) {
          productImage = item.ProductImage;
        } else if (item.designSnapshot && item.designSnapshot.previewImage) {
          productImage = item.designSnapshot.previewImage;
        } else if (item.cakeDesignID && item.cakeDesignID.previewImage) {
          productImage = item.cakeDesignID.previewImage;
        }
        
        // Use the name from the cake design
        itemName = item.ProductName || 
                  (item.designSnapshot?.name ? `Custom Cake: ${item.designSnapshot.name}` : null) ||
                  (item.cakeDesignID?.name ? `Custom Cake: ${item.cakeDesignID.name}` : 'Custom Cake');
        
        // Use the description from the cake design
        itemDescription = item.designSnapshot?.description || item.cakeDesignID?.description || 'Custom cake design';
        
        // Use the price from the order item
        itemPrice = item.SubTotal / (item.Quantity || 1);
      }

      return {
        ...item,
        ProductImage: productImage,
        ProductName: itemName,
        Price: itemPrice,
        description: itemDescription,
        // Include the item type
        itemType: item.itemType || 'product'
      };
    });

    // Format response with consistent casing
    const formattedOrder = {
      ...order,
      OrderDetails: orderDetails,
      hasCustomCakes: order.hasCustomCakes || orderDetails.some(item => item.itemType === 'cake_design'),
      customCakeCount: order.customCakeCount || orderDetails.filter(item => item.itemType === 'cake_design').length,
      customer: {
        id: order.accID?._id,
        name: order.accID?.username || order.accID?.fullName || 'Unknown',
        email: order.accID?.e_Mail || ''
      },
      tracking: {
        number: order.Delivery.TrackingNumber || '',
        notes: order.Delivery.DeliveryNotes || ''
      }
    };

    return res.status(200).json({
      success: true,
      order: formattedOrder
    });
    
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching order details', 
      error: error.message 
    });
  }
};

// Get user orders
const getUserOrders = async (req, res) => {
  try {
    const userId = req.params.UserID; // Assuming user is authenticated
    
    console.log('User ID:', userId);

    const orders = await Orders.find({ accID: userId })
      .sort({ OrderDate: -1 }) // Most recent orders first
      .populate({
        path: 'OrderDetails.ProductID',
        select: 'name Name price Price image Image description Description'
      })
      .populate({
        path: 'OrderDetails.cakeDesignID',
        select: 'name description previewImage'
      })
      .populate('accID', 'username e_Mail fullName')
      .lean(); // Convert to plain JS object for better performance
    
    if (!orders || orders.length === 0) {
      return res.status(200).json({ 
        success: true,
        message: "No orders found", 
        orders: [] // Return empty array in orders property
      });
    }

    // Format orders for the frontend
    const formattedOrders = orders.map(order => {
      // Get representative image for order preview - prioritize cake designs
      let productImage = 'default-product-image.jpg';
      
      // Try to find a cake design first (if any) for the preview image
      const firstCakeDesign = order.OrderDetails.find(item => item.itemType === 'cake_design');
      
      if (firstCakeDesign) {
        // Use cake design image for the order preview
        if (firstCakeDesign.ProductImage) {
          productImage = firstCakeDesign.ProductImage;
        } else if (firstCakeDesign.designSnapshot && firstCakeDesign.designSnapshot.previewImage) {
          productImage = firstCakeDesign.designSnapshot.previewImage;
        } else if (firstCakeDesign.cakeDesignID && firstCakeDesign.cakeDesignID.previewImage) {
          productImage = firstCakeDesign.cakeDesignID.previewImage;
        }
      } else {
        // Fall back to regular product image
        const firstProduct = order.OrderDetails[0]?.ProductID;
        if (firstProduct) {
          if (firstProduct.Image && Array.isArray(firstProduct.Image) && firstProduct.Image.length > 0) {
            productImage = firstProduct.Image[0].url || firstProduct.Image[0];
          } else if (firstProduct.image && Array.isArray(firstProduct.image) && firstProduct.image.length > 0) {
            productImage = firstProduct.image[0].url || firstProduct.image[0];
          } else if (typeof firstProduct.Image === 'string') {
            productImage = firstProduct.Image;
          } else if (typeof firstProduct.image === 'string') {
            productImage = firstProduct.image;
          }
        }
      }
      
      return {
        _id: order._id,
        orderNumber: order.OrderID,
        totalAmount: order.TotalAmount,
        status: order.Status,
        createdAt: order.OrderDate,
        hasCustomCakes: order.hasCustomCakes || order.OrderDetails.some(item => item.itemType === 'cake_design'),
        customCakeCount: order.customCakeCount || order.OrderDetails.filter(item => item.itemType === 'cake_design').length,
        payment: {
          method: order.Payment?.PaymentMethod || 'Unknown',
          status: order.Payment?.PaymentStatus || 'Unknown',
          reference: order.Payment?.PaymentReference || ''
        },
        delivery: {
          status: order.Delivery?.ShippingStatus || 'Unknown',
          address: order.Delivery?.ShippingAddress || {},
          estimatedDelivery: order.Delivery?.EstimatedDeliveryDate || null,
          trackingNumber: order.Delivery?.TrackingNumber || '',
          notes: order.Delivery?.DeliveryNotes || ''
        },
        items: order.OrderDetails.map(item => {
          // Handle different item types
          if (item.itemType === 'product' && item.ProductID) {
            // Regular product item
            let itemImage;
            if (item.ProductImage) {
              itemImage = item.ProductImage;
            } else if (item.ProductID) {
              if (item.ProductID.Image && Array.isArray(item.ProductID.Image) && item.ProductID.Image.length > 0) {
                itemImage = item.ProductID.Image[0].url || item.ProductID.Image[0];
              } else if (item.ProductID.image && Array.isArray(item.ProductID.image) && item.ProductID.image.length > 0) {
                itemImage = item.ProductID.image[0].url || item.ProductID.image[0];
              } else if (typeof item.ProductID.Image === 'string') {
                itemImage = item.ProductID.Image;
              } else if (typeof item.ProductID.image === 'string') {
                itemImage = item.ProductID.image;
              }
            }
            
            return {
              productId: item.ProductID?._id || item.ProductID,
              name: item.ProductName || item.ProductID?.Name || item.ProductID?.name || 'Unknown Product',
              price: item.ProductID?.Price || item.ProductID?.price || 0,
              quantity: item.Quantity || 0,
              subTotal: item.SubTotal || 0,
              image: itemImage,
              description: item.ProductID?.Description || item.ProductID?.description || '',
              itemType: 'product'
            };
          } 
          else if (item.itemType === 'cake_design') {
            // Custom cake design item
            let itemImage;
            if (item.ProductImage) {
              itemImage = item.ProductImage;
            } else if (item.designSnapshot && item.designSnapshot.previewImage) {
              itemImage = item.designSnapshot.previewImage;
            } else if (item.cakeDesignID && item.cakeDesignID.previewImage) {
              itemImage = item.cakeDesignID.previewImage;
            } else {
              itemImage = 'default-cake-image.jpg';
            }
            
            return {
              cakeDesignId: item.cakeDesignID?._id || item.cakeDesignID,
              name: item.ProductName || 
                   (item.designSnapshot?.name ? `Custom Cake: ${item.designSnapshot.name}` : null) ||
                   (item.cakeDesignID?.name ? `Custom Cake: ${item.cakeDesignID.name}` : 'Custom Cake'),
              price: item.SubTotal / (item.Quantity || 1),
              quantity: item.Quantity || 0,
              subTotal: item.SubTotal || 0,
              image: itemImage,
              description: item.designSnapshot?.description || item.cakeDesignID?.description || 'Custom cake design',
              cakeOptions: item.cakeOptions || {},
              designSnapshot: item.designSnapshot,
              itemType: 'cake_design'
            };
          }
          else {
            // Fallback
            return {
              name: item.ProductName || 'Unknown Item',
              price: item.SubTotal / (item.Quantity || 1),
              quantity: item.Quantity || 0,
              subTotal: item.SubTotal || 0,
              image: item.ProductImage || 'default-product-image.jpg',
              itemType: item.itemType || 'unknown'
            };
          }
        }),
        previewImage: productImage
      };
    });

    // Return with the same structure as getAllOrders
    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      orders: formattedOrders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching orders', 
      error: error.message 
    });
  }
};

// Get all orders with pagination, filtering, and sorting
const getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Get filter parameters
    const status = req.query.status;
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    const hasCustomCakes = req.query.hasCustomCakes === 'true';
    const userId = req.query.userId; // Allow filtering by user ID
    const minAmount = parseFloat(req.query.minAmount) || 0;
    const paymentMethod = req.query.paymentMethod;
    const paymentStatus = req.query.paymentStatus;
    
    // Build filter object
    const filter = {};
    if (status) filter.Status = status;
    if (startDate || endDate) {
      filter.OrderDate = {};
      if (startDate) filter.OrderDate.$gte = startDate;
      if (endDate) filter.OrderDate.$lte = endDate;
    }
    if (hasCustomCakes) filter.hasCustomCakes = true;
    if (userId) filter.accID = userId;
    if (minAmount > 0) filter.TotalAmount = { $gte: minAmount };
    if (paymentMethod) filter['Payment.PaymentMethod'] = paymentMethod;
    if (paymentStatus) filter['Payment.PaymentStatus'] = paymentStatus;
    
    // Count total matching orders for pagination
    const totalOrders = await Orders.countDocuments(filter);
    
    // Fetch orders with pagination, sorting and filtering
    const orders = await Orders.find(filter)
      .sort({ OrderDate: -1 }) // Most recent first
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'OrderDetails.ProductID',
        select: 'Name name Price price Image image description Description'
      })
      .populate({
        path: 'OrderDetails.cakeDesignID',
        select: 'name description previewImage'
      })
      .populate('accID', 'username e_Mail fullName')
      .lean();
    
    if (!orders || orders.length === 0) {
      return res.status(200).json({ 
        success: true,
        message: "No orders found", 
        orders: [],
        pagination: {
          totalOrders: 0,
          totalPages: 0,
          currentPage: page,
          hasNextPage: false,
          hasPrevPage: false
        }
      });
    }

    // Format orders for the frontend
    const formattedOrders = orders.map(order => {
      // Get representative image (prefer cake designs for preview)
      let productImage = 'default-product-image.jpg';
      
      // Try to find a cake design first for the preview image
      const firstCakeDesign = order.OrderDetails.find(item => item.itemType === 'cake_design');
      
      if (firstCakeDesign) {
        // Use cake design image for the order preview
        if (firstCakeDesign.ProductImage) {
          productImage = firstCakeDesign.ProductImage;
        } else if (firstCakeDesign.designSnapshot && firstCakeDesign.designSnapshot.previewImage) {
          productImage = firstCakeDesign.designSnapshot.previewImage;
        } else if (firstCakeDesign.cakeDesignID && firstCakeDesign.cakeDesignID.previewImage) {
          productImage = firstCakeDesign.cakeDesignID.previewImage;
        }
      } else {
        // Fall back to regular product image
        const firstProduct = order.OrderDetails[0]?.ProductID;
        if (firstProduct) {
          if (firstProduct.Image && Array.isArray(firstProduct.Image) && firstProduct.Image.length > 0) {
            productImage = firstProduct.Image[0].url || firstProduct.Image[0];
          } else if (firstProduct.image && Array.isArray(firstProduct.image) && firstProduct.image.length > 0) {
            productImage = firstProduct.image[0].url || firstProduct.image[0];
          } else if (typeof firstProduct.Image === 'string') {
            productImage = firstProduct.Image;
          } else if (typeof firstProduct.image === 'string') {
            productImage = firstProduct.image;
          }
        }
      }
      
      return {
        _id: order._id,
        checkoutId: order.CheckoutID,
        orderNumber: order.OrderID,
        totalAmount: order.TotalAmount,
        status: order.Status,
        createdAt: order.OrderDate,
        hasCustomCakes: order.hasCustomCakes || order.OrderDetails.some(item => item.itemType === 'cake_design'),
        customCakeCount: order.customCakeCount || order.OrderDetails.filter(item => item.itemType === 'cake_design').length,
        customer: {
          id: order.accID?._id,
          name: order.accID?.username || order.accID?.fullName || 'Unknown',
          email: order.accID?.e_Mail || ''
        },
        payment: {
          method: order.Payment?.PaymentMethod || 'Unknown',
          status: order.Payment?.PaymentStatus || 'Unknown',
          reference: order.Payment?.PaymentReference || ''
        },
        delivery: {
          status: order.Delivery?.ShippingStatus || 'Unknown',
          address: order.Delivery?.ShippingAddress || {},
          estimatedDelivery: order.Delivery?.EstimatedDeliveryDate || null,
          trackingNumber: order.Delivery?.TrackingNumber || '',
          notes: order.Delivery?.DeliveryNotes || ''
        },
        items: order.OrderDetails.map(item => {
          if (item.itemType === 'product' && item.ProductID) {
            // Regular product item
            let itemImage;
            if (item.ProductImage) {
              itemImage = item.ProductImage;
            } else if (item.ProductID) {
              if (item.ProductID.Image && Array.isArray(item.ProductID.Image) && item.ProductID.Image.length > 0) {
                itemImage = item.ProductID.Image[0].url || item.ProductID.Image[0];
              } else if (item.ProductID.image && Array.isArray(item.ProductID.image) && item.ProductID.image.length > 0) {
                itemImage = item.ProductID.image[0].url || item.ProductID.image[0];
              } else if (typeof item.ProductID.Image === 'string') {
                itemImage = item.ProductID.Image;
              } else if (typeof item.ProductID.image === 'string') {
                itemImage = item.ProductID.image;
              }
            }
            
            return {
              productId: item.ProductID?._id || item.ProductID,
              name: item.ProductName || item.ProductID?.Name || item.ProductID?.name || 'Unknown Product',
              price: item.ProductID?.Price || item.ProductID?.price || 0,
              quantity: item.Quantity || 0,
              subTotal: item.SubTotal || 0,
              image: itemImage,
              description: item.ProductID?.Description || item.ProductID?.description || '',
              itemType: 'product'
            };
          } 
          else if (item.itemType === 'cake_design') {
            // Custom cake design item
            let itemImage;
            if (item.ProductImage) {
              itemImage = item.ProductImage;
            } else if (item.designSnapshot && item.designSnapshot.previewImage) {
              itemImage = item.designSnapshot.previewImage;
            } else if (item.cakeDesignID && item.cakeDesignID.previewImage) {
              itemImage = item.cakeDesignID.previewImage;
            } else {
              itemImage = 'default-cake-image.jpg';
            }
            
            return {
              cakeDesignId: item.cakeDesignID?._id || item.cakeDesignID,
              name: item.ProductName || 
                   (item.designSnapshot?.name ? `Custom Cake: ${item.designSnapshot.name}` : null) ||
                   (item.cakeDesignID?.name ? `Custom Cake: ${item.cakeDesignID.name}` : 'Custom Cake'),
              price: item.SubTotal / (item.Quantity || 1),
              quantity: item.Quantity || 0,
              subTotal: item.SubTotal || 0,
              image: itemImage,
              description: item.designSnapshot?.description || item.cakeDesignID?.description || 'Custom cake design',
              cakeOptions: item.cakeOptions || {},
              designSnapshot: item.designSnapshot,
              itemType: 'cake_design'
            };
          }
          else {
            // Fallback
            return {
              name: item.ProductName || 'Unknown Item',
              price: item.SubTotal / (item.Quantity || 1),
              quantity: item.Quantity || 0,
              subTotal: item.SubTotal || 0,
              image: item.ProductImage || 'default-product-image.jpg',
              itemType: item.itemType || 'unknown'
            };
          }
        }),
        previewImage: productImage
      };
    });

    // Add pagination info
    const paginationData = {
      totalOrders,
      totalPages: Math.ceil(totalOrders / limit),
      currentPage: page,
      hasNextPage: page * limit < totalOrders,
      hasPrevPage: page > 1
    };

    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      orders: formattedOrders,
      pagination: paginationData
    });
    
  } catch (error) {
    console.error('Error fetching all orders:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching orders', 
      error: error.message 
    });
  }
};

// Add a new function to update delivery information
const updateDeliveryInfo = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { 
      trackingNumber, 
      deliveryNotes,
      shippingStatus,
      estimatedDeliveryDate
    } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }
    
    const order = await Orders.findOne({ OrderID: orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // Update delivery information
    if (trackingNumber) {
      order.Delivery.TrackingNumber = trackingNumber;
    }
    
    if (deliveryNotes) {
      order.Delivery.DeliveryNotes = deliveryNotes;
    }
    
    if (shippingStatus) {
      const validShippingStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Returned', 'Canceled', 'Completed'];
      if (validShippingStatuses.includes(shippingStatus)) {
        order.Delivery.ShippingStatus = shippingStatus;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid shipping status value'
        });
      }
    }
    
    if (estimatedDeliveryDate) {
      order.Delivery.EstimatedDeliveryDate = new Date(estimatedDeliveryDate);
    }
    
    await order.save();
    
    return res.status(200).json({
      success: true,
      message: 'Delivery information updated successfully',
      orderId: order.OrderID,
      delivery: {
        status: order.Delivery.ShippingStatus,
        trackingNumber: order.Delivery.TrackingNumber,
        notes: order.Delivery.DeliveryNotes,
        estimatedDelivery: order.Delivery.EstimatedDeliveryDate
      }
    });
  } catch (error) {
    console.error('Error updating delivery information:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update delivery information',
      error: error.message
    });
  }
};

// Export all functions
module.exports = {
  getUserOrders,
  createOrderFromCart,
  updateOrderPaymentStatus,
  getAllOrders,
  getOrderById,
  updateDeliveryInfo // Export the new function
};