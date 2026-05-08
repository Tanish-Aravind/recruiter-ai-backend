const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { analyzeGithub, getGithubData } = require('../controllers/githubController');

router.post('/analyze/:candidateId', auth, analyzeGithub);
router.get('/:candidateId', auth, getGithubData);

module.exports = router;