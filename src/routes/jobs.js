const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { createJob, getJobs, deleteJob } = require('../controllers/jobsController');

router.post('/', auth, createJob);
router.get('/', auth, getJobs);
router.delete('/:id', auth, deleteJob);

module.exports = router;