const jobModel = require('../models/jobModel');

async function createJob(req, res) {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authenticated user id is missing' });
    }

    const jobId = await jobModel.createJob({
      user_id: req.user.id,
      title,
      description,
    });

    const job = await jobModel.getJobById(jobId);
    res.status(201).json(job);
  } catch (err) {
    console.error('Create job error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function getJobs(req, res) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authenticated user id is missing' });
    }

    const jobs = await jobModel.getJobsByUser(req.user.id);
    res.json(jobs);
  } catch (err) {
    console.error('Get jobs error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function deleteJob(req, res) {
  try {
    await jobModel.deleteJob(req.params.id);
    res.json({ message: 'Job deleted' });
  } catch (err) {
    console.error('Delete job error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { createJob, getJobs, deleteJob };
