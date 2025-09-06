import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum QueueStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  DRAINING = 'draining',
  ERROR = 'error',
}

export enum QueueType {
  INGEST = 'ingest',
  TRANSCRIBE = 'transcribe',
  VISION = 'vision',
  SCORING = 'scoring',
  RENDER = 'render',
  PUBLISH = 'publish',
  NOTIFICATION = 'notification',
}

@Entity('queues')
export class Queue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({
    type: 'enum',
    enum: QueueType,
  })
  type: QueueType;

  @Column({
    type: 'enum',
    enum: QueueStatus,
    default: QueueStatus.ACTIVE,
  })
  status: QueueStatus;

  @Column({ type: 'int', default: 1 })
  concurrency: number;

  @Column({ type: 'int', default: 0 })
  waiting: number;

  @Column({ type: 'int', default: 0 })
  active: number;

  @Column({ type: 'int', default: 0 })
  completed: number;

  @Column({ type: 'int', default: 0 })
  failed: number;

  @Column({ type: 'int', default: 0 })
  delayed: number;

  @Column({ type: 'int', default: 0 })
  paused: number;

  @Column({ type: 'jsonb', nullable: true })
  config: {
    maxRetries?: number;
    retryDelay?: number;
    removeOnComplete?: number;
    removeOnFail?: number;
    backoff?: {
      type: 'fixed' | 'exponential';
      delay: number;
    };
    attempts?: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  metrics: {
    processedPerMinute?: number;
    averageProcessingTime?: number;
    errorRate?: number;
    lastProcessedAt?: Date;
    totalProcessed?: number;
  };

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workerId: string;

  @Column({ type: 'timestamp', nullable: true })
  lastProcessedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastErrorAt: Date;

  @Column({ type: 'text', nullable: true })
  lastError: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Computed properties
  get totalJobs(): number {
    return this.waiting + this.active + this.completed + this.failed + this.delayed + this.paused;
  }

  get isHealthy(): boolean {
    return this.status === QueueStatus.ACTIVE && !this.lastError;
  }

  get isOverloaded(): boolean {
    return this.waiting > this.concurrency * 10; // More than 10x concurrency waiting
  }

  get successRate(): number {
    const total = this.completed + this.failed;
    return total > 0 ? (this.completed / total) * 100 : 0;
  }

  get errorRate(): number {
    const total = this.completed + this.failed;
    return total > 0 ? (this.failed / total) * 100 : 0;
  }
}
