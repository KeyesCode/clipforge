import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiClient } from '../api/client';
import { Streamer } from '../types';
import toast from 'react-hot-toast';

// Query keys
export const STREAMERS_QUERY_KEYS = {
  all: ['streamers'] as const,
  lists: () => [...STREAMERS_QUERY_KEYS.all, 'list'] as const,
  list: () => [...STREAMERS_QUERY_KEYS.lists()] as const,
  details: () => [...STREAMERS_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...STREAMERS_QUERY_KEYS.details(), id] as const,
};

// Hooks for fetching streamers data
export function useStreamers() {
  return useQuery(
    STREAMERS_QUERY_KEYS.list(),
    () => apiClient.getStreamers(),
    {
      staleTime: 300000, // 5 minutes
      retry: 2,
      onError: (error: Error) => {
        toast.error(`Failed to load streamers: ${error.message}`);
      },
    }
  );
}

export function useStreamer(id: string) {
  return useQuery(
    STREAMERS_QUERY_KEYS.detail(id),
    () => apiClient.getStreamer(id),
    {
      enabled: !!id,
      staleTime: 300000, // 5 minutes
      retry: 2,
      onError: (error: Error) => {
        toast.error(`Failed to load streamer: ${error.message}`);
      },
    }
  );
}

// Mutation hooks for streamer operations
export function useCreateStreamer() {
  const queryClient = useQueryClient();
  
  return useMutation(
    (data: {
      name: string;
      platform: string;
      channelUrl: string;
    }) => apiClient.createStreamer(data),
    {
      onSuccess: (streamer) => {
        queryClient.invalidateQueries(STREAMERS_QUERY_KEYS.all);
        toast.success(`Streamer "${streamer.name}" added successfully`);
      },
      onError: (error: Error) => {
        toast.error(`Failed to create streamer: ${error.message}`);
      },
    }
  );
}

export function useUpdateStreamer() {
  const queryClient = useQueryClient();
  
  return useMutation(
    ({ id, data }: { id: string; data: Partial<Streamer> }) => apiClient.updateStreamer(id, data),
    {
      onSuccess: (streamer) => {
        queryClient.invalidateQueries(STREAMERS_QUERY_KEYS.detail(streamer.id));
        queryClient.invalidateQueries(STREAMERS_QUERY_KEYS.lists());
        toast.success(`Streamer "${streamer.name}" updated successfully`);
      },
      onError: (error: Error) => {
        toast.error(`Failed to update streamer: ${error.message}`);
      },
    }
  );
}

export function useDeleteStreamer() {
  const queryClient = useQueryClient();
  
  return useMutation(
    (id: string) => apiClient.deleteStreamer(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(STREAMERS_QUERY_KEYS.all);
        toast.success('Streamer deleted successfully');
      },
      onError: (error: Error) => {
        toast.error(`Failed to delete streamer: ${error.message}`);
      },
    }
  );
}