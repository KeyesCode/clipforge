import { Job, JobType, JobStatus } from '../job.entity';

export class JobResponseDto {
  id: string;
  type: JobType;
  status: JobStatus;
  priority: number;
  data: Record<string, any>;
  result: Record<string, any>;
  errorMessage: string;
  errorStack: string;
  retryCount: number;
  maxRetries: number;
  startedAt: Date;
  completedAt: Date;
  scheduledFor: Date;
  workerId: string;
  progress: number;
  progressMessage: string;
  streamerId: string;
  streamId: string;
  clipId: string;
  createdAt: Date;
  updatedAt: Date;
  duration: number | null;
  isActive: boolean;
  canRetry: boolean;
  canCancel: boolean;

  // Related entities (optional)
  streamer?: {
    id: string;
    username: string;
    displayName: string;
  };
  stream?: {
    id: string;
    title: string;
    platform: string;
  };
  clip?: {
    id: string;
    title: string;
    status: string;
  };

  constructor(job: Job) {
    this.id = job.id;
    this.type = job.type;
    this.status = job.status;
    this.priority = job.priority;
    this.data = job.data;
    this.result = job.result;
    this.errorMessage = job.errorMessage;
    this.errorStack = job.errorStack;
    this.retryCount = job.retryCount;
    this.maxRetries = job.maxRetries;
    this.startedAt = job.startedAt;
    this.completedAt = job.completedAt;
    this.scheduledFor = job.scheduledFor;
    this.workerId = job.workerId;
    this.progress = job.progress;
    this.progressMessage = job.progressMessage;
    this.streamerId = job.streamerId;
    this.streamId = job.streamId;
    this.clipId = job.clipId;
    this.createdAt = job.createdAt;
    this.updatedAt = job.updatedAt;
    this.duration = job.duration;
    this.isActive = job.isActive;
    this.canRetry = job.canRetry;
    this.canCancel = job.canCancel;

    // Include related entities if loaded
    if (job.streamer) {
      this.streamer = {
        id: job.streamer.id,
        username: job.streamer.username,
        displayName: job.streamer.displayName,
      };
    }

    if (job.stream) {
      this.stream = {
        id: job.stream.id,
        title: job.stream.title,
        platform: job.stream.platform,
      };
    }

    if (job.clip) {
      this.clip = {
        id: job.clip.id,
        title: job.clip.title,
        status: job.clip.status,
      };
    }
  }
}
