import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiClient } from '../api/client';
import { Clip, ClipFilters, ClipStats } from '../types';
import toast from 'react-hot-toast';

// Query keys
export const CLIPS_QUERY_KEYS = {
  all: ['clips'] as const,
  lists: () => [...CLIPS_QUERY_KEYS.all, 'list'] as const,
  list: (filters?: ClipFilters) => [...CLIPS_QUERY_KEYS.lists(), filters] as const,
  details: () => [...CLIPS_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...CLIPS_QUERY_KEYS.details(), id] as const,
  stats: (streamId?: string) => [...CLIPS_QUERY_KEYS.all, 'stats', streamId] as const,
  highlights: (filters?: ClipFilters) => [...CLIPS_QUERY_KEYS.all, 'highlights', filters] as const,
  pendingReview: (filters?: ClipFilters) => [...CLIPS_QUERY_KEYS.all, 'pending-review', filters] as const,
  byStream: (streamId: string, filters?: ClipFilters) => [...CLIPS_QUERY_KEYS.all, 'stream', streamId, filters] as const,
};

// Hooks for fetching clips data
export function useClips(filters?: ClipFilters) {
  return useQuery(
    CLIPS_QUERY_KEYS.list(filters),
    () => apiClient.getClips(filters),
    {
      staleTime: 30000, // 30 seconds
      retry: 2,
      onError: (error: Error) => {
        toast.error(`Failed to load clips: ${error.message}`);
      },
    }
  );
}

export function useClip(id: string) {
  return useQuery(
    CLIPS_QUERY_KEYS.detail(id),
    () => apiClient.getClip(id),
    {
      enabled: !!id,
      staleTime: 60000, // 1 minute
      retry: 2,
      onError: (error: Error) => {
        toast.error(`Failed to load clip: ${error.message}`);
      },
    }
  );
}

export function useClipStats(streamId?: string) {
  return useQuery(
    CLIPS_QUERY_KEYS.stats(streamId),
    () => apiClient.getClipStats(streamId),
    {
      staleTime: 60000, // 1 minute
      retry: 2,
      onError: (error: Error) => {
        toast.error(`Failed to load clip statistics: ${error.message}`);
      },
    }
  );
}

export function useHighlights(filters?: ClipFilters) {
  return useQuery(
    CLIPS_QUERY_KEYS.highlights(filters),
    () => apiClient.getHighlights(filters),
    {
      staleTime: 30000, // 30 seconds
      retry: 2,
      onError: (error: Error) => {
        toast.error(`Failed to load highlights: ${error.message}`);
      },
    }
  );
}

export function usePendingReviewClips(filters?: ClipFilters) {
  return useQuery(
    CLIPS_QUERY_KEYS.pendingReview(filters),
    () => apiClient.getPendingReviewClips(filters),
    {
      staleTime: 30000, // 30 seconds
      retry: 2,
      onError: (error: Error) => {
        toast.error(`Failed to load clips pending review: ${error.message}`);
      },
    }
  );
}

export function useClipsByStream(streamId: string, filters?: ClipFilters) {
  return useQuery(
    CLIPS_QUERY_KEYS.byStream(streamId, filters),
    () => apiClient.getClipsByStream(streamId, filters),
    {
      enabled: !!streamId,
      staleTime: 30000, // 30 seconds
      retry: 2,
      onError: (error: Error) => {
        toast.error(`Failed to load stream clips: ${error.message}`);
      },
    }
  );
}

// Mutation hooks for clip operations
export function useCreateClip() {
  const queryClient = useQueryClient();
  
  return useMutation(
    (data: Partial<Clip>) => apiClient.createClip(data),
    {
      onSuccess: (clip) => {
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.all);
        toast.success(`Clip "${clip.title}" created successfully`);
      },
      onError: (error: Error) => {
        toast.error(`Failed to create clip: ${error.message}`);
      },
    }
  );
}

export function useUpdateClip() {
  const queryClient = useQueryClient();
  
  return useMutation(
    ({ id, data }: { id: string; data: Partial<Clip> }) => apiClient.updateClip(id, data),
    {
      onSuccess: (clip) => {
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.detail(clip.id));
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.lists());
        toast.success(`Clip "${clip.title}" updated successfully`);
      },
      onError: (error: Error) => {
        toast.error(`Failed to update clip: ${error.message}`);
      },
    }
  );
}

