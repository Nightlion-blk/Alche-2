const express = require('express');
const {getAllUsers, loginUser, registerUser, verifyOtp, resendOtp, resetPassword } = require('../controllers/userController.js');
const userRouter = express.Router();

userRouter.post('/login', loginUser);
userRouter.post('/register', registerUser);
userRouter.post('/verify-otp', verifyOtp);
userRouter.post('/resend-otp', resendOtp); // Assuming resend OTP uses the same 
userRouter.post('/reset-password', resetPassword); // Assuming resend OTP uses the same endpoint as 
userRouter.get('/all', getAllUsers); // Assuming you want to get all users

// verify OTP
// controller as verify OTP
module.exports = userRouter;