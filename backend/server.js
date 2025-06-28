const express = require('express');
const http = require('http'); 
const cors = require('cors');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const { Server } = require('socket.io'); 
const jwt = require('jsonwebtoken'); 
require('dotenv').config(); 
const config = require('./config/config');

const User = require('./models/User'); 
const Message = require('./models/Message'); 
const Conversation = require('./models/Conversation'); 

// Import your HTTP middleware and routes
const authMiddleware = require('./middleware/authMiddleware'); 
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const groupRoutes = require('./routes/groups');
const postsRoutes = require('./routes/posts');
const commentRoutes = require('./routes/comments');
const likeRoutes = require('./routes/likes');
const chatRoutes = require('./routes/chats'); 
const statsRoutes = require('./routes/stats');

const { sendNewChatMessageNotificationEmail } = require('./utils/emailService');
const { getUserFieldByCustomUserId } = require('./utils/userUtils');

const app = express();
const server = http.createServer(app); // Create HTTP server from Express app, for Socket.IO

// CORS Configuration 
const frontendUrl = config.FRONTEND_URL;
const allowedOrigins = [
    frontendUrl,
    'http://localhost:3000',
    'http://localhost:3001' 
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            const error = new Error(`CORS Error: Not allowed by CORS: ${origin}. Allowed origins: ${allowedOrigins.join(', ')}`);
            console.error(error.message);
            callback(error, false);
        }
    },
    credentials: true, 
    optionsSuccessStatus: 200 
};
app.use(cors(corsOptions)); 

// Body Parsers 
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

// Global Logger
app.use((req, res, next) => {
    console.log(`[HTTP Request] ${new Date().toISOString()} ${req.method} ${req.originalUrl} - from origin: ${req.headers.origin || 'N/A'}`);
    next();
});

// Cloudinary Configuration
cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET
});

// MongoDB Connection
const mongoUri = config.MONGODB_UR;
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('[MongoDB] Connected to MongoDB successfully'))
    .catch(err => console.error('[MongoDB] Could not connect to MongoDB:', err));

//  HTTP API Routes 
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/likes', likeRoutes);
app.use('/api/chats', chatRoutes); 
app.use('/api/stats', statsRoutes);

// Socket.IO Setup
const io = new Server(server, {
    cors: corsOptions, 
    pingInterval: 10000, 
    pingTimeout: 5000, 
});

app.set('io', io); 

// Socket.IO JWT Authentication Middleware
io.use(async (socket, next) => {
    console.log(`[Socket Auth Middleware] ${new Date().toISOString()} - Socket ID: ${socket.id} - Attempting authentication.`);
    const token = socket.handshake.auth.token; 
    console.log(`[Socket Auth Middleware] Token received: ${token ? 'YES' : 'NO'}`);
    if (!token) {
        console.error('Socket Auth Error: Token not provided in handshake.');
        return next(new Error('Authentication error: Token not provided.'));
    }
    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        if (!decoded.userId2) { 
             console.error(`[Socket Auth Middleware] Auth Error: userId2 missing in JWT payload for socket ID: ${socket.id}. Decoded:`, decoded);
             return next(new Error('Authentication error: Invalid token payload. userId2 missing.'));
        }
        socket.user = { 
            userId: decoded.userId2, 
            username: decoded.username 
        }; 
        console.log(`[Socket Auth Middleware] User ${socket.user.userId} authenticated successfully for socket ID: ${socket.id}.`);
        next(); 
    } catch (err) {
        console.error(`[Socket Auth Middleware] Auth Error: Invalid token for socket ID: ${socket.id}: ${err.message}`);
        return next(new Error('Authentication error: Invalid token.')); 
    }
});

