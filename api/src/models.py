from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


class JobRole(Base):
    __tablename__ = 'job_roles'

    role_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    required_skills: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    evaluations: Mapped[list['CandidateEvaluation']] = relationship(
        'CandidateEvaluation', back_populates='role', cascade='all, delete-orphan'
    )


class Candidate(Base):
    __tablename__ = 'candidates'

    candidate_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    raw_text_extracted: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    evaluations: Mapped[list['CandidateEvaluation']] = relationship(
        'CandidateEvaluation', back_populates='candidate', cascade='all, delete-orphan'
    )


class CandidateEvaluation(Base):
    __tablename__ = 'candidate_evaluations'
    __table_args__ = (
        CheckConstraint('match_score >= 0 AND match_score <= 100', name='ck_score_range'),
        UniqueConstraint('candidate_id', 'role_id', name='uq_candidate_role'),
    )

    evaluation_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey('candidates.candidate_id', ondelete='CASCADE'))
    role_id: Mapped[int] = mapped_column(ForeignKey('job_roles.role_id', ondelete='CASCADE'))
    match_score: Mapped[int] = mapped_column(Integer, nullable=False)
    qualification_status: Mapped[str] = mapped_column(String(50), nullable=False)
    ai_justification: Mapped[str] = mapped_column(Text, nullable=False)
    extracted_skills: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    evaluated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    candidate: Mapped['Candidate'] = relationship('Candidate', back_populates='evaluations')
    role: Mapped['JobRole'] = relationship('JobRole', back_populates='evaluations')
