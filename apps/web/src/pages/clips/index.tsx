import { NextPage } from 'next';
import Head from 'next/head';
import React from 'react';
import { ClipList } from '../../components/clips';

const ClipsPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>All Clips - ClipForge</title>
        <meta name="description" content="Browse and manage all video clips" />
      </Head>

      <ClipList
        title="All Clips"
        description="Browse and manage all your video clips"
        showFilters={true}
      />
    </>
  );
};

export default ClipsPage;