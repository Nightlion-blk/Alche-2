const mongoose = require('mongoose');

// Define the Product schema
const productSchema = new mongoose.Schema({
    ProductID: {
        type: String, // Assuming ProductID is a string (change to Number if it's numeric)
        required: true,
        unique: true, // Ensures ProductID is unique
    },

    Name: {
        type: String,
        required: true,
        trim: true, // Removes extra spaces
    },

    Description: {
        type: String,
        required: true,
        trim: true,
    },

    Price: {
        type: Number, // Assuming Price is a numeric value
        required: true,
        min: 0, // Ensures the price is non-negative
    },

    StockQuantity: {
        type: Number, // Assuming StockQuantity is a numeric value
        required: true,
        min: 0, // Ensures the stock quantity is non-negative
    },

    Category: {
        type: String,
        required: true,
        trim: true,
    },
    Status: {
        type: String,
        enum: ['Deleted', 'Available', 'Not Available'], // Assuming status can be either 'active' or 'inactive'
        default: 'Available', // Default value for status
    },
    Image: [{
        public_id: {
            type: String, // Assuming public_id is a string (e.g., from cloudinary)
            required: true,
        },
        url: {
            type: String, // Assuming url is a string (e.g., from cloudinary)
            required: true,
        },
    }],
    salesData: {
        totalSold: {
            type: Number,
            default: 0
        },
        lastMonthSold: {
            type: Number, 
            default: 0
        },
        lastWeekSold: {
            type: Number,
            default: 0
        },
        bestSellerRank: {
            type: Number,
            default: null
        },
        bestSellerSince: {
            type: Date,
            default: null
        },
        isBestSeller: {
            type: Boolean,
            default: false
        }
    }


}, { collection: 'Products' }); // Explicitly set the collection name

// Export the Product model
const Product = mongoose.model('Products', productSchema);

module.exports = Product;