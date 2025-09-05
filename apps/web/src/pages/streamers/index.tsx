import { NextPage } from 'next';
import Head from 'next/head';
import React from 'react';
import { StreamerList } from '../../components/streamers';

const StreamersPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>Streamers - ClipForge</title>
        <meta name="description" content="Manage your streamers and content creators" />
      </Head>

      <StreamerList />
    </>
  );
};

export default StreamersPage;