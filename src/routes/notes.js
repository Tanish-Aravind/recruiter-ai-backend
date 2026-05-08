const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { addNote, getNotes } = require('../controllers/notesController');

router.post('/:candidateId', auth, addNote);
router.get('/:candidateId', auth, getNotes);

module.exports = router;