const jwt = require('jsonwebtoken');
const User = require('../models/users');
require('dotenv').config({ path: '../access.env' });
const speakeasy = require("speakeasy");

async function verifyOTP(req, res, next) {
    const { otp, token } = req.body; 
    
    // Basic validation
    if (!otp || !token) {
        return res.status(400).json({ error: "OTP and token are required" });
    }
    
    try {
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET_OT); 
        
        if (!decoded.email) {
            return res.status(400).json({ error: "Invalid token payload" });
        }
        
        // Find user from decoded email
        const user = await User.findOne({ e_Mail: decoded.email });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        
        // Verify using speakeasy
        const isValid = speakeasy.totp.verify({
            secret: process.env.JWT_SECRET_OT,
            encoding: "base32",
            token: otp,
            window: 1, // Allows for 1 period before and after
        });
        
        if (!isValid) {
            return res.status(401).json({ error: "Invalid or expired OTP" });
        }
        
        // Update user verification status
        user.isOtpVerified = true;
        user.otp = null; // Clear OTP after successful verification
        user.otpExpire = null;
        await user.save();
        
        // Add user data to request
        req.user = {
            id: user._id,
            email: user.e_Mail,
            username: user.username,
            role: user.Role
        };
        
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: "Invalid token" });
        } else if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: "Token has expired" });
        }
        res.status(500).json({ error: "Server error: " + error.message });
    }
}

module.exports = verifyOTP;