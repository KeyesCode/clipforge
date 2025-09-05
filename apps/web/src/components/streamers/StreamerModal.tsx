import React, { useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Fragment } from 'react';
import { useCreateStreamer, useUpdateStreamer } from '../../lib/hooks/useStreamers';
import { Streamer } from '../../lib/types';
import { isValidUrl, extractPlatform } from '../../lib/utils';

interface StreamerModalProps {
  streamer?: Streamer;
  onClose: () => void;
}

const platformOptions = [
  { value: 'twitch', label: 'Twitch' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'kick', label: 'Kick' },
  { value: 'other', label: 'Other' },
];

export function StreamerModal({ streamer, onClose }: StreamerModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    platform: '',
    channelUrl: '',
    isActive: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useCreateStreamer();
  const updateMutation = useUpdateStreamer();
  const isEditing = !!streamer;

  useEffect(() => {
    if (streamer) {
      setFormData({
        name: streamer.name,
        platform: streamer.platform,
        channelUrl: streamer.channelUrl,
        isActive: streamer.isActive,
      });
    }
  }, [streamer]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.channelUrl) {
      newErrors.channelUrl = 'Channel URL is required';
    } else if (!isValidUrl(formData.channelUrl)) {
      newErrors.channelUrl = 'Please enter a valid URL';
    }

    if (!formData.platform) {
      newErrors.platform = 'Please select a platform';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    try {
      const data = {
        name: formData.name.trim(),
        platform: formData.platform as 'twitch' | 'youtube' | 'kick' | 'other',
        channelUrl: formData.channelUrl,
        ...(isEditing && { isActive: formData.isActive }),
      };

      if (isEditing) {
        await updateMutation.mutateAsync({ id: streamer!.id, data });
      } else {
        await createMutation.mutateAsync(data);
      }
      
      onClose();
    } catch (error) {
      console.error('Save streamer failed:', error);
    }
  };

  const handleChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Auto-detect platform from URL
    if (field === 'channelUrl' && typeof value === 'string') {
      const detectedPlatform = extractPlatform(value);
      if (detectedPlatform !== 'other') {
        setFormData(prev => ({ ...prev, platform: detectedPlatform }));
      }
    }
    
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <Transition.Root show={true} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div className="absolute right-0 top-0 pr-4 pt-4">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                <div className="sm:flex sm:items-start">
                  <div className="w-full">
                    <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 mb-4">
                      {isEditing ? 'Edit Streamer' : 'Add New Streamer'}
                    </Dialog.Title>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      {/* Name */}
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                          Streamer Name
                        </label>
                        <input
                          type="text"
                          id="name"
                          value={formData.name}
                          onChange={(e) => handleChange('name', e.target.value)}
                          placeholder="Enter streamer name"
                          className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                            errors.name ? 'border-red-300' : 'border-gray-300'
                          }`}
                        />
                        {errors.name && (
                          <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                        )}
                      </div>

                      {/* Channel URL */}
                      <div>
                        <label htmlFor="channelUrl" className="block text-sm font-medium text-gray-700 mb-1">
                          Channel URL
                        </label>
                        <input
                          type="url"
                          id="channelUrl"
                          value={formData.channelUrl}
                          onChange={(e) => handleChange('channelUrl', e.target.value)}
                          placeholder="https://..."
                          className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                            errors.channelUrl ? 'border-red-300' : 'border-gray-300'
                          }`}
                        />
                        {errors.channelUrl && (
                          <p className="mt-1 text-sm text-red-600">{errors.channelUrl}</p>
                        )}
                      </div>

                      {/* Platform */}
                      <div>
                        <label htmlFor="platform" className="block text-sm font-medium text-gray-700 mb-1">
                          Platform
                        </label>
                        <select
                          id="platform"
                          value={formData.platform}
                          onChange={(e) => handleChange('platform', e.target.value)}
                          className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                            errors.platform ? 'border-red-300' : 'border-gray-300'
                          }`}
                        >
                          <option value="">Select platform</option>
                          {platformOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {errors.platform && (
                          <p className="mt-1 text-sm text-red-600">{errors.platform}</p>
                        )}
                      </div>

                      {/* Active Status (only when editing) */}
                      {isEditing && (
                        <div>
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={formData.isActive}
                              onChange={(e) => handleChange('isActive', e.target.checked)}
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            />
                            <span className="ml-2 text-sm text-gray-700">Active streamer</span>
                          </label>
                          <p className="mt-1 text-xs text-gray-500">
                            Inactive streamers won't be shown in stream creation dropdowns
                          </p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex justify-end space-x-3 pt-4">
                        <button
                          type="button"
                          onClick={onClose}
                          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={createMutation.isLoading || updateMutation.isLoading}
                          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          {createMutation.isLoading || updateMutation.isLoading 
                            ? 'Saving...' 
                            : isEditing 
                            ? 'Update Streamer' 
                            : 'Add Streamer'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}