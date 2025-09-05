import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Stream } from '../streams/stream.entity';

@Entity('streamers')
export class Streamer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column()
  displayName: string;

  @Column({ nullable: true })
  platform: string; // 'twitch', 'youtube', etc.

  @Column({ nullable: true })
  platformId: string; // Platform-specific user ID

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @Column('json', { nullable: true })
  settings: {
    autoIngest?: boolean;
    clipDuration?: number;
    preferredAspectRatio?: string;
    captionStyle?: string;
    publishingEnabled?: boolean;
    platforms?: string[];
  };

  @Column('json', { nullable: true })
  metadata: {
    followerCount?: number;
    subscriberCount?: number;
    lastStreamDate?: string;
    totalStreams?: number;
    totalClips?: number;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @OneToMany(() => Stream, stream => stream.streamer)
  streams: Stream[];

  @CreateDateColumn({ nullable: true })
  lastSyncAt?: Date;

  @CreateDateColumn({ nullable: true })
  lastActivityAt?: Date;
}