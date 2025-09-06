export class QueueStatsDto {
  totalQueues: number;
  activeQueues: number;
  pausedQueues: number;
  errorQueues: number;
  totalJobs: number;
  totalWaiting: number;
  totalActive: number;
  totalCompleted: number;
  totalFailed: number;
  totalDelayed: number;
  totalPaused: number;
  averageSuccessRate: number;
  averageErrorRate: number;
  overloadedQueues: number;
  healthyQueues: number;
  lastUpdated: Date;

  constructor(data: Partial<QueueStatsDto>) {
    Object.assign(this, data);
  }
}
