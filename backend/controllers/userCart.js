const { CartHeader, CartItem } = require('../models/cart');
const Product = require('../models/product');
const CakeDesign = require('../models/cakeDesign'); // Make sure this import is present

/**
 * AddToCart - Adds a product or cake design to the user's cart
 * 
 * @param {Object} req - Request object containing:
 *   - body.userId: ID of the user adding to cart
 *   - body.productId: ID of the product to add (for product items)
 *   - body.cakeDesignId: ID of the cake design to add (for cake_design items)
 *   - body.quantity: Number of items to add
 *   - body.price: Price of the item
 *   - body.itemType: Type of item ('product' or 'cake_design')
 *   - body.cakeOptions: Optional customization details for cake designs
 * @param {Object} res - Response object
 * 
 * @returns {Object} JSON response with cart item details or error message
 */
const AddToCart = async (req, res) => {
  try {
    // Extract all needed fields from request body
    const { userId, productId, cakeDesignId, quantity, price, itemType, cakeOptions, ProductName, ProductImage } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // Validate that itemType is provided and valid
    if (!itemType || !['product', 'cake_design'].includes(itemType)) {
      return res.status(400).json({
        success: false,
        message: 'Valid item type is required (product or cake_design)'
      });
    }
    
    // Additional item-type specific validation
    if (itemType === 'product' && !productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required for product items'
      });
    }
    
    if (itemType === 'cake_design' && !cakeDesignId) {
      return res.status(400).json({
        success: false,
        message: 'Cake Design ID is required for cake_design items'
      });
    }
    
    // Find or create a cart for the user
    let cartHeader = await CartHeader.findOne({ 
      accID: userId, 
      status: 'active' 
    });
    
    if (!cartHeader) {
      cartHeader = new CartHeader({
        cartId: `CART_${Date.now()}`,
        accID: userId,
        status: 'active'
      });
      await cartHeader.save();
    }
    
    // Check if the item already exists in the cart
    let cartItem;
    const cartQuery = { cartId: cartHeader.cartId, itemType: itemType };
    
    if (itemType === 'product') {
      cartQuery.productId = productId;
    } else if (itemType === 'cake_design') {
      cartQuery.cakeDesignId = cakeDesignId;
    }
    
    cartItem = await CartItem.findOne(cartQuery);
    
    // Get item details for name/image if not provided
    let itemName = ProductName;
    let itemImage = ProductImage;
    
    if (!itemName || !itemImage) {
      if (itemType === 'product' && productId) {
        // Get product details to ensure we have name, price, and image
        const product = await Product.findById(productId);
        if (product) {
          // Set name from product
          itemName = itemName || product.Name || product.name;
          
          // Set image from product
          if (!itemImage) {
            if (product.Image && Array.isArray(product.Image) && product.Image.length > 0) {
              itemImage = product.Image[0].url || product.Image[0];
            } else if (typeof product.image === 'string') {
              itemImage = product.image;
            } else {
              itemImage = 'default-product-image.jpg';
            }
          }
        }
      } else if (itemType === 'cake_design' && cakeDesignId) {
        const cakeDesign = await CakeDesign.findById(cakeDesignId);
        if (cakeDesign) {
          itemName = itemName || `Custom Cake: ${cakeDesign.name || 'Untitled Design'}`;
          itemImage = itemImage || cakeDesign.previewImage || 'default-cake-image.jpg';
        }
      }
    }
    
    // Default values if still not set
    itemName = itemName || (itemType === 'product' ? 'Product' : 'Custom Cake');
    itemImage = itemImage || (itemType === 'product' ? 'default-product-image.jpg' : 'default-cake-image.jpg');
    
    if (cartItem) {
      // Update existing item
      cartItem.quantity = quantity;
      cartItem.price = price;
      
      // Ensure these fields are set (they might have been missed initially)
      cartItem.ProductName = itemName;
      cartItem.ProductImage = itemImage;
      
      // Ensure productId or cakeDesignId is set properly
      if (itemType === 'product' && productId) {
        cartItem.productId = productId;
      } else if (itemType === 'cake_design' && cakeDesignId) {
        cartItem.cakeDesignId = cakeDesignId;
      }
      
      // Update cake options if provided
      if (itemType === 'cake_design' && cakeOptions) {
        cartItem.cakeOptions = cakeOptions;
      }
      
      await cartItem.save();
    } else {
      // Create new cart item with ALL required fields
      const newCartItem = {
        cartId: cartHeader.cartId,
        quantity: quantity || 1,
        price: price || 0,
        itemType: itemType, // This is critical - must be included
        ProductName: itemName,
        ProductImage: itemImage
      };
      
      // Add type-specific fields - CRITICAL: This is where productId must be set
      if (itemType === 'product') {
        newCartItem.productId = productId; // Make sure this is set correctly
        console.log(`Creating cart item with productId: ${productId}`);
      } else if (itemType === 'cake_design') {
        newCartItem.cakeDesignId = cakeDesignId;
        if (cakeOptions) {
          newCartItem.cakeOptions = cakeOptions;
        }
      }
      
      cartItem = await CartItem.create(newCartItem);
    }
    
    // Log the created/updated cart item for debugging
    console.log('Cart item details:', {
      id: cartItem._id,
      productId: cartItem.productId,
      itemType: cartItem.itemType,
      name: cartItem.ProductName
    });
    
    // Update cart header
    cartHeader.updated_at = Date.now();
    await cartHeader.save();
    
    // Return detailed response with cart info
    return res.status(200).json({
      success: true,
      message: `${itemType === 'product' ? 'Product' : 'Custom cake'} added to cart successfully`,
      cartItem: cartItem,
      cartId: cartHeader.cartId
    });
    
  } catch (error) {
    console.error('Error adding item to cart:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add item to cart',
      error: error.message
    });
  }
};

