from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ── Job Roles ─────────────────────────────────────────────────────────────────

class JobRoleCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    department: str | None = None
    description: str = Field(..., min_length=1)
    required_skills: str = Field(..., min_length=1)


class JobRoleOut(BaseModel):
    role_id: int
    title: str
    department: str | None
    description: str
    required_skills: str
    created_at: datetime

    model_config = {'from_attributes': True}


# ── Candidates ────────────────────────────────────────────────────────────────

class CandidateOut(BaseModel):
    candidate_id: int
    first_name: str
    last_name: str
    email: str | None
    phone: str | None
    file_path: str
    created_at: datetime

    model_config = {'from_attributes': True}


class ParsedCandidateInfo(BaseModel):
    '''Parsed personal info from a CV — returned before the candidate is saved.'''
    first_name: str
    last_name: str
    email: str | None
    phone: str | None


# ── AI / LLM output (internal schema) ────────────────────────────────────────

QualificationStatus = Literal['Highly Qualified', 'Qualified', 'Unqualified']


class LLMEvaluationResult(BaseModel):
    match_score: int = Field(..., ge=0, le=100)
    status: QualificationStatus
    justification: str
    identified_skills: list[str]


# ── Evaluations ───────────────────────────────────────────────────────────────

class EvaluationOut(BaseModel):
    evaluation_id: int
    candidate_id: int
    role_id: int
    match_score: int
    qualification_status: str
    ai_justification: str
    extracted_skills: list[str] | None
    evaluated_at: datetime

    model_config = {'from_attributes': True}


class LeaderboardEntry(BaseModel):
    rank: int
    candidate_id: int
    first_name: str
    last_name: str
    email: str | None
    match_score: int
    qualification_status: str
    ai_justification: str
    extracted_skills: list[str] | None
    evaluated_at: datetime


class BatchEvaluationResponse(BaseModel):
    message: str
    role_id: int
    queued_count: int


class StatsOut(BaseModel):
    total_roles: int
    total_candidates: int
    total_evaluations: int
