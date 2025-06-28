const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const verifyAuthToken = require('../middleware/authMiddleware'); 

router.post('/', commentController.addComment);
router.put('/:commentId', commentController.updateComment);
router.delete('/:commentId', commentController.deleteComment);

module.exports = router;