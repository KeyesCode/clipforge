/**
 * Utility functions for converting local Docker paths to public URLs
 */

/**
 * Convert a local Docker path to a public URL
 * @param localPath - The local Docker path (e.g., /app/storage/downloads/...)
 * @param baseUrl - The base URL for the orchestrator (default: http://localhost:3001)
 * @returns Public URL (e.g., http://localhost:3001/storage/downloads/...)
 */
export function convertToPublicUrl(localPath: string | null | undefined, baseUrl: string = 'http://localhost:3001'): string | null {
  if (!localPath) {
    return null;
  }

  // Convert /app/storage/... to /storage/...
  if (localPath.startsWith('/app/storage/')) {
    const publicPath = localPath.replace('/app/storage/', '/storage/');
    return `${baseUrl}${publicPath}`;
  }

  // Convert /data/... to /storage/... (for clips)
  if (localPath.startsWith('/data/')) {
    const publicPath = localPath.replace('/data/', '/storage/');
    return `${baseUrl}${publicPath}`;
  }

  // If it's already a public URL, return as-is
  if (localPath.startsWith('http://') || localPath.startsWith('https://')) {
    return localPath;
  }

  // If it's already a relative path starting with /storage/, make it absolute
  if (localPath.startsWith('/storage/')) {
    return `${baseUrl}${localPath}`;
  }

  // For any other local path, try to convert it
  return `${baseUrl}/storage${localPath}`;
}

/**
 * Convert multiple path fields in an object to public URLs
 * @param obj - The object containing path fields
 * @param pathFields - Array of field names that contain paths
 * @param baseUrl - The base URL for the orchestrator
 * @returns Object with converted path fields
 */
export function convertPathsToPublicUrls<T extends Record<string, any>>(
  obj: T,
  pathFields: string[],
  baseUrl: string = 'http://localhost:3001'
): T {
  const result = { ...obj } as any;
  
  for (const field of pathFields) {
    if (result[field]) {
      result[field] = convertToPublicUrl(result[field] as string, baseUrl);
    }
  }
  
  return result as T;
}

/**
 * Path field mappings for different entities
 */
export const ENTITY_PATH_FIELDS = {
  stream: ['thumbnailUrl', 'localVideoPath', 'localAudioPath', 'localThumbnailPath'] as string[],
  chunk: ['videoPath', 'audioPath', 'thumbnailPath'] as string[],
  clip: ['sourceFilePath', 'renderedFilePath', 'thumbnailPath'] as string[],
};
