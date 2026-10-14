import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Play, Pause, RotateCcw, RotateCw, Maximize2, Minimize2,
  FileText, Send, Sparkles, Volume2, VolumeX, Settings,
  AlertTriangle, RefreshCw, Check, Clock
} from 'lucide-react';
import Hls from 'hls.js';
import { fetchVideoDetails, getProxyVideoUrl, VideoDetailsResponse } from '../services/apiService';
import { BRAND_ASSETS, Lecture } from '../data/batchesData';

interface LecturePlayerModalProps {
  courseId?: string;
  videoId?: string;
  title?: string;
  duration?: string;
  thumbnail?: string;
  lecture?: Lecture | null;
  onClose: () => void;
  onOpenPdf?: (pdfUrl: string, title: string) => void;
}

export const LecturePlayerModal: React.FC<LecturePlayerModalProps> = ({
  courseId,
  videoId,
  title: initialTitle,
  duration: initialDuration,
  thumbnail,
  lecture,
  onClose,
  onOpenPdf,
}) => {
  const [videoData, setVideoData] = useState<VideoDetailsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedQualityUrl, setSelectedQualityUrl] = useState<string>('');
  const [selectedQualityLabel, setSelectedQualityLabel] = useState<string>('Auto');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1.0);
  const [isTheater, setIsTheater] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const effectiveCourseId = courseId || '141';
  const effectiveVideoId = videoId || (lecture ? lecture.id : '');
  const displayTitle = videoData?.title || initialTitle || (lecture ? lecture.title : 'Lecture Video');

  // Load video details from backend API
  useEffect(() => {
    let isCancelled = false;

    async function loadDetails() {
      if (!effectiveVideoId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await fetchVideoDetails(effectiveCourseId, effectiveVideoId);
        if (!isCancelled) {
          setVideoData(data);

          // Select best quality URL
          if (data.qualities && data.qualities.length > 0) {
            const best = data.qualities[0];
            setSelectedQualityUrl(best.url);
            setSelectedQualityLabel(best.quality);
          } else if (data.decoded_video_link) {
            setSelectedQualityUrl(data.decoded_video_link);
            setSelectedQualityLabel('Default');
          }
          setLoading(false);
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.warn('Could not fetch video details from API, using fallback:', err);
          // If video details API failed, check if lecture prop has videoUrl
          if (lecture?.videoUrl) {
            setSelectedQualityUrl(lecture.videoUrl);
            setLoading(false);
          } else {
            setError(err?.message || 'Could not load video details. Stream link may be unavailable.');
            setLoading(false);
          }
        }
      }
    }

    loadDetails();

    return () => {
      isCancelled = true;
    };
  }, [effectiveCourseId, effectiveVideoId, lecture]);

  // Handle HLS stream mounting
  useEffect(() => {
    if (!selectedQualityUrl || !videoRef.current) return;

    // Check if it's YouTube
    const isYouTube = selectedQualityUrl.length === 11 || selectedQualityUrl.includes('youtube.com') || selectedQualityUrl.includes('youtu.be');
    if (isYouTube) return;

    const streamUrl = getProxyVideoUrl(selectedQualityUrl);
    const video = videoRef.current;
    const prevTime = video.currentTime;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        startPosition: prevTime > 0 ? prevTime : -1,
        enableWorker: true,
        lowLatencyMode: false,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('HLS Network error, recovering...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('HLS Media error, recovering...');
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      if (prevTime > 0) video.currentTime = prevTime;
      video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [selectedQualityUrl]);

  // Video element event handlers
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (videoRef.current.duration) {
        setDurationSec(videoRef.current.duration);
      }
    }
  };

  const handleTogglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
  };

  const handleSkip = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration || 99999, videoRef.current.currentTime + seconds));
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSettingsMenu(false);
  };

  const handleQualityChange = (qUrl: string, qLabel: string) => {
    setSelectedQualityUrl(qUrl);
    setSelectedQualityLabel(qLabel);
    setShowSettingsMenu(false);
  };

  const handleToggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Check if YouTube link
  const ytMatch = selectedQualityUrl.match(/(?:embed\/|v=|vi\/|youtu\.be\/|\/v\/)([a-zA-Z0-9_-]{11})/);
  const isYouTube = Boolean(ytMatch) || (selectedQualityUrl.length === 11 && !selectedQualityUrl.includes('http'));
  const youtubeId = ytMatch ? ytMatch[1] : (isYouTube ? selectedQualityUrl : null);

  const attachedPdf = videoData?.decoded_pdf_link || videoData?.pdf_viewer;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/95 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div
        ref={containerRef}
        className={`w-full bg-[#12071d] border border-pink-500/40 rounded-2xl shadow-2xl shadow-pink-900/60 overflow-hidden flex flex-col my-auto transition-all ${
          isTheater ? 'max-w-6xl' : 'max-w-4xl'
        }`}
        role="dialog"
        aria-modal="true"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-[#190a29] border-b border-pink-500/25">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-pink-500 shadow-sm shadow-pink-500 animate-pulse" />
            <span className="text-xs font-black text-pink-400 tracking-wider uppercase truncate">
              GB STUDY · HD Video Player
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {attachedPdf && onOpenPdf && (
              <button
                onClick={() => onOpenPdf(attachedPdf, `${displayTitle} - Notes`)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-pink-600/20 hover:bg-pink-600/30 text-pink-300 hover:text-white border border-pink-500/30 text-xs font-bold transition-all cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Lecture Notes</span>
              </button>
            )}

            <button
              onClick={() => setIsTheater(!isTheater)}
              className="hidden sm:block text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#250f3b] text-pink-300 hover:text-white border border-pink-500/30 transition-colors cursor-pointer"
            >
              {isTheater ? 'Normal' : 'Theater'}
            </button>

            <button
              onClick={handleToggleFullscreen}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 hidden sm:block cursor-pointer"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-pink-600 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Close Player"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Canvas Container */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden group">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 text-pink-400">
              <div className="w-12 h-12 rounded-full border-3 border-pink-500 border-t-transparent animate-spin" />
              <p className="text-xs font-bold text-white tracking-wide">Connecting HD Video Stream...</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center p-6 text-center max-w-md">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 mb-3 border border-red-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="text-white font-bold text-sm mb-1">Stream Error</h4>
              <p className="text-slate-400 text-xs mb-4">{error}</p>
              <a
                href={BRAND_ASSETS.telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs shadow-md shadow-pink-600/30 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Get Direct Stream on Telegram</span>
              </a>
            </div>
          )}

          {/* YouTube Player */}
          {isYouTube && youtubeId && !loading && (
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1`}
              title={displayTitle}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0"
            />
          )}

          {/* Direct HLS Video Player */}
          {!isYouTube && !error && (
            <>
              <video
                ref={videoRef}
                playsInline
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onClick={handleTogglePlay}
                poster={thumbnail}
                className={`w-full h-full object-contain cursor-pointer ${loading ? 'hidden' : 'block'}`}
              />

              {/* Big Center Play Overlay Button when paused */}
              {!isPlaying && !loading && (
                <button
                  onClick={handleTogglePlay}
                  className="absolute inset-0 m-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-pink-600/90 hover:bg-pink-500 text-white flex items-center justify-center shadow-2xl shadow-pink-600/60 backdrop-blur-sm cursor-pointer transition-transform hover:scale-110 z-10"
                >
                  <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-white translate-x-1" />
                </button>
              )}

              {/* Custom Overlay Controls */}
              {!loading && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 sm:p-4 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  {/* Progress Slider */}
                  <div className="flex items-center gap-2 mb-2.5">
                    <input
                      type="range"
                      min={0}
                      max={durationSec || 100}
                      step={0.5}
                      value={currentTime}
                      onChange={handleSeek}
                      className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-pink-500 focus:outline-none"
                    />
                  </div>

                  {/* Controls Row */}
                  <div className="flex items-center justify-between text-white text-xs">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <button
                        onClick={handleTogglePlay}
                        className="p-1.5 hover:text-pink-400 transition-colors cursor-pointer"
                        title={isPlaying ? 'Pause' : 'Play'}
                      >
                        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                      </button>

                      <button
                        onClick={() => handleSkip(-10)}
                        className="p-1 hover:text-pink-400 transition-colors cursor-pointer text-slate-300"
                        title="Rewind 10s"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleSkip(10)}
                        className="p-1 hover:text-pink-400 transition-colors cursor-pointer text-slate-300"
                        title="Forward 10s"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>

                      <div className="flex items-center gap-1.5 ml-2 text-slate-300">
                        <button onClick={handleToggleMute} className="hover:text-pink-400 cursor-pointer">
                          {isMuted ? <VolumeX className="w-4 h-4 text-pink-400" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={isMuted ? 0 : volume}
                          onChange={handleVolumeChange}
                          className="w-14 sm:w-18 h-1 bg-white/20 rounded accent-pink-500 cursor-pointer hidden sm:block"
                        />
                      </div>

                      <div className="text-[11px] font-mono text-slate-300 ml-1">
                        <span className="text-pink-400">{formatTime(currentTime)}</span> / <span>{formatTime(durationSec)}</span>
                      </div>
                    </div>

                    {/* Right Controls: Quality, Speed, Fullscreen */}
                    <div className="flex items-center gap-2 relative">
                      {/* Speed Badge */}
                      <div className="relative">
                        <button
                          onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-pink-600/30 text-[11px] font-bold text-pink-300 hover:text-white border border-pink-500/30 flex items-center gap-1 cursor-pointer"
                        >
                          <Settings className="w-3 h-3" />
                          <span>{selectedQualityLabel}</span>
                          <span className="text-slate-400">·</span>
                          <span>{playbackSpeed}x</span>
                        </button>

                        {/* Settings Popup Menu */}
                        {showSettingsMenu && (
                          <div className="absolute bottom-full right-0 mb-2 w-48 rounded-xl bg-[#1c0c2e] border border-pink-500/40 p-2.5 shadow-2xl z-30">
                            {/* Qualities */}
                            {videoData?.qualities && videoData.qualities.length > 0 && (
                              <div className="mb-3">
                                <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wider block mb-1">
                                  Video Quality
                                </span>
                                <div className="space-y-1">
                                  {videoData.qualities.map((q) => (
                                    <button
                                      key={q.quality}
                                      onClick={() => handleQualityChange(q.url, q.quality)}
                                      className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs font-semibold cursor-pointer ${
                                        selectedQualityLabel === q.quality
                                          ? 'bg-pink-600 text-white'
                                          : 'text-slate-300 hover:bg-white/10'
                                      }`}
                                    >
                                      <span>{q.quality}</span>
                                      {selectedQualityLabel === q.quality && <Check className="w-3 h-3" />}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Playback Speeds */}
                            <div>
                              <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wider block mb-1">
                                Playback Speed
                              </span>
                              <div className="grid grid-cols-3 gap-1">
                                {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => handleSpeedChange(s)}
                                    className={`py-1 rounded text-center text-xs font-semibold cursor-pointer ${
                                      playbackSpeed === s
                                        ? 'bg-pink-600 text-white'
                                        : 'text-slate-300 hover:bg-white/10'
                                    }`}
                                  >
                                    {s}x
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={handleToggleFullscreen}
                        className="p-1 hover:text-pink-400 transition-colors cursor-pointer"
                        title="Fullscreen"
                      >
                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Video Info Footer */}
        <div className="p-4 sm:p-5 bg-[#170926] border-t border-pink-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-black text-white line-clamp-1">
              {displayTitle}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              GB STUDY Free Educational Batch · {videoData?.date || initialDuration || 'HD Video Lecture'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {attachedPdf && onOpenPdf && (
              <button
                onClick={() => onOpenPdf(attachedPdf, `${displayTitle} - Notes`)}
                className="px-3.5 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-pink-600/30 cursor-pointer transition-all"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Open PDF Notes</span>
              </button>
            )}

            <a
              href={BRAND_ASSETS.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 rounded-xl bg-[#250f3b] hover:bg-pink-900/40 text-pink-300 hover:text-white border border-pink-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Join Telegram</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
