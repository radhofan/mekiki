// ── Job Roles ─────────────────────────────────────────────────────────────────
export interface JobRole {
  role_id: number;
  title: string;
  department: string | null;
  description: string;
  required_skills: string;
  created_at: string;
}

export interface JobRoleCreate {
  title: string;
  department?: string;
  description: string;
  required_skills: string;
}

// ── Candidates ────────────────────────────────────────────────────────────────
export interface Candidate {
  candidate_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  file_path: string;
  created_at: string;
}

export interface ParsedCandidateInfo {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}


// ── Evaluations ───────────────────────────────────────────────────────────────
export interface EvaluationOut {
  evaluation_id: number;
  candidate_id: number;
  role_id: number;
  match_score: number;
  qualification_status: QualificationStatus;
  ai_justification: string;
  extracted_skills: string[] | null;
  evaluated_at: string;
}

export type QualificationStatus = 'Highly Qualified' | 'Qualified' | 'Unqualified';

// ── Leaderboard ───────────────────────────────────────────────────────────────
export interface LeaderboardEntry {
  rank: number;
  candidate_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  match_score: number;
  qualification_status: QualificationStatus;
  ai_justification: string;
  extracted_skills: string[] | null;
  evaluated_at: string;
}

// ── Batch ─────────────────────────────────────────────────────────────────────
export interface BatchEvaluationResponse {
  message: string;
  role_id: number;
  queued_count: number;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
export interface StatsOut {
  total_roles: number;
  total_candidates: number;
  total_evaluations: number;
}
