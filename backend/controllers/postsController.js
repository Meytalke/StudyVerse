const Post = require('../models/Post');
const User = require('../models/User');
const Comment = require('../models/Comment');
const cloudinary = require('cloudinary').v2; 
const { getPopulatedPost, populatePostsArray } = require('../utils/postPopulator');

exports.createPost = async (req, res) => {
    const { title, content, type, tags, groupId,author } = req.body;
    console.log("author: " + author);
    console.log(req);
    const mediaUrl = req.mediaUrl || null; 
    const mediaType = req.mediaType || null; 

    console.log('--- createPost Controller Debug ---');
    console.log('Received data in createPost controller (req.body):', req.body);
    console.log('File object directly on req (from multer):', req.file); 
    console.log('Media URL from mediaUpload middleware:', mediaUrl);
    console.log('Media Type from mediaUpload middleware:', mediaType);
    console.log('Author ID (from auth middleware):', author); 
    console.log('Group ID in controller:', groupId);
    console.log('-----------------------------------');

    if (!title || !content || !groupId || !author) {
        return res.status(400).json({ msg: 'Please enter all required fields: title, content, group ID, and author ID.' });
    }

    try {
        const newPost = new Post({
            title,
            content,
            type,
            tags: tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '') : [],
            groupId,
            author,
            mediaUrl, 
            mediaType, 
        });

        const post = await newPost.save();

        const populatedPost = await Post.findById(post._id)
            .populate('author', 'username')
            .populate({
                path: 'comments',
                populate: { path: 'user', select: 'username' }
            });

        res.status(201).json(populatedPost);

    } catch (err) {
        console.error('Error creating post:', err.message);
        res.status(500).send('Server Error: Could not create post.');
    }
};

// Get all posts for a specific group
exports.getGroupPosts = async (req, res) => {
    try {
        const { groupId } = req.params;
        const currentUserId = req.user ? req.user.userId2 : null;

        let posts = await Post.find({ groupId: groupId })
            .populate({
                path: 'author',
                model: 'User',
                localField: 'author',
                foreignField: 'user_id',
                select: 'username email user_id'
            })
            .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    model: 'User',
                    localField: 'user',
                    foreignField: 'user_id',
                    select: 'username user_id'
                },
                options: { sort: { createdAt: -1 } }
            })
            .sort({ createdAt: -1 })
            .lean(); 

        if (!posts || posts.length === 0) {
            console.log(`DEBUG::postsController.getGroupPosts: No posts found for group ${groupId}.`);
            return res.status(200).json([]);
        }

        console.log(`DEBUG::postsController.getGroupPosts: Found ${posts.length} raw posts. Calling populatePostsArray...`);

        const populatedPosts = await populatePostsArray(posts, currentUserId);
        
        console.log(`DEBUG::postsController.getGroupPosts: Returning ${populatedPosts.length} fully populated posts for group ${groupId}.`);
        res.status(200).json(populatedPosts);

    } catch (err) {
        console.error('Error getting group posts:', err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Group ID format.' });
        }
        res.status(500).send('Server Error: Could not fetch group posts.');
    }
};

// Get post by ID
exports.getPostById = async (req, res) => {
    try {
        const postId = req.params.id;
        const currentUserId = req.user ? req.user.userId2 : null;
        const post = await getPopulatedPost(postId, currentUserId);

        if (!post) {
            console.log(`DEBUG::postsController.getPostById: Post ${postId} not found.`);
            return res.status(404).json({ msg: 'Post not found.' });
        }

        console.log(`DEBUG::postsController.getPostById: Returning fully populated post ${postId}.`);
        res.json(post);

    } catch (err) {
        console.error('Error getting post by ID:', err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Post ID format.' });
        }
        res.status(500).send('Server Error: Could not fetch post.');
    }
};

function extractPublicId(url) {
    if (!url) {
        console.warn('extractPublicId: URL is null or empty.');
        return null;
    }
    const parts = url.split('/');
    const uploadIndex = parts.indexOf('upload');

    if (uploadIndex === -1 || parts.length <= uploadIndex + 1) {
        console.warn(`extractPublicId: 'upload' segment not found or URL too short: ${url}`);
        return null; // 'upload' not found or no segments after it
    }

    // After 'upload/', the next segment is usually 'v<version_number>'.
    // The public ID starts after this version segment.
    const publicIdStartIndex = uploadIndex + 2;

    if (publicIdStartIndex >= parts.length) {
        console.warn(`extractPublicId: No public ID segments found after version in URL: ${url}`);
        return null;
    }

    const publicIdSegments = parts.slice(publicIdStartIndex);
    const publicIdWithExtension = publicIdSegments.join('/'); // Rejoin to get 'folder/filename.ext'
    const publicId = publicIdWithExtension.split('.')[0]; // Remove the file extension

    console.log(`Extracted Public ID: ${publicId} from URL: ${url}`);
    return publicId;
}