// Socket.IO Event Handlers
io.on('connection', socket => {
    console.log(`[Socket.IO Connection] ${new Date().toISOString()} - User connected: Socket ID: ${socket.id}, Auth User ID: ${socket.user.userId}`);
    
    socket.on('error', (err) => {
        console.error(`[Socket.IO Error] Socket ID: ${socket.id}, User ID: ${socket.user.userId || 'N/A'} - Error: ${err.message}`, err);
    });

    socket.on('join_chat_room', async (chatId) => { 
        console.log(`[Socket.IO Event] ${new Date().toISOString()} - User ${socket.user.userId} attempting to join chat room: ${chatId}`);
        try {
            // Find conversation and populate participants
            const conversation = await Conversation.findById(chatId)
                .populate({
                    path: 'participants',
                    model: 'User',
                    foreignField: 'user_id',
                    localField: 'participants',
                    select: 'user_id' 
                });

            if (!conversation) {
                console.warn(`[Socket.IO Event] Chat room ${chatId} not found for user ${socket.user.userId}.`);
                return;
            }

            // Verify that the authenticated user
            const isParticipant = conversation.participants.some(
                p => String(p.user_id) === String(socket.user.userId)
            );

            if (isParticipant) {
                socket.join(chatId); 
                console.log(`[Socket.IO Event] User ${socket.user.userId} successfully joined chat room ${chatId}`);
            } else {
                console.warn(`[Socket.IO Event] User ${socket.user.userId} tried to join unauthorized chat ${chatId}. Not a participant.`);
            }
        } catch (error) {
            console.error(`[Socket.IO Event] Error joining chat room ${chatId}:`, error);
        }
    });

    socket.on('leave_chat_room', (chatId) => { 
        console.log(`[Socket.IO Event] ${new Date().toISOString()} - User ${socket.user.userId} left chat room ${chatId}.`);
        socket.leave(chatId);
    });

    socket.on('new_message', async ({ conversationId, receiverId, text, tempId }) => {
        console.log("I'm on new_message in server!!");
        console.log(`[Socket.IO Event] ${new Date().toISOString()} - Received 'new_message' from ${socket.user.userId} for chat ${conversationId}, receiver ${receiverId}, tempId: ${tempId || 'N/A'}`);
        try {
            const currentSenderUserId = socket.user.userId;
            const receiverClientUserId = receiverId; 
            const senderUserObj = await User.findOne({ user_id: currentSenderUserId });
            
            if (!senderUserObj) {
                console.error(`[Socket.IO Event] ERROR: Sender user object not found for user_id: ${currentSenderUserId}. Aborting message send.`);
                return; 
            }
            console.log(`[Socket.IO Event] Found senderUserObj: _id: ${senderUserObj._id}, user_id: ${senderUserObj.user_id}`);

            const receiverUserObj = await User.findOne({ user_id: receiverClientUserId });
            if (!receiverUserObj) {
                console.error(`[Socket.IO Event] ERROR: Receiver user object not found for user_id: ${receiverClientUserId}. Aborting message send.`);
                return; 
            }
            console.log(`[Socket.IO Event] Found receiverUserObj: _id: ${receiverUserObj._id}, user_id: ${receiverUserObj.user_id}`);

            const conversation = await Conversation.findById(conversationId)
                .populate({
                    path: 'participants',
                    model: 'User',
                    foreignField: 'user_id',
                    localField: 'participants',
                    select: 'user_id'
                });

            if (!conversation) {
                console.warn(`[Socket.IO Event] Conversation ${conversationId} not found for new message. Aborting.`);
                return;
            }

            const isSenderParticipant = conversation.participants.some(p => String(p.user_id) === String(currentSenderUserId));
            const isReceiverParticipant = conversation.participants.some(p => String(p.user_id) === String(receiverClientUserId));

            if (!isSenderParticipant || !isReceiverParticipant) {
                console.warn(`[Socket.IO Event] Unauthorized message attempt for conversation ${conversationId} from ${currentSenderUserId} to ${receiverClientUserId}. Participant mismatch. Aborting.`);
                return;
            }

            const newMessage = new Message({
                conversation: conversationId,
                sender: senderUserObj._id, 
                receiver: receiverUserObj._id,
                text: text,
                readBy: [currentSenderUserId] 
            });
            await newMessage.save();
            console.log(`[Socket.IO Event] Message saved to DB: ${newMessage._id}`);

            conversation.lastMessage = newMessage._id;
            conversation.updatedAt = newMessage.createdAt;
            await conversation.save();
            console.log(`[Socket.IO Event] Conversation ${conversationId} updated with lastMessage.`);

            // Populate the message before emitting so frontend has full data 
            const populatedMessage = await Message.findById(newMessage._id)
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
                .lean(); 

            if (populatedMessage.sender && typeof populatedMessage.sender.user_id !== 'string') {
                populatedMessage.sender.user_id = String(populatedMessage.sender.user_id);
            }
            if (populatedMessage.receiver && typeof populatedMessage.receiver.user_id !== 'string') {
                populatedMessage.receiver.user_id = String(populatedMessage.receiver.user_id);
            }

            console.log(`[Socket.IO Event] Emitting 'new_message' to room ${conversationId} with populated message: ${populatedMessage._id}, tempId: ${tempId || 'N/A'}`);
            console.log(`[Socket.IO Server Debug] Emitting message (after conversion):`, JSON.stringify(populatedMessage, null, 2));
            console.log(`[Socket.IO Server Debug] populatedMessage.sender.user_id (after conversion):`, populatedMessage.sender ? populatedMessage.sender.user_id : 'N/A');

            sendNewChatMessageNotificationEmail(receiverUserObj.email,senderUserObj.username,newMessage.text);
            io.to(conversationId).emit('new_message', { ...populatedMessage, tempId: tempId });
        } catch (error) {
            console.error(`[Socket.IO Event] UNEXPECTED ERROR sending message for chat ${conversationId}:`, error);
        }
    });

    socket.on('mark_read', async ({ conversationId, messageIds }) => {
        const externalUserId = socket.user.userId;
        let currentUserInternalObjectId; 

        try {
            const user = await User.findOne({ user_id: externalUserId }); 
            if (!user) {
                console.warn(`[Socket.IO MarkRead Debug] User with external ID ${externalUserId} not found in DB.`);
                return;
            }
            currentUserInternalObjectId = new mongoose.Types.ObjectId(user._id); 
        } catch (err) {
            console.error(`[Socket.IO MarkRead Debug] Error finding user by external ID ${externalUserId}:`, err);
            return; 
        }

        let convObjectId;
        try {
            convObjectId = new mongoose.Types.ObjectId(conversationId);
        } catch (err) {
            console.error(`[Socket.IO MarkRead Debug] Invalid conversationId: ${conversationId}`, err);
            return;
        }

        let messageObjectIds = [];
        try {
            messageObjectIds = messageIds.map(id => new mongoose.Types.ObjectId(id));
        } catch (err) {
            console.error(`[Socket.IO MarkRead Debug] Invalid messageIds array:`, messageIds, err);
            return;
        }

        console.log(`[Socket.IO MarkRead Debug] ${new Date().toISOString()}`);
        console.log(`  Client requested chat: ${conversationId}`);
        console.log(`  Messages to mark:`, messageIds);
        console.log(`  User making request (from socket auth - EXTERNAL ID): ${externalUserId}`);
        console.log(`  Found and Parsed currentUserInternalId (ObjectId): ${currentUserInternalObjectId}`);
        console.log(`  Parsed conversationId (ObjectId): ${convObjectId}`);
        console.log(`  Parsed messageIds (ObjectIds):`, messageObjectIds);

        try {
            const conversation = await Conversation.findById(convObjectId);

            if (!conversation) {
                console.warn(`[Socket.IO Event] Conversation ${conversationId} not found.`);
                return;
            }

            console.log(`[Socket.IO MarkRead Debug] Conversation participants (raw ObjectIds):`, conversation.participants.map(id => String(id)));
            console.log(`[Socket.IO MarkRead Debug] Current user internal ID for comparison: ${String(currentUserInternalObjectId)}`);

            const isParticipant = conversation.participants.some(pId => String(pId) === externalUserId);

            if (!isParticipant) {
                console.warn(`[Socket.IO Event] Unauthorized 'mark_read' attempt for conversation ${conversationId} by ${externalUserId}. User (internal ID: ${currentUserInternalObjectId}) is not a participant in conversation ${conversationId}.`);
                return;
            }
            const result = await Message.updateMany(
                {
                    _id: { $in: messageObjectIds },
                    conversation: convObjectId,
                    receiver: currentUserInternalObjectId,
                    readBy: { $ne: externalUserId } 
                },
                {
                    $addToSet: { readBy: externalUserId } 
                }
            );

            console.log(`  MongoDB updateMany result:`, result);
            if (result.modifiedCount > 0) {
                console.log(`[Socket.IO Event] ${result.modifiedCount} messages updated as read in DB.`);
                io.to(String(convObjectId)).emit('messages_read', {
                    chatId: String(convObjectId),
                    readerId: String(externalUserId),
                    messageIds: messageIds
                });
                console.log(`[Socket.IO Event] Emitted 'messages_read' to chat room ${convObjectId}.`);
            } else {
                console.log(`[Socket.IO Event] No new messages to mark as read for user ${externalUserId} in chat ${convObjectId}.`);
            }
        } catch (error) {
            console.error(`[Socket.IO Event] Error marking messages as read for chat ${conversationId}:`, error);
        }
    });
    socket.on('typing', ({ conversationId, isTyping }) => {
        console.log(`[Socket.IO Event] ${new Date().toISOString()} - Received 'typing' from ${socket.user.userId} in chat ${conversationId}: ${isTyping}`);
        socket.to(conversationId).emit('typing', {
            chatId: conversationId,
            userId: socket.user.userId, 
            isTyping: isTyping
        });
        console.log(`[Socket.IO Event] Emitted 'typing' to room ${conversationId}.`);
    });

    socket.on('disconnect', (reason) => {
        console.log(`[Socket.IO Disconnect] ${new Date().toISOString()} - User disconnected - ID: ${socket.id}, Auth User ID: ${socket.user.userId || 'N/A'}, Reason: ${reason}`);
    });
});

// 404 Handler
app.use((req, res, next) => {
    res.status(404).json({ message: 'API endpoint not found' });
});

// Start the HTTP server (which also handles Socket.IO)
const PORT = process.env.PORT || 5000; 
server.listen(PORT, () => {
    console.log(`[Server] Server listening on port ${PORT}`);
});
