const Model3D = require('../models/Models');
const path = require('path');
const fs = require('fs');

// Helper function to ensure upload directories exist
const ensureDirectoriesExist = () => {
  const dirs = [
    path.join(__dirname, '../public/models'),
    path.join(__dirname, '../public/textures'),
    path.join(__dirname, '../public/thumbnails')
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

// Get all 3D models
exports.getAllModels = async (req, res) => {
  try {
    const { 
      category, 
      search,
      page = 1,
      limit = 10
    } = req.query;
    
    const query = {};
    
    if (category) {
      query.category = category;
    }
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const models = await Model3D.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
      
    const totalModels = await Model3D.countDocuments(query);
    
    return res.status(200).json({
      success: true,
      totalModels,
      totalPages: Math.ceil(totalModels / parseInt(limit)),
      currentPage: parseInt(page),
      models
    });
  } catch (error) {
    console.error('Error fetching 3D models:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching 3D models',
      error: error.message
    });
  }
};

// Get a single 3D model by ID
exports.getModelById = async (req, res) => {
  try {
    const model = await Model3D.findById(req.params.id);
    
    if (!model) {
      return res.status(404).json({
        success: false,
        message: '3D model not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      model
    });
  } catch (error) {
    console.error('Error fetching 3D model:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching 3D model',
      error: error.message
    });
  }
};

// Create a new 3D model
exports.createModel = async (req, res) => {
  try {
    ensureDirectoriesExist();
    
    // Get the uploaded files from multer middleware
    const modelFile = req.files.modelFile ? req.files.modelFile[0] : null;
    
    if (!modelFile) {
      return res.status(400).json({
        success: false,
        message: '3D model file is required'
      });
    }
    
    // Process textures
    const textureData = [];
    if (req.files.textures) {
      req.files.textures.forEach(texture => {
        textureData.push({
          type: req.body[`textureType_${texture.originalname}`] || 'diffuse',
          path: `/textures/${texture.filename}`
        });
      });
    }
    
    // Process body data
    const position = req.body.position ? JSON.parse(req.body.position) : [0, 0, 0];
    const targetedMeshName = req.body.targetedMeshName ? 
      JSON.parse(req.body.targetedMeshName) : [];
      
    // Create new 3D model
    const newModel = new Model3D({
      name: req.body.name || 'New Model',
      path: `/models/${modelFile.filename}`,
      position: position,
      color: {
        primary: req.body.primaryColor || '#ffffff',
        flavorName: req.body.flavorName || null
      },
      targetedMeshName: targetedMeshName,
      textures: textureData,
      price: parseFloat(req.body.price || 0)
    });
    
    await newModel.save();
    
    return res.status(201).json({
      success: true,
      message: '3D model created successfully',
      model: newModel
    });
  } catch (error) {
    console.error('Error creating 3D model:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating 3D model',
      error: error.message
    });
  }
};

// Update a 3D model
exports.updateModel = async (req, res) => {
  try {
    const model = await Model3D.findById(req.params.id);
    
    if (!model) {
      return res.status(404).json({
        success: false,
        message: '3D model not found'
      });
    }
    
    // Update model properties
    if (req.body.name) model.name = req.body.name;
    if (req.body.position) model.position = JSON.parse(req.body.position);
    if (req.body.price) model.price = parseFloat(req.body.price);
    
    if (req.body.primaryColor || req.body.flavorName) {
      model.color = {
        primary: req.body.primaryColor || model.color.primary,
        flavorName: req.body.flavorName || model.color.flavorName
      };
    }
    
    if (req.body.targetedMeshName) {
      model.targetedMeshName = JSON.parse(req.body.targetedMeshName);
    }
    
    // Update model file if provided
    if (req.files && req.files.modelFile) {
      // Delete old file if it exists
      const oldFilePath = path.join(__dirname, '../public', model.path);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
      
      // Update with new file
      model.path = `/models/${req.files.modelFile[0].filename}`;
    }
    
    // Update textures if provided
    if (req.files && req.files.textures) {
      // Handle existing textures (keep or replace)
      if (req.body.replaceTextures === 'true') {
        // Delete old texture files
        for (const texture of model.textures) {
          const texturePath = path.join(__dirname, '../public', texture.path);
          if (fs.existsSync(texturePath)) {
            fs.unlinkSync(texturePath);
          }
        }
        
        // Replace with new textures
        model.textures = req.files.textures.map(texture => ({
          type: req.body[`textureType_${texture.originalname}`] || 'diffuse',
          path: `/textures/${texture.filename}`
        }));
      } else {
        // Add new textures to existing ones
        const newTextures = req.files.textures.map(texture => ({
          type: req.body[`textureType_${texture.originalname}`] || 'diffuse',
          path: `/textures/${texture.filename}`
        }));
        
        model.textures = [...model.textures, ...newTextures];
      }
    }
    
    await model.save();
    
    return res.status(200).json({
      success: true,
      message: '3D model updated successfully',
      model
    });
  } catch (error) {
    console.error('Error updating 3D model:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating 3D model',
      error: error.message
    });
  }
};

// Delete a 3D model
exports.deleteModel = async (req, res) => {
  try {
    const model = await Model3D.findById(req.params.id);
    
    if (!model) {
      return res.status(404).json({
        success: false,
        message: '3D model not found'
      });
    }
    
    // Delete associated files
    try {
      // Delete model file
      const modelPath = path.join(__dirname, '../public', model.path);
      if (fs.existsSync(modelPath)) {
        fs.unlinkSync(modelPath);
      }
      
      // Delete texture files
      for (const texture of model.textures) {
        const texturePath = path.join(__dirname, '../public', texture.path);
        if (fs.existsSync(texturePath)) {
          fs.unlinkSync(texturePath);
        }
      }
    } catch (err) {
      console.warn('Error deleting associated files:', err);
      // Continue with model deletion even if file deletion fails
    }
    
    await Model3D.findByIdAndDelete(req.params.id);
    
    return res.status(200).json({
      success: true,
      message: '3D model deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting 3D model:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting 3D model',
      error: error.message
    });
  }
};