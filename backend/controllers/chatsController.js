const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { sendNewChatMessageNotificationEmail } = require('../utils/emailService');
const { getUserFieldByCustomUserId } = require('../utils/userUtils'); 

// Get all conversations for the authenticated user
exports.getConversations = async (req, res) => {
    try {
        const currentAuthenticatedUserId = req.user.userId; 
        console.log("chatsController: getConversations - Authenticated userId (userId):", currentAuthenticatedUserId);
        
        // Find conversations where the current user is a participant
        const conversations = await Conversation.find({ participants: currentAuthenticatedUserId })
            // Populate participant details and the last message content
            .populate({ 
                path: 'participants', 
                model: 'User', 
                foreignField: 'user_id', 
                localField: 'participants', 
                select: 'username _id user_id' 
            })            
            .populate('lastMessage') 
            .sort({ updatedAt: -1 }); 

        const chatsWithOtherUser = conversations.map(chat => {
            console.log(`--- Debugging Conversation ID: ${chat._id} ---`);
            console.log("chat.participants (after populate):", chat);

            // Find the other participant 
            const otherParticipant = chat.participants.find(p => {
                const pUserId = String(p.user_id); 
                const currentAuthId = String(currentAuthenticatedUserId); 

                console.log(`  Comparing participant's user_id: '${pUserId}' with currentAuthenticatedUserId: '${currentAuthId}'`);
                const isMatch = (pUserId === currentAuthId);
                console.log(`  Result of comparison: ${pUserId} === ${currentAuthId} is ${isMatch}`);
                
                return !isMatch; // return the other users
            });
            console.log("otherParticipant: ",otherParticipant);
            console.log("Found other participant:", otherParticipant ? otherParticipant.username : 'None found (likely the chat is with self, or populate failed for other participant)');
            console.log(`--- End Debugging Conversation ID: ${chat._id} ---`);

            return {
                _id: chat._id, 
                name: otherParticipant ? otherParticipant.username : 'null', 
                otherUserId: otherParticipant ? String(otherParticipant.user_id) : null, 
                lastMessage: chat.lastMessage ? chat.lastMessage.text : null, 
                lastMessageTime: chat.lastMessage ? chat.lastMessage.createdAt : null, 
                updatedAt: chat.updatedAt, 
                participants: chat.participants.map(p => String(p.user_id)), 
                type: chat.type, 
            };
        });
        res.json(chatsWithOtherUser); 
    } catch (error) {
        console.error("Error fetching conversations:", error);
        res.status(500).json({ message: 'Server error while fetching conversations.' });
    }
};

// Create a new conversation 
exports.createConversation = async (req, res) => {
    const { recipientId } = req.body; // ID of the user to start a chat with
    console.log("createConversation: Recipient ID:", recipientId);
    const senderId = req.user.userId; 
    console.log("createConversation: Sender ID (userId):", senderId);

    // Basic validation
    if (!recipientId || String(senderId) === String(recipientId)) {
        return res.status(400).json({ message: 'Invalid recipient ID or cannot chat with self.' });
    }

    try {
        // The order of participants is always consistent,
        const sortedParticipants = [String(senderId), String(recipientId)].sort();

        // Conversation already exists?
        let conversation = await Conversation.findOne({
            participants: {
                $all: sortedParticipants, // Checks if all IDs in 'sortedParticipants' array exist
                $size: sortedParticipants.length // Crucial for exact match (only these two participants for a direct chat)
            },
            type: 'direct' 
        });

        if (conversation) {
            console.log("createConversation: Existing conversation found, returning it.");
            const populatedConversation = await Conversation.findById(conversation._id)
                                .populate('participants', 'username user_id')
                                .populate('lastMessage');
            
            const otherParticipant = populatedConversation.participants.find(p => String(p._id) !== String(senderId));
            const processedConversation = {
                _id: populatedConversation._id,
                name: otherParticipant ? otherParticipant.username : 'null2',
                otherUserId: otherParticipant ? String(otherParticipant._id) : null,
                lastMessage: populatedConversation.lastMessage ? populatedConversation.lastMessage.text : null,
                lastMessageTime: populatedConversation.lastMessage ? populatedConversation.lastMessage.createdAt : null,
                updatedAt: populatedConversation.updatedAt,
                participants: populatedConversation.participants.map(p => String(p._id)),
                type: populatedConversation.type,
            };
            return res.status(200).json(processedConversation);
        }

        // If no existing conversation, create a new one 
        const newConversation = new Conversation({
            participants: sortedParticipants, 
            type: 'direct', 
            lastMessage: null, 
            lastMessageTime: null,
        });
        await newConversation.save(); // Save the new conversation to the database

        // Populate the new conversation before returning it to the frontend
        const populatedNewConversation = await Conversation.findById(newConversation._id)
                                        .populate('participants', 'username user_id'); 
        
        const otherParticipant = populatedNewConversation.participants.find(p => String(p._id) !== String(senderId));
        const processedNewConversation = {
            _id: populatedNewConversation._id,
            name: otherParticipant ? otherParticipant.username : 'null3',
            otherUserId: otherParticipant ? String(otherParticipant._id) : null,
            lastMessage: null, 
            lastMessageTime: null,
            updatedAt: populatedNewConversation.updatedAt,
            participants: populatedNewConversation.participants.map(p => String(p._id)),
            type: populatedNewConversation.type,
        };

        res.status(201).json(processedNewConversation);
    } catch (error) {
        console.error("Error creating conversation:", error);
        if (error.code === 11000) { // Duplicate key error
            return res.status(409).json({ message: 'A conversation with these participants already exists.' });
        }
        res.status(500).json({ message: 'Server error during conversation creation.' });
    }
};

