import { NextPage } from 'next';
import Head from 'next/head';
import React, { useState } from 'react';
import { 
  Cog6ToothIcon,
  BellIcon,
  ShieldCheckIcon,
  KeyIcon,
  VideoCameraIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

const SettingsPage: NextPage = () => {
  const [activeTab, setActiveTab] = useState('general');

  const tabs = [
    { id: 'general', name: 'General', icon: Cog6ToothIcon },
    { id: 'processing', name: 'Processing', icon: VideoCameraIcon },
    { id: 'notifications', name: 'Notifications', icon: BellIcon },
    { id: 'analytics', name: 'Analytics', icon: ChartBarIcon },
    { id: 'security', name: 'Security', icon: ShieldCheckIcon },
    { id: 'api', name: 'API Keys', icon: KeyIcon },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">General Settings</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Application Name
              </label>
              <input
                type="text"
                defaultValue="ClipForge"
                className="block w-full max-w-md px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Language
              </label>
              <select className="block w-full max-w-md px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Timezone
              </label>
              <select className="block w-full max-w-md px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                <option value="UTC">UTC</option>
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
              </select>
            </div>
          </div>
        );

      case 'processing':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">Processing Settings</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Clip Duration (seconds)
              </label>
              <input
                type="number"
                defaultValue="30"
                min="5"
                max="300"
                className="block w-full max-w-md px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Highlight Score Threshold
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                defaultValue="0.7"
                className="w-full max-w-md"
              />
              <p className="text-sm text-gray-500 mt-1">
                Clips with scores above this threshold will be marked as highlights
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Auto-approve Clips
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="ml-2 text-sm text-gray-700">Auto-approve clips with score &gt; 90%</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="ml-2 text-sm text-gray-700">Auto-reject clips with score &lt; 30%</span>
                </label>
              </div>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">Notification Settings</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-4">
                Email Notifications
              </label>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input type="checkbox" defaultChecked className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="ml-2 text-sm text-gray-700">Processing completed</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" defaultChecked className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="ml-2 text-sm text-gray-700">Processing failed</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="ml-2 text-sm text-gray-700">New clips need review</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="ml-2 text-sm text-gray-700">Weekly summary report</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notification Email
              </label>
              <input
                type="email"
                defaultValue="admin@clipforge.com"
                className="block w-full max-w-md px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
        );

      case 'analytics':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">Analytics Settings</h3>
            
            <div>
              <label className="flex items-center">
                <input type="checkbox" defaultChecked className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="ml-2 text-sm text-gray-700">Enable analytics tracking</span>
              </label>
              <p className="text-sm text-gray-500 mt-1 ml-6">
                Collect usage statistics and performance metrics
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data Retention Period
              </label>
              <select className="block w-full max-w-md px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                <option value="30">30 days</option>
                <option value="90" selected>90 days</option>
                <option value="180">6 months</option>
                <option value="365">1 year</option>
              </select>
            </div>

            <div>
              <label className="flex items-center">
                <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="ml-2 text-sm text-gray-700">Export analytics data monthly</span>
              </label>
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">Security Settings</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Session Timeout (minutes)
              </label>
              <input
                type="number"
                defaultValue="60"
                min="5"
                max="480"
                className="block w-full max-w-md px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="flex items-center">
                <input type="checkbox" defaultChecked className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="ml-2 text-sm text-gray-700">Require HTTPS</span>
              </label>
            </div>

            <div>
              <label className="flex items-center">
                <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="ml-2 text-sm text-gray-700">Enable two-factor authentication</span>
              </label>
            </div>

            <div className="border-t pt-6">
              <h4 className="text-md font-medium text-gray-900 mb-4">Change Password</h4>
              <div className="space-y-4 max-w-md">
                <input
                  type="password"
                  placeholder="Current password"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
                <input
                  type="password"
                  placeholder="New password"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  Update Password
                </button>
              </div>
            </div>
          </div>
        );

      case 'api':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">API Keys</h3>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <p className="text-sm text-yellow-800">
                <strong>Warning:</strong> Keep your API keys secure and never share them publicly.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ClipForge API Key
              </label>
              <div className="flex max-w-md">
                <input
                  type="password"
                  value="cf_1234567890abcdef"
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md shadow-sm bg-gray-50"
                />
                <button className="px-3 py-2 bg-gray-200 border border-l-0 border-gray-300 rounded-r-md hover:bg-gray-300">
                  Show
                </button>
              </div>
              <div className="mt-2 space-x-2">
                <button className="text-sm text-indigo-600 hover:text-indigo-700">
                  Regenerate
                </button>
                <button className="text-sm text-gray-600 hover:text-gray-700">
                  Copy
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Webhook URL
              </label>
              <input
                type="url"
                placeholder="https://your-app.com/webhooks/clipforge"
                className="block w-full max-w-md px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="text-sm text-gray-500 mt-1">
                Receive notifications about clip processing events
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Head>
        <title>Settings - ClipForge</title>
        <meta name="description" content="ClipForge application settings" />
      </Head>

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your ClipForge application preferences and configuration
          </p>
        </div>

        <div className="flex flex-col lg:flex-row lg:gap-8">
          {/* Tabs */}
          <div className="w-full lg:w-64">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                    activeTab === tab.id
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <tab.icon className="mr-3 h-5 w-5" />
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 bg-white rounded-lg shadow p-6">
            {renderTabContent()}

            {/* Save button */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <button className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsPage;