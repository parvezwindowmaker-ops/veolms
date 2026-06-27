import { useEffect, useRef, useState, type DragEvent } from 'react'
import { ImageIcon, Loader2, RefreshCw, X } from 'lucide-react'
import { uploadImage } from '@/lib/upload'
import { apiErrorMessage } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface ThumbnailValue {
  /** Uploaded image asset id (preferred when set). */
  assetId: number | null
  /** Externally-hosted image URL (used when no upload). */
  url: string
}

const MAX_MB = 5

/**
 * Course thumbnail picker: a 16:9 dropzone you can click or drag-and-drop an
 * image onto (uploaded straight to R2), OR paste an external image URL.
 * `previewFallback` is the already-resolved display URL for a course saved with
 * an uploaded image, so the existing cover shows on edit.
 */
export function ThumbnailField({
  value,
  onChange,
  previewFallback,
  hideLabel,
}: {
  value: ThumbnailValue
  onChange: (v: ThumbnailValue) => void
  previewFallback?: string | null
  /** Hide the built-in "Thumbnail" label (when a section header already names it). */
  hideLabel?: boolean
}) {
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [broken, setBroken] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Revoke the object URL of a just-picked file when it's replaced/unmounted.
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview)
    }
  }, [localPreview])

  // Preview priority: a just-picked file > a typed URL > the existing cover.
  const preview =
    localPreview ??
    (value.url.trim() || (value.assetId ? previewFallback ?? null : null))

  useEffect(() => setBroken(false), [preview])
  const hasImage = !!preview && !broken

  const handleFile = async (file: File) => {
    setError('')
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file')
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Image must be under ${MAX_MB} MB`)
      return
    }
    setLocalPreview(URL.createObjectURL(file))
    setUploading(true)
    setProgress(0)
    try {
      // Thumbnails live in their own dedicated `thumbnails/` folder (not per-course).
      const assetId = await uploadImage(file, null, setProgress)
      onChange({ assetId, url: '' })
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
    onChange({ assetId: null, url: '' })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      {!hideLabel && <Label htmlFor="thumbnailUrl">Thumbnail</Label>}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!uploading) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'relative aspect-video w-full overflow-hidden rounded-xl border-2 transition-colors',
          hasImage ? 'border-ink' : 'border-dashed',
          dragging
            ? 'border-ink bg-secondary'
            : hasImage
              ? ''
              : 'border-input bg-tint'
        )}
      >
        {hasImage ? (
          <>
            <img
              src={preview as string}
              alt="Course thumbnail preview"
              className="h-full w-full object-cover"
              onError={() => setBroken(true)}
            />
            {!uploading && (
              <div className="absolute right-2 top-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Replace image"
                  className="tag rounded-full bg-card p-1.5 text-foreground transition-colors hover:text-primary-strong"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={clear}
                  aria-label="Remove image"
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
              <ImageIcon className="h-6 w-6" />
            </span>
            <span className="text-sm font-bold text-foreground">
              {broken ? "Couldn't load that image" : 'Click or drop an image here'}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              PNG or JPG · up to {MAX_MB} MB · 16:9 looks best
            </span>
          </button>
        )}

        {/* Drag hint */}
        {dragging && !uploading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink/60 text-sm font-bold text-white">
            Drop to upload
          </div>
        )}

        {/* Uploading overlay */}
        {uploading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-ink/70 px-6 text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm font-bold">Uploading… {progress}%</span>
            <div className="h-1.5 w-2/3 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full bg-white transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
        }}
      />

      {/* URL alternative */}
      <div className="flex items-center gap-3 pt-1">
        <span className="h-0.5 flex-1 rounded-full bg-border" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          or paste a URL
        </span>
        <span className="h-0.5 flex-1 rounded-full bg-border" />
      </div>

      <Input
        id="thumbnailUrl"
        type="url"
        inputMode="url"
        aria-label="Thumbnail image URL"
        placeholder="https://…/cover.jpg"
        value={value.url}
        disabled={uploading}
        onChange={(e) => {
          setLocalPreview(null)
          onChange({ assetId: null, url: e.target.value })
        }}
      />

      {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
    </div>
  )
}
