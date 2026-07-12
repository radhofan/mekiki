"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRole, getLeaderboard, batchEvaluate } from "@/lib/api";
import type {
  JobRole,
  LeaderboardEntry,
  QualificationStatus,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBatchStore } from "./batchStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Minimizes database queries
    },
  },
});

export default function LeaderboardPageWrapper() {
  return (
    <QueryClientProvider client={queryClient}>
      <LeaderboardPage />
    </QueryClientProvider>
  );
}

function LeaderboardPage() {
  const params = useParams();
  const roleId = Number(params.id);
  const queryClient = useQueryClient();

  const [batching, setBatching] = useState(false);
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Zustand Store selectors
  const batchStartTime = useBatchStore((s) => s.batchStartTime);
  const showSuccessBanner = useBatchStore((s) => s.showSuccessBanner);
  const recentlyEvaluatedIds = useBatchStore((s) => s.recentlyEvaluatedIds);
  const startBatchStore = useBatchStore((s) => s.startBatch);
  const syncBoardState = useBatchStore((s) => s.syncBoardState);

  // TanStack Query: Fetch role details
  const { data: role } = useQuery<JobRole>({
    queryKey: ["role", roleId],
    queryFn: () => getRole(roleId),
  });

  // TanStack Query: Fetch leaderboard with background polling
  const { data: board = [], error: queryError, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard", roleId],
    queryFn: () => getLeaderboard(roleId),
    refetchInterval: 2000, // automatic background polling every 2s
  });

  // Sync board evaluations with our Zustand timer store
  useEffect(() => {
    syncBoardState(board);
  }, [board, syncBoardState]);

  // Derived states
  const isBatchRunning =
    (batchStartTime !== null &&
      board.some(
        (e) =>
          e.qualification_status === "Evaluating" ||
          e.qualification_status === "Not Evaluated",
      )) ||
    board.some((e) => e.qualification_status === "Evaluating");



  const getBannerMessage = () => {
    const hasEvaluating = board.some((e) => e.qualification_status === "Evaluating");
    if (!batchStartTime && !hasEvaluating) return null;

    if (isBatchRunning) {
      const remaining = board.filter(
        (e) =>
          e.qualification_status === "Evaluating" ||
          e.qualification_status === "Not Evaluated",
      ).length;
      return `Batch evaluation queued for ${board.length} candidate(s). ${remaining} remaining...`;
    }
    if (showSuccessBanner) {
      return "Batch evaluation successful.";
    }
    return null;
  };

  const handleBatch = async () => {
    setBatching(true);
    setLocalError(null);
    startBatchStore();

    // Optimistically update candidate states to Evaluating in TanStack cache
    queryClient.setQueryData<LeaderboardEntry[]>(["leaderboard", roleId], (prev = []) =>
      prev.map((item) => ({
        ...item,
        qualification_status: "Evaluating",
      }))
    );

    try {
      await batchEvaluate(roleId);
    } catch (err) {
      setLocalError((err as Error).message);
    } finally {
      setBatching(false);
    }
  };

  const bannerMsg = getBannerMessage();
  const displayError = localError || (queryError ? (queryError as Error).message : null);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Back link */}
      <Link
        href="/roles"
        className="text-xs text-slate-500 hover:text-slate-300 transition-colors mb-6 inline-flex items-center gap-1"
      >
        ← Back to roles
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold grad-text mb-1">
            {role?.title ?? "Loading…"}
          </h1>
          <p className="text-slate-500 text-sm">
            {role?.department && (
              <span className="mr-2">{role.department} ·</span>
            )}
            AI-ranked candidate leaderboard
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            onClick={handleBatch}
            disabled={batching || isBatchRunning}
            className="bg-linear-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-medium shadow-lg shadow-violet-500/20"
          >
            {batching || isBatchRunning ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Evaluating…
              </span>
            ) : (
              "⚡ Evaluate Candidates"
            )}
          </Button>
        </div>
      </div>

      {bannerMsg && (
        <div className="mb-6 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm">
          {bannerMsg}
        </div>
      )}

      {displayError && (
        <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {displayError}
        </div>
      )}

      {/* Role info card */}
      {role && (
        <div className="glass p-4 rounded-xl mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
              Description
            </p>
            <p className="text-sm text-slate-300 line-clamp-3">
              {role.description}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
              Required Skills
            </p>
            <p className="text-sm text-slate-300">{role.required_skills}</p>
          </div>
        </div>
      )}

      {/* Leaderboard table */}
      {isLoading && board.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass h-14 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : board.length === 0 ? (
        <div className="glass p-16 text-center rounded-xl">
          <p className="text-4xl mb-4 opacity-30">◈</p>
          <p className="text-slate-400 mb-1">No evaluations yet</p>
          <p className="text-slate-600 text-sm">
            Upload candidates and click &quot;Run Batch AI Evaluation&quot;.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {board.map((entry) => {
            const isPending =
              entry.qualification_status === "Not Evaluated" ||
              entry.qualification_status === "Evaluating";
            const isRecent =
              !isPending && recentlyEvaluatedIds.includes(entry.candidate_id);

            return (
              <button
                key={entry.candidate_id}
                onClick={() => !isBatchRunning && setSelected(entry)}
                disabled={isBatchRunning}
                className={`w-full glass flex items-center gap-4 p-4 rounded-xl transition-all duration-150 text-left group border ${
                  isBatchRunning ? "cursor-not-allowed opacity-80" : ""
                } ${
                  isPending
                    ? "border-amber-500/40 bg-amber-950/20 text-amber-300"
                    : isRecent
                      ? "border-emerald-500/60 bg-emerald-950/30 shadow-md shadow-emerald-500/10"
                      : "border-emerald-500/20 bg-emerald-950/10"
                } ${
                  !isBatchRunning
                    ? isPending
                      ? "hover:bg-amber-950/30"
                      : isRecent
                        ? "hover:bg-emerald-950/40"
                        : "hover:bg-emerald-950/20"
                    : ""
                }`}
              >
                {/* Rank */}
                <div className="w-8 shrink-0 text-center">
                  {entry.rank <= 3 ? (
                    <span className="text-lg">
                      {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}
                    </span>
                  ) : (
                    <span className="text-slate-600 font-mono text-sm">
                      #{entry.rank}
                    </span>
                  )}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-200 group-hover:text-white transition-colors">
                      {entry.first_name} {entry.last_name}
                    </p>
                    {isRecent && (
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded shrink-0 animate-pulse">
                        Recently Evaluated
                      </span>
                    )}
                    {isPending && (
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded shrink-0 animate-pulse">
                        {entry.qualification_status}
                      </span>
                    )}
                  </div>
                  {entry.email && (
                    <p className="text-xs text-slate-600 truncate">
                      {entry.email}
                    </p>
                  )}
                </div>

                {/* Score bar */}
                <div className="w-36 shrink-0 hidden sm:block">
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-bold ${scoreColor(entry.match_score)}`}
                    >
                      {entry.match_score}%
                    </span>
                  </div>
                  <Progress
                    value={entry.match_score}
                    className="h-1.5 bg-white/5"
                  />
                </div>

                {/* Status badge */}
                <div className="shrink-0">
                  {!isPending && (
                    <StatusBadge status={entry.qualification_status} />
                  )}
                </div>

                {/* View arrow */}
                <span className="text-slate-600 group-hover:text-violet-400 transition-colors shrink-0">
                  →
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Candidate detail modal */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="bg-[#0f0f1a] border border-white/10 text-slate-100 max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">
                  <span className="grad-text">
                    {selected.first_name} {selected.last_name}
                  </span>
                </DialogTitle>
              </DialogHeader>

              {/* Score section */}
              <div className="flex items-center gap-6 py-4 border-b border-white/5">
                <div className="text-center">
                  <p
                    className={`text-5xl font-black ${scoreColor(selected.match_score)}`}
                  >
                    {selected.match_score}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Match Score</p>
                </div>
                <div>
                  <StatusBadge status={selected.qualification_status} large />
                  {selected.email && (
                    <p className="text-xs text-slate-500 mt-2">
                      {selected.email}
                    </p>
                  )}
                </div>
              </div>

              {/* AI Justification */}
              <div className="mt-4">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">
                  AI Justification
                </p>
                <p className="text-sm text-slate-300 leading-relaxed bg-white/3 rounded-lg p-4 border border-white/5">
                  {selected.ai_justification}
                </p>
              </div>

              {/* Extracted skills */}
              {selected.extracted_skills &&
                selected.extracted_skills.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">
                      Identified Skills
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selected.extracted_skills.map((skill) => (
                        <span
                          key={skill}
                          className="text-xs px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              {/* Footer */}
              <p className="text-xs text-slate-600 mt-6">
                Evaluated{" "}
                {formatUtcDate(selected.evaluated_at).toLocaleString()}
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return "score-high";
  if (score >= 50) return "score-mid";
  return "score-low";
}

function StatusBadge({
  status,
  large = false,
}: {
  status: QualificationStatus;
  large?: boolean;
}) {
  const map: Record<QualificationStatus, string> = {
    "Highly Qualified":
      "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    Qualified: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    Unqualified: "bg-red-500/15 text-red-400 border-red-500/25",
    Evaluating:
      "bg-amber-500/15 text-amber-400 border-amber-500/25 animate-pulse",
    "Not Evaluated": "bg-slate-500/15 text-slate-400 border-slate-500/25",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${map[status]} ${
        large ? "text-sm px-3 py-1" : "text-[10px] px-2 py-0.5"
      }`}
    >
      {status}
    </span>
  );
}

function formatUtcDate(dateStr: string): Date {
  const normalized =
    dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : `${dateStr}Z`;
  return new Date(normalized);
}
