const Group = require('../models/Group');
const JoinRequest = require('../models/JoinRequest');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Post = require('../models/Post');
const { sendGroupJoinConfirmationEmail } = require('../utils/emailService');
const { getUserFieldByCustomUserId } = require('../utils/userUtils');

const createGroup = asyncHandler(async (req, res) => {
  const { name, description, institution, courseCode, isPrivate, requiresApproval } = req.body;

  if (!name || !description || !institution || !courseCode) {
    return res.status(400).json({ message: 'Please provide all required fields for the group' });
  }

  const newGroup = new Group({
    name,
    description,
    institution,
    courseCode,
    isPrivate: isPrivate || false,
    requiresApproval: isPrivate ? (requiresApproval || true) : false, 
    creator: req.user.userId, 
    members: [req.user.userId], 
  });

  const createdGroup = await newGroup.save();
  res.status(201).json(createdGroup);
});

const getAllGroups = asyncHandler(async (req, res) => {
  const groups = await Group.find({}).sort({ createdAt: -1 });
  res.json(groups);
});

const updateGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { name, description, institution, courseCode, isPrivate } = req.body;
        const userId = req.user.userId; 

        if (!mongoose.Types.ObjectId.isValid(groupId)) {
            return res.status(400).json({ message: 'Invalid Group ID format.' });
        }

        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({ message: 'Group not found.' });
        }

        console.log("group.creator " + group.creator.toString());
        console.log("userId " + userId);

        if (group.creator.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'You are not authorized to update this group.' });
        }

        if (name !== undefined) group.name = name;
        if (description !== undefined) group.description = description;
        if (institution !== undefined) group.institution = institution;
        if (courseCode !== undefined) group.courseCode = courseCode;
        if (isPrivate !== undefined) group.isPrivate = isPrivate;

        const updatedGroup = await group.save();

        res.status(200).json(updatedGroup);
    } catch (error) {
        console.error('Error updating group:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Server error: Failed to update group.' });
    }
};

const removeGroupMember = asyncHandler(async (req, res) => {
    const { groupId, memberId } = req.params; 
    const adminId = req.user.userId; 

    console.log(`Attempting to remove member. Group ID: ${groupId}, Member ID to remove (user_id): ${memberId}`);
    console.log(`Admin ID (current user user_id): ${adminId}`);

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(memberId)) {
       return res.status(400).json({ message: 'Invalid Group ID or Member ID format.' });  
    }

    const group = await Group.findById(groupId);
    if (!group) {
        return res.status(404).json({ message: 'Group not found' });  
    }

    console.log(`Group found. Creator (user_id): ${group.creator.toString()}`);
    console.log('Current members in group.members array (before filter - these are user_ids):');
    group.members.forEach(m => console.log(`  - ${m.toString()}`));


    // Only the group creator can remove members
    if (group.creator.toString() !== adminId.toString()) {
        return res.status(403).json({ message: 'Not authorized to remove members from this group.' });  
    }

    // Prevent removing the creator itself (comparing user_ids)
    if (group.creator.toString() === memberId.toString()) {
        return res.status(400).json({ message: 'Cannot remove the group creator from the group. Delete the group instead.' });  
    }

    const initialMemberCount = group.members.length;
    group.members = group.members.filter(
        (storedMemberUserId) => storedMemberUserId.toString() !== memberId.toString()
    );

    if (group.members.length === initialMemberCount) {
        // This means the memberId was not found in the group.members array
        console.error(`Filter did not change member count. Target member user_id ${memberId} was not found in the group's members array.`);
        return res.status(404).json({ message: 'Member not found in this group' });  
    }

    await group.save();

    // Optionally, remove any pending join requests for this user if they were trying to rejoin
    await JoinRequest.deleteMany({ user: memberId, group: groupId, status: 'pending' });

    res.status(200).json({ message: 'Member removed successfully', groupId: group._id, removedMemberId: memberId });
});

const getGroupById = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.groupId)
    .populate({
    path: 'creator',
    select: 'username email',
    foreignField: 'user_id', 
    localField: 'creator'
    })
    .populate({
    path: 'members',
    select: 'username email',
    foreignField: 'user_id', 
    localField: 'members'
    })
    .lean();;

  console.log('Group after populate:', group);

  if (!group) {
          return res.status(404).json({ message: 'Group not found' });
      }
      try {
          const postCount = await Post.countDocuments({ groupId: group._id }); 
          group.postCount = postCount;

          console.log('Group with postCount:', postCount); 
          res.json(group); 
      } catch (countError) {
          console.error('Error counting posts for group:', group._id, countError);
          res.json(group);
      }
});

const requestToJoinGroup = asyncHandler(async (req, res) => {
    const groupId = req.params.groupId;
    const userId = req.user.userId; 

    const group = await Group.findById(groupId);
    if (!group) {
        return res.status(404).json({ message: 'Group not found' });  
    }

    if (!group.isPrivate) { 
        return res.status(400).json({ message: 'This group does not require join requests or is public. Use direct join.' });
    }

    const isMember = group.members.some(memberId => memberId.toString() === userId.toString());
    if (isMember) {
        return res.status(400).json({ message: 'You are already a member of this group.' });
    }

    const existingRequest = await JoinRequest.findOne({
        group: groupId,
        user: userId,
        status: 'pending',
    });

    console.log("existingRequest: ", existingRequest);
    if (existingRequest) {
        return res.status(400).json({ message: 'You already have a pending join request for this group.' });
    }

    const newRequest = await JoinRequest.create({ 
        user: userId,
        group: groupId,
    });

    res.status(201).json({ message: 'Join request sent successfully', request: newRequest }); // תיקון: השתמש ב-newRequest
});

