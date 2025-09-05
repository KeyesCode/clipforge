import React from 'react';
import { 
  FilmIcon, 
  EyeIcon, 
  ClockIcon,
  CheckCircleIcon,
  ChartBarIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import { ClipStats } from '../../lib/types';
import { formatNumber, formatDuration, formatScore } from '../../lib/utils';
import { LoadingSpinner } from '../ui';

interface StatsCardsProps {
  stats: ClipStats | undefined;
  isLoading: boolean;
}

export function StatsCards({ stats, isLoading }: StatsCardsProps) {
  const statCards = [
    {
      name: 'Total Clips',
      value: stats?.total || 0,
      icon: FilmIcon,
      color: 'text-blue-600 bg-blue-100',
      formatter: formatNumber,
    },
    {
      name: 'Pending Review',
      value: stats?.needsReviewCount || 0,
      icon: EyeIcon,
      color: 'text-yellow-600 bg-yellow-100',
      formatter: formatNumber,
    },
    {
      name: 'Processing',
      value: stats?.byStatus?.rendering || 0,
      icon: ClockIcon,
      color: 'text-indigo-600 bg-indigo-100',
      formatter: formatNumber,
    },
    {
      name: 'Highlights',
      value: stats?.highlightsCount || 0,
      icon: PlayIcon,
      color: 'text-green-600 bg-green-100',
      formatter: formatNumber,
    },
    {
      name: 'Average Score',
      value: stats?.averageScore || 0,
      icon: ChartBarIcon,
      color: 'text-purple-600 bg-purple-100',
      formatter: (val: number) => formatScore(val / 100),
    },
    {
      name: 'Total Duration',
      value: stats?.totalDuration || 0,
      icon: CheckCircleIcon,
      color: 'text-emerald-600 bg-emerald-100',
      formatter: formatDuration,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {statCards.map((stat) => (
        <div key={stat.name} className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className={`inline-flex items-center justify-center p-3 rounded-md ${stat.color}`}>
                  <stat.icon className="h-6 w-6" aria-hidden="true" />
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    {stat.name}
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {isLoading ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      stat.formatter(stat.value)
                    )}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}