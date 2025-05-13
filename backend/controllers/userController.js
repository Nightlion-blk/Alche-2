const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken'); 
const nodemailer = require("nodemailer");
const speakeasy = require("speakeasy");
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const Users = require('../models/users.js'); // Adjust the path as necessary
const saltRounds = 10;
require('dotenv').config({ path: '../access.env' });

// Add email transporter configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

const loginUser = async (req, res) => {
  const { e_Mail, password } = req.body;
  console.log("Login Request Body:", req.body);
  try {
    if (!e_Mail || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    
    // Find user by email in MongoDB
    const user = await Users.findOne({ e_Mail });
    console.log("Query Result:", user);

    if (user) {
      const hashedPassword = user.password;
      if (!hashedPassword) {
        console.error("Error: Retrieved user has no password stored.");
        return res.status(500).json({ success: false, message: "Internal Server Error" });
      }

      const isPasswordMatch = await bcrypt.compare(password, hashedPassword);
      if (isPasswordMatch) {
        console.log("Password matches!");
        const tokengenerate = jwt.sign({ e_Mail }, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });
        
        // Generate OTP (6-digit number for better UX)
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // IMPORTANT: Store OTP in user document

        user.otp = otp;
        user.otpExpire = new Date(Date.now() + 5 * 60000); // 5 minutes expiration
        user.isOtpVerified = false;
        await user.save();

        try {
          await transporter.sendMail({
            from: process.env.SMTP_USERNAME,
            to: e_Mail,
            subject: "Your Login Verification Code",
            html:
             `
               <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0;">
                <h2 style="color: #333;">Verification Code</h2>
                <p>Your verification code is:</p>
                <div style="background-color: #f4f4f4; padding: 10px; font-size: 24px; letter-spacing: 5px; text-align: center;">
                  ${otp}
                </div>
                <p>This code expires in 5 minutes.</p>
              </div>
            `
          });
          
          console.log("Email sent successfully!");

          return res.status(200).json({ 
              success: true, 
              message: 'Login successful, verification code sent to email', 
              requiresVerification: true,
              id: user._id,
              name: user.username,
              role: user.Role,
              address: user.address,
              contacts: user.contacts,
              e_Mail: user.e_Mail,
              token: tokengenerate
            });   
        } catch (error) {
          console.error("Error sending email:", error);
          return res.status(500).json({ success: false, message: 'Failed to send verification code' });
        }
      } else {
        console.log("Password does not match.");
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }
    
    } else {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};
  
//Verify Otp
const verifyOtp = async (req, res) => {
  try {
    const { e_Mail, otp } = req.body; // Changed from email to e_Mail to match frontend
    
    console.log("OTP Verification Request Body:", req.body);
    
    const user = await Users.findOne({ e_Mail }); // Use e_Mail directly, no need for e_Mail: 
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Check if OTP exists
    if (!user.otp) {
      return res.status(400).json({ success: false, message: 'No OTP requested or already used' });
    }
    
    // Add these logs right before the OTP comparison
    console.log("Stored OTP:", user.otp, "Type:", typeof user.otp);
    console.log("Submitted OTP:", otp, "Type:", typeof otp);

    if (user.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
    
    if (user.otpExpire < new Date()) {
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }

    // OTP is valid, mark as verified
    user.isOtpVerified = true;

    user.otp = null; // Clear OTP after verification

    user.otpExpire = null; // Clear OTP expiration after verification

    await user.save();
    
    // Generate a final authentication token
    const finalToken = jwt.sign(
      { userId: user._id, email: user.e_Mail, role: user.Role },
      process.env.JWT_SECRET_KEY,
      { expiresIn: '1h' }
    );
    
    // Return token and user data in response - THIS WAS MISSING!
    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      token: finalToken,
      id: user._id,
      name: user.username,
      firstName: user.first_Name,
      lastName: user.last_Name,
      e_Mail: user.e_Mail,
      role: user.Role,
      address: user.address,
      contacts: user.contacts
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

//Resend OTP
const resendOtp = async (req, res) => {
  try {
    const { e_Mail } = req.body;
    console.log("Resend OTP Request Body:", req.body);

    if (!e_Mail) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    
    // Find user by email

    const user = await Users.findOne({ e_Mail });
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Generate a new OTP
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Update user document with new OTP
    
    user.otp = otp;
    user.otpExpire = new Date(Date.now() + 5 * 60000); // 5 minutes expiration
    user.isOtpVerified = false;
    await user.save();
    
    try {
      // Send the new OTP via email
    
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: e_Mail,
        subject: "Your New Verification Code",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0;">
            <h2 style="color: #333;">New Verification Code</h2>
            <p>Your new verification code is:</p>
            <div style="background-color: #f4f4f4; padding: 10px; font-size: 24px; letter-spacing: 5px; text-align: center;">
              ${otp}
            </div>
            <p>This code expires in 5 minutes.</p>
          </div>
        `
      });
      
      console.log("New OTP email sent successfully!");
      
      return res.status(200).json({ 
        success: true, 
        message: 'New verification code sent to your email' 
      });
      
    } catch (error) {
      console.error("Error sending email:", error);
      return res.status(500).json({ success: false, message: 'Failed to send verification code' });
    }
    
  } catch (error) {
    console.error('Error resending OTP:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

//ResetPassword
const resetPassword = async (req, res) => {
  try {
    const { e_Mail, newPassword } = req.body;
    console.log("Reset Password Request Body:", req.body);
    const user = await Users.findOne({ e_Mail });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const salt = await bcrypt.genSalt(saltRounds);

    const hash = await bcrypt.hash(newPassword, salt);

    user.password = hash;

    user.otp = null; // Clear OTP after password reset

    user.otpExpire = null; // Clear OTP expiration after password reset

    user.updated_at = new Date(); // Update the updated_at field
    
    await user.save();

    console.log('Password reset successfully!');
    return res.status(200).json({ success: true, message: 'Password reset successfully!' });
  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const getProfile = async (req, res) => {
  const { id } = req.params; // Get user ID from request parameters
  console.log("Get Profile Request ID:", id);
  try {
    // Find user by ID in MongoDB
    const user = await Users.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    console.log("User found:", user);

    return res.status(200).json({ success: true, user: userProfile });
  }
  catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

const updateProfile = async (req, res) => {
  try {
    const { first_Name, last_Name, contacts, date_Of_Birth } = req.body;

    // Find user and update
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (first_Name) user.first_Name = first_Name;
    if (last_Name) user.last_Name = last_Name;
    if (contacts) user.contacts = contacts;
    if (date_Of_Birth) user.date_Of_Birth = date_Of_Birth;
    user.updated_at = new Date();

    await user.save();

    res.status(200).json({ 
      message: 'Profile updated successfully',
      user: {
        first_Name: user.first_Name,
        last_Name: user.last_Name,
        e_Mail: user.e_Mail,
        contacts: user.contacts,
        username: user.username,
        date_Of_Birth: user.date_Of_Birth
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Replace the existing getAllUsers function with this enhanced version
const getAllUsers = async (req, res) => {
  try {
    // Check for admin role
   /* if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    */
    // Extract query parameters for filtering and pagination
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      role,
      search,
      startDate,
      endDate
    } = req.query;

    // Build query object
    const query = {};
    
    // Filter by role if provided
    if (role) {
      query.Role = role;
    }
    
    // Search functionality (in first name, last name, email)
    if (search) {
      query.$or = [
        { first_Name: { $regex: search, $options: 'i' } },
        { last_Name: { $regex: search, $options: 'i' } },
        { e_Mail: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Determine sort direction
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get total count for pagination info
    const totalUsers = await Users.countDocuments(query);
    
    // Fetch users with pagination, sorting, and projection (exclude sensitive fields)
    const users = await Users.find(query)
      .select('-password -otp -otpExpire')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Format the response 
    const formattedUsers = users.map(user => ({
      id: user._id,
      firstName: user.first_Name,
      lastName: user.last_Name,
      email: user.e_Mail,
      username: user.username,
      role: user.Role,
      contacts: user.contacts,
      ordersCount: user.Orders?.length || 0,
      createdAt: user.created_at || user.createdAt,
      address: user.address
    }));

    // Return response with pagination metadata
    return res.status(200).json({
      success: true,
      totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: parseInt(page),
      users: formattedUsers
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching users', 
      error: error.message 
    });
  }
};

// Register user function
const registerUser = async (req, res) => {
  const { fullName, username, e_Mail, password, contacts, address, date_Of_Birth } = req.body;
  
  try {
    // Check if email already exists
    const existingUser = await Users.findOne({ e_Mail });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: "Email already registered" 
      });
    }

    // Check if username exists
    const existingUsername = await Users.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ 
        success: false, 
        message: "Username already taken" 
      });
    }

    // Hash the password
    const hash = await bcrypt.hash(password, saltRounds);
    
    // Create new user based on schema
    const newUser = new Users({
      fullName: fullName || '',
      username,
      e_Mail,
      password: hash,
      contacts: contacts || '',
      address: address || '',
      date_Of_Birth: date_Of_Birth || null,
      Role: 'user', // Set default role to user for new registrations
      created_at: new Date(),
      updated_at: new Date()
    });
    
    // Save the new user
    await newUser.save();
    
    // Generate JWT token for the new user
    const token = jwt.sign(
      { userId: newUser._id, email: newUser.e_Mail, role: newUser.Role, accID: newUser.accID },
      process.env.JWT_SECRET_KEY,
      { expiresIn: '1h' }
    );
    
    // Send successful response with user data
    res.status(201).json({
      success: true, 
      message: 'User registered successfully',
      id: newUser._id,
      accID: newUser.accID,
      name: newUser.fullName,
      username: newUser.username,
      role: newUser.Role,
      address: newUser.address,
      contacts: newUser.contacts,
      e_Mail: newUser.e_Mail,
      token: token
    });

  } catch (err) {
    console.error('Error registering user:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to register user', 
      error: err.message 
    });
  }
};

module.exports = { loginUser, registerUser, verifyOtp, resendOtp, resetPassword, getProfile, updateProfile, getAllUsers };