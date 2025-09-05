import { google, youtube_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';

interface YouTubeConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken: string;
}

interface PublishShortParams {
  videoPath: string;
  thumbnailPath?: string;
  title: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

interface PublishResult {
  success: boolean;
  platformId?: string;
  url?: string;
  error?: string;
}

export class YouTubePublisher {
  private oauth2Client: OAuth2Client;
  private youtube: youtube_v3.Youtube;

  constructor(config: YouTubeConfig) {
    // Initialize OAuth2 client
    this.oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );

    // Set refresh token
    this.oauth2Client.setCredentials({
      refresh_token: config.refreshToken,
    });

    // Initialize YouTube API client
    this.youtube = google.youtube({
      version: 'v3',
      auth: this.oauth2Client,
    });
  }

  /**
   * Publish a video as a YouTube Short
   */
  async publishShort(params: PublishShortParams): Promise<PublishResult> {
    try {
      // Validate video file exists
      if (!fs.existsSync(params.videoPath)) {
        throw new Error(`Video file not found: ${params.videoPath}`);
      }

      // Prepare video metadata
      const videoMetadata = this.prepareVideoMetadata(params);

      // Upload video
      const uploadResult = await this.uploadVideo(params.videoPath, videoMetadata);

      if (!uploadResult.success || !uploadResult.videoId) {
        return {
          success: false,
          error: uploadResult.error || 'Failed to upload video',
        };
      }

      // Upload thumbnail if provided
      if (params.thumbnailPath && fs.existsSync(params.thumbnailPath)) {
        await this.uploadThumbnail(uploadResult.videoId, params.thumbnailPath);
      }

      // Generate video URL
      const videoUrl = `https://www.youtube.com/shorts/${uploadResult.videoId}`;

      return {
        success: true,
        platformId: uploadResult.videoId,
        url: videoUrl,
      };
    } catch (error) {
      console.error('YouTube publish error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Prepare video metadata for YouTube upload
   */
  private prepareVideoMetadata(params: PublishShortParams): youtube_v3.Schema$Video {
    // Ensure title is within YouTube limits (100 characters)
    const title = params.title.length > 100 
      ? params.title.substring(0, 97) + '...' 
      : params.title;

    // Prepare description with hashtags for Shorts
    let description = params.description || '';
    
    // Add #Shorts hashtag if not present
    if (!description.toLowerCase().includes('#shorts')) {
      description = description ? `${description}\n\n#Shorts` : '#Shorts';
    }

    // Add tags as hashtags in description
    if (params.tags && params.tags.length > 0) {
      const hashtags = params.tags
        .map(tag => `#${tag.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '')}`)
        .filter(tag => tag.length > 1)
        .slice(0, 10); // Limit to 10 hashtags
      
      if (hashtags.length > 0) {
        description += `\n\n${hashtags.join(' ')}`;
      }
    }

    // Ensure description is within YouTube limits (5000 characters)
    if (description.length > 5000) {
      description = description.substring(0, 4997) + '...';
    }

    return {
      snippet: {
        title,
        description,
        tags: params.tags?.slice(0, 500), // YouTube allows up to 500 tags
        categoryId: '24', // Entertainment category
        defaultLanguage: 'en',
        defaultAudioLanguage: 'en',
      },
      status: {
        privacyStatus: 'public', // Can be 'private', 'unlisted', or 'public'
        selfDeclaredMadeForKids: false,
      },
    };
  }

  /**
   * Upload video to YouTube
   */
  private async uploadVideo(
    videoPath: string, 
    metadata: youtube_v3.Schema$Video
  ): Promise<{ success: boolean; videoId?: string; error?: string }> {
    try {
      const fileSize = fs.statSync(videoPath).size;
      const videoStream = fs.createReadStream(videoPath);

      const response = await this.youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: metadata,
        media: {
          body: videoStream,
        },
      });

      if (response.data.id) {
        return {
          success: true,
          videoId: response.data.id,
        };
      } else {
        return {
          success: false,
          error: 'No video ID returned from YouTube',
        };
      }
    } catch (error) {
      console.error('Video upload error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  /**
   * Upload custom thumbnail for the video
   */
  private async uploadThumbnail(videoId: string, thumbnailPath: string): Promise<void> {
    try {
      const thumbnailStream = fs.createReadStream(thumbnailPath);

      await this.youtube.thumbnails.set({
        videoId,
        media: {
          body: thumbnailStream,
        },
      });

      console.log(`Thumbnail uploaded successfully for video ${videoId}`);
    } catch (error) {
      console.error('Thumbnail upload error:', error);
      // Don't throw error for thumbnail upload failure
      // as the video upload was successful
    }
  }

  /**
   * Get video details by ID
   */
  async getVideoDetails(videoId: string): Promise<youtube_v3.Schema$Video | null> {
    try {
      const response = await this.youtube.videos.list({
        part: ['snippet', 'status', 'statistics'],
        id: [videoId],
      });

      return response.data.items?.[0] || null;
    } catch (error) {
      console.error('Error fetching video details:', error);
      return null;
    }
  }

  /**
   * Update video metadata
   */
  async updateVideo(
    videoId: string, 
    updates: Partial<youtube_v3.Schema$Video>
  ): Promise<boolean> {
    try {
      await this.youtube.videos.update({
        part: ['snippet', 'status'],
        requestBody: {
          id: videoId,
          ...updates,
        },
      });

      return true;
    } catch (error) {
      console.error('Error updating video:', error);
      return false;
    }
  }

  /**
   * Delete video by ID
   */
  async deleteVideo(videoId: string): Promise<boolean> {
    try {
      await this.youtube.videos.delete({
        id: videoId,
      });

      return true;
    } catch (error) {
      console.error('Error deleting video:', error);
      return false;
    }
  }

  /**
   * Get channel information
   */
  async getChannelInfo(): Promise<youtube_v3.Schema$Channel | null> {
    try {
      const response = await this.youtube.channels.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        mine: true,
      });

      return response.data.items?.[0] || null;
    } catch (error) {
      console.error('Error fetching channel info:', error);
      return null;
    }
  }

  /**
   * Check if the video qualifies as a Short
   * YouTube Shorts must be:
   * - Vertical or square (aspect ratio)
   * - 60 seconds or less
   * - Have #Shorts in title or description
   */
  private async validateShortRequirements(videoPath: string): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // Check file size (YouTube limit is 256GB, but for Shorts we'll be more conservative)
      const stats = fs.statSync(videoPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      if (fileSizeMB > 1024) { // 1GB limit for Shorts
        issues.push(`File size too large: ${fileSizeMB.toFixed(2)}MB (max 1GB for Shorts)`);
      }

      // Note: For proper video validation (duration, aspect ratio), 
      // we would need ffprobe or similar tool
      // This is a basic validation - in production, you'd want to use ffmpeg
      
    } catch (error) {
      issues.push(`Cannot access video file: ${error}`);
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Get upload quota information
   */
  async getQuotaInfo(): Promise<{
    dailyLimit: number;
    used: number;
    remaining: number;
  } | null> {
    try {
      // Note: YouTube API doesn't directly provide quota usage
      // This would typically be tracked by your application
      // or estimated based on API calls made
      
      // Default daily quota for YouTube Data API v3 is 10,000 units
      // Video upload costs 1600 units
      const dailyLimit = 10000;
      const estimatedUsed = 0; // Would be tracked by your app
      
      return {
        dailyLimit,
        used: estimatedUsed,
        remaining: dailyLimit - estimatedUsed,
      };
    } catch (error) {
      console.error('Error getting quota info:', error);
      return null;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<boolean> {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.oauth2Client.setCredentials(credentials);
      return true;
    } catch (error) {
      console.error('Error refreshing access token:', error);
      return false;
    }
  }
}

export default YouTubePublisher;