import React, { useState, useMemo } from 'react';
import { ClipCard } from './ClipCard';
import { ClipFilters } from './ClipFilters';
import { ClipBulkActions } from './ClipBulkActions';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Pagination } from '../ui/Pagination';
import { Clip, ClipFilters as ClipFiltersType } from '../../lib/types';
import { 
  useClips, 
  useReviewClip, 
  useQueueForRendering, 
  useQueueForPublishing,
  useRetryFailedClip 
} from '../../lib/hooks/useClips';
import { downloadBlob } from '../../lib/utils';
import { apiClient } from '../../lib/api/client';
import toast from 'react-hot-toast';
import { FilmIcon } from '@heroicons/react/24/outline';

interface ClipListProps {
  initialFilters?: ClipFiltersType;
  showFilters?: boolean;
  title?: string;
  description?: string;
}

export function ClipList({ 
  initialFilters = {}, 
  showFilters = true,
  title = 'Clips',
  description = 'Manage and review your video clips'
}: ClipListProps) {
  const [filters, setFilters] = useState<ClipFiltersType>({
    limit: 12,
    offset: 0,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    ...initialFilters,
  });
  
  const [selectedClips, setSelectedClips] = useState<string[]>([]);
  
  const { data, isLoading, error } = useClips(filters);
  const reviewMutation = useReviewClip();
  const queueRenderMutation = useQueueForRendering();
  const queuePublishMutation = useQueueForPublishing();
  const retryMutation = useRetryFailedClip();

  const clips = data?.data || [];
  const total = data?.total || 0;
  const hasNext = data?.hasNext || false;
  const hasPrev = data?.hasPrev || false;

  const selectedClipObjects = useMemo(() => 
    clips.filter(clip => selectedClips.includes(clip.id)),
    [clips, selectedClips]
  );

  const handleFilterChange = (newFilters: Partial<ClipFiltersType>) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      offset: 0, // Reset to first page when filters change
    }));
  };

  const handlePageChange = (page: number) => {
    const offset = (page - 1) * (filters.limit || 12);
    setFilters(prev => ({ ...prev, offset }));
  };

  const handleSelectClip = (clip: Clip, selected: boolean) => {
    setSelectedClips(prev => {
      if (selected) {
        return [...prev, clip.id];
      } else {
        return prev.filter(id => id !== clip.id);
      }
    });
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedClips(clips.map(clip => clip.id));
    } else {
      setSelectedClips([]);
    }
  };

  const handleReview = async (clip: Clip, status: 'approved' | 'rejected') => {
    try {
      await reviewMutation.mutateAsync({
        id: clip.id,
        data: {
          approvalStatus: status,
          reviewedBy: 'current-user', // TODO: Get from auth context
          reviewNotes: '',
        },
      });
    } catch (error) {
      console.error('Review failed:', error);
    }
  };

  const handleDownload = async (clip: Clip) => {
    try {
      const blob = await apiClient.downloadClip(clip.id);
      const filename = `${clip.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`;
      downloadBlob(blob, filename);
    } catch (error) {
      toast.error('Failed to download clip');
      console.error('Download failed:', error);
    }
  };

  const handleQueueRender = async (clip: Clip) => {
    try {
      await queueRenderMutation.mutateAsync(clip.id);
    } catch (error) {
      console.error('Queue render failed:', error);
    }
  };

  const handleQueuePublish = async (clip: Clip) => {
    try {
      await queuePublishMutation.mutateAsync(clip.id);
    } catch (error) {
      console.error('Queue publish failed:', error);
    }
  };

  const handleRetry = async (clip: Clip) => {
    try {
      await retryMutation.mutateAsync(clip.id);
    } catch (error) {
      console.error('Retry failed:', error);
    }
  };

  const handlePlay = (clip: Clip) => {
    // TODO: Implement video player modal
    console.log('Playing clip:', clip.id);
    toast.success('Video player coming soon!');
  };

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">
          Failed to load clips: {error.message}
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>

      {/* Filters */}
      {showFilters && (
        <ClipFilters 
          filters={filters} 
          onChange={handleFilterChange}
        />
      )}

      {/* Bulk actions */}
      {selectedClips.length > 0 && (
        <ClipBulkActions 
          selectedClips={selectedClipObjects}
          onClearSelection={() => setSelectedClips([])}
        />
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && clips.length === 0 && (
        <EmptyState
          icon={FilmIcon}
          title="No clips found"
          description="There are no clips matching your current filters."
          action={{
            label: 'Clear filters',
            onClick: () => setFilters({ limit: 12, offset: 0 }),
          }}
        />
      )}

      {/* Clips grid */}
      {!isLoading && clips.length > 0 && (
        <>
          {/* Select all */}
          <div className="flex items-center justify-between">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={selectedClips.length === clips.length}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded mr-2"
              />
              <span className="text-sm text-gray-700">
                Select all ({clips.length} clips)
              </span>
            </label>
            
            {selectedClips.length > 0 && (
              <span className="text-sm text-gray-500">
                {selectedClips.length} selected
              </span>
            )}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                selected={selectedClips.includes(clip.id)}
                onSelect={handleSelectClip}
                onPlay={handlePlay}
                onReview={handleReview}
                onDownload={handleDownload}
                onQueueRender={handleQueueRender}
                onQueuePublish={handleQueuePublish}
                onRetry={handleRetry}
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
    </div>
  );
}