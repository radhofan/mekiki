-- ============================================================
-- Local AI ATS — PostgreSQL DDL
-- Run as the postgres superuser:
--   psql -U postgres -f db/schema.sql
-- ============================================================

-- Create database (skip if it already exists)
SELECT 'CREATE DATABASE hr_ats_db'
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'hr_ats_db'
)\gexec

\c hr_ats_db;

-- ── Job Roles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_roles (
    role_id       SERIAL PRIMARY KEY,
    title         VARCHAR(255) NOT NULL,
    department    VARCHAR(100),
    description   TEXT        NOT NULL,
    required_skills TEXT      NOT NULL,
    created_at    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- ── Candidates ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidates (
    candidate_id        SERIAL PRIMARY KEY,
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    email               VARCHAR(255) UNIQUE,
    phone               VARCHAR(50),
    file_path           TEXT NOT NULL,
    raw_text_extracted  TEXT NOT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Candidate Evaluations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidate_evaluations (
    evaluation_id        SERIAL PRIMARY KEY,
    candidate_id         INT  REFERENCES candidates(candidate_id)  ON DELETE CASCADE,
    role_id              INT  REFERENCES job_roles(role_id)        ON DELETE CASCADE,
    match_score          INT  NOT NULL CHECK (match_score >= 0 AND match_score <= 100),
    qualification_status VARCHAR(50) NOT NULL,
    ai_justification     TEXT NOT NULL,
    extracted_skills     JSONB,
    evaluated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(candidate_id, role_id)
);
