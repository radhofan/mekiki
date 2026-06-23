import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.models import Candidate, CandidateEvaluation, JobRole
from src.schemas import LeaderboardEntry

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/leaderboard', tags=['leaderboard'])


@router.get('/{role_id}', response_model=list[LeaderboardEntry])
async def get_leaderboard(
    role_id: int,
    db: AsyncSession = Depends(get_db),
) -> list[LeaderboardEntry]:
    '''
    Return all candidates evaluated for a role, sorted by match_score DESC.
    Spec endpoint: GET /api/leaderboard/{role_id}
    '''
    role = await db.get(JobRole, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Role not found')

    result = await db.execute(
        select(CandidateEvaluation, Candidate)
        .join(Candidate, CandidateEvaluation.candidate_id == Candidate.candidate_id)
        .where(CandidateEvaluation.role_id == role_id)
        .order_by(CandidateEvaluation.match_score.desc())
    )
    rows = result.all()

    leaderboard: list[LeaderboardEntry] = []
    for rank, (evaluation, candidate) in enumerate(rows, start=1):
        leaderboard.append(
            LeaderboardEntry(
                rank=rank,
                candidate_id=candidate.candidate_id,
                first_name=candidate.first_name,
                last_name=candidate.last_name,
                email=candidate.email,
                match_score=evaluation.match_score,
                qualification_status=evaluation.qualification_status,
                ai_justification=evaluation.ai_justification,
                extracted_skills=evaluation.extracted_skills,
                evaluated_at=evaluation.evaluated_at,
            )
        )

    return leaderboard
