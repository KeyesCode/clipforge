import { NextPage } from 'next';
import Head from 'next/head';
import React from 'react';
import { ClipList } from '../../components/clips';
import { ClipStatus } from '../../lib/types';

const ReviewPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>Clips Pending Review - ClipForge</title>
        <meta name="description" content="Review and approve clips for publishing" />
      </Head>

      <ClipList
        title="Clips Pending Review"
        description="Review clips and approve them for publishing"
        showFilters={true}
        initialFilters={{
          approvalStatus: 'pending',
          status: ClipStatus.RENDERED,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        }}
      />
    </>
  );
};

export default ReviewPage;