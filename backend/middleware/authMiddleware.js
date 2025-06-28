const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/User'); 

const auth = async (req, res, next) => {
    //Authorization Header
    const authHeader = req.headers.authorization;
    console.log('AUTH MIDDLEWARE - Authorization Header:', authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('AUTH MIDDLEWARE - Authorization Header Missing or Invalid Format');
        return res.status(401).json({ message: 'Authentication invalid: Token missing or malformed' });
    }

    const token = authHeader.split(' ')[1];
    console.log('AUTH MIDDLEWARE - Token received:', token ? 'YES' : 'NO');

    try {
        // Decrypting the token using the secret key
        const payload = jwt.verify(token, config.jwtSecret);
        console.log('AUTH MIDDLEWARE - Payload decoded:', payload);

        if (!payload.userId2) {
            console.error('AUTH MIDDLEWARE - Invalid token payload: userId2 (user_id) missing.');
            return res.status(401).json({ message: 'Authentication invalid: Missing user ID in token.' });
        }
        
        const user = await User.findOne({ user_id: payload.userId2 }).select('-password_hash'); 
        console.log('AUTH MIDDLEWARE - User found in DB:', user ? user.username : 'null (not found)');

        if (!user) {
            console.error('AUTH MIDDLEWARE - User Not Found in Database for user_id:', payload.userId2);
            return res.status(401).json({ message: 'Authentication invalid: User not found in database.' });
        }


        req.user = { 
            _id: user._id.toString(), 
            userId: user.user_id.toString(), 
            username: user.username,
            role: user.role
        };
        console.log(`AUTH MIDDLEWARE - User ${req.user.username} (${req.user.userId}) authenticated successfully.`);
        next(); // Proceed to the next middleware/route handler
    } catch (error) {
        console.error('AUTH MIDDLEWARE - JWT Verification or User Lookup Failed:', error.message, error);
        // JWT errors
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Authentication invalid: Token expired. Please log in again.' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Authentication invalid: Invalid token. Please log in again.' });
        }
        return res.status(500).json({ message: 'Authentication failed due to server error.' });
    }
};

module.exports = auth;
