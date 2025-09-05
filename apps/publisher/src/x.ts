import { TwitterApi, TwitterApiReadWrite, EUploadMimeType } from 'twitter-api-v2';
import * as fs from 'fs';
import * as path from 'path';

// Configuration interface for X/Twitter API
export interface XConfig {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
  bearerToken?: string;
}

// Parameters for publishing a video to X
export interface PublishVideoParams {
  videoPath: string;
  text: string;
  altText?: string;
  tags?: string[];
  replyToTweetId?: string;
  metadata?: Record<string, any>;
}

// Result of publishing operation
export interface PublishResult {
  success: boolean;
  tweetId?: string;
  url?: string;
  error?: string;
}

// Tweet data structure
export interface TweetData {
  id: string;
  text: string;
  createdAt: string;
  authorId: string;
  publicMetrics?: {
    retweetCount: number;
    likeCount: number;
    replyCount: number;
    quoteCount: number;
  };
  attachments?: {
    mediaKeys: string[];
  };
}

// Media upload result
export interface MediaUploadResult {
  mediaId: string;
  mediaKey: string;
  size: number;
  type: string;
}

/**
 * X (Twitter) Publisher Service
 * Handles video uploads, tweet posting, and media management for X platform
 */
export class XPublisher {
  private client: TwitterApiReadWrite;
  private config: XConfig;

  constructor(config: XConfig) {
    this.config = config;
    
    // Initialize Twitter API client with OAuth 1.0a credentials
    this.client = new TwitterApi({
      appKey: config.appKey,
      appSecret: config.appSecret,
      accessToken: config.accessToken,
      accessSecret: config.accessSecret,
    }).readWrite;
  }

