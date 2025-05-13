const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const modelsController = require('../controllers/ModelsController');
const verifyToken = require('../middleware/auth'); // Adjust path if needed

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'modelFile') {
      cb(null, path.join(__dirname, '../public/models'));
    } else if (file.fieldname === 'textures') {
      cb(null, path.join(__dirname, '../public/textures'));
    } else {
      cb(null, path.join(__dirname, '../public/uploads'));
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'modelFile') {
    const validTypes = ['.gltf', '.glb', '.obj', '.fbx', '.stl'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (validTypes.includes(ext)) {
      return cb(null, true);
    }
    return cb(new Error('Invalid file format. Supported formats: gltf, glb, obj, fbx, stl'));
  } else if (file.fieldname === 'textures') {
    const validTypes = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (validTypes.includes(ext)) {
      return cb(null, true);
    }
    return cb(new Error('Invalid texture format. Supported formats: png, jpg, jpeg, webp'));
  }
  
  cb(null, true);
};

// Setup multer upload
const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Define routes
router.get('/', modelsController.getAllModels);
router.get('/:id', modelsController.getModelById);

// Fix the POST route - make sure all parameters are functions
router.post('/', [
  verifyToken, 
  upload.fields([
    { name: 'modelFile', maxCount: 1 },
    { name: 'textures', maxCount: 5 }
  ]),
  modelsController.createModel
]);

router.put('/:id', [
  verifyToken,
  upload.fields([
    { name: 'modelFile', maxCount: 1 },
    { name: 'textures', maxCount: 5 }
  ]),
  modelsController.updateModel
]);

router.delete('/:id', verifyToken, modelsController.deleteModel);

module.exports = router;