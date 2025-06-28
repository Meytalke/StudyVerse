const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: true
    }],
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message' 
    },
    type: {
        type: String,
        enum: ['direct', 'group'], 
        default: 'direct'
    },
    lastMessageText: {
        type: String,
        default: null
    },
    lastMessageTime: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Conversation', conversationSchema);
