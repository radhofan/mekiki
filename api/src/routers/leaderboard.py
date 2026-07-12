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
    Return all candidates evaluated for a role (or pending), sorted by match_score DESC.
    Spec endpoint: GET /api/leaderboard/{role_id}
    '''
    role = await db.get(JobRole, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Role not found')

    result = await db.execute(
        select(Candidate, CandidateEvaluation)
        .outerjoin(
            CandidateEvaluation,
            (Candidate.candidate_id == CandidateEvaluation.candidate_id)
            & (CandidateEvaluation.role_id == role_id)
        )
    )
    rows = result.all()

    from datetime import datetime, timezone
    entries = []
    for candidate, evaluation in rows:
        if evaluation:
            match_score = evaluation.match_score
            qualification_status = evaluation.qualification_status
            ai_justification = evaluation.ai_justification
            extracted_skills = evaluation.extracted_skills
            # Make sure it is timezone-aware UTC
            evaluated_at = evaluation.evaluated_at.replace(tzinfo=timezone.utc)
        else:
            match_score = 0
            qualification_status = 'Not Evaluated'
            ai_justification = ''
            extracted_skills = []
            evaluated_at = datetime.now(timezone.utc)

        entries.append({
            'candidate_id': candidate.candidate_id,
            'first_name': candidate.first_name,
            'last_name': candidate.last_name,
            'email': candidate.email,
            'match_score': match_score,
            'qualification_status': qualification_status,
            'ai_justification': ai_justification,
            'extracted_skills': extracted_skills,
            'evaluated_at': evaluated_at
        })

    # Sort evaluated candidates first (by match_score DESC), then pending ones
    def get_sort_key(item):
        is_evaluated = item['qualification_status'] not in ('Not Evaluated', 'Evaluating')
        return (not is_evaluated, -item['match_score'], item['candidate_id'])

    entries.sort(key=get_sort_key)

    leaderboard: list[LeaderboardEntry] = []
    for rank, item in enumerate(entries, start=1):
        leaderboard.append(
            LeaderboardEntry(
                rank=rank,
                candidate_id=item['candidate_id'],
                first_name=item['first_name'],
                last_name=item['last_name'],
                email=item['email'],
                match_score=item['match_score'],
                qualification_status=item['qualification_status'],
                ai_justification=item['ai_justification'],
                extracted_skills=item['extracted_skills'],
                evaluated_at=item['evaluated_at'],
            )
        )

    return leaderboard
