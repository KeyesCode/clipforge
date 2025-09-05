import React, { useState } from 'react';
import { 
  PlayIcon,
  EyeIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowDownTrayIcon,
  EllipsisHorizontalIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { Clip } from '../../lib/types';
import { 
  formatDuration, 
  formatRelativeTime, 
  formatScore, 
  getStatusColor, 
  getApprovalStatusColor,
  getScoreColor,
  cn 
} from '../../lib/utils';

interface ClipCardProps {
  clip: Clip;
  onPlay?: (clip: Clip) => void;
  onReview?: (clip: Clip, status: 'approved' | 'rejected') => void;
  onDownload?: (clip: Clip) => void;
  onQueueRender?: (clip: Clip) => void;
  onQueuePublish?: (clip: Clip) => void;
  onRetry?: (clip: Clip) => void;
  selected?: boolean;
  onSelect?: (clip: Clip, selected: boolean) => void;
}

export function ClipCard({ 
  clip, 
  onPlay, 
  onReview, 
  onDownload, 
  onQueueRender,
  onQueuePublish,
  onRetry,
  selected = false,
  onSelect 
}: ClipCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const thumbnailUrl = clip.thumbnailPath || `/api/clips/${clip.id}/thumbnail`;
  const canReview = clip.approvalStatus === 'pending' && clip.status === 'rendered';
  const canDownload = clip.status === 'rendered' || clip.status === 'published';
  const canRetry = clip.status === 'failed';
  const canQueue = clip.status === 'rendered' && clip.approvalStatus === 'approved';

  return (
    <div className={cn(
      'bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow',
      selected && 'ring-2 ring-indigo-500'
    )}>
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-100">
        {!imageError ? (
          <img
            src={thumbnailUrl}
            alt={clip.title}
            className={cn(
              'w-full h-full object-cover transition-opacity duration-200',
              imageLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageError(true);
              setImageLoaded(true);
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <PlayIcon className="h-12 w-12 text-gray-400" />
          </div>
        )}
        
        {/* Play button overlay */}
        {onPlay && (
          <button
            onClick={() => onPlay(clip)}
            className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-30 transition-colors duration-200 group"
          >
            <PlayIcon className="h-12 w-12 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          </button>
        )}
        
        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
          {formatDuration(clip.duration)}
        </div>
        
        {/* Highlight indicator */}
        {clip.isHighlight && (
          <div className="absolute top-2 left-2">
            <StarSolidIcon className="h-5 w-5 text-yellow-400" />
          </div>
        )}
        
        {/* Selection checkbox */}
        {onSelect && (
          <div className="absolute top-2 right-2">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect(clip, e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
          </div>
        )}
      </div>
      
      {/* Content */}
      <div className="p-4">
        {/* Title and description */}
        <div className="mb-3">
          <h3 className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">
            {clip.title}
          </h3>
          {clip.description && (
            <p className="text-xs text-gray-500 line-clamp-2">
              {clip.description}
            </p>
          )}
        </div>
        
        {/* Status badges */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span className={cn(
            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
            getStatusColor(clip.status)
          )}>
            {clip.status}
          </span>
          
          <span className={cn(
            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
            getApprovalStatusColor(clip.approvalStatus)
          )}>
            {clip.approvalStatus}
          </span>
        </div>
        
        {/* Score */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <StarIcon className="h-4 w-4 text-gray-400 mr-1" />
            <span className={cn(
              'text-sm font-medium',
              getScoreColor(clip.highlightScore).replace('bg-', 'text-').split(' ')[0]
            )}>
              {formatScore(clip.highlightScore)}
            </span>
          </div>
          
          <div className="text-xs text-gray-500">
            {formatRelativeTime(clip.createdAt)}
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {/* Quick actions */}
            {canReview && onReview && (
              <>
                <button
                  onClick={() => onReview(clip, 'approved')}
                  className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-full transition-colors"
                  title="Approve"
                >
                  <CheckCircleIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onReview(clip, 'rejected')}
                  className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
                  title="Reject"
                >
                  <XCircleIcon className="h-4 w-4" />
                </button>
              </>
            )}
            
            {canDownload && onDownload && (
              <button
                onClick={() => onDownload(clip)}
                className="p-1.5 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded-full transition-colors"
                title="Download"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
              </button>
            )}
            
            {canRetry && onRetry && (
              <button
                onClick={() => onRetry(clip)}
                className="p-1.5 text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-full transition-colors"
                title="Retry"
              >
                <ClockIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          
          {/* More actions menu */}
          <Menu as="div" className="relative">
            <Menu.Button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-full transition-colors">
              <EllipsisHorizontalIcon className="h-4 w-4" />
            </Menu.Button>
            
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                {onPlay && (
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => onPlay(clip)}
                        className={cn(
                          active ? 'bg-gray-50' : '',
                          'flex w-full items-center px-4 py-2 text-sm text-gray-700'
                        )}
                      >
                        <PlayIcon className="mr-3 h-4 w-4" />
                        Play
                      </button>
                    )}
                  </Menu.Item>
                )}
                
                {canQueue && onQueueRender && (
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => onQueueRender(clip)}
                        className={cn(
                          active ? 'bg-gray-50' : '',
                          'flex w-full items-center px-4 py-2 text-sm text-gray-700'
                        )}
                      >
                        <ClockIcon className="mr-3 h-4 w-4" />
                        Queue for Rendering
                      </button>
                    )}
                  </Menu.Item>
                )}
                
                {canQueue && onQueuePublish && (
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => onQueuePublish(clip)}
                        className={cn(
                          active ? 'bg-gray-50' : '',
                          'flex w-full items-center px-4 py-2 text-sm text-gray-700'
                        )}
                      >
                        <EyeIcon className="mr-3 h-4 w-4" />
                        Queue for Publishing
                      </button>
                    )}
                  </Menu.Item>
                )}
                
                <Menu.Item>
                  {({ active }) => (
                    <button
                      className={cn(
                        active ? 'bg-gray-50' : '',
                        'flex w-full items-center px-4 py-2 text-sm text-gray-700'
                      )}
                    >
                      View Details
                    </button>
                  )}
                </Menu.Item>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
      </div>
    </div>
  );
}