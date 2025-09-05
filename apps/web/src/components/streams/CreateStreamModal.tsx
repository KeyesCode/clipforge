import React, { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Fragment } from 'react';
import { useCreateStream } from '../../lib/hooks/useStreams';
import { useStreamers } from '../../lib/hooks/useStreamers';
import { isValidUrl } from '../../lib/utils';

interface CreateStreamModalProps {
  onClose: () => void;
}

export function CreateStreamModal({ onClose }: CreateStreamModalProps) {
  const [formData, setFormData] = useState({
    streamerId: '',
    vodUrl: '',
    title: '',
    description: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useCreateStream();
  const { data: streamers = [] } = useStreamers();

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.streamerId) {
      newErrors.streamerId = 'Please select a streamer';
    }

    if (!formData.vodUrl) {
      newErrors.vodUrl = 'VOD URL is required';
    } else if (!isValidUrl(formData.vodUrl)) {
      newErrors.vodUrl = 'Please enter a valid URL';
    }

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    try {
      await createMutation.mutateAsync({
        streamerId: formData.streamerId,
        vodUrl: formData.vodUrl,
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
      });
      onClose();
    } catch (error) {
      console.error('Create stream failed:', error);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
                      Add New Stream
                    </Dialog.Title>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      {/* Streamer Selection */}
                      <div>
                        <label htmlFor="streamerId" className="block text-sm font-medium text-gray-700 mb-1">
                          Streamer
                        </label>
                        <select
                          id="streamerId"
                          value={formData.streamerId}
                          onChange={(e) => handleChange('streamerId', e.target.value)}
                          className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                            errors.streamerId ? 'border-red-300' : 'border-gray-300'
                          }`}
                        >
                          <option value="">Select a streamer</option>
                          {streamers.map((streamer) => (
                            <option key={streamer.id} value={streamer.id}>
                              {streamer.name} ({streamer.platform})
                            </option>
                          ))}
                        </select>
                        {errors.streamerId && (
                          <p className="mt-1 text-sm text-red-600">{errors.streamerId}</p>
                        )}
                      </div>

                      {/* VOD URL */}
                      <div>
                        <label htmlFor="vodUrl" className="block text-sm font-medium text-gray-700 mb-1">
                          VOD URL
                        </label>
                        <input
                          type="url"
                          id="vodUrl"
                          value={formData.vodUrl}
                          onChange={(e) => handleChange('vodUrl', e.target.value)}
                          placeholder="https://..."
                          className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                            errors.vodUrl ? 'border-red-300' : 'border-gray-300'
                          }`}
                        />
                        {errors.vodUrl && (
                          <p className="mt-1 text-sm text-red-600">{errors.vodUrl}</p>
                        )}
                      </div>

                      {/* Title */}
                      <div>
                        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                          Title
                        </label>
                        <input
                          type="text"
                          id="title"
                          value={formData.title}
                          onChange={(e) => handleChange('title', e.target.value)}
                          placeholder="Stream title"
                          className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                            errors.title ? 'border-red-300' : 'border-gray-300'
                          }`}
                        />
                        {errors.title && (
                          <p className="mt-1 text-sm text-red-600">{errors.title}</p>
                        )}
                      </div>

                      {/* Description */}
                      <div>
                        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                          Description (optional)
                        </label>
                        <textarea
                          id="description"
                          rows={3}
                          value={formData.description}
                          onChange={(e) => handleChange('description', e.target.value)}
                          placeholder="Stream description"
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>

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
                          disabled={createMutation.isLoading}
                          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          {createMutation.isLoading ? 'Creating...' : 'Create Stream'}
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