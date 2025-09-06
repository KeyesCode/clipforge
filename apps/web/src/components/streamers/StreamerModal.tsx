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

interface StreamerFormData {
  username: string;
  displayName: string;
  platform: string;
  platformId: string;
  avatarUrl: string;
  description: string;
  isActive: boolean;
  settings: {
    auto_clip: boolean;
    min_clip_duration: number;
    max_clip_duration: number;
    highlight_threshold: number;
    preferred_aspect_ratios: string[];
    auto_publish: boolean;
  };
}

const platformOptions = [
  { value: 'twitch', label: 'Twitch' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'kick', label: 'Kick' },
  { value: 'other', label: 'Other' },
];

export function StreamerModal({ streamer, onClose }: StreamerModalProps) {
  const [formData, setFormData] = useState<StreamerFormData>({
    username: '',
    displayName: '',
    platform: '',
    platformId: '',
    avatarUrl: '',
    description: '',
    isActive: true,
    settings: {
      auto_clip: true,
      min_clip_duration: 30,
      max_clip_duration: 90,
      highlight_threshold: 0.6,
      preferred_aspect_ratios: ['9:16', '1:1'],
      auto_publish: true,
    },
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useCreateStreamer();
  const updateMutation = useUpdateStreamer();
  const isEditing = !!streamer;

  useEffect(() => {
    if (streamer) {
      setFormData({
        username: streamer.username,
        displayName: streamer.displayName,
        platform: streamer.platform || '',
        platformId: streamer.platformId || '',
        avatarUrl: streamer.avatarUrl || '',
        description: streamer.description || '',
        isActive: streamer.isActive,
        settings: {
          auto_clip: streamer.settings?.auto_clip ?? true,
          min_clip_duration: streamer.settings?.min_clip_duration ?? 30,
          max_clip_duration: streamer.settings?.max_clip_duration ?? 90,
          highlight_threshold: streamer.settings?.highlight_threshold ?? 0.6,
          preferred_aspect_ratios: streamer.settings?.preferred_aspect_ratios ?? ['9:16', '1:1'],
          auto_publish: streamer.settings?.auto_publish ?? true,
        },
      });
    }
  }, [streamer]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    }

    if (!formData.displayName.trim()) {
      newErrors.displayName = 'Display name is required';
    }

    if (formData.avatarUrl && !isValidUrl(formData.avatarUrl)) {
      newErrors.avatarUrl = 'Please enter a valid URL';
    }

    // Settings validation
    if (formData.settings.min_clip_duration < 5) {
      newErrors.min_clip_duration = 'Minimum clip duration must be at least 5 seconds';
    }

    if (formData.settings.max_clip_duration > 300) {
      newErrors.max_clip_duration = 'Maximum clip duration cannot exceed 300 seconds';
    }

    if (formData.settings.min_clip_duration >= formData.settings.max_clip_duration) {
      newErrors.max_clip_duration = 'Maximum duration must be greater than minimum duration';
    }

    if (formData.settings.highlight_threshold < 0 || formData.settings.highlight_threshold > 1) {
      newErrors.highlight_threshold = 'Highlight threshold must be between 0 and 1';
    }

    if (formData.settings.preferred_aspect_ratios.length === 0) {
      newErrors.preferred_aspect_ratios = 'At least one aspect ratio must be selected';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    try {
      const data = {
        username: formData.username.trim(),
        displayName: formData.displayName.trim(),
        platform: formData.platform || undefined,
        platformId: formData.platformId || undefined,
        avatarUrl: formData.avatarUrl || undefined,
        description: formData.description || undefined,
        settings: formData.settings,
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

  const handleChange = (field: string, value: string | boolean | number | string[]) => {
    if (field.startsWith('settings.')) {
      const settingField = field.replace('settings.', '');
      setFormData(prev => ({
        ...prev,
        settings: {
          ...prev.settings,
          [settingField]: value,
        },
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
      
      // Auto-detect platform from URL
      if (field === 'channelUrl' && typeof value === 'string') {
        const detectedPlatform = extractPlatform(value);
        if (detectedPlatform !== 'other') {
          setFormData(prev => ({ ...prev, platform: detectedPlatform }));
        }
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
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6">
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
                      {/* Username */}
                      <div>
                        <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                          Username *
                        </label>
                        <input
                          type="text"
                          id="username"
                          value={formData.username}
                          onChange={(e) => handleChange('username', e.target.value)}
                          placeholder="Enter unique username"
                          className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                            errors.username ? 'border-red-300' : 'border-gray-300'
                          }`}
                        />
                        {errors.username && (
                          <p className="mt-1 text-sm text-red-600">{errors.username}</p>
                        )}
                      </div>

                      {/* Display Name */}
                      <div>
                        <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                          Display Name *
                        </label>
                        <input
                          type="text"
                          id="displayName"
                          value={formData.displayName}
                          onChange={(e) => handleChange('displayName', e.target.value)}
                          placeholder="Enter display name"
                          className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                            errors.displayName ? 'border-red-300' : 'border-gray-300'
                          }`}
                        />
                        {errors.displayName && (
                          <p className="mt-1 text-sm text-red-600">{errors.displayName}</p>
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

                      {/* Platform ID */}
                      <div>
                        <label htmlFor="platformId" className="block text-sm font-medium text-gray-700 mb-1">
                          Platform ID
                        </label>
                        <input
                          type="text"
                          id="platformId"
                          value={formData.platformId}
                          onChange={(e) => handleChange('platformId', e.target.value)}
                          placeholder="Platform-specific user ID"
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Optional: Platform-specific user ID for API integration
                        </p>
                      </div>

                      {/* Avatar URL */}
                      <div>
                        <label htmlFor="avatarUrl" className="block text-sm font-medium text-gray-700 mb-1">
                          Avatar URL
                        </label>
                        <input
                          type="url"
                          id="avatarUrl"
                          value={formData.avatarUrl}
                          onChange={(e) => handleChange('avatarUrl', e.target.value)}
                          placeholder="https://..."
                          className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                            errors.avatarUrl ? 'border-red-300' : 'border-gray-300'
                          }`}
                        />
                        {errors.avatarUrl && (
                          <p className="mt-1 text-sm text-red-600">{errors.avatarUrl}</p>
                        )}
                      </div>

                      {/* Description */}
                      <div>
                        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => handleChange('description', e.target.value)}
                          placeholder="Enter streamer description"
                          rows={3}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>

                      {/* Settings Section */}
                      <div className="border-t pt-6">
                        <h4 className="text-lg font-medium text-gray-900 mb-4">Clip Settings</h4>
                        
                        {/* Auto Clip */}
                        <div className="mb-4">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={formData.settings.auto_clip}
                              onChange={(e) => handleChange('settings.auto_clip', e.target.checked)}
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            />
                            <span className="ml-2 text-sm text-gray-700">Enable automatic clip generation</span>
                          </label>
                          <p className="mt-1 text-xs text-gray-500">
                            Automatically generate clips from streams based on highlight detection
                          </p>
                        </div>

                        {/* Clip Duration Range */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <label htmlFor="min_clip_duration" className="block text-sm font-medium text-gray-700 mb-1">
                              Min Duration (seconds)
                            </label>
                            <input
                              type="number"
                              id="min_clip_duration"
                              min="5"
                              max="300"
                              value={formData.settings.min_clip_duration}
                              onChange={(e) => handleChange('settings.min_clip_duration', parseInt(e.target.value) || 5)}
                              className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                                errors.min_clip_duration ? 'border-red-300' : 'border-gray-300'
                              }`}
                            />
                            {errors.min_clip_duration && (
                              <p className="mt-1 text-sm text-red-600">{errors.min_clip_duration}</p>
                            )}
                          </div>
                          <div>
                            <label htmlFor="max_clip_duration" className="block text-sm font-medium text-gray-700 mb-1">
                              Max Duration (seconds)
                            </label>
                            <input
                              type="number"
                              id="max_clip_duration"
                              min="5"
                              max="300"
                              value={formData.settings.max_clip_duration}
                              onChange={(e) => handleChange('settings.max_clip_duration', parseInt(e.target.value) || 90)}
                              className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                                errors.max_clip_duration ? 'border-red-300' : 'border-gray-300'
                              }`}
                            />
                            {errors.max_clip_duration && (
                              <p className="mt-1 text-sm text-red-600">{errors.max_clip_duration}</p>
                            )}
                          </div>
                        </div>

                        {/* Highlight Threshold */}
                        <div className="mb-4">
                          <label htmlFor="highlight_threshold" className="block text-sm font-medium text-gray-700 mb-1">
                            Highlight Threshold
                          </label>
                          <input
                            type="range"
                            id="highlight_threshold"
                            min="0"
                            max="1"
                            step="0.1"
                            value={formData.settings.highlight_threshold}
                            onChange={(e) => handleChange('settings.highlight_threshold', parseFloat(e.target.value))}
                            className="block w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>0.0 (Low)</span>
                            <span className="font-medium">{formData.settings.highlight_threshold}</span>
                            <span>1.0 (High)</span>
                          </div>
                          {errors.highlight_threshold && (
                            <p className="mt-1 text-sm text-red-600">{errors.highlight_threshold}</p>
                          )}
                        </div>

                        {/* Preferred Aspect Ratios */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Preferred Aspect Ratios
                          </label>
                          <div className="space-y-2">
                            {[
                              { value: '9:16', label: '9:16 (Vertical)' },
                              { value: '1:1', label: '1:1 (Square)' },
                              { value: '16:9', label: '16:9 (Horizontal)' },
                            ].map((ratio) => (
                              <label key={ratio.value} className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={formData.settings.preferred_aspect_ratios.includes(ratio.value)}
                                  onChange={(e) => {
                                    const newRatios = e.target.checked
                                      ? [...formData.settings.preferred_aspect_ratios, ratio.value]
                                      : formData.settings.preferred_aspect_ratios.filter(r => r !== ratio.value);
                                    handleChange('settings.preferred_aspect_ratios', newRatios);
                                  }}
                                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <span className="ml-2 text-sm text-gray-700">{ratio.label}</span>
                              </label>
                            ))}
                          </div>
                          {errors.preferred_aspect_ratios && (
                            <p className="mt-1 text-sm text-red-600">{errors.preferred_aspect_ratios}</p>
                          )}
                        </div>

                        {/* Auto Publish */}
                        <div className="mb-4">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={formData.settings.auto_publish}
                              onChange={(e) => handleChange('settings.auto_publish', e.target.checked)}
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            />
                            <span className="ml-2 text-sm text-gray-700">Enable automatic publishing</span>
                          </label>
                          <p className="mt-1 text-xs text-gray-500">
                            Automatically publish approved clips to configured platforms
                          </p>
                        </div>
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