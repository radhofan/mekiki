import { create } from 'zustand';
import type { LeaderboardEntry } from '@/lib/types';

function formatUtcDate(dateStr: string): Date {
  const normalized = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
  return new Date(normalized);
}

interface BatchState {
  batchStartTime: number | null;
  batchEndTime: number | null;
  showSuccessBanner: boolean;
  recentlyEvaluatedIds: number[];
  timeoutId: ReturnType<typeof setTimeout> | null;
  startBatch: () => void;
  syncBoardState: (board: LeaderboardEntry[]) => void;
  clearBatch: () => void;
}

export const useBatchStore = create<BatchState>((set, get) => ({
  batchStartTime: null,
  batchEndTime: null,
  showSuccessBanner: false,
  recentlyEvaluatedIds: [],
  timeoutId: null,

  startBatch: () => {
    const currentTimeout = get().timeoutId;
    if (currentTimeout) clearTimeout(currentTimeout);

    set({
      batchStartTime: Date.now(),
      batchEndTime: null,
      showSuccessBanner: false,
      recentlyEvaluatedIds: [],
      timeoutId: null,
    });
  },

  clearBatch: () => {
    const currentTimeout = get().timeoutId;
    if (currentTimeout) clearTimeout(currentTimeout);

    set({
      batchStartTime: null,
      batchEndTime: null,
      showSuccessBanner: false,
      recentlyEvaluatedIds: [],
      timeoutId: null,
    });
  },

  syncBoardState: (board: LeaderboardEntry[]) => {
    if (board.length === 0) return;

    const hasEvaluating = board.some((e) => e.qualification_status === 'Evaluating');
    const { batchStartTime, batchEndTime, timeoutId } = get();
    const now = Date.now();

    const getRecentIds = (startTime: number | null, endTime: number | null, isRunning: boolean) => {
      return board
        .filter((e) => {
          if (e.qualification_status === 'Not Evaluated' || e.qualification_status === 'Evaluating') {
            return false;
          }
          const evalTime = formatUtcDate(e.evaluated_at).getTime();
          if (startTime && endTime) {
            return evalTime >= startTime - 5000 && now - endTime < 90000;
          }
          if (startTime && isRunning) {
            return evalTime >= startTime - 5000;
          }
          return now - evalTime < 90000;
        })
        .map((e) => e.candidate_id);
    };

    // Case 1: Batch is currently running (some candidates are 'Evaluating')
    if (hasEvaluating) {
      if (batchStartTime === null) {
        if (timeoutId) clearTimeout(timeoutId);

        set({
          batchStartTime: now,
          batchEndTime: null,
          showSuccessBanner: false,
          recentlyEvaluatedIds: getRecentIds(now, null, true),
          timeoutId: null,
        });
      } else {
        set({
          recentlyEvaluatedIds: getRecentIds(batchStartTime, null, true),
        });
      }
    }
    // Case 2: Batch has finished, or page was loaded after batch completed
    else {
      const evaluated = board.filter(
        (e) => e.qualification_status !== 'Not Evaluated' && e.qualification_status !== 'Evaluating'
      );
      if (evaluated.length > 0) {
        const evalTimes = evaluated.map((e) => formatUtcDate(e.evaluated_at).getTime());
        const maxTime = Math.max(...evalTimes);
        const minTime = Math.min(...evalTimes);

        const timeSinceCompletion = now - maxTime;

        if (timeSinceCompletion < 90000) {
          if (batchEndTime === null) {
            if (timeoutId) clearTimeout(timeoutId);

            const remainingMs = 90000 - timeSinceCompletion;
            const newTimeoutId = setTimeout(() => {
              get().clearBatch();
            }, remainingMs);

            const resolvedStartTime = batchStartTime ?? (minTime - 5000);
            set({
              batchStartTime: resolvedStartTime,
              batchEndTime: maxTime,
              showSuccessBanner: true,
              recentlyEvaluatedIds: getRecentIds(resolvedStartTime, maxTime, false),
              timeoutId: newTimeoutId,
            });
          } else {
            set({
              recentlyEvaluatedIds: getRecentIds(batchStartTime, batchEndTime, false),
            });
          }
        } else {
          if (batchStartTime !== null || batchEndTime !== null) {
            get().clearBatch();
          }
        }
      } else {
        if (batchStartTime !== null || batchEndTime !== null) {
          get().clearBatch();
        }
      }
    }
  },
}));
