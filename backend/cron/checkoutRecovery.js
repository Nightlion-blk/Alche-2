const cron = require('node-cron');
const mongoose = require('mongoose');
const { CartHeader } = require('../models/cart');
const Orders = require('../models/order');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  }
});

/**
 * Recover abandoned checkouts
 * Runs every hour to find and reset stale checkout sessions
 */
const recoverAbandonedCheckouts = async () => {
  try {
    console.log('Running checkout recovery job...');
    
    // Find cart headers that have been in checkout status for more than 1 hour
    const staleTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    
    // Find carts in checkout status that haven't been updated recently
    const abandonedCarts = await CartHeader.find({
      status: 'checkout',
      updated_at: { $lt: staleTime }
    }).populate('accID', 'e_Mail fullName username'); // Get user details
    
    console.log(`Found ${abandonedCarts.length} abandoned checkout(s)`);
    
    for (const cart of abandonedCarts) {
      console.log(`Processing abandoned cart: ${cart.cartId}`);
      
      // Reset cart status to active
      cart.status = 'active';
      cart.updated_at = new Date();
      await cart.save();
      
      // Find order associated with this cart
      const order = await Orders.findOne({ cartHeaderID: cart.cartId });
      
      // If user has email, send recovery email
      if (cart.accID && cart.accID.e_Mail) {
        const userName = cart.accID.fullName || cart.accID.username || 'Valued Customer';
        
        // Send recovery email
        await transporter.sendMail({
          from: '"Forever Shop" <noreply@forever.com>',
          to: cart.accID.e_Mail,
          subject: 'Complete Your Purchase at Forever',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #d63384;">Hello ${userName},</h2>
              <p>We noticed you left some items in your cart without completing your purchase.</p>
              <p>Your cart is still saved and ready for checkout!</p>
              <div style="text-align: center; margin: 20px 0;">
                <a href="${process.env.FRONTEND_URL}/cart" style="background-color: #d63384; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  Complete Your Order
                </a>
              </div>
              <p>If you experienced any issues during checkout, please don't hesitate to contact our customer support.</p>
              <p>Thank you for shopping with Forever!</p>
            </div>
          `
        });
        
        console.log(`Recovery email sent to ${cart.accID.e_Mail}`);
      }
    }
    
    console.log('Checkout recovery job completed successfully');
  } catch (error) {
    console.error('Error in checkout recovery job:', error);
  }
};

// Schedule the job to run every hour
const startRecoveryJob = () => {
  cron.schedule('0 * * * *', recoverAbandonedCheckouts);
  console.log('Checkout recovery cron job scheduled');
};

module.exports = { startRecoveryJob, recoverAbandonedCheckouts };