// Get messages for conversation
exports.getMessages = async (req, res) => {
    try {
        const messages = await Message.find({ conversation: req.params.chatId })
            .populate({ 
                path: 'sender', 
                model: 'User', 
                select: 'username _id user_id' 
            }) 
            .populate({
                path: 'receiver',
                model: 'User',
                select: 'username _id user_id' 
            })
            .sort({ createdAt: 1 })
            .lean(); 
        console.log("Backend: Messages sent to frontend:");
        messages.forEach(msg => {
            console.log(`  Message ID: ${msg._id}, Sender: ${msg.sender ? msg.sender.username : 'NULL/NOT POPULATED'}, Receiver: ${msg.receiver ? msg.receiver.username : 'NULL/NOT POPULATED'}, Text: "${msg.text}"`);
            if (!msg.sender) {
                console.log(`    WARN: Sender was not populated for message ID ${msg._id}. Raw sender field in DB: ${msg.sender}`);
            }
            if (!msg.receiver) {
                console.log(`    WARN: Receiver was not populated for message ID ${msg._id}. Raw receiver field in DB: ${msg.receiver}`);
            }
        });    
        res.json(messages);
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ message: 'Server error while fetching messages.' });
    }
};

// Send a message to conversation
exports.sendMessage = async (req, res) => {
    const { content, receiverId } = req.body; 
    const senderId = req.user.userId; 
    const conversation = req.conversation; 
    console.log("I'm on sendMessage in controller!!");

    if (!content || !content.trim()) {
        return res.status(400).json({ message: 'Message content cannot be empty.' });
    }
    if (!receiverId || !conversation.participants.some(p => String(p) === String(receiverId))) {
        return res.status(400).json({ message: 'Invalid receiver ID or receiver not a participant in this conversation.' });
    }

    try {
        const newMessage = new Message({
            conversation: conversation._id,
            sender: senderId, 
            receiver: receiverId, 
            text: content,
            readBy: [senderId] 
        });
        await newMessage.save(); 

        // Update lastMessage and updatedAt fields in the conversation
        conversation.lastMessage = newMessage._id;
        conversation.updatedAt = newMessage.createdAt;
        await conversation.save();

        const populatedMessage = await Message.findById(newMessage._id)
                                            .populate({ 
                                                path: 'sender', 
                                                model: 'User', 
                                                foreignField: 'user_id', 
                                                localField: 'sender',   
                                                select: 'username _id user_id' 
                                            }) 
                                            .populate({
                                                path: 'receiver',
                                                model: 'User',
                                                foreignField: 'user_id', 
                                                localField: 'receiver', 
                                                select: 'username _id user_id' 
                                            })
                                            .lean();

        const email = await getUserFieldByCustomUserId(receiverId, 'email');
        console.log("email: ", email);
        const senderName = await getUserFieldByCustomUserId(senderId, 'username');                                   
        console.log("senderName: ", senderName);
        sendNewChatMessageNotificationEmail(email,senderName,newMessage.text);
        res.status(201).json(populatedMessage); 
    } catch (error) {
        console.error("Error sending message via API:", error);
        res.status(500).json({ message: 'Server error while sending message.' });
    }
};

// Mark messages in conversation as read by the current user
exports.markMessagesAsRead = async (req, res) => {
    const currentUserId = req.user.userId; 
    const conversationId = req.params.chatId; 
    const { messageIds } = req.body; 

    console.log("MARK AS READ DEBUG:");
    console.log("currentUserId:", currentUserId);
    console.log("conversationId:", conversationId);
    console.log("messageIds:", messageIds);
    console.log("Type of currentUserId:", typeof currentUserId, currentUserId.constructor.name);
    console.log("Type of messageIds[0]:", messageIds.length > 0 ? typeof messageIds[0] + ", " + messageIds[0].constructor.name : "N/A");
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ message: 'No message IDs provided to mark as read.' });
    }

    try {
        const result = await Message.updateMany(
            {
                _id: { $in: messageIds },
                conversation: conversationId,
                receiver: currentUserId, 
                readBy: { $ne: currentUserId } 
            },
            {
                $addToSet: { readBy: currentUserId } // Add user ID to the readBy array
            }
        );

        if (result.modifiedCount > 0) {
            console.log(`${result.modifiedCount} messages marked as read by user ${currentUserId} in chat ${conversationId}`);
        } else {
            console.log(`No new messages to mark as read for user ${currentUserId} in chat ${conversationId}.`);
        }
        
        res.status(200).json({ message: 'Messages marked as read', modifiedCount: result.modifiedCount });
    } catch (error) {
        console.error("Error marking messages as read:", error);
        res.status(500).json({ message: 'Server error while marking messages as read.' });
    }
};

exports.deleteChat = async (req, res, next) => {
    try {
        const { chatId } = req.params; 
        const userId = req.user.userId; 

        if (!chatId) {
            return res.status(400).json({ message: 'Chat ID is required.' });
        }
        const chat = await Conversation.findById(chatId);
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found.' });
        }
        if (!chat.participants.includes(userId)) {
             return res.status(403).json({ message: 'You are not a participant of this chat.' });
        }

        await Conversation.deleteOne({ _id: chatId }); 
        res.status(200).json({ message: 'Chat deleted successfully.' });
    } catch (error) {
        console.error('Error deleting chat:', error);
        next(error); 
    }
};