const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './access.env' });

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token == null) {
        console.log("Token not found in headers");
        return res.status(401).json({
            success: false,
            message: "Authentication required"
        });
    }

    jwt.verify(token, process.env.JWT_SECRET_KEY, (err, user) => {
        if (err) {
            console.error("Token verification failed:", err.message);
            return res.status(403).json({
                success: false, 
                message: "Invalid or expired token"
            });
        }
        console.log("Token verified successfully:", token);
        req.user = user;
        next();
    });
}

module.exports = verifyToken;