import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { cn } from '../../lib/utils';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  onPageChange: (page: number) => void;
  total: number;
  showing: {
    start: number;
    end: number;
  };
}

export function Pagination({
  currentPage,
  totalPages,
  hasNext,
  hasPrev,
  onPageChange,
  total,
  showing,
}: PaginationProps) {
  const getVisiblePages = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];

    for (
      let i = Math.max(2, currentPage - delta);
      i <= Math.min(totalPages - 1, currentPage + delta);
      i++
    ) {
      range.push(i);
    }

    if (currentPage - delta > 2) {
      rangeWithDots.push(1, '...');
    } else {
      rangeWithDots.push(1);
    }

    rangeWithDots.push(...range);

    if (currentPage + delta < totalPages - 1) {
      rangeWithDots.push('...', totalPages);
    } else if (totalPages > 1) {
      rangeWithDots.push(totalPages);
    }

    return rangeWithDots;
  };

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex flex-1 justify-between sm:hidden">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasPrev}
          className={cn(
            'relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium',
            hasPrev
              ? 'text-gray-700 hover:bg-gray-50'
              : 'text-gray-400 cursor-not-allowed'
          )}
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNext}
          className={cn(
            'relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium',
            hasNext
              ? 'text-gray-700 hover:bg-gray-50'
              : 'text-gray-400 cursor-not-allowed'
          )}
        >
          Next
        </button>
      </div>
      
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{showing.start}</span> to{' '}
            <span className="font-medium">{showing.end}</span> of{' '}
            <span className="font-medium">{total}</span> results
          </p>
        </div>
        
        <div>
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={!hasPrev}
              className={cn(
                'relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 focus:z-20 focus:outline-none focus:ring-2 focus:ring-indigo-500',
                hasPrev
                  ? 'hover:bg-gray-50'
                  : 'cursor-not-allowed opacity-50'
              )}
            >
              <span className="sr-only">Previous</span>
              <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
            </button>
            
            {getVisiblePages().map((page, index) => (
              <button
                key={index}
                onClick={() => typeof page === 'number' && onPageChange(page)}
                disabled={page === '...'}
                className={cn(
                  'relative inline-flex items-center px-4 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 focus:z-20 focus:outline-none focus:ring-2 focus:ring-indigo-500',
                  page === currentPage
                    ? 'z-10 bg-indigo-600 text-white focus:ring-indigo-500'
                    : page === '...'
                    ? 'text-gray-700 cursor-default'
                    : 'text-gray-900 hover:bg-gray-50'
                )}
              >
                {page}
              </button>
            ))}
            
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={!hasNext}
              className={cn(
                'relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 focus:z-20 focus:outline-none focus:ring-2 focus:ring-indigo-500',
                hasNext
                  ? 'hover:bg-gray-50'
                  : 'cursor-not-allowed opacity-50'
              )}
            >
              <span className="sr-only">Next</span>
              <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}