// Core types for ClipForge UI

export interface Streamer {
  id: string;
  name: string;
  platform: 'twitch' | 'youtube' | 'kick' | 'other';
  channelUrl: string;
  avatarUrl?: string;
  isActive: boolean;
  totalStreams: number;
  totalClips: number;
  createdAt: string;
  updatedAt: string;
}

export interface Stream {
  id: string;
  streamerId: string;
  title: string;
  description?: string;
  originalUrl: string;
  status: 'pending' | 'downloading' | 'processing' | 'completed' | 'failed' | 'published';
  duration: number;
  thumbnailUrl?: string;
  totalChunks: number;
  totalClips: number;
  processingProgress: number;
  createdAt: string;
  updatedAt: string;
  streamer?: Streamer;
  clips?: Clip[];
}

export interface Chunk {
  id: string;
  streamId: string;
  startTime: number;
  endTime: number;
  duration: number;
  filePath: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transcriptionStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  visionStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export enum ClipStatus {
  PENDING = 'pending',
  RENDERING = 'rendering',
  RENDERED = 'rendered',
  PUBLISHED = 'published',
  FAILED = 'failed',
}

export enum ClipAspectRatio {
  VERTICAL = '9:16',
  SQUARE = '1:1',
  HORIZONTAL = '16:9',
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
  scheduledAt?: string;
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

export interface Clip {
  id: string;
  streamId: string;
  chunkId?: string;
  title: string;
  description?: string;
  status: ClipStatus;
  startTime: number;
  endTime: number;
  duration: number;
  highlightScore: number;
  scoreBreakdown?: {
    audioEnergy: number;
    visualActivity: number;
    speechClarity: number;
    faceDetection: number;
    sceneChanges: number;
    chatActivity?: number;
    viewerReactions?: number;
  };
  sourceFilePath?: string;
  renderedFilePath?: string;
  thumbnailPath?: string;
  metadata?: ClipMetadata;
  renderSettings: RenderSettings;
  captionSettings: CaptionSettings;
  publishSettings?: PublishSettings;
  processingStartedAt?: string;
  processingCompletedAt?: string;
  errorMessage?: string;
  retryCount: number;
  publishedUrls?: {
    youtube?: string;
    twitter?: string;
    tiktok?: string;
    instagram?: string;
    [platform: string]: string | undefined;
  };
  publishedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
  stream?: Stream;
  chunk?: Chunk;
  
  // Computed properties
  isHighlight: boolean;
  isPending: boolean;
  isProcessing: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  isPublished: boolean;
  canRetry: boolean;
  needsReview: boolean;
  isApproved: boolean;
  formattedDuration: string;
  aspectRatioLabel: string;
  estimatedFileSize: number;
}

export interface ClipStats {
  total: number;
  byStatus: Record<ClipStatus, number>;
  byApprovalStatus: Record<string, number>;
  averageScore: number;
  averageDuration: number;
  totalDuration: number;
  highlightsCount: number;
  needsReviewCount: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ClipFilters {
  streamId?: string;
  chunkId?: string;
  status?: ClipStatus;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  aspectRatio?: ClipAspectRatio;
  minScore?: number;
  maxScore?: number;
  minDuration?: number;
  maxDuration?: number;
  reviewedBy?: string;
  highlightsOnly?: boolean;
  needsReview?: boolean;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// UI State Types
export interface UIState {
  sidebarOpen: boolean;
  currentView: 'dashboard' | 'clips' | 'streams' | 'review' | 'analytics';
  selectedClips: string[];
  viewMode: 'grid' | 'list' | 'table';
  filters: ClipFilters;
  isLoading: boolean;
  error?: string;
}

// WebSocket Event Types
export interface WebSocketEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
  version: string;
  source: string;
  correlationId: string;
  data: any;
}

export interface ClipProcessingEvent extends WebSocketEvent {
  data: {
    clipId: string;
    status: ClipStatus;
    progress?: number;
    error?: string;
  };
}

export interface StreamProcessingEvent extends WebSocketEvent {
  data: {
    streamId: string;
    status: string;
    progress: number;
    stage: string;
  };
}