import React from 'react';
import { 
  ArrowDownTrayIcon,
  CogIcon,
  FilmIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { Stream } from '../../lib/types';
import { cn, formatBytes, formatDuration } from '../../lib/utils';

interface StreamProgressProps {
  stream: Stream;
  className?: string;
}

export function StreamProgress({ stream, className }: StreamProgressProps) {
  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'downloading':
        return <ArrowDownTrayIcon className="h-4 w-4" />;
      case 'fixing':
        return <CogIcon className="h-4 w-4" />;
      case 'chunking':
        return <FilmIcon className="h-4 w-4" />;
      case 'completed':
        return <CheckCircleIcon className="h-4 w-4" />;
      default:
        return <ClockIcon className="h-4 w-4" />;
    }
  };

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case 'downloading':
        return 'Downloading';
      case 'fixing':
        return 'Fixing Video';
      case 'chunking':
        return 'Creating Chunks';
      case 'completed':
        return 'Completed';
      default:
        return 'Processing';
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'downloading':
        return 'text-blue-600 bg-blue-50';
      case 'fixing':
        return 'text-yellow-600 bg-yellow-50';
      case 'chunking':
        return 'text-purple-600 bg-purple-50';
      case 'completed':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const formatEstimatedTime = (seconds: number) => {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      return `${Math.round(seconds / 60)}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.round((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  };

  const getDownloadProgress = () => {
    if (stream.downloadedBytes && stream.totalBytes) {
      const percentage = Math.round((stream.downloadedBytes / stream.totalBytes) * 100);
      return {
        percentage,
        downloaded: formatBytes(stream.downloadedBytes),
        total: formatBytes(stream.totalBytes)
      };
    }
    return null;
  };

  const downloadProgress = getDownloadProgress();

  return (
    <div className={cn("space-y-3", className)}>
      {/* Current Stage */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={cn(
            "flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm font-medium",
            getStageColor(stream.currentStage || 'processing')
          )}>
            {getStageIcon(stream.currentStage || 'processing')}
            <span>{getStageLabel(stream.currentStage || 'processing')}</span>
          </div>
          
          {stream.estimatedTimeRemaining && (
            <div className="flex items-center space-x-1 text-sm text-gray-500">
              <ClockIcon className="h-4 w-4" />
              <span>{formatEstimatedTime(stream.estimatedTimeRemaining)} remaining</span>
            </div>
          )}
        </div>
        
        <div className="text-sm font-medium text-gray-900">
          {stream.processingProgress}%
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="h-2 rounded-full bg-indigo-600 transition-all duration-300"
          style={{ width: `${stream.processingProgress}%` }}
        />
      </div>

      {/* Progress Message */}
      {stream.progressMessage && (
        <div className="text-sm text-gray-600">
          {stream.progressMessage}
        </div>
      )}

      {/* Download Progress (if downloading) */}
      {downloadProgress && stream.currentStage === 'downloading' && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Download Progress</span>
            <span>{downloadProgress.percentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div 
              className="h-1.5 rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${downloadProgress.percentage}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{downloadProgress.downloaded}</span>
            <span>{downloadProgress.total}</span>
          </div>
        </div>
      )}

      {/* File Size Info */}
      {stream.totalBytes && (
        <div className="text-xs text-gray-500">
          Total size: {formatBytes(stream.totalBytes)}
        </div>
      )}

      {/* Chunks Info */}
      {stream.totalChunks > 0 && (
        <div className="text-xs text-gray-500">
          {stream.totalChunks} chunks created
        </div>
      )}

      {/* Error Message */}
      {stream.status === 'failed' && (
        <div className="flex items-center space-x-2 text-sm text-red-600 bg-red-50 p-2 rounded">
          <ExclamationTriangleIcon className="h-4 w-4" />
          <span>Processing failed</span>
        </div>
      )}
    </div>
  );
}
