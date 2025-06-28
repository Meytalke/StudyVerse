const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const auth = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware'); 

router.get('/profile/:userId', usersController.getPublicUserProfile);
router.get('/:userId/groups', auth, usersController.getUserGroups);
router.get('/:userId/posts', auth, usersController.getUserPosts);
router.get('/:userId', auth, usersController.getUserById);
router.get('/', auth, usersController.getUsers); 

router.put('/profile', auth, usersController.updateProfile);
router.delete('/me', auth, usersController.deleteMe);

router.get('/admin/all', auth, usersController.getAllUsers);
router.delete('/admin/:userId', auth, adminMiddleware, usersController.deleteUser);
router.put('/admin/:userId', auth, adminMiddleware, usersController.updateUserByAdmin);
router.patch('/admin/:userId/role', auth, adminMiddleware, usersController.updateUserRole);

module.exports = router;