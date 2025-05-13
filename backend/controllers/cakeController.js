const Cake = require('../models/cake');

const createCake = async (req, res) => {
    try {
        // Create new cake from request body
        const newCake = new Cake(req.body);
        
        // If user is authenticated, associate the cake with them
        if (req.user && req.user._id) {
            newCake.userId = req.user._id;
        }
        
        const savedCake = await newCake.save();
        
        res.status(201).json({
            success: true,
            message: 'Cake created successfully',
            data: savedCake
        });
    } catch (error) {
        console.error('Error creating cake:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create cake',
            error: error.message
        });
    }
};
const getAllCakes = async (req, res) => {
    try {
        // Extract query parameters for filtering
        const { userId, flavor, limit = 10, page = 1 } = req.query;
        
        // Build filter object
        const filter = {};
        if (userId) filter.userId = userId;
        if (flavor) filter['flavor.type'] = flavor;
        
        // Calculate pagination values
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Find cakes with filters and pagination
        const cakes = await Cake.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        // Get total count for pagination metadata
        const total = await Cake.countDocuments(filter);
        
        res.status(200).json({
            success: true,
            count: cakes.length,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            data: cakes
        });
    } catch (error) {
        console.error('Error fetching cakes:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch cakes',
            error: error.message
        });
    }
};

const getCakeById = async (req, res) => {
    try {
        const cake = await Cake.findById(req.params.id);
        
        if (!cake) {
            return res.status(404).json({
                success: false,
                message: 'Cake not found'
            });
        }
        
        res.status(200).json({
            success: true,
            data: cake
        });
    } catch (error) {
        console.error('Error fetching cake:', error);
        
        // Handle invalid ObjectId format
        if (error.kind === 'ObjectId') {
            return res.status(400).json({
                success: false,
                message: 'Invalid cake ID format',
                error: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Failed to fetch cake',
            error: error.message
        });
    }
};
const updateCake = async (req, res) => {
    try {
        // Find cake and update
        const cake = await Cake.findById(req.params.id);
        
        if (!cake) {
            return res.status(404).json({
                success: false,
                message: 'Cake not found'
            });
        }
        
        // Optional: Check ownership if implementing user auth
        if (req.user && cake.userId && cake.userId !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this cake'
            });
        }
        
        // Update the cake
        const updatedCake = await Cake.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        
        res.status(200).json({
            success: true,
            message: 'Cake updated successfully',
            data: updatedCake
        });
    } catch (error) {
        console.error('Error updating cake:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update cake',
            error: error.message
        });
    }
};

const deleteCake = async (req, res) => {
    try {
        // Find cake to delete
        const cake = await Cake.findById(req.params.id);
        
        if (!cake) {
            return res.status(404).json({
                success: false,
                message: 'Cake not found'
            });
        }
        
        // Optional: Check ownership if implementing user auth
        if (req.user && cake.userId && cake.userId !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this cake'
            });
        }
        
        // Delete the cake
        await cake.remove();
        
        res.status(200).json({
            success: true,
            message: 'Cake deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting cake:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete cake',
            error: error.message
        });
    }
};

module.exports = { 
    createCake, 
    getAllCakes, 
    getCakeById,
    deleteCake,
    updateCake
};