const CakeDesign = require('../models/cakeDesign');

// Add this near the top of your file
const handleFlavorData = (cakeState) => {
console.log('Handling flavor data:', cakeState);
console.log('Flavor data before processing:', cakeState.cakeModel.flavor);

  if (cakeState.cakeModel && 
      cakeState.cakeModel.flavor && 
      cakeState.cakeModel.flavor.name && 
      (!cakeState.cakeModel.flavor.primary || !cakeState.cakeModel.flavor.secondary)) {
    
    const flavorPreset = CakeDesign.getFlavorPreset(cakeState.cakeModel.flavor.name);
    cakeState.cakeModel.flavor = {
      ...cakeState.cakeModel.flavor,
      primary: cakeState.cakeModel.flavor.primary || flavorPreset.primary,
      secondary: cakeState.cakeModel.flavor.secondary || flavorPreset.secondary
    };
  }
  return cakeState;
};

// Add this helper function at the top of your file 
const findExistingDesignByName = async (userId, name) => {
  if (!name || !userId) return null;
  
  return await CakeDesign.findOne({
    userId: userId,
    name: { $regex: new RegExp(`^${name}$`, 'i') } // Case-insensitive match
  });
};

// Add this helper function near the top with your other helpers
const processRotationData = (cakeState) => {
  // Deep clone to avoid modifying the original object
  const processedState = JSON.parse(JSON.stringify(cakeState));
  
  // Process elements rotation arrays if they exist
  if (processedState.elements && Array.isArray(processedState.elements)) {
    processedState.elements.forEach(element => {
      if (element.rotation) {
        // Check if rotation is a string (might be stringified array)
        if (typeof element.rotation === 'string') {
          try {
            // Parse the string to an array but keep all values (including 'XYZ')
            element.rotation = JSON.parse(element.rotation.replace(/'/g, '"'));
            // Save rotationType if present
            if (element.rotation.length > 3 && typeof element.rotation[3] === 'string') {
              element.rotationType = element.rotation[3];
              // Keep only the numeric values in rotation array
              element.rotation = element.rotation.slice(0, 3);
            }
          } catch (err) {
            // If parsing fails, set a default rotation
            element.rotation = [0, 0, 0];
            console.log('Failed to parse rotation:', element.rotation);
          }
        } 
        // If it's already an array, extract the rotationType if present
        else if (Array.isArray(element.rotation) && element.rotation.length > 3) {
          if (typeof element.rotation[3] === 'string') {
            element.rotationType = element.rotation[3];
            element.rotation = element.rotation.slice(0, 3);
          }
        }
      }
    });
  }
  
  // Process message rotation if it exists (no change needed here)
  if (processedState.messageRotation) {
    if (typeof processedState.messageRotation === 'string') {
      try {
        const parsed = JSON.parse(processedState.messageRotation.replace(/'/g, '"'));
        processedState.messageRotation = parsed.filter(val => typeof val === 'number');
      } catch (err) {
        processedState.messageRotation = [0, 0, 0];
        console.log('Failed to parse message rotation:', processedState.messageRotation);
      }
    } else if (Array.isArray(processedState.messageRotation)) {
      processedState.messageRotation = processedState.messageRotation.filter(val => 
        typeof val === 'number');
    }
  }
  
  return processedState;
};

// Define all controller functions
const createCakeDesign = async (req, res) => {
  try {
    const { userId, name, username, description, isPublic, previewImage, action, ...cakeState } = req.body;
    
    // Better logging to diagnose the username issue
    console.log('Request body received:', { 
      userId, 
      name, 
      username,  // Log the actual username from request
      description: description ? 'provided' : 'not provided', 
      isPublic, 
      action
    });
    
    console.log('User object from authentication:', req.user);
    
    // Check if a design with the same name already exists for this user
    const existingDesign = await findExistingDesignByName(userId, name);
    
    // Only log existingDesign if it exists
    if (existingDesign) {
      console.log('Existing design found:', {
        id: existingDesign._id,
        name: existingDesign.name,
        username: existingDesign.username
      });
    } else {
      console.log('No existing design found with name:', name);
    }
    
    // More focused logging for username troubleshooting
    console.log('Username that will be used:', username || req.user?.username || 'Unknown user');
    
    // Process flavor data
    const processedCakeState = handleFlavorData(cakeState);
    // Add this line to clean rotation data:
    const cleanedCakeState = processRotationData(processedCakeState);
    
    // If existing design found and no action specified, ask the user what to do
    if (existingDesign && !action) {
      console.log(`Found existing design with name "${name}" for user ${userId}, asking for user decision`);
      
      return res.status(409).json({
        success: false,
        message: 'A design with this name already exists',
        existingDesign: {
          id: existingDesign._id,
          name: existingDesign.name,
          previewImage: existingDesign.previewImage,
          createdAt: existingDesign.createdAt,
          updatedAt: existingDesign.updatedAt
        },
        options: {
          update: "Update the existing design",
          rename: "Create a new design with a numbered suffix"
        }
      });
    }
    
    // If existing design found and user chose to update
    if (existingDesign && action === 'update') {
      console.log(`Updating existing design with name "${name}" as requested by user`);
      
      // Update the existing design fields
      existingDesign.description = description || existingDesign.description;
      existingDesign.isPublic = isPublic !== undefined ? isPublic : existingDesign.isPublic;
      
      if (previewImage) {
        existingDesign.previewImage = previewImage;
      }
      
      // Update cake model data
      if (cleanedCakeState.cakeModel) existingDesign.cakeModel = cleanedCakeState.cakeModel;
      if (cleanedCakeState.cakePlacement) existingDesign.cakePlacement = cleanedCakeState.cakePlacement;
      if (cleanedCakeState.elements) existingDesign.elements = cleanedCakeState.elements;
      if (cleanedCakeState.message !== undefined) existingDesign.message = cleanedCakeState.message;
      if (cleanedCakeState.messageColor) existingDesign.messageColor = cleanedCakeState.messageColor;
      if (cleanedCakeState.messageFont) existingDesign.messageFont = cleanedCakeState.messageFont;
      if (cleanedCakeState.messagePosition) existingDesign.messagePosition = cleanedCakeState.messagePosition;
      if (cleanedCakeState.messageRotation) existingDesign.messageRotation = cleanedCakeState.messageRotation;
      if (cleanedCakeState.messageScale) existingDesign.messageScale = cleanedCakeState.messageScale;
      
      const updatedDesign = await existingDesign.save();
      
      return res.status(200).json({
        success: true,
        data: updatedDesign,
        message: 'Existing cake design updated successfully',
        wasUpdated: true
      });
    }
    
    // If existing design found and user chose to create a new one with a different name
    if (existingDesign && action === 'rename') {
      // Find a unique name by appending numbers
      let counter = 1;
      let uniqueName = name;
      let nameExists = true;
      
      while (nameExists) {
        uniqueName = `${name} (${counter})`;
        const existingWithNewName = await findExistingDesignByName(userId, uniqueName);
        if (!existingWithNewName) {
          nameExists = false;
        } else {
          counter++;
        }
      }
      
      console.log(`Creating new design with auto-renamed name "${uniqueName}"`);
      
      // Create new cake design with the unique name
      const cakeDesign = new CakeDesign({
        userId: userId,
        username: username || req.user.username || 'Unknown user',
        name: uniqueName,
        description,
        isPublic: isPublic || false,
        previewImage,
        cakeModel: cleanedCakeState.cakeModel,
        cakePlacement: cleanedCakeState.cakePlacement,
        elements: cleanedCakeState.elements,
        message: cleanedCakeState.message,
        messageColor: cleanedCakeState.messageColor,
        messageFont: cleanedCakeState.messageFont,
        messagePosition: cleanedCakeState.messagePosition,
        messageRotation: cleanedCakeState.messageRotation,
        messageScale: cleanedCakeState.messageScale || [1, 1, 1]
      });
      
      const savedDesign = await cakeDesign.save();
      
      return res.status(201).json({
        success: true,
        data: savedDesign,
        message: `Cake design created with name "${uniqueName}"`,
        wasRenamed: true,
        originalName: name
      });
    }
    
    // If no existing design or no conflict, create a new one
    const cakeDesign = new CakeDesign({
      userId: userId,
      username: username || req.user.username || 'Unknown user', // FIXED: Now using username from request body
      name,
      description,
      isPublic: isPublic || false,
      previewImage,
      cakeModel: cleanedCakeState.cakeModel,
      cakePlacement: cleanedCakeState.cakePlacement,
      elements: cleanedCakeState.elements,
      message: cleanedCakeState.message,
      messageColor: cleanedCakeState.messageColor,
      messageFont: cleanedCakeState.messageFont,
      messagePosition: cleanedCakeState.messagePosition,
      messageRotation: cleanedCakeState.messageRotation,
      messageScale: cleanedCakeState.messageScale || [1, 1, 1]
    });
    
    const savedDesign = await cakeDesign.save();
    
    res.status(201).json({
      success: true,
      data: savedDesign,
      message: 'Cake design created successfully',
      wasUpdated: false
    });
  } catch (error) {
    console.error('Error creating/updating cake design:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating/updating cake design',
      error: error.message
    });
  }
};

const getAllCakeDesigns = async (req, res) => {
  try {
    const { isPublic, limit = 10, page = 1, sort = '-createdAt' } = req.query;
    const query = {};
    
    if (isPublic !== undefined) {
      query.isPublic = isPublic === 'true';
    }
    
    const options = {
      limit: parseInt(limit),
      page: parseInt(page),
      sort
    };
    
    const designs = await CakeDesign.find(query)
      .limit(options.limit)
      .skip((options.page - 1) * options.limit)
      .sort(options.sort);
      
    const total = await CakeDesign.countDocuments(query);
    
    res.status(200).json({
      success: true,
      count: designs.length,
      total,
      pages: Math.ceil(total / options.limit),
      data: designs
    });
  } catch (error) {
    console.error('Error fetching cake designs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching cake designs',
      error: error.message
    });
  }
};

const getUserCakeDesigns = async (req, res) => {
  try {
    if (!req.params.userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    const { userId } = req.params;
    console.log('Fetching designs for user:', userId);
    console.log('Current user from token:', req.user);
    
    const { limit = 10, page = 1 } = req.query;

    // Check both possible token payload structures
    const currentUserId = req.user.userId || req.user._id;
    
    // Handle if currentUserId is an object (like MongoDB ObjectId)
    const currentUserIdStr = typeof currentUserId === 'object' ? 
      currentUserId.toString() : currentUserId;
    
    const isCurrentUser = currentUserIdStr === userId;
    
    console.log('Is current user:', isCurrentUser);
    console.log('Current user ID:', currentUserIdStr);
    console.log('Requested user ID:', userId);

    const query = { userId };
    console.log('Query before visibility check:', JSON.stringify(query));
    
    // Only filter by public if not the current user
    if (!isCurrentUser) {
      query.isPublic = true;
      console.log('Added isPublic filter: not the current user');
    }
    
    console.log('Final query:', JSON.stringify(query));
    
    const designs = await CakeDesign.find(query)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort('-createdAt');
    
    console.log('Query results count:', designs.length);
    
    const total = await CakeDesign.countDocuments(query);
    
    res.status(200).json({
      success: true,
      count: designs.length,
      total,
      pages: Math.ceil(total / parseInt(limit)),
      data: designs
    });
  } catch (error) {
    console.error('Error fetching user cake designs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching user cake designs',
      error: error.message
    });
  }
};
// Get a specific cake design by ID
const getCakeDesignById = async (req, res) => {
  try {
    const design = await CakeDesign.findById(req.params.id);
    
    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Cake design not found'
      });
    }

    // Check if user is authenticated
    let isOwner = false;
    if (req.user) {
      // User is authenticated, check if they own the design
      const currentUserId = req.user.userId || req.user._id;
      const currentUserIdStr = typeof currentUserId === 'object' ? 
        currentUserId.toString() : currentUserId;
      isOwner = design.userId === currentUserIdStr;
    }

    // Only allow access if design is public or user is owner
    if (!design.isPublic && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this cake design'
      });
    }
    
    res.status(200).json({
      success: true,
      data: design,
      isOwner
    });
  } catch (error) {
    console.error('Error fetching cake design:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching cake design',
      error: error.message
    });
  }
};

