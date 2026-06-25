import { useState, type FormEvent } from 'react'
import { IndianRupee } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ThumbnailField, type ThumbnailValue } from '@/components/admin/ThumbnailField'
import { apiErrorMessage } from '@/lib/api'
import { useUpdateCourse } from '@/features/admin/manage'
import type { Course } from '@/types'

const LEVELS = ['beginner', 'intermediate', 'advanced'] as const

export function CourseDetailsModal({
  open,
  onClose,
  course,
}: {
  open: boolean
  onClose: () => void
  course: Course
}) {
  const update = useUpdateCourse(course.id)
  const [title, setTitle] = useState(course.title)
  const [subtitle, setSubtitle] = useState(course.subtitle ?? '')
  const [description, setDescription] = useState(course.description ?? '')
  const [thumbnail, setThumbnail] = useState<ThumbnailValue>(
    course.thumbnailAssetId
      ? { assetId: course.thumbnailAssetId, url: '' }
      : { assetId: null, url: course.thumbnail ?? '' }
  )
  const [level, setLevel] = useState<(typeof LEVELS)[number]>(course.level)
  // Empty = free (₹0); avoids a leading zero the user has to clear before typing.
  const [priceRupees, setPriceRupees] = useState(
    course.price ? String(course.price / 100) : ''
  )
  const [error, setError] = useState('')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const rupees = Number(priceRupees)
    if (!Number.isFinite(rupees) || rupees < 0 || (rupees > 0 && rupees < 1)) {
      setError('Price must be ₹0 (free) or at least ₹1')
      return
    }
    try {
      // Uploaded image (assetId) wins; otherwise the external URL (null clears it).
      const thumb =
        thumbnail.assetId != null
          ? { thumbnailAssetId: thumbnail.assetId }
          : { thumbnail: thumbnail.url.trim() || null }
      await update.mutateAsync({
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        description: description.trim() || null,
        ...thumb,
        level,
        price: Math.round(rupees * 100),
      })
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update course'))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit course details">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cTitle">Title</Label>
          <Input id="cTitle" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cSubtitle">Subtitle</Label>
          <Input
            id="cSubtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cDesc">Description</Label>
          <Textarea
            id="cDesc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
          />
        </div>

        <ThumbnailField
          value={thumbnail}
          onChange={setThumbnail}
          previewFallback={course.thumbnail}
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cLevel">Level</Label>
            <Select
              id="cLevel"
              value={level}
              onChange={(v) => setLevel(v as (typeof LEVELS)[number])}
              options={LEVELS.map((l) => ({ value: l, label: l }))}
              className="capitalize"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cPrice">Price</Label>
            <div className="relative">
              <IndianRupee className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="cPrice"
                type="number"
                min={0}
                step="1"
                inputMode="numeric"
                placeholder="0"
                value={priceRupees}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setPriceRupees(e.target.value)}
                className="pl-9"
              />
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              Leave empty or 0 for a free course.
            </p>
          </div>
        </div>

        {error && (
          <p className="rounded-xl bg-destructive/10 px-3.5 py-2 text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}
