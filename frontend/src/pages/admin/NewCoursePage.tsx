import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, IndianRupee, Sparkles } from 'lucide-react'
import { useCreateCourse } from '@/features/admin/api'
import { apiErrorMessage } from '@/lib/api'
import { Decor } from '@/components/layout/Decor'
import { ThumbnailField, type ThumbnailValue } from '@/components/admin/ThumbnailField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const LEVELS = ['beginner', 'intermediate', 'advanced'] as const

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

  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [description, setDescription] = useState('')
  const [thumbnail, setThumbnail] = useState<ThumbnailValue>({ assetId: null, url: '' })
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('beginner')
  // Empty = free (₹0). Kept empty (with a "0" placeholder) so there's no leading
  // zero to delete before typing a price.
  const [priceRupees, setPriceRupees] = useState('')
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
    try {
      // An uploaded image (assetId) takes precedence; otherwise an external URL.
      const thumb =
        thumbnail.assetId != null
          ? { thumbnailAssetId: thumbnail.assetId }
          : { thumbnail: thumbnail.url.trim() || undefined }
      const course = await create.mutateAsync({
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        description: description.trim() || undefined,
        ...thumb,
        level,
        price: Math.round(rupees * 100), // ₹ -> paise
      })
      navigate('/admin/courses', { replace: true })
      void course
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create course'))
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" asChild className="mb-5">
        <Link to="/admin/courses">
          <ArrowLeft className="h-4 w-4" />
          Back to courses
        </Link>
      </Button>

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
              <span
                className={
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ' +
                  (isFree
                    ? 'bg-teal/15 text-teal'
                    : 'bg-secondary text-primary-strong')
                }
              >
                {isFree
                  ? 'Free, anyone can enroll'
                  : `Students pay ₹${rupees.toLocaleString('en-IN')} once`}
              </span>
            </div>
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
