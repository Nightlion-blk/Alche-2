const { CartHeader, CartItem } = require('../models/cart');
const Orders = require('../models/order');
const Product = require('../models/product');
const Cart = require('../models/cart');
const Users = require('../models/users'); // Assuming you have a Users model
const mongoose = require('mongoose'); // Add this import at the top of your file

// Fix: Export individual functions, not nested objects
const createOrderFromCart = async (req, res) => {
  try {
    const { 
      userId,
      cartId, 
      paymentMethod = 'COD', 
      paymentStatus = 'Pending', 
      paymentReference = null,
      shippingDetails,
      billingDetails 
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
    
    // Get cart items
    const cartItems = await CartItem.find({ cartId }).populate('productId');
    if (!cartItems.length) {
      return res.status(400).json({ 
        success: false,
        message: 'Cart is empty' 
      });
    }
    
    // Create order details with proper handling for required fields
    const orderDetails = cartItems.map(item => ({
      cartItemID: item._id,
      ProductID: item.productId._id,
      ProductName: item.ProductName || item.productId.Name || item.productId.name || 'Product',
      ProductImage: item.ProductImage || 
                   (item.productId.image && item.productId.image.length > 0 ? item.productId.image[0] : 
                   (item.productId.Image?.url || 'default-product-image.jpg')),
      Quantity: item.quantity || 1,
      SubTotal: (item.productId.Price || item.productId.price) * (item.quantity || 1)
    }));
    
    // Calculate total
    const totalAmount = orderDetails.reduce((sum, item) => sum + item.SubTotal, 0);
    
    // Generate OrderID
    const orderId = "ORD_" + Date.now();
    console.log('Generated Order ID:', orderId);
    console.log('Cart ID:', cartId);
    console.log('User ID:', userId);
    console.log('Payment Method:', paymentMethod);
    console.log('CheckoutID:', cartHeader.checkoutId);
    // Create the order
    const newOrder = new Orders({
      OrderID: orderId,
      cartHeaderID: cartId,
      accID: userId,
      CheckoutID: new mongoose.Types.ObjectId(), // Replace with suggested code change
      OrderDate: new Date(),
      TotalAmount: totalAmount,
      OrderDetails: orderDetails,
      Status: 'Pending',
      
      customerEmail: user.e_Mail || '', // Get from billing details
      
      customerName: {
        Fullname: user.fullName || user.username // Get from user or fallback
      },


      
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
        EstimatedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    
    // Save the order
    const savedOrder = await newOrder.save();
    
    // Update cart status - use 'ordered' for COD, keep as 'checkout' for online payment
    cartHeader.status = 'checkout';
    
    // If online payment, store checkout reference
    if (paymentReference && paymentMethod === 'Online Payment') {
      cartHeader.checkoutId = paymentReference;
    }
    
    cartHeader.updated_at = new Date();
    await cartHeader.save();
    
    // For both COD and online payments, update sales data
    for (const item of cartItems) {
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
    
    return res.status(201).json({
      success: true,
      message: 'Order created successfully',
      orderId: savedOrder.OrderID
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

const updateOrderPaymentStatus = async (req, res) => {
  try {
    const { 
      orderId, 
      checkoutId, 
      status, // This comes from frontend as 'status'
      orderStatus // This is still orderStatus
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
    
    // Valid order status values
    const validOrderStatuses = ['Pending', 'Shipped', 'Delivered', 'Returned', 'Canceled', 'Refunded', 'Completed', 'Baking'];
    
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
    }
    
    if (checkoutId) {
      order.Payment.PaymentReference = checkoutId;
    }
    
    await order.save();
    
    // Update product stock for online payments that are marked as paid
    if (status === 'Paid') {
      const cartItems = await CartItem.find({ cartId: order.cartHeaderID }).populate('productId');
      
      for (const item of cartItems) {
        const product = await Product.findById(item.productId._id);
        if (product) {
          product.StockQuantity = Math.max(0, product.StockQuantity - item.quantity);
          await product.save();
        }
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'Order status and payment status updated',
      orderId: order.OrderID,
      status: order.Status,
      paymentStatus: order.Payment.PaymentStatus
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

    // Find the order with proper field selection
    const order = await Orders.findOne(query)
      .populate({
        path: 'OrderDetails.ProductID',
        select: 'Name name Price price Image image Description description' // Handle mixed case fields
      })
      .populate('accID', 'username e_Mail fullName')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Process images with better error handling
    const orderDetails = order.OrderDetails.map(item => {
      // Default image
      let productImage = 'default-product-image.jpg';
      
      // Try to get image from all possible locations with proper error handling
      if (item.ProductImage) {
        productImage = item.ProductImage;
      } else if (item.ProductID) {
        // Check for Image (uppercase) array format
        if (item.ProductID.Image && Array.isArray(item.ProductID.Image) && item.ProductID.Image.length > 0) {
          productImage = item.ProductID.Image[0].url || item.ProductID.Image[0];
        } 
        // Check for image (lowercase) array format
        else if (item.ProductID.image && Array.isArray(item.ProductID.image) && item.ProductID.image.length > 0) {
          productImage = item.ProductID.image[0].url || item.ProductID.image[0];
        }
        // Check for direct image/Image string
        else if (typeof item.ProductID.Image === 'string') {
          productImage = item.ProductID.Image;
        }
        else if (typeof item.ProductID.image === 'string') {
          productImage = item.ProductID.image;
        }
      }

      return {
        ...item,
        ProductImage: productImage,
        // Ensure consistent product name and price
        ProductName: item.ProductName || item.ProductID?.Name || item.ProductID?.name || 'Unknown Product',
        Price: item.ProductID?.Price || item.ProductID?.price || 0
      };
    });

    // Format response with consistent casing
    const formattedOrder = {
      ...order,
      OrderDetails: orderDetails,
      customer: {
        id: order.accID?._id,
        name: order.accID?.username || order.accID?.fullName || 'Unknown',
        email: order.accID?.e_Mail || ''
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
const getUserOrders = async (req, res) => {
  try {
    const userId = req.params.UserID; // Assuming user is authenticated
    
    console.log('User ID:', userId);

    const orders = await Orders.find({ accID: userId })
      .sort({ OrderDate: -1 }) // Most recent orders first
      .populate({
        path: 'OrderDetails.ProductID',
        select: 'name Name price Price image Image description Description' // Include all case variations
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
      // Get first product image for the order preview
      const firstProduct = order.OrderDetails[0]?.ProductID;
      
      // More robust image handling
      let productImage = 'default-product-image.jpg';
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
      
      return {
        _id: order._id,
        orderNumber: order.OrderID,
        totalAmount: order.TotalAmount,
        status: order.Status,
        createdAt: order.OrderDate,
        payment: {
          method: order.Payment?.PaymentMethod || 'Unknown',
          status: order.Payment?.PaymentStatus || 'Unknown',
          reference: order.Payment?.PaymentReference || ''
        },
        delivery: {
          status: order.Delivery?.ShippingStatus || 'Unknown',
          address: order.Delivery?.ShippingAddress || {},
          estimatedDelivery: order.Delivery?.EstimatedDeliveryDate || null
        },
        items: order.OrderDetails.map(item => {
          // Per-item image handling
          let itemImage
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
            description: item.ProductID?.Description || item.ProductID?.description || ''
          };
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
const getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Get filter parameters
    const status = req.query.status;
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    
    // Build filter object
    const filter = {};
    if (status) filter.Status = status;
    if (startDate || endDate) {
      filter.OrderDate = {};
      if (startDate) filter.OrderDate.$gte = startDate;
      if (endDate) filter.OrderDate.$lte = endDate;
    }
    
    // Count total matching orders for pagination
    const totalOrders = await Orders.countDocuments(filter);
    
    // Fetch orders with pagination, sorting and filtering
    const orders = await Orders.find(filter)
      .sort({ OrderDate: -1 }) // Most recent first
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'OrderDetails.ProductID',
        select: 'Name name Price price Image image description Description' // Handle both cases
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
      const firstProduct = order.OrderDetails[0]?.ProductID;
      
      // More robust image handling
      let productImage = 'default-product-image.jpg';
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
      
      return {
        _id: order._id,
        checkoutId: order.CheckoutID,
        orderNumber: order.OrderID,
        totalAmount: order.TotalAmount,
        status: order.Status,
        createdAt: order.OrderDate,
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
          estimatedDelivery: order.Delivery?.EstimatedDeliveryDate || null
        },
        items: order.OrderDetails.map(item => {
          // Per-item image handling
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
            description: item.ProductID?.Description || item.ProductID?.description || ''
          };
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

module.exports = {
  getUserOrders,
  createOrderFromCart,
  updateOrderPaymentStatus,
  getAllOrders,  // Add this to exports
  getOrderById
};