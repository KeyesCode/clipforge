import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { 
  Clip, 
  ClipStats, 
  Stream, 
  Streamer, 
  ClipFilters, 
  PaginatedResponse,
  ApiResponse 
} from '../types';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add auth token if available
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // Handle common errors
        if (error.response?.status === 401) {
          // Handle unauthorized
          this.handleUnauthorized();
        }
        return Promise.reject(error);
      }
    );
  }

  private getAuthToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('authToken');
    }
    return null;
  }

  private handleUnauthorized(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
  }

  // Generic request method
  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.request(config);
      return response.data;
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'An error occurred';
      throw new Error(message);
    }
  }

  // Clips API
  async getClips(filters?: ClipFilters): Promise<PaginatedResponse<Clip>> {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
    }

    return this.request<PaginatedResponse<Clip>>({
      method: 'GET',
      url: '/clips',
      params,
    });
  }

  async getClip(id: string): Promise<Clip> {
    return this.request<Clip>({
      method: 'GET',
      url: `/clips/${id}`,
    });
  }

  async createClip(data: Partial<Clip>): Promise<Clip> {
    return this.request<Clip>({
      method: 'POST',
      url: '/clips',
      data,
    });
  }

  async updateClip(id: string, data: Partial<Clip>): Promise<Clip> {
    return this.request<Clip>({
      method: 'PATCH',
      url: `/clips/${id}`,
      data,
    });
  }

  async deleteClip(id: string): Promise<void> {
    return this.request<void>({
      method: 'DELETE',
      url: `/clips/${id}`,
    });
  }

  async reviewClip(id: string, data: {
    approvalStatus: 'approved' | 'rejected';
    reviewedBy: string;
    reviewNotes?: string;
  }): Promise<Clip> {
    return this.request<Clip>({
      method: 'POST',
      url: `/clips/${id}/review`,
      data,
    });
  }

  async queueClipForRendering(id: string): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>({
      method: 'POST',
      url: `/clips/${id}/render`,
    });
  }

  async queueClipForPublishing(id: string): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>({
      method: 'POST',
      url: `/clips/${id}/publish`,
    });
  }

  async retryFailedClip(id: string): Promise<Clip> {
    return this.request<Clip>({
      method: 'POST',
      url: `/clips/${id}/retry`,
    });
  }

  async getClipStats(streamId?: string): Promise<ClipStats> {
    const params = streamId ? { streamId } : {};
    return this.request<ClipStats>({
      method: 'GET',
      url: '/clips/stats',
      params,
    });
  }

  async getHighlights(filters?: ClipFilters): Promise<PaginatedResponse<Clip>> {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
    }

    return this.request<PaginatedResponse<Clip>>({
      method: 'GET',
      url: '/clips/highlights',
      params,
    });
  }

  async getPendingReviewClips(filters?: ClipFilters): Promise<PaginatedResponse<Clip>> {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
    }

    return this.request<PaginatedResponse<Clip>>({
      method: 'GET',
      url: '/clips/pending-review',
      params,
    });
  }

  async getClipsByStream(streamId: string, filters?: ClipFilters): Promise<PaginatedResponse<Clip>> {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
    }

    return this.request<PaginatedResponse<Clip>>({
      method: 'GET',
      url: `/clips/stream/${streamId}`,
      params,
    });
  }

  // Streams API
  async getStreams(filters?: {
    platform?: string;
    status?: string;
    streamerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Stream>> {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
    }

    return this.request<PaginatedResponse<Stream>>({
      method: 'GET',
      url: '/streams',
      params,
    });
  }

  async getStream(id: string): Promise<Stream> {
    return this.request<Stream>({
      method: 'GET',
      url: `/streams/${id}`,
    });
  }

  async createStream(data: {
    streamerId: string;
    vodUrl: string;
    title: string;
    description?: string;
  }): Promise<Stream> {
    return this.request<Stream>({
      method: 'POST',
      url: '/streams',
      data,
    });
  }

  async deleteStream(id: string): Promise<void> {
    return this.request<void>({
      method: 'DELETE',
      url: `/streams/${id}`,
    });
  }

  // Streamers API
  async getStreamers(): Promise<Streamer[]> {
    return this.request<Streamer[]>({
      method: 'GET',
      url: '/streamers',
    });
  }

  async getStreamer(id: string): Promise<Streamer> {
    return this.request<Streamer>({
      method: 'GET',
      url: `/streamers/${id}`,
    });
  }

  async createStreamer(data: Partial<Streamer>): Promise<Streamer> {
    return this.request<Streamer>({
      method: 'POST',
      url: '/streamers',
      data,
    });
  }

  async updateStreamer(id: string, data: Partial<Streamer>): Promise<Streamer> {
    return this.request<Streamer>({
      method: 'PATCH',
      url: `/streamers/${id}`,
      data,
    });
  }

  async deleteStreamer(id: string): Promise<void> {
    return this.request<void>({
      method: 'DELETE',
      url: `/streamers/${id}`,
    });
  }

  // File download
  async downloadClip(clipId: string): Promise<Blob> {
    const response = await this.client.get(`/clips/${clipId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  }

  // Bulk operations
  async bulkApproveClips(clipIds: string[], reviewedBy: string): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>({
      method: 'POST',
      url: '/clips/bulk/approve',
      data: { clipIds, reviewedBy },
    });
  }

  async bulkRejectClips(clipIds: string[], reviewedBy: string, notes?: string): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>({
      method: 'POST',
      url: '/clips/bulk/reject',
      data: { clipIds, reviewedBy, notes },
    });
  }

  async bulkQueueForRendering(clipIds: string[]): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>({
      method: 'POST',
      url: '/clips/bulk/render',
      data: { clipIds },
    });
  }

  async bulkQueueForPublishing(clipIds: string[]): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>({
      method: 'POST',
      url: '/clips/bulk/publish',
      data: { clipIds },
    });
  }
}

// Create singleton instance
export const apiClient = new ApiClient();
export default apiClient;