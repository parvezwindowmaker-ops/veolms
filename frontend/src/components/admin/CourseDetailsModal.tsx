import { useState, type FormEvent } from 'react'
import { IndianRupee } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ThumbnailField, type ThumbnailValue } from '@/components/admin/ThumbnailField'
import { TrailerField, type TrailerValue } from '@/components/admin/TrailerField'
import { apiErrorMessage } from '@/lib/api'
import { useUpdateCourse } from '@/features/admin/manage'
import { useCategories } from '@/features/courses/api'
import type { Course } from '@/types'

const LEVELS = ['beginner', 'intermediate', 'advanced'] as const

/** Split a textarea (one item per line) into a trimmed, non-empty string[]. */
function linesToList(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Split comma-separated tags into a trimmed, de-duped string[]. */
function csvToTags(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    )
  )
}

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
  const { data: categories, isLoading: categoriesLoading } = useCategories()
  const [title, setTitle] = useState(course.title)
  const [subtitle, setSubtitle] = useState(course.subtitle ?? '')
  const [description, setDescription] = useState(course.description ?? '')
  const [thumbnail, setThumbnail] = useState<ThumbnailValue>({
    assetId: course.thumbnailAssetId ?? null,
  })
  const [banner, setBanner] = useState<ThumbnailValue>({
    assetId: course.bannerAssetId ?? null,
  })
  const [trailer, setTrailer] = useState<TrailerValue>({
    assetId: course.trailerAssetId ?? null,
  })
  const [level, setLevel] = useState<(typeof LEVELS)[number]>(course.level)
  const [categoryId, setCategoryId] = useState(
    course.categoryId != null ? String(course.categoryId) : ''
  )
  const [language, setLanguage] = useState(course.language ?? 'English')
  const [tags, setTags] = useState((course.tags ?? []).join(', '))
  const [outcomes, setOutcomes] = useState((course.learningOutcomes ?? []).join('\n'))
  const [prerequisites, setPrerequisites] = useState(
    (course.prerequisites ?? []).join('\n')
  )
  const [whoFor, setWhoFor] = useState((course.whoThisIsFor ?? []).join('\n'))
  // Empty = free (₹0); avoids a leading zero the user has to clear before typing.
  const [priceRupees, setPriceRupees] = useState(
    course.price ? String(course.price / 100) : ''
  )
  const [discountRupees, setDiscountRupees] = useState(
    course.discountPrice ? String(course.discountPrice / 100) : ''
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
    const price = Math.round(rupees * 100)
    // Discount is optional; empty clears it (null).
    let discountPrice: number | null = null
    if (discountRupees.trim() !== '') {
      const dRupees = Number(discountRupees)
      if (!Number.isFinite(dRupees) || dRupees < 0) {
        setError('Enter a valid discount price')
        return
      }
      discountPrice = Math.round(dRupees * 100)
      if (discountPrice >= price) {
        setError('Discount price must be less than the price')
        return
      }
    }
    try {
      // Cover/banner are uploaded image assets (R2); null clears them.
      await update.mutateAsync({
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        description: description.trim() || null,
        thumbnailAssetId: thumbnail.assetId,
        bannerAssetId: banner.assetId,
        trailerAssetId: trailer.assetId,
        level,
        price,
        discountPrice,
        categoryId: categoryId ? Number(categoryId) : null,
        language: language.trim() || undefined,
        tags: csvToTags(tags),
        learningOutcomes: linesToList(outcomes),
        prerequisites: linesToList(prerequisites),
        whoThisIsFor: linesToList(whoFor),
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
          <Input
            id="cTitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The Complete JavaScript Course"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cSubtitle">Subtitle</Label>
          <Input
            id="cSubtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="One line that sells the course"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cDesc">Description</Label>
          <Textarea
            id="cDesc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What will students learn? What will they build?"
            rows={5}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cCategory">Category</Label>
            <Select
              id="cCategory"
              value={categoryId}
              onChange={setCategoryId}
              placeholder="Choose a category"
              loading={categoriesLoading}
              options={(categories ?? []).map((c) => ({
                value: String(c.id),
                label: c.name,
              }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cLanguage">Language</Label>
            <Input
              id="cLanguage"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="English"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Cover image</Label>
          <ThumbnailField
            value={thumbnail}
            onChange={setThumbnail}
            previewFallback={course.thumbnail}
            hideLabel
          />
        </div>

        <div className="space-y-2">
          <Label>Banner image</Label>
          <ThumbnailField
            value={banner}
            onChange={setBanner}
            previewFallback={course.banner}
            hideLabel
          />
        </div>

        <div className="space-y-2">
          <Label>Trailer video</Label>
          <TrailerField
            value={trailer}
            onChange={setTrailer}
            courseId={course.id}
            hideLabel
          />
        </div>

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
          <div className="space-y-2">
            <Label htmlFor="cDiscount">Discount price</Label>
            <div className="relative">
              <IndianRupee className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="cDiscount"
                type="number"
                min={0}
                step="1"
                inputMode="numeric"
                placeholder="0"
                value={discountRupees}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setDiscountRupees(e.target.value)}
                className="pl-9"
              />
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              Optional. Must be less than the price.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cTags">Tags</Label>
          <Input
            id="cTags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="javascript, web, beginners"
          />
          <p className="text-xs font-medium text-muted-foreground">Comma-separated.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cOutcomes">Learning outcomes</Label>
          <Textarea
            id="cOutcomes"
            value={outcomes}
            onChange={(e) => setOutcomes(e.target.value)}
            placeholder={'Build a full web app\nDeploy to production'}
            rows={4}
          />
          <p className="text-xs font-medium text-muted-foreground">One item per line.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cPrereqs">Prerequisites</Label>
          <Textarea
            id="cPrereqs"
            value={prerequisites}
            onChange={(e) => setPrerequisites(e.target.value)}
            placeholder={'Basic HTML & CSS\nA code editor'}
            rows={4}
          />
          <p className="text-xs font-medium text-muted-foreground">One item per line.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cWhoFor">Who this is for</Label>
          <Textarea
            id="cWhoFor"
            value={whoFor}
            onChange={(e) => setWhoFor(e.target.value)}
            placeholder={'Aspiring web developers\nDesigners learning to code'}
            rows={4}
          />
          <p className="text-xs font-medium text-muted-foreground">One item per line.</p>
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
