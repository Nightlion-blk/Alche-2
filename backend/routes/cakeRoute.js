const express = require('express');
const cake = express.Router();
const {
    createCake,
    getAllCakes,
    getCakeById,
    updateCake,
    deleteCake
} = require('../controllers/cakeController');

cake.post('/cake', createCake); // Create a new cake
cake.get('/all', getAllCakes); // Get all cakes
cake.get('/:id', getCakeById); // Get a cake by ID
cake.put('/:id', updateCake); // Update a cake by ID
cake.delete('/:id', deleteCake); // Delete a cake by ID

module.exports = cake;
