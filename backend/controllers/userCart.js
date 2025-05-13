const { CartHeader, CartItem } = require('../models/cart');
const Product = require('../models/product');

/**
 * AddToCart - Adds a product to the user's cart or updates quantity if item already exists
 * 
 * @param {Object} req - Request object containing:
 *   - body.userId: ID of the user adding to cart
 *   - body.productId: ID of the product to add
 *   - body.quantity: Number of items to add
 *   - body.price: Price of the product
 * @param {Object} res - Response object
 * 
 * @returns {Object} JSON response with cart item details or error message
 */
const AddToCart = async (req, res) => {
    try {
        const { userId, productId, quantity, price } = req.body;
        
        // Find or create cart header for this user
        let cartHeader = await CartHeader.findOne({ 
            accID: userId, 
            status: 'active' 
        });
        
        // If user doesn't have an active cart, create one
        if (!cartHeader) {
            cartHeader = new CartHeader({
                accID: userId,
                status: 'active',
                created_at: Date.now()
            });
            await cartHeader.save();
        }
        
        // Get product details for required fields
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        
        // Check if the product already exists in the cart
        let cartItem = await CartItem.findOne({ 
            cartId: cartHeader.cartId, 
            productId: productId 
        });
        
        // Get the product image URL from the Image array
        let productImageUrl = 'default-product-image.jpg';
        if (product.Image && Array.isArray(product.Image) && product.Image.length > 0) {
            productImageUrl = product.Image[0].url;
        }
        
        if (cartItem) {
            // Update quantity if item exists
            cartItem.quantity = quantity;
            // Update price in case it changed
            cartItem.price = price;
            await cartItem.save();
        } else {
            // Create new cart item with ALL required fields
            cartItem = new CartItem({
                cartId: cartHeader.cartId,
                productId,
                ProductName: product.Name || product.name, // Add required field
                ProductImage: productImageUrl, // Use the image URL from the array
                quantity,
                price
            });
            await cartItem.save();
        }
        
        res.status(200).json({ 
            success: true, 
            message: 'Item added to cart successfully',
            cartItem 
        });
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to add item to cart', 
            error: error.message 
        });
    }
};

/**
 * GetCart - Retrieves a user's active cart with all items and product details
 * 
 * @param {Object} req - Request object containing:
 *   - params.userId: ID of the user whose cart to retrieve
 * @param {Object} res - Response object
 * 
 * @returns {Object} JSON with cart header info and populated cart items or error message
 */
const GetCart = async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Validate user ID is provided
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // Find user's active cart header
        const cartHeader = await CartHeader.findOne({ 
            accID: userId,
            status: 'active'
        });

        console.log('Cart Header:', cartHeader);

        // Return 404 if no active cart exists
        if (!cartHeader) {
            return res.status(404).json({
                success: false,
                message: 'No active cart found for this user'
            });
        }
     
        console.log('Cart ID:', cartHeader.cartId);
        
        // Get cart items with populated product details
        const cartItems = await CartItem.find({ 
            cartId: cartHeader.cartId
        }).populate('productId'); // Populate replaces product ID with full product object
        
        // Return message if cart exists but is empty
        if (cartItems.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Cart is empty' 
            });
        }
        
        // Return cart data with all items
        res.status(200).json({
            success: true,
            cartId: cartHeader.cartId,
            status: cartHeader.status,
            items: cartItems
        });
        
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch cart',
            error: error.message
        });
    }
};

/**
 * DeleteCart - Removes a specific item from a user's cart
 * 
 * @param {Object} req - Request object containing:
 *   - params.userId: ID of the user
 *   - params.itemId: ID of the cart item to delete
 *   - body.cartId: ID of the cart (optional verification)
 * @param {Object} res - Response object
 * 
 * @returns {Object} Success message or error
 */
const DeleteCart = async (req, res) => {
    try {
        const { userId, itemId } = req.params;
        const { cartId } = req.body;
        
        console.log(`Attempting to delete item ${itemId} from cart ${cartId}`);
        
        // First check if the item exists
        const cartItem = await CartItem.findById(itemId);
        
        // If item doesn't exist, return success anyway 
        // (since the end goal - item not in cart - is achieved)
        if (!cartItem) {
            console.log(`Item ${itemId} not found, but treating as success`);
            return res.status(200).json({
                success: true,
                message: "Item already removed from cart"
            });
        }
        
        // Delete the item if it exists
        await CartItem.findByIdAndDelete(itemId);
        
        return res.status(200).json({
            success: true,
            message: "Item removed from cart"
        });
        
    } catch (error) {
        console.error("Error deleting cart item:", error);
        return res.status(500).json({
            success: false,
            message: "Server error while deleting item"
        });
    }
}

