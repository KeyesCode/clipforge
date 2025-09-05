import { NextPage } from 'next';
import React from 'react';
import { HomeIcon, FilmIcon } from '@heroicons/react/24/outline';

const TestStyles: NextPage = () => {
  return (
    <div className="p-8 space-y-4">
      <h1 className="text-3xl font-bold text-gray-900">Tailwind Test Page</h1>
      
      {/* Test basic styling */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-blue-600 mb-4">Component Test</h2>
        <p className="text-gray-700 mb-4">This should be styled with Tailwind CSS.</p>
        
        {/* Test icons */}
        <div className="flex items-center space-x-4">
          <HomeIcon className="h-6 w-6 text-indigo-600" />
          <FilmIcon className="h-6 w-6 text-green-600" />
        </div>
        
        {/* Test button */}
        <button className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          Test Button
        </button>
      </div>
      
      {/* Test grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-red-100 p-4 rounded">Red</div>
        <div className="bg-green-100 p-4 rounded">Green</div>
        <div className="bg-blue-100 p-4 rounded">Blue</div>
      </div>
    </div>
  );
};

export default TestStyles;