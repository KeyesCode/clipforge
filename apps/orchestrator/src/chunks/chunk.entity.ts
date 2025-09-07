import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { Stream } from '../streams/stream.entity';
import { Clip } from '../clips/clip.entity';

export enum ChunkStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  TRANSCRIBED = 'transcribed',
  ANALYZED = 'analyzed', 
  SCORED = 'scored',
  COMPLETED = 'completed',
  FAILED = 'failed',
}


@Entity('chunks')
@Index(['streamId', 'startTime'])
@Index(['status'])
export class Chunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  streamId: string;

  @ManyToOne(() => Stream, (stream) => stream.chunks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'streamId' })
  stream: Stream;

  @OneToMany(() => Clip, (clip) => clip.chunk, {
    cascade: true,
  })
  clips: Clip[];

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'float' })
  startTime: number; // seconds from stream start

  @Column({ type: 'float' })
  endTime: number; // seconds from stream start

  @Column({ type: 'float' })
  duration: number; // chunk duration in seconds

  @Column({
    type: 'enum',
    enum: ChunkStatus,
    default: ChunkStatus.PENDING,
  })
  @Index()
  status: ChunkStatus;

  // File paths
  @Column({ type: 'varchar', length: 500, nullable: true })
  videoPath?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  audioPath?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  thumbnailPath?: string;

  // Processing metadata
  @Column({ type: 'jsonb', nullable: true })
  transcription?: {
    text: string;
    segments: Array<{
      start: number;
      end: number;
      text: string;
      confidence: number;
    }>;
    language: string;
    confidence: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  audioFeatures?: {
    energy: number[];
    spectralCentroid: number[];
    mfcc: number[][];
    tempo: number;
    loudness: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  visionAnalysis?: {
    sceneChanges: number[];
    faces: Array<{
      timestamp: number;
      count: number;
      emotions: Record<string, number>;
      positions: Array<{ x: number; y: number; width: number; height: number }>;
    }>;
    motionIntensity: number[];
    colorHistogram: number[][];
  };

  @Column({ type: 'jsonb', nullable: true })
  visualFeatures?: {
    sceneChanges: number[];
    faces: Array<{
      timestamp: number;
      count: number;
      emotions: Record<string, number>;
      positions: Array<{ x: number; y: number; width: number; height: number }>;
    }>;
    motionIntensity: number[];
    colorHistogram: number[][];
  };

  // Scoring and ranking
  @Column({ type: 'float', nullable: true })
  score?: number;

  @Column({ type: 'float', nullable: true })
  highlightScore?: number;

  @Column({ type: 'jsonb', nullable: true })
  scoreBreakdown?: {
    audioEnergy: number;
    speechClarity: number;
    visualActivity: number;
    faceEngagement: number;
    textSentiment: number;
    sceneVariety: number;
    overall: number;
  };

  @Column({ type: 'integer', nullable: true })
  rank?: number; // ranking within the stream

  // Processing timestamps
  @Column({ type: 'timestamp', nullable: true })
  processedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  transcribedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  analyzedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  scoredAt?: Date;

  // Error handling
  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'integer', default: 0 })
  retryCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Computed properties
  get isProcessed(): boolean {
    return this.status === ChunkStatus.COMPLETED;
  }

  get hasTranscription(): boolean {
    return !!this.transcription?.text;
  }

  get hasVisualAnalysis(): boolean {
    return !!this.visualFeatures;
  }

  get hasAudioAnalysis(): boolean {
    return !!this.audioFeatures;
  }

  get isHighlight(): boolean {
    return (this.highlightScore ?? 0) > 0.7;
  }

  get formattedDuration(): string {
    const minutes = Math.floor(this.duration / 60);
    const seconds = Math.floor(this.duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  get formattedTimeRange(): string {
    const formatTime = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      
      if (hours > 0) {
        return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return `${formatTime(this.startTime)} - ${formatTime(this.endTime)}`;
  }

  @Column({ type: 'text', nullable: true })
  processingError: string | null;
}