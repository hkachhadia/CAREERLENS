-- CareerLift PostgreSQL schema for storing analysis history
-- Run with: psql "$DATABASE_URL" -f backend/db/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  display_name VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (auth_provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS analysis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_role VARCHAR(255),
  input_payload JSONB NOT NULL,
  overall_score SMALLINT NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  technical_score SMALLINT NOT NULL CHECK (technical_score BETWEEN 0 AND 100),
  problem_solving_score SMALLINT NOT NULL CHECK (problem_solving_score BETWEEN 0 AND 100),
  communication_score SMALLINT NOT NULL CHECK (communication_score BETWEEN 0 AND 100),
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence VARCHAR(16) NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  analysis_source VARCHAR(32) NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analysis_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES analysis_history(id) ON DELETE CASCADE,
  platform VARCHAR(32) NOT NULL,
  username VARCHAR(255) NOT NULL,
  snapshot JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_history_user_analyzed_at
  ON analysis_history (user_id, analyzed_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_history_created_at
  ON analysis_history (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_integrations_analysis_id
  ON analysis_integrations (analysis_id);

CREATE INDEX IF NOT EXISTS idx_analysis_history_input_payload_gin
  ON analysis_history USING GIN (input_payload);
