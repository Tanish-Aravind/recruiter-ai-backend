const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const multer = require('multer');
require('./config/passport');

const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const candidateRoutes = require('./routes/candidates');
const githubRoutes = require('./routes/github');
const chatRoutes = require('./routes/chat');
const noteRoutes = require('./routes/notes');
const emailRoutes = require('./routes/email');

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());
app.use('/uploads', express.static('uploads'));

app.use('/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/email', emailRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/test-pinecone', async (req, res) => {
  try {
    const { Pinecone } = require('@pinecone-database/pinecone');
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const indexes = await pc.listIndexes();
    res.json(indexes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum allowed size is 5MB.' });
    }

    return res.status(400).json({ error: err.message });
  }

  if (err?.message === 'Only PDF and DOCX files are allowed') {
    return res.status(400).json({ error: err.message });
  }

  return next(err);
});

module.exports = app;
