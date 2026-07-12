'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getEvaluationHistory } from '@/lib/api';
import type { EvaluationHistoryEntry, QualificationStatus } from '@/lib/types';

export default function EvaluationHistoryPage() {
  const [history, setHistory] = useState<EvaluationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');

  // Expanded row ID
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    getEvaluationHistory()
      .then((data) => setHistory(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Filter evaluations
  const filteredHistory = history.filter((entry) => {
    const fullName = `${entry.first_name} ${entry.last_name}`.toLowerCase();
    const roleTitle = entry.role_title.toLowerCase();
    const dept = (entry.role_department ?? '').toLowerCase();
    const searchLower = searchTerm.toLowerCase();

    const matchesSearch =
      fullName.includes(searchLower) ||
      roleTitle.includes(searchLower) ||
      dept.includes(searchLower);

    const matchesStatus =
      selectedStatus === 'All' || entry.qualification_status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: QualificationStatus) => {
    switch (status) {
      case 'Highly Qualified':
        return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
      case 'Qualified':
        return 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400';
      case 'Unqualified':
        return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
      default:
        return 'bg-slate-500/10 border-slate-500/20 text-slate-400';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-400';
    if (score >= 60) return 'text-cyan-400';
    return 'text-rose-400';
  };

  return (
    <div className='p-8 max-w-6xl mx-auto'>
      {/* Navigation & Header */}
      <div className='mb-8'>
        <Link
          href='/'
          className='text-xs text-slate-500 hover:text-violet-400 transition-colors flex items-center gap-1 mb-3'
        >
          ← Back to Dashboard
        </Link>
        <h1 className='text-3xl font-bold grad-text mb-2'>AI Evaluation History</h1>
        <p className='text-slate-500 text-sm'>
          Complete history of all AI candidate evaluations run across all job roles.
        </p>
      </div>

      {error && (
        <div className='mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm'>
          ⚠ Cannot reach API: {error}. Make sure FastAPI is running.
        </div>
      )}

      {/* Controls: Search and Filter */}
      <div className='flex flex-col md:flex-row gap-4 mb-6'>
        {/* Search */}
        <div className='flex-1 relative'>
          <input
            type='text'
            placeholder='Search by candidate name, role, or department...'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className='w-full glass bg-slate-950/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition-colors'
          />
        </div>

        {/* Status Filters */}
        <div className='flex gap-2 self-start'>
          {['All', 'Highly Qualified', 'Qualified', 'Unqualified'].map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`px-4 py-2.5 rounded-xl text-xs font-medium border transition-all duration-150 ${
                selectedStatus === status
                  ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                  : 'glass border-white/5 text-slate-400 hover:border-white/10 hover:text-slate-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className='space-y-3'>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className='glass h-16 animate-pulse rounded-xl' />
          ))}
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className='glass p-12 text-center text-slate-500 rounded-xl'>
          <p className='text-lg mb-2'>No evaluations found</p>
          <p className='text-sm text-slate-600'>
            {history.length === 0
              ? 'Try uploading resumes for a job role and starting an evaluation first.'
              : 'Try refining your search or filters.'}
          </p>
        </div>
      ) : (
        <div className='space-y-4'>
          {filteredHistory.map((entry) => {
            const isExpanded = expandedId === entry.evaluation_id;
            return (
              <div
                key={entry.evaluation_id}
                className={`glass border transition-all duration-200 rounded-xl overflow-hidden ${
                  isExpanded
                    ? 'border-violet-500/30 bg-white/[0.02]'
                    : 'border-white/5 hover:border-white/10'
                }`}
              >
                {/* Summary Row */}
                <div
                  onClick={() => toggleExpand(entry.evaluation_id)}
                  className='p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none'
                >
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-3 mb-1'>
                      <span className='font-semibold text-slate-200 group-hover:text-white'>
                        {entry.first_name} {entry.last_name}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${getStatusColor(
                          entry.qualification_status
                        )}`}
                      >
                        {entry.qualification_status}
                      </span>
                    </div>
                    <div className='text-xs text-slate-500 flex flex-wrap gap-x-2 gap-y-1 items-center'>
                      <span className='text-slate-400'>{entry.role_title}</span>
                      {entry.role_department && (
                        <>
                          <span className='text-slate-600'>·</span>
                          <span>{entry.role_department}</span>
                        </>
                      )}
                      <span className='text-slate-600'>·</span>
                      <span>Evaluated {formatUtcDate(entry.evaluated_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className='flex items-center justify-between sm:justify-end gap-6'>
                    {/* Score */}
                    <div className='text-right'>
                      <span className='text-xs text-slate-500 block mb-0.5'>Match Score</span>
                      <span className={`text-2xl font-bold ${getScoreColor(entry.match_score)}`}>
                        {entry.match_score}%
                      </span>
                    </div>

                    {/* Expand/Collapse Chevron */}
                    <span className='text-slate-500 text-sm transition-transform duration-200'>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className='border-t border-white/5 bg-slate-950/40 p-5 sm:p-6 space-y-5 animate-fade-in'>
                    {/* Skills Extracted */}
                    {entry.extracted_skills && entry.extracted_skills.length > 0 && (
                      <div>
                        <h4 className='text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2'>
                          Extracted Skills
                        </h4>
                        <div className='flex flex-wrap gap-1.5'>
                          {entry.extracted_skills.map((skill) => (
                            <span
                              key={skill}
                              className='bg-white/5 border border-white/5 text-slate-300 text-xs px-2.5 py-1 rounded-lg'
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* AI Report / Justification */}
                    <div>
                      <h4 className='text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2'>
                        Detailed AI Justification
                      </h4>
                      <p className='text-sm text-slate-300 leading-relaxed whitespace-pre-line bg-white/[0.01] p-4 rounded-xl border border-white/5'>
                        {entry.ai_justification}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className='flex items-center justify-between border-t border-white/5 pt-4'>
                      <span className='text-xs text-slate-500'>
                        Evaluation ID: #{entry.evaluation_id}
                      </span>
                      <Link
                        href={`/role/${entry.role_id}`}
                        className='px-4 py-2 bg-violet-600/80 hover:bg-violet-600 text-white rounded-xl text-xs font-medium transition-colors'
                      >
                        View Job Leaderboard →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatUtcDate(dateStr: string): Date {
  const normalized = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
  return new Date(normalized);
}
