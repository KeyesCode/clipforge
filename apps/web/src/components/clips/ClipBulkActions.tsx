import React, { useState } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  EyeIcon,
  XMarkIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { Clip } from '../../lib/types';
import { 
  useBulkApproveClips, 
  useBulkRejectClips,
  useBulkQueueForRendering,
  useBulkQueueForPublishing 
} from '../../lib/hooks/useClips';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

interface ClipBulkActionsProps {
  selectedClips: Clip[];
  onClearSelection: () => void;
}

export function ClipBulkActions({ selectedClips, onClearSelection }: ClipBulkActionsProps) {
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');

  const bulkApproveMutation = useBulkApproveClips();
  const bulkRejectMutation = useBulkRejectClips();
  const bulkQueueRenderMutation = useBulkQueueForRendering();
  const bulkQueuePublishMutation = useBulkQueueForPublishing();

  const selectedCount = selectedClips.length;
  const clipIds = selectedClips.map(clip => clip.id);

  // Check what actions are available based on selected clips
  const canApprove = selectedClips.some(clip => 
    clip.approvalStatus === 'pending' && clip.status === 'rendered'
  );
  const canReject = selectedClips.some(clip => 
    clip.approvalStatus === 'pending'
  );
  const canQueueRender = selectedClips.some(clip => 
    clip.status === 'rendered' && clip.approvalStatus === 'approved'
  );
  const canQueuePublish = selectedClips.some(clip => 
    clip.status === 'rendered' && clip.approvalStatus === 'approved'
  );

  const handleBulkApprove = async () => {
    const eligibleClips = selectedClips.filter(clip => 
      clip.approvalStatus === 'pending' && clip.status === 'rendered'
    );
    
    if (eligibleClips.length === 0) {
      toast.error('No eligible clips for approval');
      return;
    }

    try {
      await bulkApproveMutation.mutateAsync({
        clipIds: eligibleClips.map(clip => clip.id),
        reviewedBy: 'current-user', // TODO: Get from auth context
      });
      onClearSelection();
    } catch (error) {
      console.error('Bulk approve failed:', error);
    }
  };

  const handleBulkReject = async () => {
    const eligibleClips = selectedClips.filter(clip => 
      clip.approvalStatus === 'pending'
    );
    
    if (eligibleClips.length === 0) {
      toast.error('No eligible clips for rejection');
      return;
    }

    try {
      await bulkRejectMutation.mutateAsync({
        clipIds: eligibleClips.map(clip => clip.id),
        reviewedBy: 'current-user', // TODO: Get from auth context
        notes: rejectNotes || undefined,
      });
      onClearSelection();
      setShowRejectModal(false);
      setRejectNotes('');
    } catch (error) {
      console.error('Bulk reject failed:', error);
    }
  };

  const handleBulkQueueRender = async () => {
    const eligibleClips = selectedClips.filter(clip => 
      clip.status === 'rendered' && clip.approvalStatus === 'approved'
    );
    
    if (eligibleClips.length === 0) {
      toast.error('No eligible clips for rendering queue');
      return;
    }

    try {
      await bulkQueueRenderMutation.mutateAsync(
        eligibleClips.map(clip => clip.id)
      );
      onClearSelection();
    } catch (error) {
      console.error('Bulk queue render failed:', error);
    }
  };

  const handleBulkQueuePublish = async () => {
    const eligibleClips = selectedClips.filter(clip => 
      clip.status === 'rendered' && clip.approvalStatus === 'approved'
    );
    
    if (eligibleClips.length === 0) {
      toast.error('No eligible clips for publishing queue');
      return;
    }

    try {
      await bulkQueuePublishMutation.mutateAsync(
        eligibleClips.map(clip => clip.id)
      );
      onClearSelection();
    } catch (error) {
      console.error('Bulk queue publish failed:', error);
    }
  };

  return (
    <>
      <div className="bg-indigo-600 rounded-lg p-4 flex items-center justify-between text-white">
        <div className="flex items-center">
          <span className="text-sm font-medium">
            {selectedCount} clip{selectedCount !== 1 ? 's' : ''} selected
          </span>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Quick actions */}
          {canApprove && (
            <button
              onClick={handleBulkApprove}
              disabled={bulkApproveMutation.isLoading}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-indigo-600 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <CheckCircleIcon className="h-4 w-4 mr-1" />
              Approve
            </button>
          )}
          
          {canReject && (
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={bulkRejectMutation.isLoading}
              className="inline-flex items-center px-3 py-1.5 border border-white text-xs font-medium rounded text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <XCircleIcon className="h-4 w-4 mr-1" />
              Reject
            </button>
          )}
          
          {/* More actions dropdown */}
          <Menu as="div" className="relative">
            <Menu.Button className="inline-flex items-center px-3 py-1.5 border border-white text-xs font-medium rounded text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
              More
              <ChevronDownIcon className="ml-1 h-3 w-3" />
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
                {canQueueRender && (
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={handleBulkQueueRender}
                        disabled={bulkQueueRenderMutation.isLoading}
                        className={cn(
                          active ? 'bg-gray-50' : '',
                          'flex w-full items-center px-4 py-2 text-sm text-gray-700 disabled:opacity-50'
                        )}
                      >
                        <ClockIcon className="mr-3 h-4 w-4" />
                        Queue for Rendering
                      </button>
                    )}
                  </Menu.Item>
                )}
                
                {canQueuePublish && (
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={handleBulkQueuePublish}
                        disabled={bulkQueuePublishMutation.isLoading}
                        className={cn(
                          active ? 'bg-gray-50' : '',
                          'flex w-full items-center px-4 py-2 text-sm text-gray-700 disabled:opacity-50'
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
                      Export Selection
                    </button>
                  )}
                </Menu.Item>
              </Menu.Items>
            </Transition>
          </Menu>
          
          <button
            onClick={onClearSelection}
            className="p-1 text-white hover:text-indigo-200"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowRejectModal(false)} />
            
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <XCircleIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      Reject Selected Clips
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Are you sure you want to reject {selectedCount} clip{selectedCount !== 1 ? 's' : ''}? 
                        You can optionally provide a reason below.
                      </p>
                      <div className="mt-4">
                        <textarea
                          value={rejectNotes}
                          onChange={(e) => setRejectNotes(e.target.value)}
                          rows={3}
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 mt-1 block w-full sm:text-sm border-gray-300 rounded-md"
                          placeholder="Rejection reason (optional)..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleBulkReject}
                  disabled={bulkRejectMutation.isLoading}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                >
                  {bulkRejectMutation.isLoading ? 'Rejecting...' : 'Reject'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}