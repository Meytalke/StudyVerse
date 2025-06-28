const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Schema.Types;
const { v4: uuidv4 } = require('uuid');

const GroupSchema = new Schema({
  uniqueId: {
    type: String,
    default: uuidv4,
    unique: true,
    immutable: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  institution: {
    type: String,
    required: true,
    trim: true,
  },
  courseCode: {
    type: String,
    required: true,
    trim: true,
  },
  isPrivate: {
    type: Boolean,
    default: false,
  },
  requiresApproval: {
    type: Boolean,
    default: false,
  },
  creator: {
    type: ObjectId, 
    ref: 'User',
    required: true,
  },
  members: [{
    type: ObjectId,
    ref: 'User',
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Group', GroupSchema);