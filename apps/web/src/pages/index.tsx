import { NextPage } from 'next';
import Head from 'next/head';
import React from 'react';
import { useClipStats, useClips } from '../lib/hooks/useClips';
import { StatsCards, StatusBreakdown, RecentClips } from '../components/dashboard';

const Dashboard: NextPage = () => {
  const { data: stats, isLoading: statsLoading } = useClipStats();
  const { data: recentClips, isLoading: clipsLoading } = useClips({
    limit: 6,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

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
        <StatsCards stats={stats} isLoading={statsLoading} />

        {/* Status Breakdown */}
        <StatusBreakdown stats={stats} isLoading={statsLoading} />

        {/* Recent Clips */}
        <RecentClips clips={recentClips} isLoading={clipsLoading} />
      </div>
    </>
  );
};

export default Dashboard;