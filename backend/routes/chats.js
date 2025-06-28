const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware'); 
const { isParticipant } = require('../middleware/chatMiddleware'); 
const chatController = require('../controllers/chatsController');

router.get('/', authMiddleware, chatController.getConversations);
router.post('/', authMiddleware, chatController.createConversation);
router.get('/:chatId/messages', authMiddleware, isParticipant, chatController.getMessages);
router.post('/:chatId/messages', authMiddleware, isParticipant, chatController.sendMessage);
router.put('/:chatId/messages/read', authMiddleware, isParticipant, chatController.markMessagesAsRead);
router.delete('/:chatId', authMiddleware, chatController.deleteChat);

module.exports = router;
