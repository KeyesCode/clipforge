import { Queue, QueueType, QueueStatus } from '../queue.entity';

export class QueueResponseDto {
  id: string;
  name: string;
  type: QueueType;
  status: QueueStatus;
  concurrency: number;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  totalJobs: number;
  isHealthy: boolean;
  isOverloaded: boolean;
  successRate: number;
  errorRate: number;
  config?: any;
  metrics?: any;
  description?: string;
  workerId?: string;
  lastProcessedAt?: Date;
  lastErrorAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(queue: Queue) {
    this.id = queue.id;
    this.name = queue.name;
    this.type = queue.type;
    this.status = queue.status;
    this.concurrency = queue.concurrency;
    this.waiting = queue.waiting;
    this.active = queue.active;
    this.completed = queue.completed;
    this.failed = queue.failed;
    this.delayed = queue.delayed;
    this.paused = queue.paused;
    this.totalJobs = queue.totalJobs;
    this.isHealthy = queue.isHealthy;
    this.isOverloaded = queue.isOverloaded;
    this.successRate = queue.successRate;
    this.errorRate = queue.errorRate;
    this.config = queue.config;
    this.metrics = queue.metrics;
    this.description = queue.description;
    this.workerId = queue.workerId;
    this.lastProcessedAt = queue.lastProcessedAt;
    this.lastErrorAt = queue.lastErrorAt;
    this.lastError = queue.lastError;
    this.createdAt = queue.createdAt;
    this.updatedAt = queue.updatedAt;
  }
}
