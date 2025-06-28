const jwt = require('jsonwebtoken');
const User = require('../models/User'); 

const adminMiddleware = async (req, res, next) => {
    try {
        console.log("req.user " + req.user.userId)
        if (!req.user.userId) {
            return res.status(401).json({ message: 'Not authenticated. No user ID found.' });
        }

        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'adminMiddleware: User not found.' });
        }

        if (user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Only administrators can perform this action.' });
        }
        next(); 
    } catch (error) {
        console.error('Admin middleware error:', error.message);
        res.status(500).json({ message: 'Server Error during authorization check.' });
    }
};

module.exports = adminMiddleware;