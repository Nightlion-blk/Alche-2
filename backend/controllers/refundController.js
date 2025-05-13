const axios = require('axios');
const Orders = require('../models/order');
require('dotenv').config();

// Get PayMongo API keys from environment variables
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const BASE_URL = 'https://api.paymongo.com/v1';

// Create Basic auth header
const authHeader = {
  Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET_KEY).toString('base64')}`
};

/**
 * Process a refund for an order
 */
exports.processRefund = async (req, res) => {
  try {
    const { orderId, reason, amount } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }
    
    // Find the order in database
    const order = await Orders.findOne({ OrderID: orderId });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // Verify the order has been paid
    if (order.Payment.PaymentStatus !== 'Paid') {
      return res.status(400).json({
        success: false,
        message: 'Cannot refund an unpaid order'
      });
    }
    
    // Get the payment ID from the order
    const paymentId = order.Payment.PaymentID;
    
    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: 'No payment ID found for this order'
      });
    }
    
    // Calculate refund amount if not provided
    const refundAmount = amount || order.TotalAmount;
    
    // Create refund in PayMongo
    const refundResponse = await axios.post(
      `${BASE_URL}/refunds`,
      {
        data: {
          attributes: {
            amount: Math.round(refundAmount * 100), // Convert to cents
            payment_id: paymentId,
            reason: reason || 'Requested by customer',
            metadata: {
              order_id: orderId
            }
          }
        }
      },
      {
        headers: {
          ...authHeader,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Update order in database
    order.Status = 'Refunded';
    order.Payment.PaymentStatus = 'Refunded';
    order.Payment.RefundDate = new Date();
    order.Payment.RefundAmount = refundAmount;
    order.Payment.RefundReason = reason || 'Requested by customer';
    order.Payment.RefundReference = refundResponse.data.data.id;
    
    await order.save();
    
    return res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      refund: refundResponse.data.data,
      order: {
        orderId: order.OrderID,
        status: order.Status,
        refundAmount: order.Payment.RefundAmount,
        refundDate: order.Payment.RefundDate
      }
    });
    
  } catch (error) {
    console.error('Refund error:', error.response?.data || error.message);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: 'Failed to process refund',
      error: error.response?.data?.errors?.[0]?.detail || error.message
    });
  }
};

/**
 * Get refund details
 */
exports.getRefundDetails = async (req, res) => {
  try {
    const { refundId } = req.params;
    
    if (!refundId) {
      return res.status(400).json({
        success: false,
        message: 'Refund ID is required'
      });
    }
    
    // Get refund details from PayMongo
    const refundResponse = await axios.get(
      `${BASE_URL}/refunds/${refundId}`,
      { headers: authHeader }
    );
    
    return res.status(200).json({
      success: true,
      refund: refundResponse.data.data
    });
    
  } catch (error) {
    console.error('Get refund error:', error.response?.data || error.message);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: 'Failed to get refund details',
      error: error.response?.data?.errors?.[0]?.detail || error.message
    });
  }
};

/**
 * List all refunds for an order
 */
exports.getOrderRefunds = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }
    
    // Find the order in database
    const order = await Orders.findOne({ OrderID: orderId });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // If the order has a refund reference, get details from PayMongo
    if (order.Payment.RefundReference) {
      const refundResponse = await axios.get(
        `${BASE_URL}/refunds/${order.Payment.RefundReference}`,
        { headers: authHeader }
      );
      
      return res.status(200).json({
        success: true,
        order: {
          orderId: order.OrderID,
          status: order.Status,
          refundAmount: order.Payment.RefundAmount,
          refundDate: order.Payment.RefundDate
        },
        refund: refundResponse.data.data
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'No refunds found for this order',
      order: {
        orderId: order.OrderID,
        status: order.Status
      }
    });
    
  } catch (error) {
    console.error('Get order refunds error:', error.response?.data || error.message);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: 'Failed to get order refunds',
      error: error.response?.data?.errors?.[0]?.detail || error.message
    });
  }
};