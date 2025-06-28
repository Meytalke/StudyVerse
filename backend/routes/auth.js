const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth  = require('../middleware/authMiddleware'); 

router.get('/me', auth, authController.me);

router.post('/login',authController.login);
router.post('/register', authController.register);

router.get('/verify-email/:token', authController.verifyEmail);

router.post('/change-password', auth, authController.changePassword);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);

module.exports = router;