const getJoinRequests = asyncHandler(async (req, res) => {
  const groupId = req.params.groupId;
  const userId = req.user.userId;

  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({ message: 'Group not found' });
  }

  if (group.creator.toString() !== userId.toString()) {
    return res.status(403).json({ message: 'Not authorized to view join requests for this group' });
  }

  const joinRequests = await JoinRequest.find({ group: groupId, status: 'pending' })
  .populate({
      path: 'user',
      select: 'username email',
      foreignField: 'user_id', 
      localField: 'user'    
    })

  res.json(joinRequests);
});

const approveJoinRequest = asyncHandler(async (req, res) => {
  const { groupId, requestId } = req.params;
  const userId = req.user.userId;

  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({ message: 'Group not found' });
  }

  if (group.creator.toString() !== userId.toString()) {
    return res.status(403).json({ message: 'Not authorized to approve join requests for this group' });
  }

  const joinRequest = await JoinRequest.findById(requestId);
  if (!joinRequest || joinRequest.group.toString() !== groupId || joinRequest.status !== 'pending') {
    return res.status(404).json({ message: 'Join request not found or already processed' });
  }

  if (group.members.includes(joinRequest.user)) {
    return res.status(400).json({ message: 'User is already a member of this group' });
  }

  group.members.push(joinRequest.user);
  await group.save();

  joinRequest.status = 'approved';
  await joinRequest.save();

  const email = await getUserFieldByCustomUserId(joinRequest.user, 'email');
  sendGroupJoinConfirmationEmail(email, group.name, group._id);
  res.json({ message: 'Join request approved', groupId: group._id, userId: joinRequest.user });
});

const rejectJoinRequest = asyncHandler(async (req, res) => {
  const { groupId, requestId } = req.params;
  const userId = req.user.userId;

  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({ message: 'Group not found' });
  }

  if (group.creator.toString() !== userId.toString()) {
    return res.status(403).json({ message: 'Not authorized to reject join requests for this group' });
  }

  const joinRequest = await JoinRequest.findById(requestId);
  if (!joinRequest || joinRequest.group.toString() !== groupId || joinRequest.status !== 'pending') {
    return res.status(404).json({ message: 'Join request not found or already processed' });
  }

  joinRequest.status = 'rejected';
  await joinRequest.save();

  res.json({ message: 'Join request rejected', requestId: joinRequest._id });
});
const deleteGroup = asyncHandler(async (req, res) => {
  const groupId = req.params.groupId;

  const group = await Group.findById(groupId);

  if (!group) {
    return res.status(404).json({ message: 'Group not found' });
  }

  await Group.deleteOne({ _id: groupId }); 

  res.status(200).json({ message: `Group ${groupId} deleted successfully` });
});

const joinGroup = asyncHandler(async (req, res) => {
  const groupId = req.params.groupId;
  const userId = req.user.userId;

  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({ message: 'Group not found' });
  }

  const isMember = group.members.includes(userId);
  if (isMember) {
    return res.status(400).json({ message: 'You are already a member of this group' });
  }

  if (group.isPrivate && group.requiresApproval) {
    return res.status(400).json({ message: 'This is a private group that requires approval. Please send a join request.' });
  }

  group.members.push(userId);
  await group.save();

  res.json({ message: 'Successfully joined the group', groupId: group._id });
});

const leaveGroup = asyncHandler(async (req, res) => {
  const groupId = req.params.groupId;
  const userId = req.user.userId;

  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({ message: 'Group not found' });
  }

  const isMember = group.members.includes(userId);
  if (!isMember) {
    return res.status(400).json({ message: 'You are not a member of this group' });
  }

  group.members = group.members.filter(memberId => memberId.toString() !== userId.toString());
  await group.save();
  await JoinRequest.deleteMany({ user: userId, group: groupId, status: 'pending' });

  res.json({ message: 'Successfully left the group', groupId: group._id });
});

const getGroupMembers = asyncHandler(async (req, res) => {
  const groupId = req.params.groupId;
  const group = await Group.findById(groupId).populate('members', 'name email');
  if (!group) {
    return res.status(404).json({ message: 'Group not found' });
  }
  res.json(group.members);
});

const getTrendingGroups = asyncHandler(async (req, res) => {
  const trendingGroups = await Group.find({ isPrivate: false }) 
    .sort({ members: -1 }) 
    .limit(10); 
  res.json(trendingGroups);
});

module.exports = {
  createGroup,
  getAllGroups,
  updateGroup,
  getGroupById,
  requestToJoinGroup,
  getJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  deleteGroup,
  removeGroupMember,
  joinGroup,
  leaveGroup,
  getGroupMembers,
  getTrendingGroups,
};