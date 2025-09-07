import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { Streamer } from '../streamers/streamer.entity';
import { Chunk } from '../chunks/chunk.entity';
import { Clip } from '../clips/clip.entity';

export enum StreamStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  PROCESSING = 'processing',
  DOWNLOADED = 'downloaded',
  PROCESSED = 'processed',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PUBLISHED = 'published'
}

export enum StreamPlatform {
  TWITCH = 'twitch',
  YOUTUBE = 'youtube',
  KICK = 'kick'
}

@Entity('streams')
export class Stream {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 500 })
  originalUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  videoId: string;

  @Column({ type: 'enum', enum: StreamPlatform })
  platform: StreamPlatform;

  @Column({ type: 'enum', enum: StreamStatus, default: StreamStatus.PENDING })
  status: StreamStatus;

  @Column({ type: 'int', nullable: true })
  duration: number; // Duration in seconds

  @Column({ type: 'varchar', length: 500, nullable: true })
  thumbnailUrl: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  localVideoPath: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  localAudioPath: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  localThumbnailPath: string;

  @Column({ type: 'bigint', nullable: true })
  fileSize: number; // File size in bytes

  @Column({ type: 'varchar', length: 50, nullable: true })
  videoCodec: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  audioCodec: string;

  @Column({ type: 'int', nullable: true })
  width: number;

  @Column({ type: 'int', nullable: true })
  height: number;

  @Column({ type: 'float', nullable: true })
  fps: number;

  @Column({ type: 'int', nullable: true })
  bitrate: number;

  @Column({ type: 'timestamp', nullable: true })
  streamDate: Date;

  @Column({ type: 'int', default: 0 })
  viewCount: number;

  @Column({ type: 'int', default: 0 })
  totalChunks: number;

  @Column({ type: 'int', default: 0 })
  processingProgress: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  currentStage: string; // 'downloading', 'fixing', 'chunking', 'completed'

  @Column({ type: 'varchar', length: 255, nullable: true })
  progressMessage: string; // e.g., "Downloading 8.29GB... 45% complete"

  @Column({ type: 'int', nullable: true })
  estimatedTimeRemaining: number; // in seconds

  @Column({ type: 'bigint', nullable: true })
  downloadedBytes: number; // bytes downloaded so far

  @Column({ type: 'bigint', nullable: true })
  totalBytes: number; // total bytes to download

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Streamer, streamer => streamer.streams, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'streamerId' })
  streamer: Streamer;

  @Column({ type: 'uuid' })
  streamerId: string;

  @OneToMany(() => Chunk, chunk => chunk.stream, { cascade: true })
  chunks: Chunk[];

  @OneToMany(() => Clip, clip => clip.stream, { cascade: true })
  clips: Clip[];
}