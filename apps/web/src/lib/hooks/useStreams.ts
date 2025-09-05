import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiClient } from '../api/client';
import { Stream } from '../types';
import toast from 'react-hot-toast';

// Query keys
export const STREAMS_QUERY_KEYS = {
  all: ['streams'] as const,
  lists: () => [...STREAMS_QUERY_KEYS.all, 'list'] as const,
  list: (filters?: any) => [...STREAMS_QUERY_KEYS.lists(), filters] as const,
  details: () => [...STREAMS_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...STREAMS_QUERY_KEYS.details(), id] as const,
};

// Hooks for fetching streams data
export function useStreams(filters?: {
  platform?: string;
  status?: string;
  streamerId?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery(
    STREAMS_QUERY_KEYS.list(filters),
    () => apiClient.getStreams(filters),
    {
      staleTime: 30000, // 30 seconds
      retry: 2,
      onError: (error: Error) => {
        toast.error(`Failed to load streams: ${error.message}`);
      },
    }
  );
}

export function useStream(id: string) {
  return useQuery(
    STREAMS_QUERY_KEYS.detail(id),
    () => apiClient.getStream(id),
    {
      enabled: !!id,
      staleTime: 60000, // 1 minute
      retry: 2,
      onError: (error: Error) => {
        toast.error(`Failed to load stream: ${error.message}`);
      },
    }
  );
}

// Mutation hooks for stream operations
export function useCreateStream() {
  const queryClient = useQueryClient();
  
  return useMutation(
    (data: {
      streamerId: string;
      vodUrl: string;
      title: string;
      description?: string;
    }) => apiClient.createStream(data),
    {
      onSuccess: (stream) => {
        queryClient.invalidateQueries(STREAMS_QUERY_KEYS.all);
        toast.success(`Stream "${stream.title}" created successfully`);
      },
      onError: (error: Error) => {
        toast.error(`Failed to create stream: ${error.message}`);
      },
    }
  );
}

export function useDeleteStream() {
  const queryClient = useQueryClient();
  
  return useMutation(
    (id: string) => apiClient.deleteStream(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(STREAMS_QUERY_KEYS.all);
        toast.success('Stream deleted successfully');
      },
      onError: (error: Error) => {
        toast.error(`Failed to delete stream: ${error.message}`);
      },
    }
  );
}