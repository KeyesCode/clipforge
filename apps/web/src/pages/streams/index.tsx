import { NextPage } from 'next';
import Head from 'next/head';
import React from 'react';
import { StreamList } from '../../components/streams';

const StreamsPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>Streams - ClipForge</title>
        <meta name="description" content="Manage your video streams and VODs" />
      </Head>

      <StreamList />
    </>
  );
};

export default StreamsPage;