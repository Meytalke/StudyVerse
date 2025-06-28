const User = require('../models/User');
const Post = require('../models/Post');
const Group = require('../models/Group');
const Comment = require('../models/Comment');
const Like = require('../models/Like');
const mongoose = require('mongoose');

exports.getUserStats = async (req, res, next) => {
    console.log('Backend: Entering getUserStats controller.');
    try {
        const { userId: mongoUserIdFromParams } = req.params;

        console.log(`Backend: Received request for user stats. MongoDB _id from params: ${mongoUserIdFromParams}`);

        if (!mongoose.Types.ObjectId.isValid(mongoUserIdFromParams)) {
            console.error(`Invalid MongoDB _id format received in params: ${mongoUserIdFromParams}`);
            return res.status(400).json({ message: 'Invalid User ID format.' });
        }

        const user = await User.findById(mongoUserIdFromParams);
        if (!user) {
            console.log(`User with MongoDB _id ${mongoUserIdFromParams} NOT found in DB.`);
            return res.status(404).json({ message: 'User not found.' });
        }
        console.log(`Found user: ${user.username}, MongoDB _id: ${user._id}, Custom user_id: ${user.user_id}`);
        const userIdForQueries = user.user_id;

        // Fetch User Posts
        console.log(`Querying posts for author matching custom user_id: ${userIdForQueries}`);
        const userPosts = await Post.find({ author: userIdForQueries })
            .populate({
                path: 'groupId',
                select: 'name'
            });
        console.log(`Found ${userPosts.length} posts for user ${user.username}.`);

        const userPostIds = userPosts.map(post => post._id);

        // Calculate Total Comments on User Posts
        console.log(`Calculating total comments on user's posts...`);
        const totalComments = await Comment.countDocuments({ post: { $in: userPostIds } });
        console.log(`Total comments on user's posts: ${totalComments}`);

        // Calculate Total Likes on User Posts
        console.log(`Calculating total likes on user's posts...`);
        const totalPostLikes = await Like.countDocuments({
            target: { $in: userPostIds },
            targetType: "Post"
        });
        console.log(`Total likes on user's posts: ${totalPostLikes}`);

        // Fetch User Groups
        console.log(`Querying groups for member matching custom user_id: ${userIdForQueries}`);
        const userGroups = await Group.find({ members: userIdForQueries });
        console.log(`Found ${userGroups.length} groups for user ${user.username}.`);

        // This replaces the slow for loop by running all count operations concurrently.
        console.log(`Backend: Preparing popular posts data using Promise.all...`);
        const popularPostsPromises = userPosts.map(async (post) => {
            const likesCount = await Like.countDocuments({ target: post._id, targetType: "Post" });
            const commentsCount = await Comment.countDocuments({ post: post._id });
            return {
                _id: post._id,
                title: post.title,
                comments: commentsCount,
                likes: likesCount,
                group_name: post.groupId ? post.groupId.name : 'Unknown Group'
            };
        });

        // Execute all promises concurrently
        const popularPostsWithStats = await Promise.all(popularPostsPromises);

        // Sort by combined likes and comments
        popularPostsWithStats.sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments));
        const topPopularPosts = popularPostsWithStats.slice(0, 3);
        console.log("Top 3 Popular Posts (by likes + comments):", topPopularPosts);

        // Calculate Activity Over Time
        const activityMap = new Map();
        userPosts.forEach(post => {
            if (post.createdAt instanceof Date && !isNaN(post.createdAt.getTime())) {
                const postDateString = post.createdAt.toISOString().split('T')[0];
                activityMap.set(postDateString, (activityMap.get(postDateString) || 0) + 1);
            } else {
                console.warn(`Post ID ${post._id} has an invalid or missing createdAt date (${post.createdAt}). Skipping for activity chart.`);
            }
        });
        const activityOverTime = Array.from(activityMap.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        console.log("Processed Activity Over Time data:", activityOverTime);

        // Calculate Content Type Distribution
        const contentDistributionMap = new Map();
        userPosts.forEach(post => {
            if (post.type) {
                contentDistributionMap.set(post.type, (contentDistributionMap.get(post.type) || 0) + 1);
            } else {
                console.warn(`Post ${post._id} has no 'type' field. Skipping for content distribution chart.`);
            }
        });
        const contentDistribution = Array.from(contentDistributionMap.entries()).map(([type, count]) => ({ type, count }));
        console.log("Processed Content Type Distribution data:", contentDistribution);

        // Send Response
        res.status(200).json({
            totalComments: totalComments, 
            totalPostLikes: totalPostLikes,
            userPostsCount: userPosts.length,
            userGroupsCount: userGroups.length,
            popularPosts: topPopularPosts, 
            activityOverTime,
            contentDistribution,
        });
        console.log('Backend: Successfully sent user stats response.');

    } catch (error) {
        console.error('Backend: Error in getUserStats:', error);
        res.status(500).json({ message: 'Internal server error while fetching user stats.' });
    }
};