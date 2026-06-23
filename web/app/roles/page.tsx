'use client';

import { useEffect, useState } from 'react';
import { getRoles, createRole, deleteRole } from '@/lib/api';
import type { JobRole, JobRoleCreate } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function RolesPage() {
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<JobRoleCreate>({
    title: '',
    department: '',
    description: '',
    required_skills: '',
  });

  const fetchRoles = () => {
    setLoading(true);
    getRoles()
      .then(setRoles)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRoles(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createRole(form);
      setForm({ title: '', department: '', description: '', required_skills: '' });
      setOpen(false);
      fetchRoles();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this role? All evaluations for it will be removed.')) return;
    try {
      await deleteRole(id);
      fetchRoles();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className='p-8 max-w-5xl mx-auto'>
      <div className='flex items-center justify-between mb-8'>
        <div>
          <h1 className='text-3xl font-bold grad-text mb-1'>Job Roles</h1>
          <p className='text-slate-500 text-sm'>Create and manage your open positions.</p>
        </div>

        <Button
          onClick={() => setOpen(true)}
          className='bg-violet-600 hover:bg-violet-500 text-white'
        >
          + New Role
        </Button>

        <Dialog open={open} onOpenChange={setOpen}>          <DialogContent className='bg-[#0f0f1a] border border-white/10 text-slate-100 max-w-lg'>
            <DialogHeader>
              <DialogTitle className='grad-text text-xl'>Create Job Role</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className='space-y-4 mt-2'>
              <div>
                <label className='text-xs text-slate-400 mb-1.5 block uppercase tracking-wider'>
                  Job Title *
                </label>
                <Input
                  required
                  placeholder='e.g. Senior Backend Engineer'
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className='bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600'
                />
              </div>

              <div>
                <label className='text-xs text-slate-400 mb-1.5 block uppercase tracking-wider'>
                  Department
                </label>
                <Input
                  placeholder='e.g. Engineering'
                  value={form.department ?? ''}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className='bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600'
                />
              </div>

              <div>
                <label className='text-xs text-slate-400 mb-1.5 block uppercase tracking-wider'>
                  Job Description *
                </label>
                <Textarea
                  required
                  rows={4}
                  placeholder='Describe responsibilities, team, and expectations...'
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className='bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600 resize-none'
                />
              </div>

              <div>
                <label className='text-xs text-slate-400 mb-1.5 block uppercase tracking-wider'>
                  Required Skills *
                </label>
                <Textarea
                  required
                  rows={3}
                  placeholder='e.g. Python, FastAPI, PostgreSQL, Docker, REST APIs...'
                  value={form.required_skills}
                  onChange={(e) => setForm({ ...form, required_skills: e.target.value })}
                  className='bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600 resize-none'
                />
              </div>

              {error && (
                <p className='text-red-400 text-sm bg-red-500/10 p-2 rounded-lg'>{error}</p>
              )}

              <div className='flex justify-end gap-3 pt-2'>
                <Button
                  type='button'
                  variant='ghost'
                  onClick={() => setOpen(false)}
                  className='text-slate-400 hover:text-slate-200'
                >
                  Cancel
                </Button>
                <Button
                  type='submit'
                  disabled={submitting}
                  className='bg-violet-600 hover:bg-violet-500 text-white'
                >
                  {submitting ? 'Creating…' : 'Create Role'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && !open && (
        <div className='mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm'>
          {error}
        </div>
      )}

      {loading ? (
        <div className='space-y-3'>
          {[1, 2, 3].map((i) => (
            <div key={i} className='glass h-24 animate-pulse rounded-xl' />
          ))}
        </div>
      ) : roles.length === 0 ? (
        <div className='glass p-16 text-center rounded-xl'>
          <p className='text-5xl mb-4'>◉</p>
          <p className='text-slate-400 mb-2'>No job roles yet</p>
          <p className='text-slate-600 text-sm'>Click "New Role" to create your first opening.</p>
        </div>
      ) : (
        <div className='space-y-3'>
          {roles.map((role) => (
            <div
              key={role.role_id}
              className='glass p-5 rounded-xl flex items-start gap-4 hover:bg-white/[0.03] transition-all duration-150'
            >
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-3 flex-wrap'>
                  <Link
                    href={`/role/${role.role_id}`}
                    className='font-semibold text-slate-100 hover:text-violet-300 transition-colors truncate'
                  >
                    {role.title}
                  </Link>
                  {role.department && (
                    <span className='text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20 uppercase tracking-wider shrink-0'>
                      {role.department}
                    </span>
                  )}
                </div>
                <p className='text-slate-500 text-sm mt-1 line-clamp-2'>{role.description}</p>
                <p className='text-xs text-slate-600 mt-2'>
                  Skills: <span className='text-slate-400'>{role.required_skills}</span>
                </p>
              </div>

              <div className='flex items-center gap-2 shrink-0'>
                <Link href={`/role/${role.role_id}`}>
                  <Button
                    size='sm'
                    className='bg-white/5 hover:bg-violet-600/20 border border-white/10 hover:border-violet-500/30 text-slate-300 hover:text-violet-300 transition-all text-xs'
                  >
                    View Leaderboard
                  </Button>
                </Link>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => handleDelete(role.role_id)}
                  className='text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs'
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
