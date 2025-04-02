const express = require('express');
const { loginUser, registerUser } = require('../controllers/userController.js');
const verifyOTP = require('../middleware/Otp.js');
const userRouter = express.Router();

userRouter.post('/login', loginUser);
userRouter.post('/register', registerUser);
userRouter.post('/verify-otp', verifyOTP);

module.exports = userRouter;