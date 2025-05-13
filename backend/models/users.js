const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose); // Import mongoose-sequence for auto-increment
require('dotenv').config({ path: '../access.env' });

// Counter Schema
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // Counter name (e.g., 'accID')
    seq: { type: Number, default: 0 }, // Current sequence value
});
const Counter = mongoose.model('Counter', counterSchema);

// Account Schema
const accountSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: false,
        trim: true, // Removes extra spaces
    },
    e_Mail: {
        type: String,
        required: true,
        unique: true, // Ensures email is unique
        lowercase: true, // Converts email to lowercase
        trim: true,
    },
    contacts: {
        type: String, // Assuming contacts is a string (e.g., phone number)
        required: false,
    },
    address: {
        type: String, // Assuming address is a string
        required: false,
    },
    username: {
        type: String,
        required: true,
        unique: true, // Ensures username is unique
        trim: true,
    },
    password: {
        type: String,
        required: true,
    },
    date_Of_Birth: {
        type: Date, // Stores date of birth as a Date object
        required: false,
    },
    created_at: {
        type: Date,
        default: Date.now, // Automatically sets the current date
    },
    updated_at: {
        type: Date,
        default: Date.now, // Automatically sets the current date
    },
    Role: {
        type: String,
        enum: ['user', 'admin'], // Restricts Role to specific values
        default: 'admin',
    },
    otp:{
        type: String,
        default: null, // Default value for OTP
    },
    otpExpire:{
        type: Date,
        default: null, // Default value for OTP expiration
    },
    isOtpVerified:{
        type: Boolean,
        default: false, // Default value for OTP verification status
    },

}, { collection: 'Users' }); // Explicitly set the collection name

// Middleware to auto-increment accID
accountSchema.plugin(AutoIncrement, { inc_field: 'accID' });
// Export the Accounts model
const Account = mongoose.model('Users', accountSchema);

module.exports = Account;