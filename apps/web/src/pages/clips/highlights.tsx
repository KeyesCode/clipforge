import { NextPage } from 'next';
import Head from 'next/head';
import React from 'react';
import { ClipList } from '../../components/clips';

const HighlightsPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>Highlights - ClipForge</title>
        <meta name="description" content="Browse high-quality highlight clips" />
      </Head>

      <ClipList
        title="Highlights"
        description="Browse your highest-scoring clips and potential highlights"
        showFilters={true}
        initialFilters={{
          highlightsOnly: true,
          sortBy: 'highlightScore',
          sortOrder: 'desc',
        }}
      />
    </>
  );
};

export default HighlightsPage;