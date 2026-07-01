import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Film, Loader2, RefreshCw, X } from 'lucide-react'
import { uploadVideo } from '@/lib/upload'
import { apiErrorMessage } from '@/lib/api'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface TrailerValue {
  assetId: number | null
}

const MAX_MB = 500

export function TrailerField({
  value,
  onChange,
  courseId,
  previewFallback,
  hideLabel,
}: {
  value: TrailerValue
  onChange: (v: TrailerValue) => void
  courseId?: number | null
  previewFallback?: string | null
  hideLabel?: boolean
}) {
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview)
    }
  }, [localPreview])

  const preview = localPreview ?? (value.assetId ? previewFallback ?? null : null)
  const hasVideo = !!preview

  const handleFile = async (file: File) => {
    setError('')
    if (!file.type.startsWith('video/')) {
      setError('Please choose a video file')
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Video must be under ${MAX_MB} MB`)
      return
    }
    setLocalPreview(URL.createObjectURL(file))
    setUploading(true)
    setProgress(0)
    try {
      const assetId = await uploadVideo(file, courseId ?? null, setProgress)
      onChange({ assetId })
    } catch (e) {
      setError(apiErrorMessage(e, 'Upload failed. Please try again.'))
      setLocalPreview(null)
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (uploading) return
    const f = e.dataTransfer.files?.[0]
    if (f) void handleFile(f)
  }

  const clear = () => {
    setLocalPreview(null)
    setError('')
    onChange({ assetId: null })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      {!hideLabel && <Label>Trailer video</Label>}

      <div
        onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'relative aspect-video w-full overflow-hidden rounded-xl border-2 transition-colors',
          hasVideo ? 'border-ink' : 'border-dashed',
          dragging ? 'border-ink bg-secondary' : hasVideo ? '' : 'border-input bg-tint'
        )}
      >
        {hasVideo ? (
          <>
            <video
              src={preview}
              controls={!uploading}
              className="h-full w-full object-cover"
              preload="metadata"
            />
            {!uploading && (
              <div className="absolute right-2 top-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Replace trailer"
                  className="tag rounded-full bg-card p-1.5 text-foreground transition-colors hover:text-primary-strong"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={clear}
                  aria-label="Remove trailer"
                  className="tag rounded-full bg-card p-1.5 text-foreground transition-colors hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex h-full w-full flex-col items-center justify-center gap-2.5 px-4 text-center"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-ink bg-card text-primary-strong shadow-[2px_3px_0_var(--ink)]">
              <Film className="h-6 w-6" />
            </span>
            <span className="text-sm font-bold text-foreground">
              Click or drop a video here
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              MP4, WebM · up to {MAX_MB} MB · 16:9 recommended
            </span>
          </button>
        )}

        {dragging && !uploading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink/60 text-sm font-bold text-white">
            Drop to upload
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-ink/70 px-6 text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm font-bold">Uploading… {progress}%</span>
            <div className="h-1.5 w-2/3 overflow-hidden rounded-full bg-white/25">
              <div className="h-full bg-white transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs font-medium opacity-75">
              Video will be transcoded to HLS after upload.
            </span>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
        }}
      />

      {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
    </div>
  )
}
