const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { sendMessage, getChatHistory } = require('../controllers/chatController');

router.post('/:candidateId', auth, sendMessage);
router.get('/:candidateId', auth, getChatHistory);

module.exports = router;