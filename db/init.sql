CREATE DATABASE IF NOT EXISTS recruiter_ai
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE recruiter_ai;

CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT,
  google_id VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_users_google_id (google_id),
  UNIQUE KEY uniq_users_email (email)
);

CREATE TABLE IF NOT EXISTS job_postings (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description LONGTEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_job_postings_user_id (user_id),
  CONSTRAINT fk_job_postings_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS candidates (
  id INT NOT NULL AUTO_INCREMENT,
  job_id INT NOT NULL,
  name VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(100) NULL,
  resume_path VARCHAR(255) NULL,
  resume_url TEXT NULL,
  resume_text LONGTEXT NULL,
  ai_summary LONGTEXT NULL,
  skills_json JSON NULL,
  github_url TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'uploaded',
  match_score INT NULL DEFAULT 0,
  trust_score INT NULL,
  red_flags JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_candidates_job_id (job_id),
  CONSTRAINT fk_candidates_job
    FOREIGN KEY (job_id) REFERENCES job_postings(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS github_data (
  id INT NOT NULL AUTO_INCREMENT,
  candidate_id INT NOT NULL,
  repos_json JSON NULL,
  languages_json JSON NULL,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_github_data_candidate_id (candidate_id),
  CONSTRAINT fk_github_data_candidate
    FOREIGN KEY (candidate_id) REFERENCES candidates(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
  id INT NOT NULL AUTO_INCREMENT,
  candidate_id INT NOT NULL,
  user_id INT NOT NULL,
  content LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notes_candidate_id (candidate_id),
  KEY idx_notes_user_id (user_id),
  CONSTRAINT fk_notes_candidate
    FOREIGN KEY (candidate_id) REFERENCES candidates(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_notes_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS qa_sessions (
  id INT NOT NULL AUTO_INCREMENT,
  candidate_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_qa_sessions_candidate_user (candidate_id, user_id),
  CONSTRAINT fk_qa_sessions_candidate
    FOREIGN KEY (candidate_id) REFERENCES candidates(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_qa_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS qa_messages (
  id INT NOT NULL AUTO_INCREMENT,
  session_id INT NOT NULL,
  role VARCHAR(50) NOT NULL,
  content LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_qa_messages_session_id (session_id),
  CONSTRAINT fk_qa_messages_session
    FOREIGN KEY (session_id) REFERENCES qa_sessions(id)
    ON DELETE CASCADE
);