// Update a cake design
const updateCakeDesign = async (req, res) => {
  try {
    const design = await CakeDesign.findById(req.params.id);
    
    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Cake design not found'
      });
    }
    
    // Get user ID from token, handling different token structures
    const currentUserId = req.user.userId || req.user._id;
    const currentUserIdStr = typeof currentUserId === 'object' ? 
      currentUserId.toString() : currentUserId;
    
    // Check ownership - only allow updates to user's own designs
    if (design.userId !== currentUserIdStr) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this cake design'
      });
    }
    
    const { name, description, isPublic, previewImage, ...cakeState } = req.body;
    // Add this line to clean rotation data:
    const cleanedCakeState = processRotationData(cakeState);
    
    // Update basic fields
    design.name = name || design.name;
    design.description = description !== undefined ? description : design.description;
    design.isPublic = isPublic !== undefined ? isPublic : design.isPublic;
    
    // Update preview image if provided
    if (previewImage !== undefined) {
      design.previewImage = previewImage;
    }
    
    // Update cake model data if provided
    if (cleanedCakeState.cakeModel) design.cakeModel = cleanedCakeState.cakeModel;
    if (cleanedCakeState.cakePlacement) design.cakePlacement = cleanedCakeState.cakePlacement;
    if (cleanedCakeState.elements) design.elements = cleanedCakeState.elements;
    if (cleanedCakeState.message !== undefined) design.message = cleanedCakeState.message;
    if (cleanedCakeState.messageColor) design.messageColor = cleanedCakeState.messageColor;
    if (cleanedCakeState.messageFont) design.messageFont = cleanedCakeState.messageFont;
    if (cleanedCakeState.messagePosition) design.messagePosition = cleanedCakeState.messagePosition;
    if (cleanedCakeState.messageRotation) design.messageRotation = cleanedCakeState.messageRotation;
    if (cleanedCakeState.messageScale) design.messageScale = cleanedCakeState.messageScale;
    
    // Save the updated design
    const updatedDesign = await design.save();
    
    res.status(200).json({
      success: true,
      data: updatedDesign,
      message: 'Cake design updated successfully'
    });
  } catch (error) {
    console.error('Error updating cake design:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating cake design',
      error: error.message
    });
  }
};

