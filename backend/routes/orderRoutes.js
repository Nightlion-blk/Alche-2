const express = require('express');
const order = express.Router();
const { createOrderFromCart, updateOrderPaymentStatus, getUserOrders, getAllOrders, getOrderById } = require('../controllers/orderController');

const verifyToken = require('../middleware/tokens'); // Adjust path if needed
const isAdmin = require('../middleware/adminAuth'); // Adjust path if needed
// Create order from cart
order.post('/createOrder', verifyToken, createOrderFromCart);

order.get('/myorders/:UserID', verifyToken, getUserOrders);


order.get('/SpecificOrders/:orderId', verifyToken, getOrderById);

order.get('/myorders', verifyToken, getUserOrders);

order.post('/updatePayment', updateOrderPaymentStatus);

order.get('/all', verifyToken, getAllOrders);

// Export the router
module.exports = order;

