const express = require('express');
const router = express.Router(); // Changed from webhookRoute
const webhookController = require('../controllers/webhookController');

router.post('/paymongo', webhookController.handlePayMongoWebhook);

module.exports = router; // Changed from webhookRoute