/**
 * AddCakeToCart - Specialized function for adding cake designs to cart
 * 
 * This is a specialized version of AddToCart specifically for cake designs.
 * It has additional logic to handle cake design-specific fields.
 */
const AddCakeToCart = async (req, res) => {
    try {
        const { userId, cakeDesignId, quantity, price, cakeOptions } = req.body;
        
        if (!userId || !cakeDesignId) {
            return res.status(400).json({
                success: false,
                message: 'User ID and Cake Design ID are required'
            });
        }
        
        // Get cake design details
        const cakeDesign = await CakeDesign.findById(cakeDesignId);
        if (!cakeDesign) {
            return res.status(404).json({
                success: false,
                message: 'Cake design not found'
            });
        }
        
        // Forward to the main AddToCart function with all required fields
        req.body = {
            ...req.body,
            itemType: 'cake_design', // CRITICAL: explicitly set the itemType
            ProductName: cakeDesign.name || 'Custom Cake Design',
            ProductImage: cakeDesign.previewImage || 'default-cake-image.jpg',
        };
        
        return AddToCart(req, res);
    } catch (error) {
        console.error('Error adding cake to cart:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to add cake design to cart', 
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
        
        // Find user's active cart header
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
     
        // Get all cart items
        const cartItems = await CartItem.find({ cartId: cartHeader.cartId });
        
        // Instead of returning 404 for empty cart, return success with empty array
        if (cartItems.length === 0) {
            return res.status(200).json({
                success: true,
                cartId: cartHeader.cartId,
                status: cartHeader.status,
                items: [],
                message: 'Cart is empty'
            });
        }
        
        // DEBUG LOGGING to help identify the issue
        console.log("Cart items found:", cartItems.length);
        cartItems.forEach(item => {
            if (item.itemType === 'product') {
                console.log(`Cart item: ${item._id}, Product ID: ${item.productId}`);
            }
        });
        
        // Separate items by type for proper population
        const productIds = cartItems
            .filter(item => item.itemType === 'product' && item.productId)
            .map(item => item.productId);
            
        const cakeDesignIds = cartItems
            .filter(item => item.itemType === 'cake_design' && item.cakeDesignId)
            .map(item => item.cakeDesignId);
        
        // DEBUG LOGGING
        console.log("Product IDs to fetch:", productIds.length);
        console.log("Product IDs:", productIds);
        
        // Fetch all product details
        const products = productIds.length > 0 ? 
            await Product.find({ _id: { $in: productIds } }) : [];
            
        // DEBUG LOGGING
        console.log("Products found:", products.length);
        
        // Fetch all cake design details
        const cakeDesigns = cakeDesignIds.length > 0 ? 
            await CakeDesign.find({ _id: { $in: cakeDesignIds } }) : [];
            
        // Map products and cake designs by ID for easy lookup - ENSURE IDs ARE STRINGS
        const productMap = {};
        products.forEach(product => {
            // Convert ID to string for consistent lookup
            const idString = product._id.toString();
            productMap[idString] = product;
        });
        
        const cakeDesignMap = {};
        cakeDesigns.forEach(design => {
            const idString = design._id.toString();
            cakeDesignMap[idString] = design;
        });
        
        // DEBUG LOGGING
        console.log("Product map keys:", Object.keys(productMap));
        
        // Enhance cart items with full details
        const enhancedCartItems = cartItems.map(item => {
            const itemData = item.toObject();
            
            // For product items
            if (item.itemType === 'product' && item.productId) {
                // Convert productId to string for consistent lookup
                const productIdString = item.productId.toString();
                const product = productMap[productIdString];
                
                console.log(`Looking up product: ${productIdString}, Found: ${!!product}`);
                
                if (product) {
                    // Product exists - add product details
                    itemData.productDetails = product;
                    
                    // Keep productId as the ID (as per model) but also add the full product 
                    // for backwards compatibility with your frontend
                    itemData.productId = product._id;
                    itemData.productObject = product; // New field that contains the full product
                    
                    // Also add primary fields to the main level for easier access
                    itemData.name = item.ProductName || product.Name || product.name;
                    itemData.price = product.Price || product.price || item.price;
                    itemData.description = product.Description || product.description;
                    itemData.isUnavailable = false;
                    
                    // Get image from the product
                    if (item.ProductImage) {
                        itemData.image = item.ProductImage;
                    } else if (product.Image && Array.isArray(product.Image) && product.Image.length > 0) {
                        itemData.image = product.Image[0].url || product.Image[0];
                    } else if (product.image) {
                        itemData.image = product.image;
                    } else {
                        itemData.image = 'default-product-image.jpg';
                    }
                } else {
                    // Product not found - mark as unavailable
                    itemData.name = item.ProductName || "Product no longer available";
                    itemData.description = "This product has been removed from our catalog";
                    itemData.price = item.price || 0;
                    itemData.image = item.ProductImage || null;
                    itemData.isUnavailable = true;
                    itemData.productId = "deleted";
                }
            } 
            // For cake design items - similar logic for cake designs
            else if (item.itemType === 'cake_design' && item.cakeDesignId) {
                const cakeDesignIdString = item.cakeDesignId.toString();
                const cakeDesign = cakeDesignMap[cakeDesignIdString];
                
                if (cakeDesign) {
                    // Cake design exists
                    itemData.cakeDesignDetails = cakeDesign;
                    itemData.name = item.ProductName || `Custom Cake: ${cakeDesign.name || 'Untitled Design'}`;
                    itemData.description = cakeDesign.description || 'Custom cake design';
                    itemData.price = item.price || 0;
                    itemData.isUnavailable = false;
                    itemData.image = item.ProductImage || cakeDesign.previewImage || 'default-cake-image.jpg';
                } else {
                    // Cake design not found - mark as unavailable
                    itemData.name = item.ProductName || "Custom cake design no longer available";
                    itemData.description = "This cake design has been removed";
                    itemData.price = item.price || 0;
                    itemData.image = item.ProductImage || null;
                    itemData.isUnavailable = true;
                    itemData.cakeDesignId = "deleted";
                }
            }
            
            return itemData;
        });
        
        // Return cart data with all items
        return res.status(200).json({
            success: true,
            cartId: cartHeader.cartId,
            status: cartHeader.status,
            items: enhancedCartItems
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
    UpdateCartStatus,
    AddCakeToCart
};

