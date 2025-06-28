const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['summary', 'question', 'exercise', 'resource', 'discussion', 'other'],
        default: 'summary'
    },
    tags: [{
        type: String,
        trim: true
    }],
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        required: true
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    mediaUrl: {
        type: String,
        default: null
    },
    mediaType: {
        type: String,
        enum: ['image', 'video', null],
        default: null
    },
    comments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment'
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Post', postSchema);