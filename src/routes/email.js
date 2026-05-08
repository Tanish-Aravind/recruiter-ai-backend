const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getDraft, sendCandidateEmail } = require('../controllers/emailController');

router.get('/draft/:candidateId', auth, getDraft);
router.post('/send', auth, sendCandidateEmail);

module.exports = router;