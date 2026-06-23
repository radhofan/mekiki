'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getRoles, uploadCandidate, parseCandidateInfo } from '@/lib/api';
import type { Candidate } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface FileUploadItem {
  file: File;
  status: UploadStatus;
  message: string;
  candidate?: Candidate;
}

export default function UploadPage() {
  const [hasRoles, setHasRoles] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [items, setItems] = useState<FileUploadItem[]>([]);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  });
  const [isParsing, setIsParsing] = useState(false);
  const [parsedFile, setParsedFile] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getRoles().then((r) => setHasRoles(r.length > 0)).catch(() => {});
  }, []);

  const triggerAutoParse = async (file: File) => {
    setIsParsing(true);
    setParsedFile(null);
    setParseError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const info = await parseCandidateInfo(fd);
      setForm({
        first_name: info.first_name || '',
        last_name: info.last_name || '',
        email: info.email || '',
        phone: info.phone || '',
      });
      setParsedFile(file.name);
    } catch (err) {
      console.error('Failed to auto-parse CV:', err);
      setParseError((err as Error).message);
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === 'application/pdf'
    );
    if (files.length === 0) return;
    addFiles(files);
  }, []);

  const addFiles = (files: File[]) => {
    const newItems: FileUploadItem[] = files.map((file) => ({
      file,
      status: 'idle',
      message: '',
    }));
    setItems((prev) => [...prev, ...newItems]);
    if (files.length > 0) {
      triggerAutoParse(files[0]);
    }
  };


  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(
      (f) => f.type === 'application/pdf'
    );
    addFiles(files);
    e.target.value = '';
  };

  const uploadAll = async () => {
    if (!form.first_name || !form.last_name) {
      alert('Please fill in First Name and Last Name before uploading.');
      return;
    }

    const pendingIndexes = items
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.status === 'idle')
      .map(({ i }) => i);

    for (const idx of pendingIndexes) {
      setItems((prev) =>
        prev.map((it, i) => (i === idx ? { ...it, status: 'uploading', message: 'Uploading…' } : it))
      );

      try {
        const fd = new FormData();
        fd.append('file', items[idx].file);
        fd.append('first_name', form.first_name);
        fd.append('last_name', form.last_name);
        if (form.email) fd.append('email', form.email);
        if (form.phone) fd.append('phone', form.phone);

        const candidate = await uploadCandidate(fd);

        setItems((prev) =>
          prev.map((it, i) =>
            i === idx
              ? {
                  ...it,
                  status: 'success',
                  message: `Candidate #${candidate.candidate_id} created`,
                  candidate,
                }
              : it
          )
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((it, i) =>
            i === idx
              ? { ...it, status: 'error', message: (err as Error).message }
              : it
          )
        );
      }
    }
  };

  const removeItem = (idx: number) => {
    setItems((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
      if (updated.length === 0) {
        setParsedFile(null);
        setParseError(null);
        setForm({
          first_name: '',
          last_name: '',
          email: '',
          phone: '',
        });
      }
      return updated;
    });
  };


  const pendingCount = items.filter((it) => it.status === 'idle').length;
  const successCount = items.filter((it) => it.status === 'success').length;

  return (
    <div className='p-8 max-w-3xl mx-auto'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold grad-text mb-1'>Upload Resumes</h1>
        <p className='text-slate-500 text-sm'>
          Drop PDF CVs below. Text is extracted automatically.
        </p>
      </div>

      {/* Candidate info */}
      <div className='glass p-5 rounded-xl mb-6'>
        <div className='flex items-center justify-between mb-4 h-6'>
          <p className='text-xs text-slate-400 uppercase tracking-wider'>Candidate Info</p>
          {isParsing && (
            <div className='flex items-center gap-1.5 text-xs text-violet-400 animate-pulse'>
              <span className='w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping' />
              <span>AI parsing CV...</span>
            </div>
          )}
          {!isParsing && parsedFile && (
            <div className='flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium animate-fade-in'>
              <span>✨ Auto-filled from CV</span>
            </div>
          )}
          {!isParsing && parseError && (
            <div className='flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20 font-medium animate-fade-in'>
              <span>⚠️ Autofill failed: {parseError}</span>
            </div>
          )}
        </div>
        <div className='grid grid-cols-2 gap-3'>
          <div>
            <label className='text-xs text-slate-500 mb-1 block'>First Name *</label>
            <Input
              placeholder='Jane'
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              className='bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600'
            />
          </div>
          <div>
            <label className='text-xs text-slate-500 mb-1 block'>Last Name *</label>
            <Input
              placeholder='Doe'
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              className='bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600'
            />
          </div>
          <div>
            <label className='text-xs text-slate-500 mb-1 block'>Email</label>
            <Input
              type='email'
              placeholder='jane@example.com'
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className='bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600'
            />
          </div>
          <div>
            <label className='text-xs text-slate-500 mb-1 block'>Phone</label>
            <Input
              placeholder='+1 555 000 0000'
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className='bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600'
            />
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-all duration-200
          ${isDragging
            ? 'border-violet-500 bg-violet-500/10 scale-[1.01]'
            : 'border-white/10 hover:border-violet-500/50 hover:bg-white/[0.02]'}
        `}
      >
        <input
          ref={fileInputRef}
          type='file'
          accept='application/pdf'
          multiple
          className='hidden'
          onChange={handleFileInput}
        />
        <div className='text-4xl mb-3 opacity-40'>⊕</div>
        <p className='text-slate-300 font-medium'>Drop PDF files here</p>
        <p className='text-slate-600 text-sm mt-1'>or click to browse</p>
        <p className='text-slate-700 text-xs mt-3'>PDF files only</p>
      </div>

      {/* File list */}
      {items.length > 0 && (
        <div className='mt-6 space-y-2'>
          <div className='flex items-center justify-between mb-3'>
            <p className='text-sm text-slate-400'>
              {items.length} file{items.length !== 1 ? 's' : ''} queued
              {successCount > 0 && (
                <span className='text-emerald-400 ml-2'>· {successCount} uploaded</span>
              )}
            </p>
            {pendingCount > 0 && (
              <Button
                onClick={uploadAll}
                className='bg-violet-600 hover:bg-violet-500 text-white text-sm'
              >
                Upload {pendingCount} CV{pendingCount !== 1 ? 's' : ''}
              </Button>
            )}
          </div>

          {items.map((item, idx) => (
            <div
              key={idx}
              className='glass flex items-center gap-3 p-3 rounded-lg'
            >
              <StatusDot status={item.status} />
              <div className='flex-1 min-w-0'>
                <p className='text-sm text-slate-300 truncate'>{item.file.name}</p>
                {item.message && (
                  <p
                    className={`text-xs mt-0.5 ${
                      item.status === 'error' ? 'text-red-400' : 'text-slate-500'
                    }`}
                  >
                    {item.message}
                  </p>
                )}
              </div>
              <span className='text-xs text-slate-600 shrink-0'>
                {(item.file.size / 1024).toFixed(0)} KB
              </span>
              {item.status !== 'uploading' && (
                <button
                  onClick={() => removeItem(idx)}
                  className='text-slate-600 hover:text-red-400 transition-colors text-lg leading-none shrink-0'
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info callout */}
      {hasRoles && (
        <div className='mt-8 glass p-4 rounded-xl border border-cyan-500/10 bg-cyan-500/5'>
          <p className='text-xs text-cyan-400 font-medium mb-1'>💡 Next step</p>
          <p className='text-xs text-slate-400'>
            After uploading, go to a{' '}
            <span className='text-cyan-300'>Role Leaderboard</span> and click{' '}
            <span className='text-cyan-300'>"Run Batch AI Evaluation"</span> to score all CVs.
          </p>
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: UploadStatus }) {
  if (status === 'idle') return <span className='w-2 h-2 rounded-full bg-slate-600 shrink-0' />;
  if (status === 'uploading')
    return (
      <span className='w-2 h-2 rounded-full bg-violet-400 shrink-0 animate-pulse' />
    );
  if (status === 'success')
    return <span className='w-2 h-2 rounded-full bg-emerald-400 shrink-0' />;
  return <span className='w-2 h-2 rounded-full bg-red-400 shrink-0' />;
}