// Delete a cake design - fix the deprecated remove() method
const deleteCakeDesign = async (req, res) => {
  try {
    const design = await CakeDesign.findById(req.params.id);
    
    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Cake design not found'
      });
    }
    
    // Get user ID from token, handling different token structures
    const currentUserId = req.user.userId || req.user._id;
    const currentUserIdStr = typeof currentUserId === 'object' ? 
      currentUserId.toString() : currentUserId;
    
    // Check ownership - only allow deletion of user's own designs
    if (design.userId !== currentUserIdStr) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this cake design'
      });
    }
    
    // Use deleteOne instead of the deprecated remove() method
    await CakeDesign.deleteOne({ _id: req.params.id });
    
    res.status(200).json({
      success: true,
      message: 'Cake design deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting cake design:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting cake design',
      error: error.message
    });
  }
};

// Create or update a cake design
const createOrUpdateCakeDesign = async (req, res) => {
  try {
    // Add username to the destructuring
    const { designId, name, username, description, isPublic, previewImage, ...cakeState } = req.body;
    
    // Get user ID from token
    const currentUserId = req.user.userId || req.user._id;
    const currentUserIdStr = typeof currentUserId === 'object' ? 
      currentUserId.toString() : currentUserId;
    
    // Add this line to clean rotation data:
    const cleanedCakeState = processRotationData(cakeState);
    
    let designToUpdate = null;
    let isNew = true;
    
    // First priority: Check if we're updating an existing design by ID
    if (designId) {
      designToUpdate = await CakeDesign.findById(designId);
      
      if (designToUpdate) {
        // Check ownership
        if (designToUpdate.userId !== currentUserIdStr) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to update this cake design'
          });
        }
        isNew = false;
      }
    }
    
    // Second priority: If no design ID or not found, check if design with same name exists
    if (!designToUpdate && name) {
      designToUpdate = await findExistingDesignByName(currentUserIdStr, name);
      
      if (designToUpdate) {
        console.log(`Found existing design with name "${name}", updating instead of creating new`);
        isNew = false;
      }
    }
    
    // If we found an existing design, update it
    if (designToUpdate) {
      // Update basic fields
      designToUpdate.name = name || designToUpdate.name;
      designToUpdate.description = description !== undefined ? description : designToUpdate.description;
      designToUpdate.isPublic = isPublic !== undefined ? isPublic : designToUpdate.isPublic;
      
      // Update preview image if provided
      if (previewImage !== undefined) {
        designToUpdate.previewImage = previewImage;
      }
      
      // Update cake model data if provided
      if (cleanedCakeState.cakeModel) designToUpdate.cakeModel = cleanedCakeState.cakeModel;
      if (cleanedCakeState.cakePlacement) designToUpdate.cakePlacement = cleanedCakeState.cakePlacement;
      if (cleanedCakeState.elements) designToUpdate.elements = cleanedCakeState.elements;
      if (cleanedCakeState.message !== undefined) designToUpdate.message = cleanedCakeState.message;
      if (cleanedCakeState.messageColor) designToUpdate.messageColor = cleanedCakeState.messageColor;
      if (cleanedCakeState.messageFont) designToUpdate.messageFont = cleanedCakeState.messageFont;
      if (cleanedCakeState.messagePosition) designToUpdate.messagePosition = cleanedCakeState.messagePosition;
      if (cleanedCakeState.messageRotation) designToUpdate.messageRotation = cleanedCakeState.messageRotation;
      if (cleanedCakeState.messageScale) designToUpdate.messageScale = cleanedCakeState.messageScale;
      
      // Save the updated design
      const updatedDesign = await designToUpdate.save();
      
      return res.status(200).json({
        success: true,
        data: updatedDesign,
        message: 'Cake design updated successfully',
        isNew: false
      });
    }
    
    // If no existing design found, create a new one
    const newCakeDesign = new CakeDesign({
      userId: currentUserIdStr,
      username: username || req.user.username || 'Unknown user',
      name: name || 'Untitled Design',
      description: description || '',
      isPublic: isPublic || false,
      previewImage,
      cakeModel: cleanedCakeState.cakeModel,
      cakePlacement: cleanedCakeState.cakePlacement,
      elements: cleanedCakeState.elements,
      message: cleanedCakeState.message,
      messageColor: cleanedCakeState.messageColor,
      messageFont: cleanedCakeState.messageFont,
      messagePosition: cleanedCakeState.messagePosition,
      messageRotation: cleanedCakeState.messageRotation,
      messageScale: cleanedCakeState.messageScale || [1, 1, 1]
    });
    
    const savedDesign = await newCakeDesign.save();
    
    res.status(201).json({
      success: true,
      data: savedDesign,
      message: 'Cake design created successfully',
      isNew: true
    });
  } catch (error) {
    console.error('Error creating/updating cake design:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating/updating cake design',
      error: error.message
    });
  }
};

