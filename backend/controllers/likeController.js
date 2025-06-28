const Like = require('../models/Like');
const Post = require('../models/Post'); 
const Comment = require('../models/Comment');
const { getPopulatedPost } = require('../utils/postPopulator'); 
const { sendLikeNotificationEmail } = require('../utils/emailService');
const { getUserFieldByCustomUserId } = require('../utils/userUtils'); 

// Toggle like for a post or a comment
exports.toggleLike = async (req, res) => {
    const { targetType, targetId } = req.params; // targetType will be 'post' or 'comment'
    const likerUserId = req.user.userId; 

    if (!likerUserId) {
        return res.status(401).json({ msg: 'Authentication required: User ID is missing.' });
    }

    try {
        let targetModel;
        let ownerUserId;
        let targetTitleOrContent; 
        let postIdForURL = null;
        let postIdForPopulation = null; 

        if (targetType === 'post') {
            targetModel = await Post.findById(targetId);
            if(targetModel)
            {
            ownerUserId = targetModel.author;  
            targetTitleOrContent = targetModel.title || targetModel.content.substring(0, 50) + "...";   
            postIdForURL = targetId;
            postIdForPopulation = targetId; // If it's a post, the postId is targetId
            }
        } else if (targetType === 'comment') {
            targetModel = await Comment.findById(targetId);
            // If it's a comment, find the parent post's ID
            if (targetModel) {
                ownerUserId = targetModel.user;
                targetTitleOrContent = targetModel.text.substring(0, 50) + "..."; 
                postIdForURL = targetModel.post;                
                postIdForPopulation = targetModel.post;
            }
        } else {
            return res.status(400).json({ msg: 'Invalid target type. Must be "post" or "comment".' });
        }

        if (!targetModel) {
            return res.status(404).json({ msg: `${targetType.charAt(0).toUpperCase() + targetType.slice(1)} not found.` });
        }

        // Check if the user has already liked this target
        const existingLike = await Like.findOne({ user: likerUserId, target: targetId, targetType: targetType === 'post' ? 'Post' : 'Comment' });

        if (existingLike) {
            // If like exists, remove it
            await Like.deleteOne({ _id: existingLike._id });
            console.log(`Like removed by user ${likerUserId} for ${targetType} ${targetId}`);
        } else {
            // If like does not exist, add it
            const newLike = new Like({
                user: likerUserId,
                target: targetId,
                targetType: targetType === 'post' ? 'Post' : 'Comment'
            });
            await newLike.save();
            console.log(`Like added by user ${likerUserId} for ${targetType} ${targetId}`);
            
            console.log("ownerUserId: ",ownerUserId.toString())
            console.log("likerUserId: ",likerUserId.toString())
            if (ownerUserId && ownerUserId.toString() !== likerUserId.toString()) {
                const ownerEmail = await getUserFieldByCustomUserId(ownerUserId, 'email');

                if (ownerEmail) {
                    await sendLikeNotificationEmail(
                        ownerEmail,
                        likerUserId, 
                        targetType,
                        targetId,
                        targetTitleOrContent,
                        postIdForURL
                    );
                } else {
                    console.warn(`toggleLike: Could not find email for owner user_id: ${ownerUserId}. Skipping like notification email.`);
                }
            } else {
                console.log(`toggleLike: Skipping like notification as owner is the liker, or ownerUserId is missing.`);
            }                   
        }

        // Get the fully populated post
        const updatedPost = await getPopulatedPost(postIdForPopulation, likerUserId);

        if (!updatedPost) {
            return res.status(404).json({ msg: 'Post not found after like update (this should not happen).' });
        }

        res.json(updatedPost);

    } catch (err) {
        // user tried to like twice, but it was already added between findOne and save
        if (err.code === 11000) {
            console.warn('Attempted duplicate like caught by unique index:', err.message);
            const postAfterDuplicateAttempt = await getPopulatedPost(postIdForPopulation, likerUserId);
            return res.json(postAfterDuplicateAttempt);
        }
        console.error('Error toggling like:', err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid ID format for target.' });
        }
        res.status(500).send('Server Error: Could not toggle like.');
    }
};