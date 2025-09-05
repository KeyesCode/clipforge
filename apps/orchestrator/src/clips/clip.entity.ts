import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Transform } from 'class-transformer';
import { Stream } from '../streams/stream.entity';
import { Chunk } from '../chunks/chunk.entity';

export enum ClipStatus {
  PENDING = 'pending',
  RENDERING = 'rendering',
  RENDERED = 'rendered',
  PUBLISHED = 'published',
  FAILED = 'failed',
}

export enum ClipAspectRatio {
  VERTICAL = '9:16',    // TikTok, YouTube Shorts, Instagram Reels
  SQUARE = '1:1',       // Instagram posts
  HORIZONTAL = '16:9',  // YouTube, Twitter
}

export interface ClipMetadata {
  originalDuration: number;
  trimmedDuration: number;
  fileSize: number;
  resolution: {
    width: number;
    height: number;
  };
  bitrate: number;
  fps: number;
  audioChannels: number;
  audioSampleRate: number;
}

export interface CaptionSettings {
  enabled: boolean;
  style: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  position: 'top' | 'center' | 'bottom';
  maxWordsPerLine: number;
  wordsPerSecond: number;
}

export interface PublishSettings {
  platforms: string[];
  title: string;
  description: string;
  tags: string[];
  thumbnail?: string;
  scheduledAt?: Date;
  privacy: 'public' | 'unlisted' | 'private';
}

export interface RenderSettings {
  aspectRatio: ClipAspectRatio;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  targetFileSize?: number;
  cropSettings?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  filters?: string[];
}

@Entity('clips')
@Index(['streamId', 'status'])
@Index(['chunkId'])
@Index(['createdAt'])
@Index(['highlightScore'])
export class Clip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'stream_id' })
  @Index()
  streamId: string;

  @Column({ name: 'chunk_id', nullable: true })
  chunkId?: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: ClipStatus,
    default: ClipStatus.PENDING,
  })
  @Index()
  status: ClipStatus;

  // Timing information
  @Column({ name: 'start_time', type: 'float' })
  startTime: number;

  @Column({ name: 'end_time', type: 'float' })
  endTime: number;

  @Column({ type: 'float' })
  duration: number;

  // Scoring and ranking
  @Column({ name: 'highlight_score', type: 'float', default: 0 })
  @Index()
  highlightScore: number;

  @Column({ name: 'score_breakdown', type: 'jsonb', nullable: true })
  scoreBreakdown?: {
    audioEnergy: number;
    visualActivity: number;
    speechClarity: number;
    faceDetection: number;
    sceneChanges: number;
    chatActivity?: number;
    viewerReactions?: number;
  };

  // File paths and metadata
  @Column({ name: 'source_file_path', nullable: true })
  sourceFilePath?: string;

  @Column({ name: 'rendered_file_path', nullable: true })
  renderedFilePath?: string;

  @Column({ name: 'thumbnail_path', nullable: true })
  thumbnailPath?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: ClipMetadata;

  // Rendering and publishing settings
  @Column({ name: 'render_settings', type: 'jsonb' })
  renderSettings: RenderSettings;

  @Column({ name: 'caption_settings', type: 'jsonb' })
  captionSettings: CaptionSettings;

  @Column({ name: 'publish_settings', type: 'jsonb', nullable: true })
  publishSettings?: PublishSettings;

  // Processing information
  @Column({ name: 'processing_started_at', type: 'timestamp', nullable: true })
  processingStartedAt?: Date;

  @Column({ name: 'processing_completed_at', type: 'timestamp', nullable: true })
  processingCompletedAt?: Date;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  // Publishing information
  @Column({ name: 'published_urls', type: 'jsonb', nullable: true })
  publishedUrls?: {
    youtube?: string;
    twitter?: string;
    tiktok?: string;
    instagram?: string;
    [platform: string]: string | undefined;
  };

  @Column({ name: 'published_at', type: 'timestamp', nullable: true })
  publishedAt?: Date;

  // User review and approval
  @Column({ name: 'reviewed_by', nullable: true })
  reviewedBy?: string;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt?: Date;

  @Column({ name: 'approval_status', default: 'pending' })
  approvalStatus: 'pending' | 'approved' | 'rejected';

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Stream, stream => stream.clips, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stream_id' })
  stream: Stream;

  @ManyToOne(() => Chunk, chunk => chunk.clips, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'chunk_id' })
  chunk?: Chunk;

  // Computed properties
  @Transform(({ value }) => parseFloat(value?.toFixed(2) || '0'))
  get processingDuration(): number {
    if (!this.processingStartedAt || !this.processingCompletedAt) {
      return 0;
    }
    return (this.processingCompletedAt.getTime() - this.processingStartedAt.getTime()) / 1000;
  }

  get isHighlight(): boolean {
    return this.highlightScore >= 0.7;
  }

  get isPending(): boolean {
    return this.status === ClipStatus.PENDING;
  }

  get isProcessing(): boolean {
    return this.status === ClipStatus.RENDERING;
  }

  get isCompleted(): boolean {
    return this.status === ClipStatus.RENDERED || this.status === ClipStatus.PUBLISHED;
  }

  get isFailed(): boolean {
    return this.status === ClipStatus.FAILED;
  }

  get isPublished(): boolean {
    return this.status === ClipStatus.PUBLISHED;
  }

  get canRetry(): boolean {
    return this.isFailed && this.retryCount < 3;
  }

  get needsReview(): boolean {
    return this.approvalStatus === 'pending' && this.isCompleted;
  }

  get isApproved(): boolean {
    return this.approvalStatus === 'approved';
  }

  get formattedDuration(): string {
    const minutes = Math.floor(this.duration / 60);
    const seconds = Math.floor(this.duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  get aspectRatioLabel(): string {
    switch (this.renderSettings.aspectRatio) {
      case ClipAspectRatio.VERTICAL:
        return 'Vertical (9:16)';
      case ClipAspectRatio.SQUARE:
        return 'Square (1:1)';
      case ClipAspectRatio.HORIZONTAL:
        return 'Horizontal (16:9)';
      default:
        return 'Unknown';
    }
  }

  get estimatedFileSize(): number {
    if (this.metadata?.fileSize) {
      return this.metadata.fileSize;
    }
    
    // Rough estimation based on duration and quality
    const qualityMultiplier = {
      low: 0.5,
      medium: 1.0,
      high: 1.5,
      ultra: 2.0,
    };
    
    const baseSizePerSecond = 1024 * 1024; // 1MB per second baseline
    return this.duration * baseSizePerSecond * qualityMultiplier[this.renderSettings.quality];
  }

  // Helper methods
  updateStatus(status: ClipStatus, errorMessage?: string): void {
    this.status = status;
    
    if (status === ClipStatus.RENDERING && !this.processingStartedAt) {
      this.processingStartedAt = new Date();
    }
    
    if (status === ClipStatus.RENDERED || status === ClipStatus.FAILED) {
      this.processingCompletedAt = new Date();
    }
    
    if (status === ClipStatus.PUBLISHED) {
      this.publishedAt = new Date();
    }
    
    if (errorMessage) {
      this.errorMessage = errorMessage;
      this.retryCount += 1;
    }
  }

  setReview(reviewedBy: string, approvalStatus: 'approved' | 'rejected', notes?: string): void {
    this.reviewedBy = reviewedBy;
    this.reviewedAt = new Date();
    this.approvalStatus = approvalStatus;
    this.reviewNotes = notes;
  }

  addPublishedUrl(platform: string, url: string): void {
    if (!this.publishedUrls) {
      this.publishedUrls = {};
    }
    this.publishedUrls[platform] = url;
  }
}