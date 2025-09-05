import React from 'react';
import { 
  UserCircleIcon,
  EllipsisHorizontalIcon,
  TrashIcon,
  PencilIcon,
  FilmIcon,
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { Streamer } from '../../lib/types';
import { 
  formatNumber, 
  formatRelativeTime,
  cn 
} from '../../lib/utils';

interface StreamerCardProps {
  streamer: Streamer;
  onEdit?: (streamer: Streamer) => void;
  onDelete?: (streamer: Streamer) => void;
  onViewStreams?: (streamer: Streamer) => void;
}

export function StreamerCard({ streamer, onEdit, onDelete, onViewStreams }: StreamerCardProps) {
  const getPlatformColor = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'twitch':
        return 'text-purple-600 bg-purple-100';
      case 'youtube':
        return 'text-red-600 bg-red-100';
      case 'kick':
        return 'text-green-600 bg-green-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="p-6">
        <div className="flex items-center">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {streamer.avatarUrl ? (
              <img
                className="h-12 w-12 rounded-full"
                src={streamer.avatarUrl}
                alt={streamer.name}
              />
            ) : (
              <UserCircleIcon className="h-12 w-12 text-gray-400" />
            )}
          </div>
          
          {/* Info */}
          <div className="ml-4 flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  {streamer.name}
                </h3>
                <div className="flex items-center mt-1">
                  <span className={cn(
                    'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium capitalize',
                    getPlatformColor(streamer.platform)
                  )}>
                    {streamer.platform}
                  </span>
                  
                  <span className={cn(
                    'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ml-2',
                    streamer.isActive 
                      ? 'text-green-600 bg-green-100' 
                      : 'text-gray-600 bg-gray-100'
                  )}>
                    {streamer.isActive ? (
                      <>
                        <CheckCircleIcon className="h-3 w-3 mr-1" />
                        Active
                      </>
                    ) : (
                      <>
                        <XCircleIcon className="h-3 w-3 mr-1" />
                        Inactive
                      </>
                    )}
                  </span>
                </div>
              </div>
              
              {/* Actions menu */}
              <Menu as="div" className="relative">
                <Menu.Button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-full transition-colors">
                  <EllipsisHorizontalIcon className="h-5 w-5" />
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
                    {onViewStreams && (
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={() => onViewStreams(streamer)}
                            className={cn(
                              active ? 'bg-gray-50' : '',
                              'flex w-full items-center px-4 py-2 text-sm text-gray-700'
                            )}
                          >
                            <FilmIcon className="mr-3 h-4 w-4" />
                            View Streams
                          </button>
                        )}
                      </Menu.Item>
                    )}
                    
                    <Menu.Item>
                      {({ active }) => (
                        <a
                          href={streamer.channelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            active ? 'bg-gray-50' : '',
                            'flex w-full items-center px-4 py-2 text-sm text-gray-700'
                          )}
                        >
                          <EyeIcon className="mr-3 h-4 w-4" />
                          View Channel
                        </a>
                      )}
                    </Menu.Item>
                    
                    {onEdit && (
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={() => onEdit(streamer)}
                            className={cn(
                              active ? 'bg-gray-50' : '',
                              'flex w-full items-center px-4 py-2 text-sm text-gray-700'
                            )}
                          >
                            <PencilIcon className="mr-3 h-4 w-4" />
                            Edit
                          </button>
                        )}
                      </Menu.Item>
                    )}
                    
                    {onDelete && (
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={() => onDelete(streamer)}
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
        
        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {formatNumber(streamer.totalStreams)}
            </div>
            <div className="text-sm text-gray-500">Streams</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {formatNumber(streamer.totalClips)}
            </div>
            <div className="text-sm text-gray-500">Clips</div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 text-center">
            Added {formatRelativeTime(streamer.createdAt)}
          </div>
        </div>
      </div>
    </div>
  );
}