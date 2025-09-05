import React from 'react';
import { ClipStats, ClipStatus } from '../../lib/types';
import { getStatusColor, formatNumber } from '../../lib/utils';

interface StatusBreakdownProps {
  stats: ClipStats | undefined;
  isLoading: boolean;
}

export function StatusBreakdown({ stats, isLoading }: StatusBreakdownProps) {
  if (isLoading || !stats) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Status Breakdown</h3>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between items-center">
              <div className="h-4 bg-gray-200 rounded animate-pulse w-24"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statusData = Object.entries(stats.byStatus || {}).map(([status, count]) => ({
    status: status as ClipStatus,
    count,
    percentage: stats.total > 0 ? (count / stats.total) * 100 : 0,
  }));

  const approvalData = Object.entries(stats.byApprovalStatus || {}).map(([status, count]) => ({
    status,
    count,
    percentage: stats.total > 0 ? (count / stats.total) * 100 : 0,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Processing Status */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Processing Status</h3>
        <div className="space-y-4">
          {statusData.map(({ status, count, percentage }) => (
            <div key={status} className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)} mr-2`}>
                    {status}
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  {formatNumber(count)} ({percentage.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="h-2 rounded-full bg-indigo-600"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Approval Status */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Approval Status</h3>
        <div className="space-y-4">
          {approvalData.map(({ status, count, percentage }) => (
            <div key={status} className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <span className="text-sm font-medium text-gray-700 capitalize mr-2">
                    {status}
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  {formatNumber(count)} ({percentage.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    status === 'approved' ? 'bg-green-600' :
                    status === 'rejected' ? 'bg-red-600' : 'bg-yellow-600'
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}