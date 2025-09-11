import React, { useState, useRef, useEffect } from 'react';
import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { 
  XMarkIcon,
  PlayIcon,
  PauseIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ArrowsPointingOutIcon,
  ArrowDownTrayIcon 
} from '@heroicons/react/24/outline';
import { Clip } from '../../lib/types';
import { formatDuration, cn } from '../../lib/utils';

interface VideoPlayerModalProps {
  clip: Clip | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload?: (clip: Clip) => void;
}

export function VideoPlayerModal({ clip, isOpen, onClose, onDownload }: VideoPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen && clip && videoRef.current) {
      // Reset state when opening new clip
      setIsPlaying(false);
      setCurrentTime(0);
      setVideoError(false);
      setIsLoading(true);
      videoRef.current.currentTime = 0;
    }
  }, [isOpen, clip]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setIsLoading(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (!isFullscreen) {
        if (videoRef.current.requestFullscreen) {
          videoRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    }
  };

  const handleVideoError = () => {
    setVideoError(true);
    setIsLoading(false);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!clip) return null;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-90" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-black text-white shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-gray-900">
                  <div className="flex-1 min-w-0">
                    <Dialog.Title className="text-lg font-medium truncate">
                      {clip.title}
                    </Dialog.Title>
                    {clip.description && (
                      <p className="text-sm text-gray-300 truncate mt-1">
                        {clip.description}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    {onDownload && (
                      <button
                        onClick={() => onDownload(clip)}
                        className="p-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
                        title="Download"
                      >
                        <ArrowDownTrayIcon className="h-5 w-5" />
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="p-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Video Player */}
                <div className="relative bg-black aspect-video">
                  {videoError ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-gray-400 mb-2">
                          Failed to load video
                        </div>
                        <div className="text-sm text-gray-500">
                          {clip.renderedFilePath || 'No video path available'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                        </div>
                      )}
                      
                      <video
                        ref={videoRef}
                        src={clip.renderedFilePath || ''}
                        className="w-full h-full"
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onError={handleVideoError}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onFullscreenChange={() => setIsFullscreen(!isFullscreen)}
                      />

                      {/* Play button overlay */}
                      {!isPlaying && !isLoading && (
                        <button
                          onClick={togglePlay}
                          className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 hover:bg-opacity-50 transition-colors"
                        >
                          <PlayIcon className="h-16 w-16 text-white" />
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Controls */}
                {!videoError && (
                  <div className="px-6 py-4 bg-gray-900 space-y-4">
                    {/* Progress bar */}
                    <div className="relative">
                      <input
                        type="range"
                        min={0}
                        max={duration}
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                      />
                      <div
                        className="absolute top-0 h-1 bg-indigo-500 rounded-lg pointer-events-none"
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    {/* Control buttons and time */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        {/* Play/Pause */}
                        <button
                          onClick={togglePlay}
                          className="p-2 hover:bg-gray-800 rounded-full transition-colors"
                          disabled={isLoading}
                        >
                          {isPlaying ? (
                            <PauseIcon className="h-6 w-6" />
                          ) : (
                            <PlayIcon className="h-6 w-6" />
                          )}
                        </button>

                        {/* Volume */}
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={toggleMute}
                            className="p-2 hover:bg-gray-800 rounded-full transition-colors"
                          >
                            {isMuted ? (
                              <SpeakerXMarkIcon className="h-5 w-5" />
                            ) : (
                              <SpeakerWaveIcon className="h-5 w-5" />
                            )}
                          </button>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.1}
                            value={isMuted ? 0 : volume}
                            onChange={handleVolumeChange}
                            className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Time display */}
                        <div className="text-sm text-gray-300 font-mono">
                          {formatDuration(currentTime)} / {formatDuration(duration)}
                        </div>
                      </div>

                      {/* Fullscreen */}
                      <button
                        onClick={toggleFullscreen}
                        className="p-2 hover:bg-gray-800 rounded-full transition-colors"
                      >
                        <ArrowsPointingOutIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}