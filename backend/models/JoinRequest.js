const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const JoinRequestSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  group: {
    type: Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('JoinRequest', JoinRequestSchema);