const express = require('express');
const cakeRoute = express.Router();
const verifyToken = require('../middleware/tokens');

// ONLY use this import approach
const controller = require('../controllers/cakeControllers');
console.log('Available controllers:', Object.keys(controller));

// Define routes using the controller object
cakeRoute.post('/createCake', verifyToken, controller.createOrUpdateCakeDesign);

// Get all cake designs (with filters)
cakeRoute.get('/getAll', controller.getAllCakeDesigns);

// Get a user's cake designs
cakeRoute.get('/cake/:userId', verifyToken, controller.getUserCakeDesigns); 

// Get, update, delete specific cake design
cakeRoute.get('/userCake/:id', controller.getCakeDesignById);
cakeRoute.put('/update/:id', verifyToken, controller.updateCakeDesign);
cakeRoute.delete('/delete/:id', verifyToken, controller.deleteCakeDesign);

module.exports = cakeRoute;