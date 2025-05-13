const Products = require("../models/product");
const cloudinary = require("cloudinary").v2; 

const addProduct = async (req, res) => {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  try { 
    console.log("Request body received:", req.body);
    
    const { Name, Description, Price, Category, StockQuantity, ProductID, Images, Image } = req.body;

    // Validate required fields
    if (!Name || !Description || !Price || !Category || !StockQuantity) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: Name, Description, Price, Category, StockQuantity'
      });
    }

    // Handle both single Image and multiple Images formats
    let processedImages = [];
    
    // Case 1: If Images array is provided (from new clients)
    if (Images && Array.isArray(Images) && Images.length > 0) {
      processedImages = Images;
    } 
    // Case 2: If single Image object is provided (from old clients)
    else if (Image && !Array.isArray(Image) && Image.public_id && Image.url) {
      processedImages = [Image];
    }
    // Case 3: If Image is already an array (matches our schema)
    else if (Image && Array.isArray(Image) && Image.length > 0) {
      processedImages = Image;
    }
    // Case 4: No valid images provided
    else {
      return res.status(400).json({
        success: false,
        message: 'At least one valid image with public_id and url is required'
      });
    }

    // Validate all images in the array
    for (let i = 0; i < processedImages.length; i++) {
      if (!processedImages[i].public_id || !processedImages[i].url) {
        return res.status(400).json({
          success: false,
          message: `Image at position ${i} is incomplete. Both public_id and url are required for all images.`
        });
      }
    }

    // Create product - use "Image" field name to match schema
    const product = await Products.create({
      Name,
      Description,
      Price: Number(Price),
      Category,
      StockQuantity: Number(StockQuantity),
      ProductID: ProductID || "PROD_" + Date.now(),
      Image: processedImages  // Store in Image array field
    });

    res.status(201).json({
      success: true,
      message: 'Product added successfully',
      product
    });
  } catch(error) {
    console.error('Error adding product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add product',
      error: error.message
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { Name, Description, Price, Category, StockQuantity, Images, Image, Status } = req.body;
    const productId = req.params.id;
    
    // Prepare update object
    const updateData = {
      Name: Name,
      Description: Description,
      Price: Number(Price),
      Category: Category,
      StockQuantity: Number(StockQuantity)
    };

    // Add Status to update data if provided
    if (Status) {
      updateData.Status = Status;
    }

    // Handle image updates
    if (Images && Array.isArray(Images) && Images.length > 0) {
      // Case 1: If Images array is provided from new clients
      updateData.Image = Images;
    } 
    else if (Image && !Array.isArray(Image) && Image.public_id && Image.url) {
      // Case 2: If single Image object is provided from old clients
      updateData.Image = [Image];
    }
    else if (Image && Array.isArray(Image) && Image.length > 0) {
      // Case 3: If Image is already an array (matches our schema)
      updateData.Image = Image;
    }
    else if (req.files) {
      // Case 4: Handle file uploads via form-data
      const uploadedImages = [];
      
      // Handle single file upload
      if (req.files.image) {
        const file = req.files.image.tempFilePath;
        const result = await cloudinary.uploader.upload(file, {
          folder: 'products',
          width: 500,
          crop: 'scale'
        });
        uploadedImages.push({
          public_id: result.public_id,
          url: result.secure_url
        });
      }
      
      // Handle multiple file uploads
      if (req.files.images && Array.isArray(req.files.images)) {
        for (const file of req.files.images) {
          const result = await cloudinary.uploader.upload(file.tempFilePath, {
            folder: 'products',
            width: 500,
            crop: 'scale'
          });
          uploadedImages.push({
            public_id: result.public_id,
            url: result.secure_url
          });
        }
      }
      
      if (uploadedImages.length > 0) {
        updateData.Image = uploadedImages;
      }
    }

    // Update the product
    const product = await Products.findByIdAndUpdate(
      productId,
      updateData,
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false, 
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true, 
      message: 'Product updated successfully', 
      product
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false, 
      message: 'Failed to update product', 
      error: error.message
    });
  }
};

const uploadImage = async (req, res) => {
  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({
        success: false, 
        message: 'No image file uploaded'
      });
    }

    const file = req.files.image.tempFilePath;
    
    const result = await cloudinary.uploader.upload(file, {
      folder: 'products',
      width: 800,
      crop: 'scale'
    });

    res.status(200).json({
      success: true,
      image: {
        public_id: result.public_id,
        url: result.secure_url
      }
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({
      success: false, 
      message: 'Failed to upload image',
      error: error.message
    });
  }
};
const findProduct = async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Products.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Format the response to ensure both new and old clients work properly
    const formattedProduct = product.toObject();
    
    // Add Images field for newer frontend code that expects it
    if (formattedProduct.Image && Array.isArray(formattedProduct.Image)) {
      formattedProduct.Images = formattedProduct.Image;
    }

    res.status(200).json({ success: true, product: formattedProduct });
  } catch (error) {
    console.error('Error finding product:', error);
    res.status(500).json({ success: false, message: 'Failed to find product', error: error.message });
  }
}

const allFindProduct = async (req, res) => {
  try {
    const products = await Products.find();
    
    if (!products || products.length === 0) {
      return res.status(404).json({ success: false, message: 'No products found' });
    }
    
    // Format each product for backward compatibility
    const formattedProducts = products.map(product => {
      const formattedProduct = product.toObject();
      
      // Add Images field for newer frontend code that expects it
      if (formattedProduct.Image && Array.isArray(formattedProduct.Image)) {
        formattedProduct.Images = formattedProduct.Image;
      }
      
      return formattedProduct;
    });
    
    return res.status(200).json({ 
      success: true, 
      products: formattedProducts 
    });
  } catch (error) {
    console.error('Error finding products:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to find products', 
      error: error.message 
    });
  }
};

const bestSellerRank = async (req, res) => {
  const { id } = req.params;
  const { rank } = req.body;

  try {
    const product = await Products.findByIdAndUpdate(
      id,
      { 'salesData.bestSellerRank': rank },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    return res.status(200).json({ success: true, message: 'Best seller rank updated successfully', product });
  } catch (error) {
    console.error('Error updating best seller rank:', error);
    res.status(500).json({ success: false, message: 'Failed to update best seller rank', error: error.message });
  }
}


const deleteProduct = async (req, res) => {
  const { id } = req.params;
  
  try {
    const product = await Products.findByIdAndUpdate(
      id,
      { Status: 'Deleted' },
      { new: true }
    );
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      message: 'Product deleted successfully' 
    });
    
  } catch (error) {
      console.error('Error deleting product:', error);
      res.status(500).json({ success: false, message: 'Failed to delete product', error: error.message });
  }
};

const updateProductStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  // Validate status value
  const validStatuses = ['Available', 'Not Available', 'Deleted'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid status value. Must be "Available", "Not Available", or "Deleted"'
    });
  }
  
  try {
    const product = await Products.findByIdAndUpdate(
      id,
      { Status: status },
      { new: true }
    );
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      message: `Product status updated to ${status} successfully`,
      product
    });
    
  } catch (error) {
    console.error('Error updating product status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update product status', 
      error: error.message 
    });
  }
};



// Update the module exports to include the new function
module.exports = {
  addProduct, 
  updateProduct, 
  findProduct, 
  allFindProduct, 
  deleteProduct, 
  uploadImage,
  updateProductStatus  // Add the new function
};