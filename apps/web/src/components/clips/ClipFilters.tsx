import React, { useState } from 'react';
import { MagnifyingGlassIcon, FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { ClipFilters as ClipFiltersType, ClipStatus, ClipAspectRatio } from '../../lib/types';
import { cn } from '../../lib/utils';

interface ClipFiltersProps {
  filters: ClipFiltersType;
  onChange: (filters: Partial<ClipFiltersType>) => void;
}

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: ClipStatus.PENDING, label: 'Pending' },
  { value: ClipStatus.RENDERING, label: 'Rendering' },
  { value: ClipStatus.RENDERED, label: 'Rendered' },
  { value: ClipStatus.PUBLISHED, label: 'Published' },
  { value: ClipStatus.FAILED, label: 'Failed' },
];

const approvalStatusOptions = [
  { value: '', label: 'All Approval Status' },
  { value: 'pending', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const aspectRatioOptions = [
  { value: '', label: 'All Aspect Ratios' },
  { value: ClipAspectRatio.HORIZONTAL, label: '16:9 (Horizontal)' },
  { value: ClipAspectRatio.VERTICAL, label: '9:16 (Vertical)' },
  { value: ClipAspectRatio.SQUARE, label: '1:1 (Square)' },
];

const sortOptions = [
  { value: 'createdAt', label: 'Created Date' },
  { value: 'updatedAt', label: 'Updated Date' },
  { value: 'highlightScore', label: 'Highlight Score' },
  { value: 'duration', label: 'Duration' },
  { value: 'title', label: 'Title' },
];

export function ClipFilters({ filters, onChange }: ClipFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchValue, setSearchValue] = useState(filters.search || '');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onChange({ search: searchValue });
  };

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    if (!value) {
      onChange({ search: undefined });
    }
  };

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (key === 'limit' || key === 'offset' || key === 'sortBy' || key === 'sortOrder') {
      return false;
    }
    return value !== undefined && value !== null && value !== '';
  });

  const clearFilters = () => {
    setSearchValue('');
    onChange({
      search: undefined,
      status: undefined,
      approvalStatus: undefined,
      aspectRatio: undefined,
      minScore: undefined,
      maxScore: undefined,
      minDuration: undefined,
      maxDuration: undefined,
      highlightsOnly: undefined,
      needsReview: undefined,
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      {/* Search and basic filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex-1">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Search clips..."
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
        </form>

        {/* Status filter */}
        <select
          value={filters.status || ''}
          onChange={(e) => onChange({ status: e.target.value as ClipStatus || undefined })}
          className="block w-full sm:w-48 px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Sort */}
        <div className="flex gap-2">
          <select
            value={filters.sortBy || 'createdAt'}
            onChange={(e) => onChange({ sortBy: e.target.value })}
            className="block w-32 px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          
          <select
            value={filters.sortOrder || 'desc'}
            onChange={(e) => onChange({ sortOrder: e.target.value as 'asc' | 'desc' })}
            className="block w-20 px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          >
            <option value="desc">↓</option>
            <option value="asc">↑</option>
          </select>
        </div>

        {/* Advanced filters toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={cn(
            'inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500',
            showAdvanced 
              ? 'text-indigo-700 bg-indigo-50 border-indigo-300' 
              : 'text-gray-700 bg-white hover:bg-gray-50'
          )}
        >
          <FunnelIcon className="h-4 w-4 mr-2" />
          Filters
        </button>
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="border-t pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Approval Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Approval Status
            </label>
            <select
              value={filters.approvalStatus || ''}
              onChange={(e) => onChange({ approvalStatus: e.target.value as any || undefined })}
              className="block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              {approvalStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aspect Ratio
            </label>
            <select
              value={filters.aspectRatio || ''}
              onChange={(e) => onChange({ aspectRatio: e.target.value as ClipAspectRatio || undefined })}
              className="block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              {aspectRatioOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Score Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Score Range
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                placeholder="Min"
                value={filters.minScore || ''}
                onChange={(e) => onChange({ minScore: e.target.value ? Number(e.target.value) : undefined })}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                placeholder="Max"
                value={filters.maxScore || ''}
                onChange={(e) => onChange({ maxScore: e.target.value ? Number(e.target.value) : undefined })}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
          </div>

          {/* Duration Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Duration (seconds)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                placeholder="Min"
                value={filters.minDuration || ''}
                onChange={(e) => onChange({ minDuration: e.target.value ? Number(e.target.value) : undefined })}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              <input
                type="number"
                min="0"
                placeholder="Max"
                value={filters.maxDuration || ''}
                onChange={(e) => onChange({ maxDuration: e.target.value ? Number(e.target.value) : undefined })}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
          </div>

          {/* Toggle filters */}
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filters.highlightsOnly || false}
                onChange={(e) => onChange({ highlightsOnly: e.target.checked || undefined })}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Highlights only</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filters.needsReview || false}
                onChange={(e) => onChange({ needsReview: e.target.checked || undefined })}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Needs review</span>
            </label>
          </div>
        </div>
      )}

      {/* Clear filters */}
      {hasActiveFilters && (
        <div className="border-t pt-4 flex justify-between items-center">
          <span className="text-sm text-gray-500">
            Active filters applied
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <XMarkIcon className="h-3 w-3 mr-1" />
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}