/**
 * UpdateCartItemQuantity - Changes the quantity of a specific item in the user's cart
 * 
 * @param {Object} req - Request object containing:
 *   - params.userId: ID of the user
 *   - params.itemId: ID of the cart item to update
 *   - body.quantity: New quantity to set (must be >= 1)
 * @param {Object} res - Response object
 * 
 * @returns {Object} Updated cart item or error message
 */
const UpdateCartItemQuantity = async (req, res) => {
    try {
        const { userId, itemId } = req.params;
        const { quantity } = req.body;
        
        // Validate required parameters
        if (!userId || !itemId) {
            return res.status(400).json({
                success: false,
                message: 'User ID and Item ID are required'
            });
        }

        // Ensure quantity is valid (positive number)
        if (!quantity || quantity < 1) {
            return res.status(400).json({
                success: false,
                message: 'Valid quantity is required'
            });
        }

        // Find user's active cart
        const userCart = await CartHeader.findOne({ 
            accID: userId, 
            status: 'active'
         });

        if (!userCart) {
            return res.status(404).json({
                success: false,
                message: 'No active cart found for this user'
            });
        }
        
        // Find and update cart item quantity
        // Using findOneAndUpdate to ensure atomic operation
        const cartItem = await CartItem.findOneAndUpdate(
            {
                _id: itemId,
                cartId: userCart.cartId
            },
            { quantity: quantity },
            { new: true } // Return updated document
        );

        if (!cartItem) {
            return res.status(404).json({
                success: false,
                message: 'Cart item not found'
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'Cart item quantity updated successfully',
            cartItem: cartItem
        });

    } catch (error) {
        console.error('Error updating cart item:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update cart item',
            error: error.message
        });
    }
};

/**
 * ClearCart - Removes all items from a user's active cart
 * 
 * @param {Object} req - Request object containing:
 *   - params.userId: ID of the user whose cart to clear
 * @param {Object} res - Response object
 * 
 * @returns {Object} Success message or error
 */
const ClearCart = async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Validate user ID
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // Find user's active cart
        const cartHeader = await CartHeader.findOne({ 
            accID: userId, 
            status: 'active'
         });

        if (!cartHeader) {
            return res.status(404).json({
                success: false,
                message: 'No active cart found for this user'
            });
        }
        
        // Delete all items associated with this cart
        await CartItem.deleteMany({ cartId: cartHeader.cartId });
        
        return res.status(200).json({
            success: true,
            message: 'Cart cleared successfully'
        });

    } catch (error) {
        console.error('Error clearing cart:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear cart',
            error: error.message
        });
    }
};

/**
 * UpdateCartStatus - Changes the status of a user's cart (e.g., from active to checkout)
 * 
 * @param {Object} req - Request object containing:
 *   - params.userId: ID of the user
 *   - body.status: New status for the cart (must be one of: active, saved, checkout, completed, abandoned)
 * @param {Object} res - Response object
 * 
 * @returns {Object} Updated cart header or error message
 */
const UpdateCartStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { status } = req.body;
        
        // Validate user ID
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }
        
        // Validate status is one of allowed values
        if (!status || !['active', 'saved', 'checkout', 'completed', 'abandoned'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Valid status is required'
            });
        }
        
        // Find and update the user's active cart
        const updatedCart = await CartHeader.findOneAndUpdate(
            { accID: userId, status: 'active' },
            { 
                status: status,
                updated_at: Date.now()
            },
            { new: true } // Return updated document
        );
        
        if (!updatedCart) {
            return res.status(404).json({
                success: false,
                message: 'Active cart not found'
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'Cart status updated successfully',
            cart: updatedCart
        });
        
    } catch (error) {
        console.error('Error updating cart status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update cart status',
            error: error.message
        });
    }
};

module.exports = {
    AddToCart,
    GetCart,
    DeleteCart,
    UpdateCartItemQuantity,
    ClearCart,
    UpdateCartStatus
};

