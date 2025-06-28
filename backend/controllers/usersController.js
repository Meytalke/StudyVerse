const User = require('../models/User');
const Group = require('../models/Group'); 
const Post = require('../models/Post');

const usersController = {
    getUsers: async (req, res) => {
        console.log('--- Entering getUsers function ---');
        try {
            const users = await User.find().select('-password_hash');
            console.log('Found users (excluding passwords):', users.length);
            res.status(200).json(users);
            console.log('--- Exiting getUsers function (success) ---');
        } catch (error) {
            console.error('Error in getUsers:', error);
            res.status(500).json({ message: 'Server error' });
            console.log('--- Exiting getUsers function (error) ---');
        }
    },

    getUserById: async (req, res) => {
        console.log('--- Entering getUserById function ---');
        const userId = req.params.userId;
        console.log('Attempting to find user with ID:', userId);
        try {
            const user = await User.findById(userId).select('-password_hash');
            if (!user) {
                console.log('User not found for ID:', userId);
                return res.status(404).json({ message: 'User not found' });
            }
            console.log('Found user by ID:', user.username);
            res.status(200).json(user);
            console.log('--- Exiting getUserById function (success) ---');
        } catch (error) {
            console.error('Error in getUserById (ID: %s):', userId, error);
            // Check if the error is a CastError (invalid ID format)
            if (error.name === 'CastError') {
                console.log('Invalid user ID format for:', userId);
                return res.status(400).json({ message: 'Invalid user ID format' });
            }
            res.status(500).json({ message: 'Server error' });
            console.log('--- Exiting getUserById function (error) ---');
        }
    },

    getUserGroups: async (req, res) => {
        console.log('--- Entering getUserGroups function ---');
        const userId = req.params.userId;
        console.log('Attempting to find groups for user ID:', userId);
        try {
            const user = await User.findById(userId);
            if (!user) {
                console.log('User not found for ID (in getUserGroups):', userId);
                return res.status(404).json({ message: 'User not found' });
            }
            console.log('User found for groups query:', user.username);
            const groups = await Group.find({ members: user.user_id });
            console.log('Found %d groups for user ID:', groups.length, userId);
            res.status(200).json(groups);
            console.log('--- Exiting getUserGroups function (success) ---');
        } catch (error) {
            console.error('Error in getUserGroups (ID: %s):', userId, error);
            res.status(500).json({ message: 'Server error' });
            console.log('--- Exiting getUserGroups function (error) ---');
        }
    },

    getUserPosts: async (req, res) => {
        console.log('--- Entering getUserPosts function ---');
        const userId = req.params.userId;
        console.log('Attempting to find posts for user ID:', userId);
        try {
            const user = await User.findById(userId);
            if (!user) {
                console.log('User not found for ID (in getUserPosts):', userId);
                return res.status(404).json({ message: 'User not found' });
            }
            console.log('User found for posts query:', user.username);
            const posts = await Post.find({ author: user.user_id })
                                .sort({ createdAt: -1 })
                                .populate('groupId', 'name');
            console.log('Found %d posts for user ID:', posts.length, userId);
            res.status(200).json(posts);
            console.log('--- Exiting getUserPosts function (success) ---');
        } catch (error) {
            console.error('Error in getUserPosts (ID: %s):', userId, error);
            res.status(500).json({ message: 'Server error' });
            console.log('--- Exiting getUserPosts function (error) ---');
        }
    },

    getPublicUserProfile: async (req, res) => {
        console.log('--- Entering getPublicUserProfile function ---');
        const userId = req.params.userId;
        console.log('Request for PUBLIC user profile with ID:', userId);

        try {
            if (!userId) {
                console.log('Missing userId in request params.');
                return res.status(400).json({ message: 'User ID is required.' });
            }
            if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
                console.log('Invalid user ID format detected:', userId);
                return res.status(400).json({ message: 'Invalid user ID format' });
            }

            const user = await User.findById(userId).select('username email institution studyField yearOfStudy');
            if (!user) {
                console.log('Public user profile not found for ID:', userId);
                return res.status(404).json({ message: 'User profile not found' });
            }
            console.log('Found public user profile for:', user.username);
            res.status(200).json({
                username: user.username,
                email: user.email,
                institution: user.institution,
                studyField: user.studyField,
                yearOfStudy: user.yearOfStudy,
            });
            console.log('--- Exiting getPublicUserProfile function (success) ---');
        } catch (error) {
            console.error('Error in getPublicUserProfile (ID: %s):', userId, error);
            if (error.name === 'CastError') {
                console.log('Caught CastError for user ID:', userId);
                return res.status(400).json({ message: 'Invalid user ID format' });
            }
            res.status(500).json({ message: 'Server error' });
            console.log('--- Exiting getPublicUserProfile function (error) ---');
        }
    },

    updateProfile: async (req, res) => {
        console.log('--- Entering updateProfile function ---');
        console.log('req.user: ', req.user);
        const authenticatedUserId = req.user._id;
        console.log('Authenticated user ID attempting to update profile:', authenticatedUserId);
        const updates = req.body;
        console.log('Received update data:', updates);

        try {
            const allowedUpdates = ['username', 'email', 'institution', 'studyField', 'yearOfStudy'];
            const filteredUpdates = {};
            for (const key of allowedUpdates) {
                if (updates[key] !== undefined) {
                    filteredUpdates[key] = updates[key];
                }
            }
            console.log('Filtered updates (allowed fields):', filteredUpdates);

            const currentUser = await User.findById(authenticatedUserId);
            if (!currentUser) {
                console.log('User not found (ID: %s) during update attempt.', authenticatedUserId);
                return res.status(404).json({ message: 'User not found' });
            }
            console.log('Current user data:', currentUser.username, currentUser.email);

            if (filteredUpdates.username !== undefined && filteredUpdates.username !== currentUser.username) {
                console.log('Username change detected. Old:', currentUser.username, 'New:', filteredUpdates.username);
                const existingUserWithSameUsername = await User.findOne({ username: filteredUpdates.username });

                if (existingUserWithSameUsername) {
                    console.log('Attempt to update to an existing username by another user:', filteredUser.username);
                    return res.status(409).json({ message: 'Username already taken. Please choose a different one.' });
                }
            } else if (filteredUpdates.username === currentUser.username) {
                console.log('Username provided is the same as current. No uniqueness check needed.');
                delete filteredUpdates.username; // הסר את השדה כדי למנוע טריגר של ייחודיות ב-findByIdAndUpdate
            }


            if (filteredUpdates.email !== undefined && filteredUpdates.email !== currentUser.email) {
                console.log('Email change detected. Old:', currentUser.email, 'New:', filteredUpdates.email);
                const existingUserWithSameEmail = await User.findOne({ email: filteredUpdates.email });

                if (existingUserWithSameEmail) {
                    console.log('Attempt to update to an existing email by another user:', filteredUpdates.email);
                    return res.status(409).json({ message: 'Email address is already in use. Please use a different email.' });
                }
            } else if (filteredUpdates.email === currentUser.email) {
                console.log('Email provided is the same as current. No uniqueness check needed.');
                delete filteredUpdates.email; // הסר את השדה
            }

            if (Object.keys(filteredUpdates).length === 0) {
                console.log('No actual changes detected after filtering updates.');
                return res.status(200).json(currentUser.toObject()); // החזר את המשתמש הנוכחי כפי שהוא
            }
            
            const updatedUser = await User.findByIdAndUpdate(authenticatedUserId, filteredUpdates, { new: true, runValidators: true }).select('-password_hash');

            if (!updatedUser) {
                console.log('User not found during final update (ID: %s).', authenticatedUserId);
                return res.status(404).json({ message: 'User not found after update attempt.' });
            }

            console.log('User profile updated successfully for ID:', updatedUser.user_id);
            res.status(200).json(updatedUser);
            console.log('--- Exiting updateProfile function (success) ---');
        } catch (error) {
            console.error('Error in updateProfile (ID: %s):', authenticatedUserId, error);

            if (error.code === 11000) {
                const field = Object.keys(error.keyValue)[0];
                const value = error.keyValue[field];
                console.log(`Duplicate key error: Field '${field}' with value '${value}' already exists.`);
                let message = `The ${field} '${value}' is already taken. Please choose a different one.`;
                if (field === 'username') {
                    message = 'Username already taken. Please choose a different username.';
                } else if (field === 'email') {
                    message = 'Email address is already in use. Please use a different email.';
                }
                return res.status(409).json({ message });
            }

            if (error.name === 'ValidationError') {
                console.log('Validation error during profile update:', error.message);
                const errors = Object.values(error.errors).map(err => err.message);
                return res.status(400).json({ message: errors.join(', ') });
            }

            res.status(500).json({ message: 'Server error' });
            console.log('--- Exiting updateProfile function (error) ---');
        }
    },

    deleteMe: async (req, res) => {
        console.log('--- Entering deleteMe function ---');
        const authenticatedUserId = req.user._id;
        console.log('Authenticated user ID attempting to delete self:', authenticatedUserId);

        try {
            const deletedUser = await User.findByIdAndDelete(authenticatedUserId);
            if (!deletedUser) {
                console.log('User not found for deletion (ID: %s). Should not happen.', authenticatedUserId);
                return res.status(404).json({ message: 'User not found' });
            }
            console.log('Account deleted successfully for user ID:', authenticatedUserId);
            res.status(200).json({ message: 'Account deleted successfully' });
            console.log('--- Exiting deleteMe function (success) ---');
        } catch (error) {
            console.error('Error in deleteMe (ID: %s):', authenticatedUserId, error);
            res.status(500).json({ message: 'Server error' });
            console.log('--- Exiting deleteMe function (error) ---');
        }
    },

    getAllUsers: async (req, res) => {
        console.log('--- Entering getAllUsers (Admin) function ---');
        try {
            const users = await User.find().select('-password_hash -emailVerificationToken -emailVerificationExpires -resetPasswordToken -resetPasswordExpires');
            console.log('Admin: Found %d users (sensitive data excluded).', users.length);
            res.status(200).json(users);
            console.log('--- Exiting getAllUsers (Admin) function (success) ---');
        } catch (error) {
            console.error('Error in getAllUsers (Admin):', error);
            res.status(500).json({ message: 'Server error' });
            console.log('--- Exiting getAllUsers (Admin) function (error) ---');
        }
    },

    deleteUser: async (req, res) => {
        console.log('--- Entering deleteUser (Admin) function ---');
        const userIdToDelete = req.params.userId;
        const requestingAdminId = req.user.userId; // Assuming req.user.userId for the requesting admin
        console.log('Admin %s attempting to delete user ID: %s', requestingAdminId, userIdToDelete);

        try {
            if (requestingAdminId.toString() === userIdToDelete.toString()) {
                console.log('Admin tried to delete their own account. Aborting.');
                return res.status(403).json({ message: 'Admin cannot delete their own account.' });
            }
            console.log('Passed self-deletion check.');

            const deletedUser = await User.findByIdAndDelete(userIdToDelete);

            if (!deletedUser) {
                console.log('User not found for deletion by admin (ID: %s).', userIdToDelete);
                return res.status(404).json({ message: 'User not found' });
            }

            console.log('User ID %s deleted successfully by Admin %s.', userIdToDelete, requestingAdminId);
            res.status(200).json({ message: 'User deleted successfully' });
            console.log('--- Exiting deleteUser (Admin) function (success) ---');
        } catch (error) {
            console.error('Error in deleteUser (Admin) (ID: %s):', userIdToDelete, error);
            if (error.name === 'CastError') {
                console.log('Caught CastError for user ID:', userIdToDelete);
                return res.status(400).json({ message: 'Invalid user ID format' });
            }
            res.status(500).json({ message: 'Server error' });
            console.log('--- Exiting deleteUser (Admin) function (error) ---');
        }
    },

    updateUserByAdmin: async (req, res) => {
        console.log('--- Entering updateUserByAdmin (Admin) function ---');
        const userIdToUpdate = req.params.userId;
        const requestingAdminId = req.user.userId;
        const updates = req.body;
        console.log('Admin %s attempting to update user ID: %s with data:', requestingAdminId, userIdToUpdate, updates);

        try {
            if (requestingAdminId.toString() === userIdToUpdate.toString() && updates.role) {
                console.log('Admin %s tried to change their own role via this endpoint. Aborting.', requestingAdminId);
                return res.status(403).json({ message: 'Admin cannot change their own role using this endpoint.' });
            }
            console.log('Passed self-role-change check.');

            const allowedAdminUpdates = ['username', 'email', 'institution', 'studyField', 'yearOfStudy', 'role'];
            const filteredUpdates = {};
            for (const key of allowedAdminUpdates) {
                if (updates[key] !== undefined) {
                    filteredUpdates[key] = updates[key];
                }
            }
            console.log('Filtered updates for Admin (allowed fields):', filteredUpdates);

            if (filteredUpdates.password_hash) {
                console.log('Admin attempted to send password_hash. Removing.');
                delete filteredUpdates.password_hash; // Prevent changing password through this route
            }

            const updatedUser = await User.findByIdAndUpdate(userIdToUpdate, filteredUpdates, { new: true, runValidators: true }).select('-password_hash');

            if (!updatedUser) {
                console.log('User not found for admin update (ID: %s).', userIdToUpdate);
                return res.status(404).json({ message: 'User not found' });
            }

            console.log('User ID %s updated successfully by Admin %s. New details:', updatedUser.user_id, requestingAdminId, updatedUser);
            res.status(200).json(updatedUser);
            console.log('--- Exiting updateUserByAdmin (Admin) function (success) ---');
        } catch (error) {
            console.error('Error in updateUserByAdmin (Admin) (ID: %s):', userIdToUpdate, error);
            if (error.name === 'CastError') {
                console.log('Caught CastError for user ID:', userIdToUpdate);
                return res.status(400).json({ message: 'Invalid user ID format' });
            }
            if (error.name === 'ValidationError') {
                console.log('Validation error during admin update:', error.message);
                return res.status(400).json({ message: error.message });
            }
            res.status(500).json({ message: 'Server error' });
            console.log('--- Exiting updateUserByAdmin (Admin) function (error) ---');
        }
    },

    updateUserRole: async (req, res) => {
        console.log('--- Entering updateUserRole (Admin) function ---');
        const userIdToUpdate = req.params.userId;
        const requestingAdminId = req.user.userId; 
        const { role } = req.body;
        console.log('Admin %s attempting to change role of user ID: %s to role: %s', requestingAdminId, userIdToUpdate, role);

        try {
            // Validate the new role
            if (!role || !['student', 'admin'].includes(role)) {
                console.log('Invalid role provided by admin: %s. Must be "student" or "admin".', role);
                return res.status(400).json({ message: 'Invalid role provided. Role must be "student" or "admin".' });
            }
            console.log('Role validation passed. Provided role is:', role);

            // Prevent admin from changing their own role
            if (requestingAdminId.toString() === userIdToUpdate.toString()) {
                console.log('Admin %s tried to change their own role. Aborting.', requestingAdminId);
                return res.status(403).json({ message: 'Admin cannot change their own role.' });
            }
            console.log('Passed self-role-change check.');
            console.log("req.params:", req.params);
            const updatedUser = await User.findByIdAndUpdate(
                userIdToUpdate,
                { role: role },
                { new: true, runValidators: true }
            ).select('-password_hash');

            if (!updatedUser) {
                console.log('User not found for role update (ID: %s).', userIdToUpdate);
                return res.status(404).json({ message: 'User not found' });
            }

            console.log('User ID %s role updated successfully to %s by Admin %s.', updatedUser.user_id, updatedUser.role, requestingAdminId);
            res.status(200).json({
                message: `User role updated to ${updatedUser.role}`,
                role: updatedUser.role,
                userId: updatedUser.user_id
            });
            console.log('--- Exiting updateUserRole (Admin) function (success) ---');
        } catch (error) {
            console.error('Error in updateUserRole (Admin) (ID: %s):', userIdToUpdate, error);
            if (error.name === 'CastError') {
                console.log('Caught CastError for user ID:', userIdToUpdate);
                return res.status(400).json({ message: 'Invalid user ID format' });
            }
            if (error.name === 'ValidationError') {
                console.log('Validation error during role update:', error.message);
                return res.status(400).json({ message: error.message });
            }
            res.status(500).json({ message: 'Server error' });
            console.log('--- Exiting updateUserRole (Admin) function (error) ---');
        }
    },
};

module.exports = usersController;