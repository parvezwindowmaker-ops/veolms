import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IndianRupee, Sparkles } from 'lucide-react'
import { BackLink } from '@/components/BackLink'
import { useCreateCourse } from '@/features/admin/api'
import { useCategories } from '@/features/courses/api'
import { apiErrorMessage } from '@/lib/api'
import { Decor } from '@/components/layout/Decor'
import { ThumbnailField, type ThumbnailValue } from '@/components/admin/ThumbnailField'
import { TrailerField, type TrailerValue } from '@/components/admin/TrailerField'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

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

/** Small section heading inside the form card. */
function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="font-grotesk text-sm font-bold uppercase tracking-wide text-foreground">
        {title}
      </h2>
      {hint && (
        <p className="mt-0.5 text-xs font-medium text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

export function NewCoursePage() {
  const navigate = useNavigate()
  const create = useCreateCourse()
  const { data: categories, isLoading: categoriesLoading } = useCategories()

  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [description, setDescription] = useState('')
  const [thumbnail, setThumbnail] = useState<ThumbnailValue>({ assetId: null })
  const [banner, setBanner] = useState<ThumbnailValue>({ assetId: null })
  const [trailer, setTrailer] = useState<TrailerValue>({ assetId: null })
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('beginner')
  const [categoryId, setCategoryId] = useState('')
  const [language, setLanguage] = useState('English')
  const [tags, setTags] = useState('')
  const [outcomes, setOutcomes] = useState('')
  const [prerequisites, setPrerequisites] = useState('')
  const [whoFor, setWhoFor] = useState('')
  // Empty = free (₹0). Kept empty (with a "0" placeholder) so there's no leading
  // zero to delete before typing a price.
  const [priceRupees, setPriceRupees] = useState('')
  const [discountRupees, setDiscountRupees] = useState('')
  const [error, setError] = useState('')

  const rupees = Number(priceRupees)
  const isFree = !Number.isFinite(rupees) || rupees <= 0

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!Number.isFinite(rupees) || rupees < 0) {
      setError('Enter a valid price (₹0 for free)')
      return
    }
    if (rupees > 0 && rupees < 1) {
      setError('Paid courses must be at least ₹1')
      return
    }
    const price = Math.round(rupees * 100) // ₹ -> paise
    // Discount is optional; only validate/send when a value was entered.
    let discountPrice: number | undefined
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
      // The cover is an uploaded image asset (R2), or none.
      const thumb =
        thumbnail.assetId != null ? { thumbnailAssetId: thumbnail.assetId } : {}
      const bannerField =
        banner.assetId != null ? { bannerAssetId: banner.assetId } : {}
      const trailerField =
        trailer.assetId != null ? { trailerAssetId: trailer.assetId } : {}
      const course = await create.mutateAsync({
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        description: description.trim() || undefined,
        ...thumb,
        ...bannerField,
        ...trailerField,
        level,
        price,
        ...(discountPrice != null ? { discountPrice } : {}),
        ...(categoryId ? { categoryId: Number(categoryId) } : {}),
        language: language.trim() || undefined,
        tags: csvToTags(tags),
        learningOutcomes: linesToList(outcomes),
        prerequisites: linesToList(prerequisites),
        whoThisIsFor: linesToList(whoFor),
      })
      navigate('/admin/courses', { replace: true })
      void course
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create course'))
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink to="/admin/courses" className="mb-5">Back to courses</BackLink>

      {/* Header */}
      <div className="relative mb-6">
        <Decor className="rounded-[22px]">
          <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-[#ffb59c] opacity-70 blur-3xl" />
          <div className="absolute -bottom-16 left-1/4 h-44 w-44 rounded-full bg-[#a7ecdd] opacity-70 blur-3xl" />
        </Decor>
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-ink bg-primary text-white shadow-[2px_3px_0_var(--ink)]">
            <Sparkles className="h-6 w-6" />
          </span>
          <div>
            <span className="eyebrow">New course</span>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
              Create a course
            </h1>
            <p className="mt-1.5 font-medium text-muted-foreground">
              Start with the basics. You can add sections, lessons, and videos next.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="pop space-y-8 p-6 sm:p-8">
        {/* Details */}
        <section className="space-y-5">
          <SectionHeader title="Course details" hint="The essentials students see first." />
          <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-primary-strong">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Complete JavaScript Course"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subtitle">Subtitle</Label>
            <Input
              id="subtitle"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="One line that sells the course"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will students learn? What will they build?"
              rows={5}
            />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                id="category"
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
              <Label htmlFor="language">Language</Label>
              <Input
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="English"
              />
            </div>
          </div>
        </section>

        <div className="border-t-2 border-dashed border-border" />

        {/* Cover image */}
        <section className="space-y-4">
          <SectionHeader
            title="Cover image"
            hint="Shown on the catalog card and the course page."
          />
          <ThumbnailField value={thumbnail} onChange={setThumbnail} hideLabel />
        </section>

        <div className="border-t-2 border-dashed border-border" />

        {/* Banner image */}
        <section className="space-y-4">
          <SectionHeader
            title="Banner image"
            hint="Wide hero image shown at the top of the course page."
          />
          <ThumbnailField value={banner} onChange={setBanner} hideLabel />
        </section>

        <div className="border-t-2 border-dashed border-border" />

        {/* Trailer video */}
        <section className="space-y-4">
          <SectionHeader
            title="Trailer video"
            hint="Short intro video shown on the course page to attract students."
          />
          <TrailerField value={trailer} onChange={setTrailer} hideLabel />
        </section>

        <div className="border-t-2 border-dashed border-border" />

        {/* Level & pricing */}
        <section className="space-y-5">
          <SectionHeader title="Level & pricing" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="level">Level</Label>
              <Select
                id="level"
                value={level}
                onChange={(v) => setLevel(v as (typeof LEVELS)[number])}
                options={LEVELS.map((l) => ({ value: l, label: l }))}
                className="capitalize"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <div className="relative">
                <IndianRupee className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="price"
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
              <Badge tone={isFree ? 'success' : 'coral'}>
                {isFree
                  ? 'Free, anyone can enroll'
                  : `Students pay ₹${rupees.toLocaleString('en-IN')} once`}
              </Badge>
            </div>

            <div className="space-y-2">
              <Label htmlFor="discount">Discount price</Label>
              <div className="relative">
                <IndianRupee className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="discount"
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
        </section>

        <div className="border-t-2 border-dashed border-border" />

        {/* What students will get */}
        <section className="space-y-5">
          <SectionHeader
            title="Details & marketing"
            hint="Help learners decide. Categories, tags, and lists shown on the course page."
          />
          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="javascript, web, beginners"
            />
            <p className="text-xs font-medium text-muted-foreground">
              Comma-separated.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="outcomes">Learning outcomes</Label>
            <Textarea
              id="outcomes"
              value={outcomes}
              onChange={(e) => setOutcomes(e.target.value)}
              placeholder={'Build a full web app\nDeploy to production\nWrite tests'}
              rows={4}
            />
            <p className="text-xs font-medium text-muted-foreground">
              One item per line.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prerequisites">Prerequisites</Label>
            <Textarea
              id="prerequisites"
              value={prerequisites}
              onChange={(e) => setPrerequisites(e.target.value)}
              placeholder={'Basic HTML & CSS\nA code editor'}
              rows={4}
            />
            <p className="text-xs font-medium text-muted-foreground">
              One item per line.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="whoFor">Who this is for</Label>
            <Textarea
              id="whoFor"
              value={whoFor}
              onChange={(e) => setWhoFor(e.target.value)}
              placeholder={'Aspiring web developers\nDesigners learning to code'}
              rows={4}
            />
            <p className="text-xs font-medium text-muted-foreground">
              One item per line.
            </p>
          </div>
        </section>

        {error && (
          <p className="rounded-xl border-2 border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-sm font-semibold text-destructive">
            {error}
          </p>
        )}

        {/* Footer actions */}
        <div className="flex flex-wrap gap-3 border-t-2 border-border pt-6">
          <Button type="submit" size="lg" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create course'}
          </Button>
          <Button type="button" size="lg" variant="outline" asChild>
            <Link to="/admin/courses">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
