import React from 'react';
import Link from 'next/link';
import { ClipCard } from '../clips';
import { LoadingSpinner } from '../ui';
import { Clip, PaginatedResponse } from '../../lib/types';

interface RecentClipsProps {
  clips: PaginatedResponse<Clip> | undefined;
  isLoading: boolean;
}

export function RecentClips({ clips, isLoading }: RecentClipsProps) {
  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Recent Clips</h3>
      </div>
      
      {isLoading ? (
        <div className="p-6 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : clips?.data && clips.data.length > 0 ? (
        <div className="p-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clips.data.map((clip) => (
            <ClipCard key={clip.id} clip={clip} />
          ))}
        </div>
      ) : (
        <div className="p-6 text-center text-gray-500">
          <p className="mb-2">No clips found.</p>
          <p className="text-sm">Start by uploading some videos!</p>
        </div>
      )}
      
      {clips?.data && clips.data.length > 0 && (
        <div className="px-6 py-4 border-t border-gray-200">
          <Link
            href="/clips"
            className="text-indigo-600 hover:text-indigo-500 font-medium text-sm"
          >
            View all clips →
          </Link>
        </div>
      )}
    </div>
  );
}