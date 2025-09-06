import React, { useState, useEffect } from 'react';
import { StreamCard } from './StreamCard';
import { CreateStreamModal } from './CreateStreamModal';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Pagination } from '../ui/Pagination';
import { Stream } from '../../lib/types';
import { useStreams, useDeleteStream } from '../../lib/hooks/useStreams';
import { useStreamers } from '../../lib/hooks/useStreamers';
import { 
  PlusIcon, 
  VideoCameraIcon, 
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';

interface StreamListProps {
  filters?: {
    platform?: string;
    status?: string;
    streamerId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  };
}

export function StreamList({ filters = { limit: 12, offset: 0 } }: StreamListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [localFilters, setLocalFilters] = useState({
    search: '',
    platform: '',
    status: '',
    streamerId: '',
    ...filters
  });
  const router = useRouter();
  
  const { data, isLoading, error } = useStreams(localFilters);
  const { data: streamers = [] } = useStreamers();
  const deleteMutation = useDeleteStream();

  const streams = data?.data || [];
  const total = data?.total || 0;
  const hasNext = data?.hasNext || false;
  const hasPrev = data?.hasPrev || false;

  // Update local filters when router query changes
  useEffect(() => {
    const query = router.query;
    setLocalFilters(prev => ({
      ...prev,
      search: (query.search as string) || '',
      platform: (query.platform as string) || '',
      status: (query.status as string) || '',
      streamerId: (query.streamerId as string) || '',
      limit: query.limit ? parseInt(query.limit as string) : 12,
      offset: query.offset ? parseInt(query.offset as string) : 0,
    }));
  }, [router.query]);

  const handleFilterChange = (key: string, value: string) => {
    setLocalFilters(prev => ({ ...prev, [key]: value, offset: 0 }));
    router.push({
      pathname: router.pathname,
      query: { ...router.query, [key]: value || undefined, offset: 0 },
    });
  };

  const handleSearch = (searchTerm: string) => {
    setLocalFilters(prev => ({ ...prev, search: searchTerm, offset: 0 }));
    router.push({
      pathname: router.pathname,
      query: { ...router.query, search: searchTerm || undefined, offset: 0 },
    });
  };

  const clearFilters = () => {
    setLocalFilters(prev => ({
      ...prev,
      search: '',
      platform: '',
      status: '',
      streamerId: '',
      offset: 0,
    }));
    router.push({
      pathname: router.pathname,
      query: { limit: localFilters.limit },
    });
  };

  const handlePageChange = (page: number) => {
    const offset = (page - 1) * (localFilters.limit || 12);
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
        
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center px-3 py-2 border text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
              showFilters || Object.values(localFilters).some(v => v && v !== '')
                ? 'border-indigo-300 text-indigo-700 bg-indigo-50'
                : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
            }`}
          >
            <FunnelIcon className="h-4 w-4 mr-2" />
            Filters
          </button>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Stream
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search streams by title or description..."
            value={localFilters.search}
            onChange={(e) => handleSearch(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Platform Filter */}
              <div>
                <label htmlFor="platform-filter" className="block text-sm font-medium text-gray-700 mb-1">
                  Platform
                </label>
                <select
                  id="platform-filter"
                  value={localFilters.platform}
                  onChange={(e) => handleFilterChange('platform', e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                  <option value="">All Platforms</option>
                  <option value="twitch">Twitch</option>
                  <option value="youtube">YouTube</option>
                  <option value="kick">Kick</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  id="status-filter"
                  value={localFilters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="downloading">Downloading</option>
                  <option value="processing">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="published">Published</option>
                </select>
              </div>

              {/* Streamer Filter */}
              <div>
                <label htmlFor="streamer-filter" className="block text-sm font-medium text-gray-700 mb-1">
                  Streamer
                </label>
                <select
                  id="streamer-filter"
                  value={localFilters.streamerId}
                  onChange={(e) => handleFilterChange('streamerId', e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                  <option value="">All Streamers</option>
                  {streamers.map((streamer) => (
                    <option key={streamer.id} value={streamer.id}>
                      {streamer.displayName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Clear Filters */}
              <div className="flex items-end">
                <button
                  onClick={clearFilters}
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <XMarkIcon className="h-4 w-4 mr-2" />
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        )}
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

      {/* Results Summary */}
      {!isLoading && streams.length > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <div>
            Showing {streams.length} of {total} streams
            {(localFilters.search || localFilters.platform || localFilters.status || localFilters.streamerId) && (
              <span className="ml-2">
                (filtered)
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {localFilters.search && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Search: "{localFilters.search}"
              </span>
            )}
            {localFilters.platform && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Platform: {localFilters.platform}
              </span>
            )}
            {localFilters.status && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                Status: {localFilters.status}
              </span>
            )}
            {localFilters.streamerId && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                Streamer: {streamers.find(s => s.id === localFilters.streamerId)?.displayName || 'Unknown'}
              </span>
            )}
          </div>
        </div>
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
            currentPage={Math.floor((localFilters.offset || 0) / (localFilters.limit || 12)) + 1}
            totalPages={Math.ceil(total / (localFilters.limit || 12))}
            hasNext={hasNext}
            hasPrev={hasPrev}
            onPageChange={handlePageChange}
            total={total}
            showing={{
              start: (localFilters.offset || 0) + 1,
              end: Math.min((localFilters.offset || 0) + (localFilters.limit || 12), total),
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