import { NextPage } from 'next';
import Head from 'next/head';
import { 
  ChartBarIcon, 
  FilmIcon, 
  EyeIcon, 
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { useClipStats, useClips } from '../lib/hooks/useClips';
import { formatNumber, formatDuration } from '../lib/utils';
import { LoadingSpinner } from '../components/ui';
import { ClipCard } from '../components/clips';
import React from 'react';

const Dashboard: NextPage = () => {
  const { data: stats, isLoading: statsLoading } = useClipStats();
  const { data: recentClips, isLoading: clipsLoading } = useClips({
    limit: 6,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const statCards = [
    {
      name: 'Total Clips',
      value: stats?.total || 0,
      icon: FilmIcon,
      color: 'text-blue-600 bg-blue-100',
    },
    {
      name: 'Pending Review',
      value: stats?.needsReviewCount || 0,
      icon: EyeIcon,
      color: 'text-yellow-600 bg-yellow-100',
    },
    {
      name: 'Processing',
      value: stats?.byStatus?.rendering || 0,
      icon: ClockIcon,
      color: 'text-indigo-600 bg-indigo-100',
    },
    {
      name: 'Highlights',
      value: stats?.highlightsCount || 0,
      icon: CheckCircleIcon,
      color: 'text-green-600 bg-green-100',
    },
  ];

  return (
    <>
      <Head>
        <title>Dashboard - ClipForge</title>
        <meta name="description" content="ClipForge video clip management dashboard" />
      </Head>

      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Overview of your video clips and processing pipeline
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
                        {statsLoading ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          formatNumber(stat.value)
                        )}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Additional Stats */}
        {stats && !statsLoading && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Summary Statistics</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {stats.averageScore.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-500">Average Score</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {formatDuration(stats.averageDuration)}
                </div>
                <div className="text-sm text-gray-500">Average Duration</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {formatDuration(stats.totalDuration)}
                </div>
                <div className="text-sm text-gray-500">Total Duration</div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Clips */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recent Clips</h3>
          </div>
          
          {clipsLoading ? (
            <div className="p-6 flex justify-center">
              <LoadingSpinner size="lg" />
            </div>
          ) : recentClips?.data && recentClips.data.length > 0 ? (
            <div className="p-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentClips.data.map((clip) => (
                <ClipCard key={clip.id} clip={clip} />
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">
              No clips found. Start by uploading some videos!
            </div>
          )}
          
          {recentClips?.data && recentClips.data.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-200">
              <a
                href="/clips"
                className="text-indigo-600 hover:text-indigo-500 font-medium text-sm"
              >
                View all clips →
              </a>
            </div>
          )}
        </div>

        {/* Status Breakdown */}
        {stats && !statsLoading && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Status Breakdown</h3>
            <div className="space-y-3">
              {Object.entries(stats.byStatus || {}).map(([status, count]) => (
                <div key={status} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700 capitalize">
                    {status}
                  </span>
                  <span className="text-sm text-gray-500">
                    {count} clips
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Dashboard;