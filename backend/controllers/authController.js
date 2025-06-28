const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const crypto = require('crypto');
const { sendVerificationEmail ,sendResetPasswordEmail } = require('../utils/emailService');

exports.verifyEmail = async (req, res) => {
  const token = req.params.token;
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() }
  });
  if (user.emailVerified) {
    return res.status(200).json({ message: "Email already verified", alreadyVerified: true });
  }

  if (!user) {
    return res.status(400).json({ message: "Invalid or expired token" });
  }

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;

  try {
    await user.save();
    return res.status(200).json({ message: "Email verified successfully", alreadyVerified: false });
  } catch (error) {
    console.error('Error saving verified user:', error);
    return res.status(500).json({ message: "Failed to verify email due to a server error" });
  }
};

exports.login = async (req, res) => {
  const { identifier, password } = req.body;

  try {
    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    console.log('Password received for login:', password);
    const isPasswordMatch = await user.comparePassword(password);
    console.log('Password match result:', isPasswordMatch);
    if (!isPasswordMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ message: 'Please verify your email before logging in.' });
    }

    const token = jwt.sign(
        { 
            userId2: user.user_id.toString(), 
            username: user.username,
            _id: user._id.toString() 
        }, 
        config.jwtSecret, 
        { expiresIn: '1h' }
    );

    res.json({
        token,
        user: {
            _id: user._id, 
            user_id: user.user_id, 
            username: user.username, 
            role: user.role,
            institution: user.institution,
            email: user.email,
            profile_picture_url: user.profile_picture_url,
            studyField: user.studyField,
            yearOfStudy: user.yearOfStudy, 
        },
        message: 'Logged in successfully'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.register = async (req, res) => {
  const { username, email, password, institution, studyField, yearOfStudy } = req.body;

  try {
    const existingUserWithEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingUserWithEmail) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const existingUserWithUsername = await User.findOne({ username });
    if (existingUserWithUsername) {
      return res.status(400).json({ message: 'Username already exists' });
    }
    let userRole = 'student';
    const userCount = await User.countDocuments();
    if (userCount === 0) {
            userRole = 'admin'; 
            console.log('First user registration detected. Assigning role: admin');
    }
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(verificationToken).digest("hex");

    const newUser = new User({
        username,
        email: email.toLowerCase(),
        password_hash: password,
        role: userRole,
        institution,
        studyField,
        yearOfStudy,
        emailVerificationToken: hashedToken,
        emailVerificationExpires: Date.now() + 1000 * 60 * 60 * 24, // 24h
    });

    try {
      const savedUser = await newUser.save();
      console.log('User saved successfully:', savedUser);
      console.log('Attempting to send verification email to:', savedUser.email, 'with token:', verificationToken); 
      try {
        await sendVerificationEmail(savedUser.email, verificationToken);
      } catch (emailError) {
        console.error('Error sending verification email:', emailError);
      }

      const token = jwt.sign(
            { 
                userId2: savedUser.user_id.toString(), 
                username: savedUser.username, 
                _id: savedUser._id.toString() 
            }, 
            config.jwtSecret, 
            { expiresIn: '1h' }
        );

        res.status(201).json({ 
            token, 
            user: { 
                _id: savedUser._id,
                user_id: savedUser.user_id, 
                username: savedUser.username,
                role: savedUser.role,
                institution: savedUser.institution,
                email: savedUser.email,
                profile_picture_url: savedUser.profile_picture_url, 
                studyField: savedUser.studyField,
                yearOfStudy: savedUser.yearOfStudy, 
            },
            message: 'Registered successfully, check your email for verification' 
        });

    } catch (saveError) {
      console.error('Error saving user:', saveError);
      if (saveError.name === 'ValidationError') {
        const errors = Object.values(saveError.errors).map(err => err.message);
        return res.status(400).json({ message: 'Validation error', errors: errors });
      }
      return res.status(500).json({ message: 'Error saving user to database' });
    }

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteMe = async (req, res) => {
    try {
      const userId = req.user.userId; 
      const deletedUser = await User.findByIdAndDelete(userId);
      if (!deletedUser) {
        return res.status(404).json({ message: 'User not found.' });
      }
      res.status(200).json({ message: 'Account deleted successfully.' });
    } catch (error) {
      console.error('Error deleting account:', error);
      res.status(500).json({ message: 'Server error while deleting account.' });
    }
  },
exports.updateProfile= async (userData) => {
    try {
      const token = localStorage.getItem('token'); 
      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, 
        },
        body: JSON.stringify(userData), 
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      return await response.json(); 
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error; 
    }
  },
  exports.changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user._id; 
  console.log('User ID from middleware:', userId);

  try {
    const user = await User.findById(userId).select('+password_hash'); 

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect old password' });
    }

    user.password_hash = newPassword;
    await user.save();

    res.status(200).json({ message: 'Password updated successfully' });

  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Server error while updating password' });
  }
},
exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password_hash'); 
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({
        _id: user._id,
        user_id: user.user_id, 
        username: user.username, 
        email: user.email,
        role: user.role,
        institution: user.institution,
        studyField: user.studyField,
        yearOfStudy: user.yearOfStudy,
        emailVerified: user.emailVerified,
        created_at: user.created_at,
        profile_picture_url: user.profile_picture_url 
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'There is no user with that email address.' });
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = Date.now() + 3600 * 60 ;  // 1h

    await user.save();
    try {
      await sendResetPasswordEmail(user.email, resetToken);
      res.status(200).json({ message: 'An email has been sent to ' + user.email + ' with instructions to reset your password.' });
    } catch (err) {
      console.error('Error sending reset password email:', err);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      return res.status(500).json({ message: 'Failed to send reset password email.' });
    }
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.resetPassword = async (req, res) => {
  console.log('Reset password');
  const { token } = req.params;
  const { newPassword, confirmNewPassword } = req.body;

  try {
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired password reset token.' });
    }

    user.password_hash = newPassword; 
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save(); 

    res.status(200).json({ message: 'Your password has been reset successfully.' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Server error while resetting password.' });
  }
};