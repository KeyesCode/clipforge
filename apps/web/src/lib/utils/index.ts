import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, formatDuration as formatDurationFns } from 'date-fns';

/**
 * Combines class names using clsx and tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format duration in seconds to human readable format (e.g., "2:34" or "1:23:45")
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format file size to human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format bytes to human readable format (alias for formatFileSize)
 */
export function formatBytes(bytes: number): string {
  return formatFileSize(bytes);
}

/**
 * Format date to various formats
 */
export function formatDate(date: string | Date, formatStr: string = 'MMM d, yyyy'): string {
  return format(new Date(date), formatStr);
}

/**
 * Format relative time (e.g., "2 minutes ago")
 */
export function formatRelativeTime(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num);
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

/**
 * Format score as percentage
 */
export function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * Get color based on clip status
 */
export function getStatusColor(status: string): string {
  const colors = {
    pending: 'text-yellow-600 bg-yellow-100',
    rendering: 'text-blue-600 bg-blue-100',
    rendered: 'text-green-600 bg-green-100',
    published: 'text-purple-600 bg-purple-100',
    failed: 'text-red-600 bg-red-100',
  };
  return colors[status as keyof typeof colors] || 'text-gray-600 bg-gray-100';
}

/**
 * Get color based on approval status
 */
export function getApprovalStatusColor(status: string): string {
  const colors = {
    pending: 'text-yellow-600 bg-yellow-100',
    approved: 'text-green-600 bg-green-100',
    rejected: 'text-red-600 bg-red-100',
  };
  return colors[status as keyof typeof colors] || 'text-gray-600 bg-gray-100';
}

/**
 * Get score color based on highlight score
 */
export function getScoreColor(score: number): string {
  if (score >= 0.8) return 'text-green-600 bg-green-100';
  if (score >= 0.6) return 'text-yellow-600 bg-yellow-100';
  if (score >= 0.4) return 'text-orange-600 bg-orange-100';
  return 'text-red-600 bg-red-100';
}

/**
 * Truncate text to specified length
 */
export function truncateText(text: string, length: number = 100): string {
  if (text.length <= length) return text;
  return text.substring(0, length).trim() + '...';
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Deep clone object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if string is valid URL
 */
export function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Extract platform from URL
 */
export function extractPlatform(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('twitch.tv')) return 'twitch';
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube';
    if (hostname.includes('kick.com')) return 'kick';
    return 'other';
  } catch (_) {
    return 'other';
  }
}

/**
 * Generate thumbnail URL for video
 */
export function generateThumbnailUrl(clipId: string): string {
  return `/api/clips/${clipId}/thumbnail`;
}

/**
 * Generate video URL for clip
 */
export function generateVideoUrl(clipId: string): string {
  return `/api/clips/${clipId}/video`;
}

/**
 * Sort array by multiple criteria
 */
export function sortBy<T>(
  array: T[],
  sorters: Array<{
    key: keyof T;
    direction: 'asc' | 'desc';
  }>
): T[] {
  return [...array].sort((a, b) => {
    for (const sorter of sorters) {
      const aVal = a[sorter.key];
      const bVal = b[sorter.key];
      
      if (aVal < bVal) {
        return sorter.direction === 'asc' ? -1 : 1;
      }
      if (aVal > bVal) {
        return sorter.direction === 'asc' ? 1 : -1;
      }
    }
    return 0;
  });
}

/**
 * Calculate pagination info
 */
export function calculatePagination(total: number, limit: number, offset: number) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  const hasNext = offset + limit < total;
  const hasPrev = offset > 0;
  
  return {
    currentPage,
    totalPages,
    hasNext,
    hasPrev,
    startIndex: offset + 1,
    endIndex: Math.min(offset + limit, total),
  };
}

/**
 * Create query string from object
 */
export function createQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, value.toString());
    }
  });
  
  return searchParams.toString();
}

/**
 * Download file from blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy text: ', err);
    return false;
  }
}

/**
 * Get aspect ratio dimensions
 */
export function getAspectRatioDimensions(aspectRatio: string, baseWidth: number = 400) {
  const ratios = {
    '16:9': { width: baseWidth, height: (baseWidth * 9) / 16 },
    '9:16': { width: (baseWidth * 9) / 16, height: baseWidth },
    '1:1': { width: baseWidth, height: baseWidth },
    '4:3': { width: baseWidth, height: (baseWidth * 3) / 4 },
  };
  
  return ratios[aspectRatio as keyof typeof ratios] || ratios['16:9'];
}