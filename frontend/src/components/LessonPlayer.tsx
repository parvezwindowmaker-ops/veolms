import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Maximize, PictureInPicture2 } from 'lucide-react'
import type HlsJs from 'hls.js'
import { loadYouTubeAPI, youTubeId, type YTPlayer } from '@/lib/youtube'
import { cn } from '@/lib/utils'

export interface LessonPlayerProps {
  source: 'r2' | 'external' | 'hls'
  url: string
  /** Resume position in seconds. */
  startAt?: number
  /** Called periodically (~10s) with the current position in seconds. */
  onProgress?: (sec: number) => void
  /** Called when playback reaches the end. */
  onEnded?: () => void
}

const FRAME =
  'aspect-video w-full overflow-hidden rounded-2xl border-2 border-foreground bg-black'

/** YouTube playback via the IFrame API, which enables resume + progress + completion. */
function YouTubePlayer({
  videoId,
  startAt = 0,
  onProgress,
  onEnded,
}: { videoId: string } & Omit<LessonPlayerProps, 'source' | 'url'>) {
  const hostRef = useRef<HTMLDivElement>(null)
  const cb = useRef({ startAt, onProgress, onEnded })
  cb.current = { startAt, onProgress, onEnded }

  useEffect(() => {
    let player: YTPlayer | null = null
    let interval: number | undefined
    let cancelled = false

    loadYouTubeAPI().then((YT) => {
      if (cancelled || !hostRef.current) return
      const mount = document.createElement('div')
      hostRef.current.appendChild(mount)
      player = new YT.Player(mount, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: (e) => {
            if (cb.current.startAt > 5) e.target.seekTo(cb.current.startAt, true)
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.ENDED) cb.current.onEnded?.()
          },
        },
      })
      interval = window.setInterval(() => {
        if (!player?.getCurrentTime) return
        const t = Math.floor(player.getCurrentTime())
        if (t > 0) cb.current.onProgress?.(t)
      }, 10_000)
    })

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
      try {
        player?.destroy()
      } catch {
        /* ignore */
      }
      if (hostRef.current) hostRef.current.innerHTML = ''
    }
  }, [videoId])

  return (
    <div
      ref={hostRef}
      className={cn(
        FRAME,
        'relative [&>iframe]:absolute [&>iframe]:inset-0 [&>iframe]:h-full [&>iframe]:w-full'
      )}
    />
  )
}

/** Native (R2 / direct file) playback with resume, progress, speed, PiP & shortcuts. */
function NativeVideoPlayer({
  url,
  isHls = false,
  startAt = 0,
  onProgress,
  onEnded,
}: Omit<LessonPlayerProps, 'source'> & { isHls?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const lastSaved = useRef(0)
  const hlsRef = useRef<HlsJs | null>(null)
  const [rate, setRate] = useState(1)
  const [levels, setLevels] = useState<{ height: number; index: number }[]>([])
  const [level, setLevel] = useState(-1) // -1 = Auto (adaptive)

  // Attach hls.js for encrypted-HLS streams (lazy-loaded; native HLS on Safari
  // is the fallback). Dynamic import keeps hls.js out of the main bundle. hls.js
  // handles adaptive bitrate automatically and exposes the renditions for a picker.
  useEffect(() => {
    if (!ref.current || !isHls) return
    let cancelled = false
    let hls: HlsJs | undefined
    void import('hls.js').then((mod) => {
      const Hls = mod.default
      const video = ref.current
      if (cancelled || !video) return
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true })
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLevels(hls!.levels.map((l, i) => ({ height: l.height, index: i })))
        })
        hls.on(Hls.Events.LEVEL_SWITCHED, () => {
          if (hls!.autoLevelEnabled) setLevel(-1)
        })
        hlsRef.current = hls
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url
      }
    })
    return () => {
      cancelled = true
      hlsRef.current = null
      hls?.destroy()
      setLevels([])
      setLevel(-1)
    }
  }, [url, isHls])

  const changeQuality = (idx: number) => {
    setLevel(idx)
    if (hlsRef.current) hlsRef.current.currentLevel = idx
  }

  const seekBy = (d: number) => {
    const v = ref.current
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || 1e9, v.currentTime + d))
  }
  const togglePlay = () => {
    const v = ref.current
    if (v) (v.paused ? v.play() : v.pause())
  }
  const toggleFullscreen = () => {
    const v = ref.current
    if (!v) return
    if (document.fullscreenElement) document.exitFullscreen()
    else v.requestFullscreen?.()
  }
  const togglePiP = async () => {
    const v = ref.current
    if (!v) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await v.requestPictureInPicture()
    } catch {
      /* PiP unsupported / denied */
    }
  }
  const setSpeed = (r: number) => {
    setRate(r)
    if (ref.current) ref.current.playbackRate = r
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const v = ref.current
    if (!v) return
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault()
        togglePlay()
        break
      case 'ArrowRight':
        seekBy(5)
        break
      case 'ArrowLeft':
        seekBy(-5)
        break
      case 'l':
        seekBy(10)
        break
      case 'j':
        seekBy(-10)
        break
      case 'm':
        v.muted = !v.muted
        break
      case 'f':
        toggleFullscreen()
        break
    }
  }

  return (
    <div className="group" tabIndex={0} onKeyDown={onKeyDown}>
      <video
        ref={ref}
        src={isHls ? undefined : url}
        controls
        playsInline
        controlsList="nodownload"
        className={FRAME}
        onLoadedMetadata={() => {
          const v = ref.current
          if (v && startAt > 5 && startAt < v.duration - 5) v.currentTime = startAt
        }}
        onTimeUpdate={() => {
          const v = ref.current
          if (!v) return
          const t = Math.floor(v.currentTime)
          if (t - lastSaved.current >= 10) {
            lastSaved.current = t
            onProgress?.(t)
          }
        }}
        onEnded={() => onEnded?.()}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1">Speed</span>
        {[0.5, 1, 1.5, 2].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setSpeed(r)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-bold transition-colors',
              rate === r
                ? 'bg-secondary text-primary-strong'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {r}x
          </button>
        ))}
        {isHls && levels.length > 1 && (
          <>
            <span className="mx-1 h-4 w-px bg-border" />
            <span className="eyebrow mr-1">Quality</span>
            <select
              value={level}
              onChange={(e) => changeQuality(Number(e.target.value))}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              aria-label="Video quality"
            >
              <option value={-1}>Auto</option>
              {[...levels]
                .sort((a, b) => b.height - a.height)
                .map((l) => (
                  <option key={l.index} value={l.index}>
                    {l.height}p
                  </option>
                ))}
            </select>
          </>
        )}
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          onClick={togglePiP}
          title="Picture-in-picture"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PictureInPicture2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          title="Fullscreen"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Maximize className="h-4 w-4" />
        </button>
        <span className="ml-auto hidden text-xs font-medium text-muted-foreground sm:block">
          shortcuts: space/k · j/l ±10s · ←/→ ±5s · f · m
        </span>
      </div>
    </div>
  )
}

export function LessonPlayer({ source, url, ...rest }: LessonPlayerProps) {
  const ytId = source === 'external' ? youTubeId(url) : null
  if (ytId) return <YouTubePlayer videoId={ytId} {...rest} />
  return <NativeVideoPlayer url={url} isHls={source === 'hls'} {...rest} />
}