exports.updatePost = async (req, res) => {
    console.log('--- Inside postsController.updatePost ---');
    console.log('req.body:', req.body);
    console.log('req.file:', req.file);
    console.log('Is removeMedia true?', req.body.removeMedia === 'true');

    const { title, content, type, tags, removeMedia } = req.body; 
    const postId = req.params.id;

    const postFields = {};
    if (title !== undefined) postFields.title = title;
    if (content !== undefined) postFields.content = content;
    if (type !== undefined) postFields.type = type;
    if (tags !== undefined) postFields.tags = tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '');

    try {
        console.log(`Attempting to find post with ID: ${postId}`);
        let post = await Post.findById(postId);

        if (!post) {
            console.error(`Post with ID ${postId} not found.`);
            return res.status(404).json({ msg: 'Post not found' });
        }
        console.log(`Found post. Author ID: ${post.author.toString()}, User ID: ${req.user.userId2}`);

        if (req.file) { // Scenario 1: A new file was uploaded
            console.log('New file detected. Processing Cloudinary upload...');
            // If uploadToCloudinary fails or doesn't set these, they'll be undefined here.
            if (req.mediaUrl && req.mediaType) {
                if (post.mediaUrl) {
                    console.log('Existing media found, attempting to delete from Cloudinary.');
                    const publicId = extractPublicId(post.mediaUrl);
                    if (publicId) {
                        try {
                            await cloudinary.uploader.destroy(publicId);
                            console.log(`Old media with publicId ${publicId} deleted from Cloudinary.`);
                        } catch (deleteError) {
                            console.error(`Error deleting old media from Cloudinary (${publicId}):`, deleteError.message);
                        }
                    }
                }
                postFields.mediaUrl = req.mediaUrl; 
                postFields.mediaType = req.mediaType;
                console.log('New mediaUrl and mediaType set for update.');
            } else {
                // This means uploadToCloudinary failed or didn't set req.mediaUrl/mediaType
                console.error('Cloudinary upload middleware did not provide mediaUrl/mediaType after processing file.');
                return res.status(500).json({ msg: 'New media processing failed.' });
            }
        } else if (removeMedia === 'true') { // Scenario 2: User explicitly wants to remove existing media
            console.log('Remove media flag detected. Clearing existing media...');
            if (post.mediaUrl) {
                const publicId = extractPublicId(post.mediaUrl);
                if (publicId) {
                    try {
                        await cloudinary.uploader.destroy(publicId);
                        console.log(`Existing media with publicId ${publicId} deleted from Cloudinary.`);
                    } catch (deleteError) {
                        console.error(`Error deleting existing media from Cloudinary (${publicId}):`, deleteError.message);
                    }
                }
            }
            postFields.mediaUrl = null;
            postFields.mediaType = null; 
            console.log('mediaUrl and mediaType set to null for update.');
        } 
        // Scenario 3: No new file and no removeMedia flag.
        console.log('Final postFields for update:', postFields);

        const updatedPost = await Post.findByIdAndUpdate(
            postId,
            { $set: postFields },
            { new: true, runValidators: true }
        ).populate('author', 'username _id'); 

        console.log('Post updated successfully in DB.');
        res.json(updatedPost);

    } catch (err) {
        console.error('Catch block: Error in updatePost controller:', err.message, err.stack); 
        let errorMessage = 'Server Error during post update.';

        if (err.name === 'ValidationError') {
            errorMessage = 'Validation error: ' + err.message;
            res.status(400); 
        } else {
            res.status(500);
        }
        res.json({ msg: errorMessage, error: err.message });
    }
};

