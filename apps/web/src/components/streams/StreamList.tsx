import React, { useState } from 'react';
import { StreamCard } from './StreamCard';
import { CreateStreamModal } from './CreateStreamModal';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Pagination } from '../ui/Pagination';
import { Stream } from '../../lib/types';
import { useStreams, useDeleteStream } from '../../lib/hooks/useStreams';
import { PlusIcon, VideoCameraIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';

interface StreamListProps {
  filters?: {
    platform?: string;
    status?: string;
    streamerId?: string;
    limit?: number;
    offset?: number;
  };
}

export function StreamList({ filters = { limit: 12, offset: 0 } }: StreamListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const router = useRouter();
  
  const { data, isLoading, error } = useStreams(filters);
  const deleteMutation = useDeleteStream();

  const streams = data?.data || [];
  const total = data?.total || 0;
  const hasNext = data?.hasNext || false;
  const hasPrev = data?.hasPrev || false;

  const handlePageChange = (page: number) => {
    const offset = (page - 1) * (filters.limit || 12);
    router.push({
      pathname: router.pathname,
      query: { ...router.query, offset },
    });
  };

  const handleViewStream = (stream: Stream) => {
    router.push(`/clips?streamId=${stream.id}`);
  };

  const handleDeleteStream = async (stream: Stream) => {
    if (confirm(`Are you sure you want to delete "${stream.title}"?`)) {
      try {
        await deleteMutation.mutateAsync(stream.id);
      } catch (error) {
        console.error('Delete failed:', error);
      }
    }
  };

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">
          Failed to load streams: {(error as Error).message}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Streams</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your video streams and VODs
          </p>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Stream
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && streams.length === 0 && (
        <EmptyState
          icon={VideoCameraIcon}
          title="No streams found"
          description="Add your first stream to start processing clips."
          action={{
            label: 'Add Stream',
            onClick: () => setShowCreateModal(true),
          }}
        />
      )}

      {/* Streams grid */}
      {!isLoading && streams.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {streams.map((stream) => (
              <StreamCard
                key={stream.id}
                stream={stream}
                onView={handleViewStream}
                onDelete={handleDeleteStream}
              />
            ))}
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={Math.floor((filters.offset || 0) / (filters.limit || 12)) + 1}
            totalPages={Math.ceil(total / (filters.limit || 12))}
            hasNext={hasNext}
            hasPrev={hasPrev}
            onPageChange={handlePageChange}
            total={total}
            showing={{
              start: (filters.offset || 0) + 1,
              end: Math.min((filters.offset || 0) + (filters.limit || 12), total),
            }}
          />
        </>
      )}

      {/* Create Stream Modal */}
      {showCreateModal && (
        <CreateStreamModal
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}