// Add a new function to save a preview image for an existing design
const savePreviewImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { previewImage } = req.body;
    
    if (!previewImage) {
      return res.status(400).json({
        success: false,
        message: 'Preview image is required'
      });
    }
    
    const design = await CakeDesign.findById(id);
    
    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Cake design not found'
      });
    }
    
    // Get user ID from token, handling different token structures
    const currentUserId = req.user.userId || req.user._id;
    const currentUserIdStr = typeof currentUserId === 'object' ? 
      currentUserId.toString() : currentUserId;
    
    // Check ownership
    if (design.userId !== currentUserIdStr) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this cake design'
      });
    }
    
    // Update the preview image
    design.previewImage = previewImage;
    await design.save();
    
    res.status(200).json({
      success: true,
      message: 'Preview image saved successfully'
    });
  } catch (error) {
    console.error('Error saving preview image:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving preview image',
      error: error.message
    });
  }
};

// Export everything at the end
const controller = {
  createCakeDesign,
  getAllCakeDesigns,
  getUserCakeDesigns,
  getCakeDesignById,
  updateCakeDesign,
  deleteCakeDesign,
  createOrUpdateCakeDesign,
  savePreviewImage
};

// Debug before exporting
console.log('Exporting controller with functions:', Object.keys(controller));

module.exports = controller;