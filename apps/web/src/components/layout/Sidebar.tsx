import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  XMarkIcon,
  HomeIcon,
  PlayIcon,
  EyeIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  FilmIcon,
  ClockIcon,
  CheckCircleIcon,
  VideoCameraIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { cn } from '../../lib/utils';
import { useClipStats } from '../../lib/hooks/useClips';
import React from 'react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'All Clips', href: '/clips', icon: FilmIcon },
  { name: 'Highlights', href: '/clips/highlights', icon: PlayIcon },
  { name: 'Pending Review', href: '/clips/review', icon: EyeIcon },
  { name: 'Streams', href: '/streams', icon: VideoCameraIcon },
  { name: 'Streamers', href: '/streamers', icon: UserGroupIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

const quickStats = [
  { name: 'Processing', key: 'rendering', icon: ClockIcon },
  { name: 'Needs Review', key: 'pendingReview', icon: EyeIcon },
  { name: 'Approved', key: 'approved', icon: CheckCircleIcon },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const router = useRouter();
  const { data: stats } = useClipStats();

  const SidebarContent = () => (
    <>
      <div className="flex h-16 shrink-0 items-center px-6">
        <div className="flex items-center">
          <FilmIcon className="h-8 w-8 text-indigo-600" />
          <span className="ml-2 text-xl font-bold text-gray-900">ClipForge</span>
        </div>
      </div>
      
      <nav className="flex flex-1 flex-col px-6 pb-4">
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          <li>
            <ul role="list" className="-mx-2 space-y-1">
              {navigation.map((item) => {
                const isActive = router.pathname === item.href;
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={cn(
                        isActive
                          ? 'bg-indigo-50 text-indigo-600'
                          : 'text-gray-700 hover:text-indigo-600 hover:bg-gray-50',
                        'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold'
                      )}
                      onClick={() => onClose()}
                    >
                      <item.icon
                        className={cn(
                          isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-indigo-600',
                          'h-6 w-6 shrink-0'
                        )}
                        aria-hidden="true"
                      />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>

          {stats && (
            <li>
              <div className="text-xs font-semibold leading-6 text-gray-400 uppercase tracking-wide">
                Quick Stats
              </div>
              <ul role="list" className="-mx-2 mt-2 space-y-1">
                {quickStats.map((stat) => {
                  const count = stat.key === 'pendingReview' 
                    ? stats.needsReviewCount 
                    : stat.key === 'approved'
                    ? stats.byApprovalStatus?.approved || 0
                    : stats.byStatus?.rendering || 0;

                  return (
                    <li key={stat.name}>
                      <div className="text-gray-700 group flex gap-x-3 rounded-md p-2 text-sm leading-6">
                        <stat.icon
                          className="h-6 w-6 shrink-0 text-gray-400"
                          aria-hidden="true"
                        />
                        <div className="flex justify-between w-full">
                          <span>{stat.name}</span>
                          <span className="text-gray-500 text-xs">{count}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          )}

          <li className="mt-auto">
            <div className="text-xs text-gray-500 px-2">
              v1.0.0
            </div>
          </li>
        </ul>
      </nav>
    </>
  );

  return (
    <>
      {/* Mobile sidebar */}
      <Transition.Root show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50 lg:hidden" onClose={onClose}>
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/80" />
          </Transition.Child>

          <div className="fixed inset-0 flex">
            <Transition.Child
              as={Fragment}
              enter="transition ease-in-out duration-300 transform"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in-out duration-300 transform"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
                <Transition.Child
                  as={Fragment}
                  enter="ease-in-out duration-300"
                  enterFrom="opacity-0"
                  enterTo="opacity-100"
                  leave="ease-in-out duration-300"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                    <button type="button" className="-m-2.5 p-2.5" onClick={onClose}>
                      <span className="sr-only">Close sidebar</span>
                      <XMarkIcon className="h-6 w-6 text-white" aria-hidden="true" />
                    </button>
                  </div>
                </Transition.Child>
                <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white">
                  <SidebarContent />
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>

      {/* Static sidebar for desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white">
          <SidebarContent />
        </div>
      </div>
    </>
  );
}