const express = require('express');
const router = express.Router();
const likesController = require('../controllers/likeController');
const auth = require('../middleware/authMiddleware');

router.put('/:targetType/:targetId', auth, likesController.toggleLike);

module.exports = router;