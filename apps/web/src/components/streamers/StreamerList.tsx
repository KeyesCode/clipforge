import React, { useState } from 'react';
import { StreamerCard } from './StreamerCard';
import { StreamerModal } from './StreamerModal';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Streamer } from '../../lib/types';
import { useStreamers, useDeleteStreamer } from '../../lib/hooks/useStreamers';
import { PlusIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';

export function StreamerList() {
  const [showModal, setShowModal] = useState(false);
  const [editingStreamer, setEditingStreamer] = useState<Streamer | undefined>();
  const router = useRouter();
  
  const { data: streamers = [], isLoading, error } = useStreamers();
  const deleteMutation = useDeleteStreamer();

  const handleEdit = (streamer: Streamer) => {
    setEditingStreamer(streamer);
    setShowModal(true);
  };

  const handleDelete = async (streamer: Streamer) => {
    if (confirm(`Are you sure you want to delete "${streamer.name}"? This will also delete all associated streams and clips.`)) {
      try {
        await deleteMutation.mutateAsync(streamer.id);
      } catch (error) {
        console.error('Delete failed:', error);
      }
    }
  };

  const handleViewStreams = (streamer: Streamer) => {
    router.push(`/streams?streamerId=${streamer.id}`);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingStreamer(undefined);
  };

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">
          Failed to load streamers: {(error as Error).message}
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
          <h1 className="text-2xl font-bold text-gray-900">Streamers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your streamers and content creators
          </p>
        </div>
        
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Streamer
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && streamers.length === 0 && (
        <EmptyState
          icon={UserGroupIcon}
          title="No streamers found"
          description="Add your first streamer to start managing their content."
          action={{
            label: 'Add Streamer',
            onClick: () => setShowModal(true),
          }}
        />
      )}

      {/* Streamers grid */}
      {!isLoading && streamers.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {streamers.map((streamer) => (
            <StreamerCard
              key={streamer.id}
              streamer={streamer}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onViewStreams={handleViewStreams}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <StreamerModal
          streamer={editingStreamer}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}