// ── API base URL ──────────────────────────────────────────────────────────────
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// ── Helpers ───────────────────────────────────────────────────────────────────
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    let msg = 'API error';
    if (typeof err.detail === 'string') {
      msg = err.detail;
    } else if (Array.isArray(err.detail)) {
      msg = err.detail
        .map((d: unknown) => {
          const item = d as { loc?: (string | number)[]; msg?: string };
          return item && item.loc && item.msg
            ? `${item.loc.join('.')}: ${item.msg}`
            : JSON.stringify(d);
        })
        .join(', ');
    } else if (err.detail && typeof err.detail === 'object') {
      msg = JSON.stringify(err.detail);
    } else if (err.message) {
      msg = err.message;
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ── Types (inline — duplicated from types.ts for import convenience) ───────────
import type {
  JobRole,
  JobRoleCreate,
  Candidate,
  ParsedCandidateInfo,
  LeaderboardEntry,
  EvaluationOut,
  BatchEvaluationResponse,
  StatsOut,
} from './types';

// ── Stats ─────────────────────────────────────────────────────────────────────
export const getStats = (): Promise<StatsOut> => request<StatsOut>('/api/stats');

// ── Roles ─────────────────────────────────────────────────────────────────────
export const getRoles = (): Promise<JobRole[]> => request<JobRole[]>('/api/roles/');

export const getRole = (id: number): Promise<JobRole> =>
  request<JobRole>(`/api/roles/${id}`);

export const createRole = (payload: JobRoleCreate): Promise<JobRole> =>
  request<JobRole>('/api/roles/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const deleteRole = (id: number): Promise<void> =>
  request<void>(`/api/roles/${id}`, { method: 'DELETE' });

// ── Candidates ────────────────────────────────────────────────────────────────
export const getCandidates = (): Promise<Candidate[]> =>
  request<Candidate[]>('/api/candidates/');

export async function uploadCandidate(
  formData: FormData,
): Promise<Candidate> {
  const res = await fetch(`${BASE}/api/candidates/upload`, {
    method: 'POST',
    body: formData, // multipart — no Content-Type header, browser sets boundary
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? 'Upload failed');
  }
  return res.json() as Promise<Candidate>;
}

export async function parseCandidateInfo(
  formData: FormData,
): Promise<ParsedCandidateInfo> {
  const res = await fetch(`${BASE}/api/candidates/parse-info`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? 'Parsing failed');
  }
  return res.json() as Promise<ParsedCandidateInfo>;
}


// ── Evaluations ───────────────────────────────────────────────────────────────
export const evaluateSingle = (candidateId: number, roleId: number): Promise<EvaluationOut> =>
  request<EvaluationOut>(`/api/evaluate/${candidateId}/${roleId}`, { method: 'POST' });

export const batchEvaluate = (roleId: number): Promise<BatchEvaluationResponse> =>
  request<BatchEvaluationResponse>(`/api/evaluate/batch/${roleId}`, { method: 'POST' });

export const getLeaderboard = (roleId: number): Promise<LeaderboardEntry[]> =>
  request<LeaderboardEntry[]>(`/api/leaderboard/${roleId}`);