export function useDeleteClip() {
  const queryClient = useQueryClient();
  
  return useMutation(
    (id: string) => apiClient.deleteClip(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.all);
        toast.success('Clip deleted successfully');
      },
      onError: (error: Error) => {
        toast.error(`Failed to delete clip: ${error.message}`);
      },
    }
  );
}

export function useReviewClip() {
  const queryClient = useQueryClient();
  
  return useMutation(
    ({ 
      id, 
      data 
    }: { 
      id: string; 
      data: {
        approvalStatus: 'approved' | 'rejected';
        reviewedBy: string;
        reviewNotes?: string;
      };
    }) => apiClient.reviewClip(id, data),
    {
      onSuccess: (clip) => {
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.detail(clip.id));
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.lists());
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.pendingReview());
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.stats());
        
        const status = clip.approvalStatus === 'approved' ? 'approved' : 'rejected';
        toast.success(`Clip "${clip.title}" ${status} successfully`);
      },
      onError: (error: Error) => {
        toast.error(`Failed to review clip: ${error.message}`);
      },
    }
  );
}

export function useQueueForRendering() {
  const queryClient = useQueryClient();
  
  return useMutation(
    (id: string) => apiClient.queueClipForRendering(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.all);
        toast.success('Clip queued for rendering');
      },
      onError: (error: Error) => {
        toast.error(`Failed to queue clip for rendering: ${error.message}`);
      },
    }
  );
}

export function useQueueForPublishing() {
  const queryClient = useQueryClient();
  
  return useMutation(
    (id: string) => apiClient.queueClipForPublishing(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.all);
        toast.success('Clip queued for publishing');
      },
      onError: (error: Error) => {
        toast.error(`Failed to queue clip for publishing: ${error.message}`);
      },
    }
  );
}

export function useRetryFailedClip() {
  const queryClient = useQueryClient();
  
  return useMutation(
    (id: string) => apiClient.retryFailedClip(id),
    {
      onSuccess: (clip) => {
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.detail(clip.id));
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.lists());
        toast.success(`Clip "${clip.title}" retry initiated`);
      },
      onError: (error: Error) => {
        toast.error(`Failed to retry clip: ${error.message}`);
      },
    }
  );
}

// Bulk operations
export function useBulkApproveClips() {
  const queryClient = useQueryClient();
  
  return useMutation(
    ({ clipIds, reviewedBy }: { clipIds: string[]; reviewedBy: string }) => 
      apiClient.bulkApproveClips(clipIds, reviewedBy),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.all);
        toast.success('Clips approved successfully');
      },
      onError: (error: Error) => {
        toast.error(`Failed to approve clips: ${error.message}`);
      },
    }
  );
}

export function useBulkRejectClips() {
  const queryClient = useQueryClient();
  
  return useMutation(
    ({ 
      clipIds, 
      reviewedBy, 
      notes 
    }: { 
      clipIds: string[]; 
      reviewedBy: string; 
      notes?: string; 
    }) => apiClient.bulkRejectClips(clipIds, reviewedBy, notes),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.all);
        toast.success('Clips rejected successfully');
      },
      onError: (error: Error) => {
        toast.error(`Failed to reject clips: ${error.message}`);
      },
    }
  );
}

export function useBulkQueueForRendering() {
  const queryClient = useQueryClient();
  
  return useMutation(
    (clipIds: string[]) => apiClient.bulkQueueForRendering(clipIds),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.all);
        toast.success('Clips queued for rendering');
      },
      onError: (error: Error) => {
        toast.error(`Failed to queue clips for rendering: ${error.message}`);
      },
    }
  );
}

export function useBulkQueueForPublishing() {
  const queryClient = useQueryClient();
  
  return useMutation(
    (clipIds: string[]) => apiClient.bulkQueueForPublishing(clipIds),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(CLIPS_QUERY_KEYS.all);
        toast.success('Clips queued for publishing');
      },
      onError: (error: Error) => {
        toast.error(`Failed to queue clips for publishing: ${error.message}`);
      },
    }
  );
}