import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Streamer } from '../streamers/streamer.entity';
import { Stream } from '../streams/stream.entity';
import { Clip } from '../clips/clip.entity';

export enum JobType {
  INGEST_STREAM = 'ingest_stream',
  GENERATE_HIGHLIGHTS = 'generate_highlights',
  RENDER_CLIP = 'render_clip',
  PUBLISH_CLIP = 'publish_clip',
  TRANSCRIBE_CHUNK = 'transcribe_chunk',
  ANALYZE_VISION = 'analyze_vision',
  SCORE_CLIP = 'score_clip',
}

export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  RETRYING = 'retrying',
}

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: JobType,
  })
  type: JobType;

  @Column({
    type: 'enum',
    enum: JobStatus,
    default: JobStatus.PENDING,
  })
  status: JobStatus;

  @Column({ type: 'int', default: 1 })
  priority: number;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'text', nullable: true })
  errorStack: string | null;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'int', default: 3 })
  maxRetries: number;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  scheduledFor: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workerId: string;

  @Column({ type: 'int', nullable: true })
  progress: number;

  @Column({ type: 'text', nullable: true })
  progressMessage: string | null;

  // Foreign key relationships
  @Column({ type: 'uuid', nullable: true })
  streamerId: string;

  @Column({ type: 'uuid', nullable: true })
  streamId: string;

  @Column({ type: 'uuid', nullable: true })
  clipId: string;

  @ManyToOne(() => Streamer, { nullable: true })
  @JoinColumn({ name: 'streamerId' })
  streamer: Streamer;

  @ManyToOne(() => Stream, { nullable: true })
  @JoinColumn({ name: 'streamId' })
  stream: Stream;

  @ManyToOne(() => Clip, { nullable: true })
  @JoinColumn({ name: 'clipId' })
  clip: Clip;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Computed properties
  get duration(): number | null {
    if (!this.startedAt) return null;
    const endTime = this.completedAt || new Date();
    return endTime.getTime() - this.startedAt.getTime();
  }

  get isActive(): boolean {
    return [JobStatus.PENDING, JobStatus.RUNNING, JobStatus.RETRYING].includes(this.status);
  }

  get canRetry(): boolean {
    return this.status === JobStatus.FAILED && this.retryCount < this.maxRetries;
  }

  get canCancel(): boolean {
    return [JobStatus.PENDING, JobStatus.RUNNING, JobStatus.RETRYING].includes(this.status);
  }
}