exports.deletePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ msg: 'Post not found.' });
        }

        console.log(post.author)
        console.log(req.user)
        if (post.author.toString() !== req.user.userId.toString()) {
            return res.status(401).json({ msg: 'User not authorized to delete this post.' });
        }

        if (post.mediaUrl) {
            try {
                const urlParts = post.mediaUrl.split('/');
                const fileNameWithExtension = urlParts[urlParts.length - 1]; 
                const folderName = urlParts[urlParts.length - 2]; 
                const publicId = `${folderName}/${fileNameWithExtension.split('.')[0]}`; 
                const resourceType = post.mediaType === 'video' ? 'video' : 'image';
                
                console.log(`Attempting to delete Cloudinary media: publicId=${publicId}, resource_type=${resourceType}`);
                await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
                console.log(`Successfully deleted media ${publicId} from Cloudinary.`);
            } catch (cloudinaryErr) {
                console.error('Error deleting media from Cloudinary:', cloudinaryErr.message);
            }
        }

        await Post.deleteOne({ _id: req.params.id });
        await Comment.deleteMany({ post: req.params.id });

        res.json({ msg: 'Post removed successfully.' });
    } catch (err) {
        console.error('Error deleting post:', err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Post ID format.' });
        }
        res.status(500).send('Server Error: Could not delete post.');
    }
};

async function getPopulatedPost2(postId, currentUserId = null) {
    try {
        const post = await Post.findById(postId)
            .populate({
                path: 'author',
                select: 'username email user_id', 
                foreignField: 'user_id',
                localField: 'author', 
                model: 'User'
            })
            .populate({
                path: 'likes',
                select: 'username user_id', 
                model: 'User'
            })
            .populate({
                path: 'comments',
                populate: [
                    {
                    path: 'user',
                    select: 'username user_id _id', 
                    foreignField: 'user_id',
                    localField: 'user', 
                    model: 'User'
                }
                ]
            })
            .lean();

        if (!post) return null;

        post.likesCount = post.likes ? post.likes.length : 0;
        post.hasLiked = currentUserId && post.likes
            ? post.likes.some(likeUser => likeUser && likeUser._id && likeUser._id.toString() === currentUserId.toString())
            : false;

        if (post.comments && post.comments.length > 0) {
            post.comments = post.comments.map(comment => {
                comment.likesCount = comment.likes ? comment.likes.length : 0;
                comment.hasLiked = currentUserId && comment.likes
                    ? comment.likes.some(likeUser => likeUser && likeUser._id && likeUser._id.toString() === currentUserId.toString())
                    : false;
                return comment;
            });
        }

        return post;
    } catch (error) {
        console.error('Error in getPopulatedPost:', error.message);
        throw error;
    }
}

exports.addComment = async (req, res) => {
    console.log("addComment at postsController!!!!");
    const { text } = req.body;
    const postId = req.params.id;
    const userId = req.user.userId;

    if (!text || text.trim() === '' || !userId) {
        return res.status(400).json({ msg: 'Comment text and user are required.' });
    }

    try {
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ msg: 'Post not found.' });
        }
        const newComment = new Comment({
            text,
            user: userId,
            post: postId
        });

        const comment = await newComment.save();

        // Add the new comment's _id to the post's comments array
        post.comments.unshift(comment._id);
        await post.save();

        // Retrieve the post entirely again with all updated and populated data
        const updatedPost = await getPopulatedPost2(postId, userId);
        console.log('updatedPost before sending to frontend:', updatedPost);
        res.status(201).json(updatedPost); 
    } catch (err) {
        console.error('Error adding comment:', err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Post ID format.' });
        }
        res.status(500).send('Server Error: Could not add comment.');
    }
};

exports.deleteComment = async (req, res) => {
    try {
        const postId = req.params.post_id;
        const commentId = req.params.comment_id;
        const userId = req.user.userId2;

        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ msg: 'Post not found' });
        }

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ msg: 'Comment not found' });
        }

        if (comment.post.toString() !== postId) {
            return res.status(400).json({ msg: 'Comment not belong to this post' });
        }

        if (comment.user.toString() !== userId.toString() && post.author.toString() !== userId.toString()) {
            return res.status(401).json({ msg: 'This user can not delete this comment' });
        }

        post.comments = post.comments.filter(
            (commId) => commId.toString() !== commentId
        );
        await post.save();
        await Comment.deleteOne({ _id: commentId });

        const updatedPost = await getPopulatedPost(postId, userId);
        res.json(updatedPost); 
    } catch (err) {
        console.error('Error deleted comment', err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid ID format' });
        }
        res.status(500).send('Server error: can not delete this comment');
    }
};