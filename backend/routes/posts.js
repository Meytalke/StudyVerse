const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const postController = require('../controllers/postsController');
const { upload, uploadToCloudinary } = require('../middleware/mediaUpload');

router.post('/', auth, upload.single('media'), uploadToCloudinary, 
postController.createPost );
router.get('/group/:groupId', auth, postController.getGroupPosts);
router.get('/:id', auth, postController.getPostById);

router.put('/:id', auth, upload.single('media'), uploadToCloudinary,
    postController.updatePost );

router.delete('/:id', auth, postController.deletePost);

module.exports = router;