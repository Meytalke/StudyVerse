const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  user_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,   
        unique: true,    
        default: () => new mongoose.Types.ObjectId() // ObjectId as default
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password_hash: {
    type: String,
    required: true,
    minlength: 6,
  },
  role: {
    type: String,
    enum: ['student', 'group_admin','admin'],
    default: 'student',
  },
  institution: {
    type: String,
    trim: true,
  },
  profile_picture_url: {
    type: String,
    trim: true,
  },
  studyField: { 
    type: String,
    trim: true,
  },
  yearOfStudy: { 
    type: String,
    trim: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  emailVerified: {
  type: Boolean,
  default: false
},
emailVerificationToken: String,
emailVerificationExpires: Date,
resetPasswordToken: String,
resetPasswordExpires: Date,
});

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password_hash')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password_hash = await bcrypt.hash(this.password_hash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password_hash);
  } catch (error) {
    throw new Error(error);
  }
};

const User = mongoose.model('User', UserSchema);

module.exports = User;