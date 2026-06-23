'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getStats, getRoles } from '@/lib/api';
import type { StatsOut, JobRole } from '@/lib/types';

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsOut | null>(null);
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getStats(), getRoles()])
      .then(([s, r]) => {
        setStats(s);
        setRoles(r);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className='p-8 max-w-6xl mx-auto'>
      {/* Header */}
      <div className='mb-10'>
        <h1 className='text-3xl font-bold grad-text mb-2'>Dashboard</h1>
        <p className='text-slate-500 text-sm'>Your local AI hiring engine — 100% private, zero cloud.</p>
      </div>

      {error && (
        <div className='mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm'>
          ⚠ Cannot reach API: {error}. Make sure FastAPI is running on port 8000.
        </div>
      )}

      {/* Stats */}
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10'>
        <StatCard
          label='Job Roles'
          value={loading ? '—' : String(stats?.total_roles ?? 0)}
          icon='◉'
          color='violet'
          href='/roles'
        />
        <StatCard
          label='Candidates'
          value={loading ? '—' : String(stats?.total_candidates ?? 0)}
          icon='⊕'
          color='cyan'
          href='/upload'
        />
        <StatCard
          label='AI Evaluations'
          value={loading ? '—' : String(stats?.total_evaluations ?? 0)}
          icon='◈'
          color='emerald'
          href='/roles'
        />
      </div>

      {/* Open Roles */}
      <div>
        <div className='flex items-center justify-between mb-4'>
          <h2 className='text-lg font-semibold text-slate-200'>Open Roles</h2>
          <Link
            href='/roles'
            className='text-xs text-violet-400 hover:text-violet-300 transition-colors'
          >
            Manage roles →
          </Link>
        </div>

        {loading ? (
          <div className='space-y-3'>
            {[1, 2, 3].map((i) => (
              <div key={i} className='glass h-16 animate-pulse rounded-xl' />
            ))}
          </div>
        ) : roles.length === 0 ? (
          <div className='glass p-8 text-center text-slate-500'>
            <p className='text-lg mb-2'>No roles yet</p>
            <Link href='/roles' className='text-violet-400 hover:text-violet-300 text-sm'>
              Create your first job role →
            </Link>
          </div>
        ) : (
          <div className='space-y-3'>
            {roles.map((role) => (
              <Link
                key={role.role_id}
                href={`/role/${role.role_id}`}
                className='glass flex items-center justify-between p-4 hover:bg-white/5 transition-all duration-150 rounded-xl group'
              >
                <div>
                  <p className='font-medium text-slate-200 group-hover:text-white transition-colors'>
                    {role.title}
                  </p>
                  <p className='text-xs text-slate-500 mt-0.5'>
                    {role.department ?? 'No department'} ·{' '}
                    {new Date(role.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className='text-slate-600 group-hover:text-violet-400 transition-colors text-lg'>
                  →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className='mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4'>
        <QuickAction
          href='/roles'
          icon='◉'
          title='Create a Job Role'
          desc='Define the position, required skills, and description.'
          color='violet'
        />
        <QuickAction
          href='/upload'
          icon='⊕'
          title='Upload Resumes'
          desc='Drag-and-drop PDF CVs for any open role.'
          color='cyan'
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
  href,
}: {
  label: string;
  value: string;
  icon: string;
  color: 'violet' | 'cyan' | 'emerald';
  href: string;
}) {
  const colorMap = {
    violet: 'from-violet-500/20 to-violet-500/5 border-violet-500/20 text-violet-400',
    cyan: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/20 text-cyan-400',
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20 text-emerald-400',
  };

  return (
    <Link
      href={href}
      className={`glass bg-gradient-to-br ${colorMap[color]} p-6 rounded-xl hover:scale-[1.02] transition-transform duration-150`}
    >
      <div className='flex items-start justify-between'>
        <div>
          <p className='text-sm text-slate-400 mb-1'>{label}</p>
          <p className='text-4xl font-bold text-slate-100'>{value}</p>
        </div>
        <span className='text-2xl opacity-60'>{icon}</span>
      </div>
    </Link>
  );
}

function QuickAction({
  href,
  icon,
  title,
  desc,
  color,
}: {
  href: string;
  icon: string;
  title: string;
  desc: string;
  color: 'violet' | 'cyan';
}) {
  const colorMap = {
    violet: 'hover:border-violet-500/40 hover:bg-violet-500/5',
    cyan: 'hover:border-cyan-500/40 hover:bg-cyan-500/5',
  };

  return (
    <Link
      href={href}
      className={`glass p-6 rounded-xl transition-all duration-150 ${colorMap[color]} group`}
    >
      <div className='text-2xl mb-3'>{icon}</div>
      <p className='font-semibold text-slate-200 group-hover:text-white mb-1'>{title}</p>
      <p className='text-sm text-slate-500'>{desc}</p>
    </Link>
  );
}
