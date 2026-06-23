import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.models import JobRole
from src.schemas import JobRoleCreate, JobRoleOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/roles', tags=['roles'])


@router.post('/', response_model=JobRoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(payload: JobRoleCreate, db: AsyncSession = Depends(get_db)) -> JobRoleOut:
    role = JobRole(**payload.model_dump())
    db.add(role)
    await db.commit()
    await db.refresh(role)
    logger.info('Created role %d: %s', role.role_id, role.title)
    return JobRoleOut.model_validate(role)


@router.get('/', response_model=list[JobRoleOut])
async def list_roles(db: AsyncSession = Depends(get_db)) -> list[JobRoleOut]:
    result = await db.execute(select(JobRole).order_by(JobRole.created_at.desc()))
    roles = result.scalars().all()
    return [JobRoleOut.model_validate(r) for r in roles]


@router.get('/{role_id}', response_model=JobRoleOut)
async def get_role(role_id: int, db: AsyncSession = Depends(get_db)) -> JobRoleOut:
    role = await db.get(JobRole, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Role not found')
    return JobRoleOut.model_validate(role)


@router.delete('/{role_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(role_id: int, db: AsyncSession = Depends(get_db)) -> None:
    role = await db.get(JobRole, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Role not found')
    await db.delete(role)
    await db.commit()
