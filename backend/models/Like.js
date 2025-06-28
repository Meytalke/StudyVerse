const mongoose = require('mongoose');

const LikeSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true
    },
    target: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'targetType' 
    },
    targetType: {
        type: String,
        required: true,
        enum: ['Post', 'Comment']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

LikeSchema.index({ user: 1, target: 1, targetType: 1 }, { unique: true });

module.exports = mongoose.model('Like', LikeSchema);