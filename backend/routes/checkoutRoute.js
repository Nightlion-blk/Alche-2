const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/CheckoutController');
const verifyToken = require('../middleware/tokens');

// These routes should NOT have /checkout prefix
router.post('/', verifyToken, checkoutController.createCheckoutSession);

//router.get('/:checkoutId', verifyToken, checkoutController.getCheckoutSession);

// Add this route before your parameter routes
//router.post('/:checkoutId/expire', verifyToken, checkoutController.expireCheckoutSession);

//router.get('/payment/success', checkoutController.handlePaymentSuccess);
//router.post('/cancel', checkoutController.cancelCheckout);
// In your routes file
//router.post('/mark-abandoning', checkoutController.markCheckoutAbandoning);
//router.post('/mark-abandoning-beacon', checkoutController.markCheckoutAbandoningBeacon);
//router.post('/recover/:cartId', checkoutController.recoverCheckout);

module.exports = router;