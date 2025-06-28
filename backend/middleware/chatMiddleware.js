const Conversation = require('../models/Conversation'); 

// Middleware to check if a user is part of a conversation
exports.isParticipant = async (req, res, next) => {
    try {
        const chatId = req.params.chatId;
        const currentAuthenticatedUserId = req.user.userId; 

        console.log(`[isParticipant Middleware] Checking chat ${chatId} for user ${currentAuthenticatedUserId}`);

        const conversation = await Conversation.findById(chatId);
        if (!conversation) {
            console.log(`[isParticipant Middleware] Conversation ${chatId} not found.`);
            return res.status(404).json({ message: 'Conversation not found.' });
        }
        
        // The authenticated user is one of the participants?
        const isUserParticipant = conversation.participants.some(pId => String(pId) === String(currentAuthenticatedUserId));
        
        if (!isUserParticipant) {
            console.log(`[isParticipant Middleware] User ${currentAuthenticatedUserId} is NOT a participant in conversation ${chatId}. Participants: ${conversation.participants.map(p => String(p))}`);
            return res.status(403).json({ message: 'Forbidden: You are not a participant in this conversation.' });
        }
        
        req.conversation = conversation; // Attach conversation object to the request for later use
        console.log(`[isParticipant Middleware] User ${currentAuthenticatedUserId} is a participant in conversation ${chatId}. Proceeding.`);
        next(); // Proceed to the next middleware/route handler
    } catch (error) {
        console.error("[isParticipant Middleware] Error during participant check:", error);
        // CastError for invalid IDs
        if (error.name === 'CastError' && error.path === '_id') {
            return res.status(400).json({ message: 'Invalid chat ID format.' });
        }
        res.status(500).json({ message: 'Server error during participant check.' });
    }
};