  /**
   * Publish a video to X (Twitter)
   * Uploads video media and creates a tweet with the video attached
   */
  async publishVideo(params: PublishVideoParams): Promise<PublishResult> {
    try {
      console.log(`Publishing video to X: ${params.videoPath}`);

      // Validate video file exists
      if (!fs.existsSync(params.videoPath)) {
        throw new Error(`Video file not found: ${params.videoPath}`);
      }

      // Get file stats
      const stats = fs.statSync(params.videoPath);
      const fileSize = stats.size;
      
      // X video size limit is 512MB
      const maxSize = 512 * 1024 * 1024; // 512MB
      if (fileSize > maxSize) {
        throw new Error(`Video file too large: ${fileSize} bytes (max: ${maxSize} bytes)`);
      }

      // Upload video media
      console.log('Uploading video media...');
      const mediaUpload = await this.uploadVideoMedia(params.videoPath, params.altText);

      // Prepare tweet text with hashtags
      let tweetText = params.text;
      if (params.tags && params.tags.length > 0) {
        const hashtags = params.tags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ');
        tweetText = `${tweetText}\n\n${hashtags}`;
      }

      // Ensure tweet text is within character limit (280 characters)
      if (tweetText.length > 280) {
        console.warn(`Tweet text too long (${tweetText.length} chars), truncating...`);
        tweetText = tweetText.substring(0, 277) + '...';
      }

      // Create tweet with video attachment
      console.log('Creating tweet with video...');
      const tweetOptions: any = {
        text: tweetText,
        media: {
          media_ids: [mediaUpload.mediaId]
        }
      };

      // Add reply reference if specified
      if (params.replyToTweetId) {
        tweetOptions.reply = {
          in_reply_to_tweet_id: params.replyToTweetId
        };
      }

      const tweet = await this.client.v2.tweet(tweetOptions);

      if (tweet.data) {
        const tweetUrl = `https://twitter.com/i/status/${tweet.data.id}`;
        console.log(`Video published successfully: ${tweetUrl}`);
        
        return {
          success: true,
          tweetId: tweet.data.id,
          url: tweetUrl
        };
      } else {
        throw new Error('Failed to create tweet - no data returned');
      }

    } catch (error) {
      console.error('Error publishing video to X:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Upload video media to X
   * Handles chunked upload for large video files
   */
  private async uploadVideoMedia(videoPath: string, altText?: string): Promise<MediaUploadResult> {
    try {
      // Read video file
      const videoBuffer = fs.readFileSync(videoPath);
      const fileExtension = path.extname(videoPath).toLowerCase();
      
      // Determine MIME type
      let mimeType: EUploadMimeType;
      switch (fileExtension) {
        case '.mp4':
          mimeType = EUploadMimeType.Mp4;
          break;
        case '.mov':
          mimeType = EUploadMimeType.Mov;
          break;
        default:
          mimeType = EUploadMimeType.Mp4; // Default to MP4
      }

      // Upload media using chunked upload
      const mediaId = await this.client.v1.uploadMedia(videoBuffer, {
        mimeType,
        additionalOwners: undefined,
        longVideo: true, // Enable for videos longer than 30 seconds
        // altText: altText || 'Video clip'
      });

      console.log(`Media uploaded successfully: ${mediaId}`);

      return {
        mediaId,
        mediaKey: mediaId, // X uses same ID for media key
        size: videoBuffer.length,
        type: mimeType
      };

    } catch (error) {
      console.error('Error uploading video media:', error);
      throw new Error(`Failed to upload video: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get tweet details by ID
   */
  async getTweetDetails(tweetId: string): Promise<TweetData | null> {
    try {
      const tweet = await this.client.v2.singleTweet(tweetId, {
        expansions: ['attachments.media_keys', 'author_id'],
        'tweet.fields': ['created_at', 'public_metrics', 'attachments'],
        'media.fields': ['type', 'url', 'preview_image_url']
      });

      if (tweet.data) {
        return {
          id: tweet.data.id,
          text: tweet.data.text,
          createdAt: tweet.data.created_at || '',
          authorId: tweet.data.author_id || '',
          publicMetrics: tweet.data.public_metrics ? {
            retweetCount: tweet.data.public_metrics.retweet_count || 0,
            likeCount: tweet.data.public_metrics.like_count || 0,
            replyCount: tweet.data.public_metrics.reply_count || 0,
            quoteCount: tweet.data.public_metrics.quote_count || 0
          } : undefined,
          attachments: tweet.data.attachments ? {
            mediaKeys: tweet.data.attachments.media_keys || []
          } : undefined
        };
      }

      return null;
    } catch (error) {
      console.error('Error fetching tweet details:', error);
      return null;
    }
  }

  /**
   * Delete a tweet by ID
   */
  async deleteTweet(tweetId: string): Promise<boolean> {
    try {
      const result = await this.client.v2.deleteTweet(tweetId);
      return result.data?.deleted || false;
    } catch (error) {
      console.error('Error deleting tweet:', error);
      return false;
    }
  }

  /**
   * Get user profile information
   */
  async getUserProfile(): Promise<any> {
    try {
      const user = await this.client.v2.me({
        'user.fields': ['created_at', 'description', 'public_metrics', 'profile_image_url', 'verified']
      });
      return user.data;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  }

  /**
   * Search for tweets with specific criteria
   */
  async searchTweets(query: string, maxResults: number = 10): Promise<TweetData[]> {
    try {
      const tweets = await this.client.v2.search(query, {
        max_results: maxResults,
        'tweet.fields': ['created_at', 'public_metrics', 'attachments'],
        expansions: ['author_id', 'attachments.media_keys']
      });

      return tweets.data.data?.map(tweet => ({
        id: tweet.id,
        text: tweet.text,
        createdAt: tweet.created_at || '',
        authorId: tweet.author_id || '',
        publicMetrics: tweet.public_metrics ? {
          retweetCount: tweet.public_metrics.retweet_count || 0,
          likeCount: tweet.public_metrics.like_count || 0,
          replyCount: tweet.public_metrics.reply_count || 0,
          quoteCount: tweet.public_metrics.quote_count || 0
        } : undefined,
        attachments: tweet.attachments ? {
          mediaKeys: tweet.attachments.media_keys || []
        } : undefined
      })) || [];
    } catch (error) {
      console.error('Error searching tweets:', error);
      return [];
    }
  }

  /**
   * Like a tweet
   */
  async likeTweet(tweetId: string): Promise<boolean> {
    try {
      const result = await this.client.v2.like(await this.getUserId(), tweetId);
      return result.data?.liked || false;
    } catch (error) {
      console.error('Error liking tweet:', error);
      return false;
    }
  }

  /**
   * Unlike a tweet
   */
  async unlikeTweet(tweetId: string): Promise<boolean> {
    try {
      const result = await this.client.v2.unlike(await this.getUserId(), tweetId);
      return result.data?.liked === false;
    } catch (error) {
      console.error('Error unliking tweet:', error);
      return false;
    }
  }

  /**
   * Retweet a tweet
   */
  async retweet(tweetId: string): Promise<boolean> {
    try {
      const result = await this.client.v2.retweet(await this.getUserId(), tweetId);
      return result.data?.retweeted || false;
    } catch (error) {
      console.error('Error retweeting:', error);
      return false;
    }
  }

  /**
   * Get authenticated user ID
   */
  private async getUserId(): Promise<string> {
    try {
      const user = await this.client.v2.me();
      return user.data?.id || '';
    } catch (error) {
      console.error('Error getting user ID:', error);
      throw new Error('Failed to get authenticated user ID');
    }
  }

  /**
   * Validate video file for X upload requirements
   */
  static validateVideoFile(videoPath: string): { valid: boolean; error?: string } {
    try {
      if (!fs.existsSync(videoPath)) {
        return { valid: false, error: 'Video file does not exist' };
      }

      const stats = fs.statSync(videoPath);
      const fileSize = stats.size;
      const maxSize = 512 * 1024 * 1024; // 512MB

      if (fileSize > maxSize) {
        return { valid: false, error: `File too large: ${fileSize} bytes (max: ${maxSize} bytes)` };
      }

      const fileExtension = path.extname(videoPath).toLowerCase();
      const supportedFormats = ['.mp4', '.mov'];
      
      if (!supportedFormats.includes(fileExtension)) {
        return { valid: false, error: `Unsupported format: ${fileExtension}. Supported: ${supportedFormats.join(', ')}` };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  /**
   * Get platform-specific video requirements
   */
  static getVideoRequirements(): {
    maxFileSize: number;
    maxDuration: number;
    supportedFormats: string[];
    recommendedSpecs: {
      resolution: string[];
      aspectRatio: string[];
      frameRate: string;
      bitrate: string;
    };
  } {
    return {
      maxFileSize: 512 * 1024 * 1024, // 512MB
      maxDuration: 140, // 2 minutes 20 seconds
      supportedFormats: ['MP4', 'MOV'],
      recommendedSpecs: {
        resolution: ['1920x1080', '1280x720', '720x1280', '1080x1920'],
        aspectRatio: ['16:9', '9:16', '1:1', '4:5'],
        frameRate: '30fps or less',
        bitrate: '25 Mbps or less'
      }
    };
  }
}

export default XPublisher;