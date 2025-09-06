import React from 'react';
import { 
  PlayIcon,
  ClockIcon,
  FilmIcon,
  EllipsisHorizontalIcon,
  TrashIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  CogIcon,
} from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { Stream } from '../../lib/types';
import { 
  formatDuration, 
  formatRelativeTime, 
  getStatusColor,
  cn,
  extractPlatform 
} from '../../lib/utils';

interface StreamCardProps {
  stream: Stream;
  onView?: (stream: Stream) => void;
  onDelete?: (stream: Stream) => void;
  onIngest?: (stream: Stream) => void;
  onProcess?: (stream: Stream) => void;
}

export function StreamCard({ stream, onView, onDelete, onIngest, onProcess }: StreamCardProps) {
  const platform = extractPlatform(stream.originalUrl);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-visible hover:shadow-md transition-shadow">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-100">
        {stream.thumbnailUrl ? (
          <img
            src={stream.thumbnailUrl}
            alt={stream.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <PlayIcon className="h-12 w-12 text-gray-400" />
          </div>
        )}
        
        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
          {formatDuration(stream.duration)}
        </div>
        
        {/* Platform badge */}
        <div className="absolute top-2 left-2 bg-white bg-opacity-90 text-gray-900 text-xs px-2 py-1 rounded capitalize">
          {platform}
        </div>
      </div>
      
      {/* Content */}
      <div className="p-4">
        {/* Title and description */}
        <div className="mb-3">
          <h3 className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">
            {stream.title}
          </h3>
          {stream.description && (
            <p className="text-xs text-gray-500 line-clamp-2">
              {stream.description}
            </p>
          )}
        </div>
        
        {/* Status and streamer */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={cn(
            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
            getStatusColor(stream.status)
          )}>
            {stream.status}
          </span>
          
          {stream.streamer && (
            <span className="text-xs text-gray-500">
              {stream.streamer.displayName}
            </span>
          )}
        </div>
        
        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
          <div className="flex items-center">
            <FilmIcon className="h-4 w-4 mr-1" />
            <span>{stream.totalClips} clips</span>
          </div>
          
          <div className="flex items-center">
            <ClockIcon className="h-4 w-4 mr-1" />
            <span>{formatRelativeTime(stream.createdAt)}</span>
          </div>
        </div>
        
        {/* Progress bar (if processing) */}
        {(stream.status === 'processing' || stream.status === 'downloading') && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Progress</span>
              <span>{stream.processingProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="h-2 rounded-full bg-indigo-600 transition-all duration-300"
                style={{ width: `${stream.processingProgress}%` }}
              />
            </div>
          </div>
        )}
        
        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {onView && (
              <button
                onClick={() => onView(stream)}
                className="p-1.5 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded-full transition-colors"
                title="View clips"
              >
                <EyeIcon className="h-4 w-4" />
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
              <Menu.Items className="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                {onView && (
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => onView(stream)}
                        className={cn(
                          active ? 'bg-gray-50' : '',
                          'flex w-full items-center px-4 py-2 text-sm text-gray-700'
                        )}
                      >
                        <EyeIcon className="mr-3 h-4 w-4" />
                        View Clips
                      </button>
                    )}
                  </Menu.Item>
                )}
                
                <Menu.Item>
                  {({ active }) => (
                    <a
                      href={stream.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        active ? 'bg-gray-50' : '',
                        'flex w-full items-center px-4 py-2 text-sm text-gray-700'
                      )}
                    >
                      <PlayIcon className="mr-3 h-4 w-4" />
                      View Original
                    </a>
                  )}
                </Menu.Item>
                
                {onIngest && stream.status === 'pending' && (
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => onIngest(stream)}
                        className={cn(
                          active ? 'bg-gray-50' : '',
                          'flex w-full items-center px-4 py-2 text-sm text-blue-700'
                        )}
                      >
                        <ArrowDownTrayIcon className="mr-3 h-4 w-4" />
                        Start Ingestion
                      </button>
                    )}
                  </Menu.Item>
                )}
                
                {onProcess && stream.status === 'downloaded' && (
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => onProcess(stream)}
                        className={cn(
                          active ? 'bg-gray-50' : '',
                          'flex w-full items-center px-4 py-2 text-sm text-green-700'
                        )}
                      >
                        <CogIcon className="mr-3 h-4 w-4" />
                        Start Processing
                      </button>
                    )}
                  </Menu.Item>
                )}
                
                {onDelete && (
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => onDelete(stream)}
                        className={cn(
                          active ? 'bg-gray-50' : '',
                          'flex w-full items-center px-4 py-2 text-sm text-red-700'
                        )}
                      >
                        <TrashIcon className="mr-3 h-4 w-4" />
                        Delete
                      </button>
                    )}
                  </Menu.Item>
                )}
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
      </div>
    </div>
  );
}