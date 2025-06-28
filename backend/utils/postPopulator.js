const Post = require('../models/Post');
const Like = require('../models/Like');
const mongoose = require('mongoose');

async function getPopulatedPost(postId, currentUserId = null) {
    console.log(`--- DEBUG::getPopulatedPost START for postId: ${postId}, currentUserId: ${currentUserId} ---`);
    try {
        const post = await Post.findById(postId)
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
            .lean();

        if (!post) {
            console.log(`DEBUG::getPopulatedPost: Post with ID ${postId} not found. Returning null.`);
            return null;
        }

        console.log('DEBUG::getPopulatedPost: Post after initial populate (author, comments):', JSON.stringify(post, null, 2));

        const postLikes = await Like.find({
            target: post._id,
            targetType: 'Post'
        })
        .populate({
            path: 'user',
            model: 'User',
            localField: 'user',
            foreignField: 'user_id',
            select: 'username user_id _id'
        })
        .lean();

        console.log(`DEBUG::getPopulatedPost: Found ${postLikes.length} likes for post ${postId}.`);
        
        post.likes = postLikes.map(likeEntry => {
            if (likeEntry.user && likeEntry.user.user_id && likeEntry.user.username) {
                return {
                    _id: likeEntry.user.user_id,
                    username: likeEntry.user.username
                };
            }
            console.warn(`DEBUG::getPopulatedPost: WARNING! Incomplete user data in post likeEntry for postId ${postId}, user object is: ${JSON.stringify(likeEntry.user)}. Returning null for this like.`);
            return null;
        }).filter(Boolean);

        post.likesCount = post.likes.length;
        post.hasLiked = currentUserId && post.likes.some(likeUser =>
            likeUser && likeUser._id && likeUser._id.toString() === currentUserId.toString()
        );

        console.log(`DEBUG::getPopulatedPost: Final post likesCount: ${post.likesCount}, hasLiked: ${post.hasLiked}`);

        if (post.comments && post.comments.length > 0) {
            console.log(`DEBUG::getPopulatedPost: Processing ${post.comments.length} comments.`);
            for (let comment of post.comments) {
                if (!mongoose.Types.ObjectId.isValid(comment._id)) {
                    console.warn(`DEBUG::getPopulatedPost: WARNING! Invalid comment ID for comment: ${comment._id}. Skipping like population for this comment.`);
                    comment.likes = [];
                    comment.likesCount = 0;
                    comment.hasLiked = false;
                    continue;
                }

                const commentLikes = await Like.find({
                    target: comment._id,
                    targetType: 'Comment'
                })
                .populate({
                    path: 'user',
                    model: 'User',
                    localField: 'user',
                    foreignField: 'user_id',
                    select: 'username user_id _id'
                })
                .lean();
                
                comment.likes = commentLikes.map(likeEntry => {
                    if (likeEntry.user && likeEntry.user.user_id && likeEntry.user.username) {
                        return {
                            _id: likeEntry.user.user_id,
                            username: likeEntry.user.username
                        };
                    }
                    console.warn(`DEBUG::getPopulatedPost: WARNING! Incomplete user data in comment likeEntry for commentId ${comment._id}, user object is: ${JSON.stringify(likeEntry.user)}. Returning null for this like.`);
                    return null;
                }).filter(Boolean);

                comment.likesCount = comment.likes.length;
                comment.hasLiked = currentUserId && comment.likes.some(likeUser =>
                    likeUser && likeUser._id && likeUser._id.toString() === currentUserId.toString()
                );
            }
        } else {
            console.log('DEBUG::getPopulatedPost: No comments found for this post or comments array is empty.');
        }

        console.log('--- DEBUG::getPopulatedPost END ---');
        return post;
    } catch (error) {
        console.error('CRITICAL ERROR in getPopulatedPost helper:', error.message, error.stack);
        throw error;
    }
}

async function populatePostsArray(posts, currentUserId = null) {
    if (!posts || posts.length === 0) {
        return [];
    }

    console.log(`--- DEBUG::populatePostsArray START for ${posts.length} posts, currentUserId: ${currentUserId} ---`);

    const postIds = posts.map(p => p._id);
    const commentIds = posts.flatMap(p => p.comments ? p.comments.map(c => c._id) : []);

    const allTargetIds = [...postIds, ...commentIds];

    let allLikes = [];
    if (allTargetIds.length > 0) {
        allLikes = await Like.find({
            target: { $in: allTargetIds }
        })
        .populate({
            path: 'user',
            model: 'User',
            localField: 'user',
            foreignField: 'user_id',
            select: 'username user_id _id'
        })
        .lean();
        console.log(`DEBUG::populatePostsArray: Fetched ${allLikes.length} total likes for ${allTargetIds.length} targets.`);
    }

    const likesMap = new Map();
    allLikes.forEach(like => {
        if (!likesMap.has(like.target.toString())) {
            likesMap.set(like.target.toString(), []);
        }
        if (like.user && like.user.user_id && like.user.username) {
            likesMap.get(like.target.toString()).push({
                _id: like.user.user_id,
                username: like.user.username
            });
        } else {
            console.warn(`DEBUG::populatePostsArray: WARNING! Incomplete user data in a like entry, user object is: ${JSON.stringify(like.user)}. Skipping this like.`);
        }
    });

    const processedPosts = posts.map(post => {
        post.likes = likesMap.get(post._id.toString()) || [];
        post.likesCount = post.likes.length;
        post.hasLiked = currentUserId ? post.likes.some(likeUser =>
            likeUser && likeUser._id && likeUser._id.toString() === currentUserId.toString()
        ) : false;

        if (post.comments && post.comments.length > 0) {
            post.comments = post.comments.map(comment => {
                comment.likes = likesMap.get(comment._id.toString()) || [];
                comment.likesCount = comment.likes.length;
                comment.hasLiked = currentUserId ? comment.likes.some(likeUser =>
                    likeUser && likeUser._id && likeUser._id.toString() === currentUserId.toString()
                ) : false;
                return comment;
            });
        }
        return post;
    });

    console.log(`--- DEBUG::populatePostsArray END ---`);
    return processedPosts;
}

module.exports = { getPopulatedPost, populatePostsArray };