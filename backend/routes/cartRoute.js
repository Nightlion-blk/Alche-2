const express = require('express');
const cartRouter = express.Router();
const { 
       AddToCart,
       AddCakeToCart,
       GetCart,
       DeleteCart,
       UpdateCartItemQuantity,
       ClearCart,
       UpdateCartStatus
} = require('../controllers/userCart');

const verifyToken = require('../middleware/tokens');
cartRouter.post('/addToCart', verifyToken, AddToCart);

cartRouter.post('/cake-design', verifyToken, AddCakeToCart);


cartRouter.get('/getCart/:userId', verifyToken, GetCart);


cartRouter.delete('/deleteFromCart/:userId/:itemId', verifyToken, DeleteCart);

// Update cart item quantity
cartRouter.put('/updateCartItem/:userId/:itemId', verifyToken, UpdateCartItemQuantity);

// Clear all items from a user's cart
cartRouter.delete('/clearCart/:userId', verifyToken, ClearCart);

// Update cart status (for checkout process)
cartRouter.put('/updateCartStatus/:userId', verifyToken, UpdateCartStatus);

module.exports = cartRouter;