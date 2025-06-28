const Comment = require('../models/Comment');
const Post = require('../models/Post');
const Like = require('../models/Like'); 
const { getPopulatedPost } = require('../utils/postPopulator');
const mongoose = require('mongoose'); 
const { sendCommentNotificationEmail } = require('../utils/emailService');
const { getUserFieldByCustomUserId } = require('../utils/userUtils'); 

// Add a comment to a post
exports.addComment = async (req, res) => {
    console.log("addComment at commentController!!!!");
    const { postId, text } = req.body; 
    console.log(req);
    const userId = req.body.userId; 

    if (!text || text.trim() === '' || !userId || !postId) {
        return res.status(400).json({ msg: 'Comment text, post ID, and user are required.' });
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
        post.comments.unshift(comment._id);

        await post.save();

        const updatedPost = await getPopulatedPost(postId, userId);
        const email = await getUserFieldByCustomUserId(post.author, 'email');
        const commenterName = await getUserFieldByCustomUserId(userId, 'username');
        sendCommentNotificationEmail(email, commenterName, post.title, post._id, newComment.text)
        res.status(201).json(updatedPost);
    } catch (err) {
        console.error('Error adding comment:', err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Post ID format.' });
        }
        res.status(500).send('Server Error: Could not add comment.');
    }
};

exports.updateComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const { text } = req.body;

        if (!text || text.trim() === '') {
            return res.status(400).json({ message: 'Comment text cannot be empty.' });
        }

        let comment = await Comment.findById(commentId);

        if (!comment) {
            return res.status(404).json({ message: 'Comment not found.' });
        }

        comment.text = text;
        comment.updatedAt = Date.now();
        await comment.save();
        const post = await Post.findById(comment.post)
            .populate({
                path: 'author',
                select: 'username user_id'
            })
            .populate({
                path: 'comments',
                options: { sort: { createdAt: 1 } },
                populate: { path: 'user', select: 'username user_id' } 
            });

        if (!post) {
            return res.status(404).json({ message: 'Associated post not found after comment update.' });
        }

        const postLikes = await Like.find({ target: post._id, targetType: 'Post' }).select('user');

        const commentIds = post.comments.map(c => c._id);
        const commentsLikes = await Like.find({ target: { $in: commentIds }, targetType: 'Comment' }).select('user target');

        const postObject = post.toObject(); 
        postObject.likes = postLikes.map(like => ({ user_id: like.user }));

        postObject.comments = postObject.comments.map(commentObj => {
            const likesForThisComment = commentsLikes.filter(
                like => like.target.equals(commentObj._id) 
            );
            return {
                ...commentObj,
                likes: likesForThisComment.map(like => ({ user_id: like.user }))
            };
        });

        res.json(postObject);
    } catch (err) {
        console.error('Error in updateComment:', err.message);
        res.status(500).json({ message: 'Server Error: Could not update comment.' });
    }
};

exports.deleteComment = async (req, res) => {
    try {
        const { commentId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(commentId)) {
            return res.status(400).json({ msg: 'Invalid comment ID format.' });
        }

        const comment = await Comment.findById(commentId);

        if (!comment) {
            return res.status(404).json({ msg: 'Comment not found.' });
        }

        const postId = comment.post;

        await Like.deleteMany({ target: comment._id, targetType: 'Comment' });
        console.log(`DEBUG::commentsController.deleteComment: Deleted likes for comment ${commentId}.`);

        await Comment.deleteOne({ _id: commentId });
        console.log(`DEBUG::commentsController.deleteComment: Comment ${commentId} deleted.`);

        await Post.findByIdAndUpdate(postId, { $pull: { comments: commentId } });
        console.log(`DEBUG::commentsController.deleteComment: Removed comment ${commentId} from post ${postId}.`);

        const updatedPost = await Post.findById(postId)
            .populate({
                path: 'author',
                select: 'username avatar'
            })
            .populate({
                path: 'comments',
                options: { sort: { createdAt: 1 } },
                populate: { path: 'user', select: 'username avatar' }
            });

        if (!updatedPost) {
            return res.status(404).json({ message: 'Associated post not found after comment deletion.' });
        }

        const postObject = updatedPost.toObject();
        const postLikes = await Like.find({ target: postObject._id, targetType: 'Post' }).select('user');
        postObject.likes = postLikes.map(like => ({ user_id: like.user }));

        const commentIds = postObject.comments.map(c => c._id);
        const commentsLikes = await Like.find({ target: { $in: commentIds }, targetType: 'Comment' }).select('user target');

        postObject.comments = postObject.comments.map(commentObj => {
            const likesForThisComment = commentsLikes.filter(
                like => like.target.equals(commentObj._id)
            );
            return {
                ...commentObj,
                likes: likesForThisComment.map(like => ({ user_id: like.user }))
            };
        });

        res.json(postObject);
    } catch (err) {
        console.error('Error deleting comment:', err.message);
        if (err.name === 'CastError' && err.path === '_id') {
            return res.status(400).json({ msg: 'Invalid comment ID format.' });
        }
        res.status(500).send('Server Error: Could not delete comment.');
    }
};