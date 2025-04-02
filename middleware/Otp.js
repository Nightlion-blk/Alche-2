const jwt =require('jsonwebtoken');
require('dotenv').config({ path: './access.env' });
const speakeasy = require("speakeasy");

async function verifyOTP(req, res, next) {
    const { otp, token } = req.body; 
   try{
    const decoded = jwt.verify(token, process.env.JWT_SECRET_OT); 
    const isValid = speakeasy.totp.verify({
        secret: process.env.JWT_SECRET_OT,
        encoding: "base32",
        token: otp,
        window: 1,
      });
      if (!isValid) return res.status(401).json({ error: "Invalid OTP" });
      req.user = decoded;
      next(); 
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
module.exports = verifyOTP;