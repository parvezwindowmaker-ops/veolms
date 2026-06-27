import { Transaction } from 'sequelize';
import { Menu } from '../../routes/control/menu/menu-model';
import { Permission } from '../../routes/control/permission/permission-model';
import { Role } from '../../routes/control/role/role-model';
import { User } from '../../routes/control/user/user-model';
import { Category } from '../../routes/lms/category/category-model';
import { Course } from '../../routes/lms/course/course-model';
import { Section } from '../../routes/lms/section/section-model';
import { Lesson } from '../../routes/lms/lesson/lesson-model';

interface Grant {
  routeLink: string;
  read?: boolean;
  create?: boolean;
  update?: boolean;
  delete?: boolean;
}

/** Grant a role a set of menu permissions, resolving menus by routeLink. */
async function grantMenuPermissions(
  roleId: number,
  menus: Menu[],
  grants: Grant[],
  transaction: Transaction
): Promise<void> {
  const byRoute = new Map(menus.map((m) => [m.routeLink, m]));
  const rows = grants
    .map((g) => {
      const menu = byRoute.get(g.routeLink);
      if (!menu) return null;
      return {
        roleId,
        menuId: menu.id,
        canRead: g.read ?? true,
        canCreate: g.create ?? false,
        canUpdate: g.update ?? false,
        canDelete: g.delete ?? false,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length) {
    await Permission.bulkCreate(rows, { transaction });
  }
}

/**
 * Seed LMS roles (Instructor, Student) with their menu permissions, demo
 * instructor/student users, and a demo catalog (4 published courses, incl. a free one).
 * Runs only on an empty database (see connectDB -> seedIfEmpty).
 */
export async function seedLmsData(
  menus: Menu[],
  transaction?: Transaction
): Promise<void> {
  const tx = transaction as Transaction;

  const instructorRole = await Role.create(
    { roleName: 'Instructor' },
    { transaction }
  );
  const studentRole = await Role.create(
    { roleName: 'Student' },
    { transaction }
  );

  await grantMenuPermissions(
    instructorRole.id,
    menus,
    [
      { routeLink: 'admin', read: true },
      { routeLink: 'admin/courses', read: true, create: true, update: true, delete: true },
      { routeLink: 'admin/categories', read: true },
      { routeLink: 'my-learning', read: true },
    ],
    tx
  );
  await grantMenuPermissions(
    studentRole.id,
    menus,
    [
      { routeLink: 'user-dashboard', read: true },
      { routeLink: 'my-learning', read: true },
    ],
    tx
  );

  // Demo users (passwords hashed by the User beforeSave hook). Dev defaults.
  const instructor = await User.create(
    {
      userName: 'instructor',
      firstName: 'Demo',
      lastName: 'Instructor',
      email: 'instructor@veolms.local',
      password: 'Instructor@123',
      roleId: instructorRole.id,
    },
    { transaction }
  );
  await User.create(
    {
      userName: 'student',
      firstName: 'Demo',
      lastName: 'Student',
      email: 'student@veolms.local',
      password: 'Student@123',
      roleId: studentRole.id,
    },
    { transaction }
  );

  // Categories
  const cats: Record<string, Category> = {};
  for (const c of [
    { name: 'Web Development', description: 'Building for the modern web' },
    { name: 'Frontend', description: 'UI, React and the browser' },
    { name: 'Backend', description: 'APIs, servers and databases' },
  ]) {
    cats[c.name] = await Category.create(c, { transaction });
  }

  await seedCatalog(instructor.id, cats, transaction);
}

type SeedLesson = {
  title: string;
  type: 'video' | 'text';
  video?: string;
  content?: string;
  dur?: number;
  preview?: boolean;
};
type SeedSection = { title: string; lessons: SeedLesson[] };
type SeedCourse = {
  title: string;
  subtitle: string;
  description: string;
  category: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  price: number; // paise (0 = free)
  sections: SeedSection[];
};

const yt = (id: string): string => `https://www.youtube.com/watch?v=${id}`;

/**
 * Seeded catalog. The video URLs are public tutorial videos used as
 * placeholders; replace them with your own (e.g. procodrr) clips from the
 * admin panel. Every course is published with sections, video + text lessons,
 * and a free preview lesson.
 */
const CATALOG: SeedCourse[] = [
  {
    title: 'The Complete JavaScript Course',
    subtitle: 'From the fundamentals to real projects',
    description:
      'Master JavaScript from scratch: variables, functions, the DOM, async/await and modern ES features, built up through hands-on lessons.',
    category: 'Web Development',
    level: 'beginner',
    price: 49900,
    sections: [
      {
        title: 'Getting Started',
        lessons: [
          { title: 'Welcome & how to learn', type: 'video', video: 'PkZNo7MFNFg', dur: 600, preview: true },
          { title: 'How JavaScript actually runs', type: 'text', content: '<h2>How JS runs</h2><p>The engine, the call stack, and the event loop in plain English.</p><ul><li>Parsing &amp; execution</li><li>Hoisting</li><li>The event loop</li></ul>' },
          { title: 'Variables, types & operators', type: 'video', video: 'W6NZfCO5SIk', dur: 900 },
        ],
      },
      {
        title: 'Core JavaScript',
        lessons: [
          { title: 'Functions, scope & closures', type: 'video', video: 'PkZNo7MFNFg', dur: 1200 },
          { title: 'Arrays, objects & loops', type: 'video', video: 'W6NZfCO5SIk', dur: 1500 },
        ],
      },
    ],
  },
  {
    title: 'React from the Ground Up',
    subtitle: 'Build modern, component-driven UIs',
    description:
      'Learn React the right way: components, props, state, hooks and data fetching, then build interactive apps with confidence.',
    category: 'Frontend',
    level: 'intermediate',
    price: 79900,
    sections: [
      {
        title: 'React Basics',
        lessons: [
          { title: 'What is React & why it matters', type: 'video', video: 'bMknfKXIFA8', dur: 720, preview: true },
          { title: 'JSX & components', type: 'text', content: '<h2>JSX &amp; components</h2><p>Components are functions that return UI. JSX is syntax sugar over <code>React.createElement</code>.</p>' },
          { title: 'Props & state', type: 'video', video: 'bMknfKXIFA8', dur: 1100 },
        ],
      },
      {
        title: 'Building Apps',
        lessons: [
          { title: 'Hooks: useState & useEffect', type: 'video', video: 'bMknfKXIFA8', dur: 1300 },
          { title: 'Fetching data & rendering lists', type: 'video', video: 'bMknfKXIFA8', dur: 1000 },
        ],
      },
    ],
  },
  {
    title: 'Node.js & Express REST APIs',
    subtitle: 'Build and ship backend services',
    description:
      'Go from zero to a working REST API: Node fundamentals, Express routing, middleware, and connecting a database.',
    category: 'Backend',
    level: 'intermediate',
    price: 69900,
    sections: [
      {
        title: 'Node Fundamentals',
        lessons: [
          { title: 'Node & npm basics', type: 'video', video: 'Oe421EPjeBE', dur: 800, preview: true },
          { title: 'The event loop & async', type: 'text', content: '<h2>Async in Node</h2><p>Non-blocking I/O is what makes Node fast. Callbacks, promises and async/await all sit on the event loop.</p>' },
          { title: 'Your first Express server', type: 'video', video: 'Oe421EPjeBE', dur: 1200 },
        ],
      },
      {
        title: 'Building a REST API',
        lessons: [
          { title: 'Routes, controllers & middleware', type: 'video', video: 'Oe421EPjeBE', dur: 1400 },
          { title: 'Connecting a database', type: 'video', video: 'Oe421EPjeBE', dur: 1100 },
        ],
      },
    ],
  },
  {
    title: 'CSS & Modern Layouts',
    subtitle: 'Flexbox, Grid and responsive design, free',
    description:
      'A free, practical CSS course: the box model, Flexbox, CSS Grid and responsive design patterns you will use every day.',
    category: 'Frontend',
    level: 'beginner',
    price: 0,
    sections: [
      {
        title: 'CSS Foundations',
        lessons: [
          { title: 'Selectors & the box model', type: 'video', video: '1Rs2ND1ryYc', dur: 700, preview: true },
          { title: 'Specificity & the cascade', type: 'text', content: '<h2>Specificity</h2><p>Inline &gt; ID &gt; class &gt; element. When in doubt, keep selectors flat and predictable.</p>' },
          { title: 'Flexbox in depth', type: 'video', video: '1Rs2ND1ryYc', dur: 1000 },
        ],
      },
      {
        title: 'Responsive Design',
        lessons: [
          { title: 'CSS Grid layouts', type: 'video', video: '1Rs2ND1ryYc', dur: 1100 },
          { title: 'Media queries & responsive UI', type: 'video', video: '1Rs2ND1ryYc', dur: 900 },
        ],
      },
    ],
  },
];

/** Create every catalog course (published) with its sections and lessons. */
async function seedCatalog(
  instructorId: number,
  cats: Record<string, Category>,
  transaction?: Transaction
): Promise<void> {
  for (const c of CATALOG) {
    const course = await Course.create(
      {
        title: c.title,
        subtitle: c.subtitle,
        description: c.description,
        categoryId: cats[c.category]?.id ?? null,
        instructorId,
        level: c.level,
        price: c.price,
        currency: 'INR',
        status: 'published',
        publishedAt: new Date(),
      },
      { transaction }
    );

    let sectionPos = 1;
    for (const s of c.sections) {
      const section = await Section.create(
        { courseId: course.id, title: s.title, position: sectionPos++ },
        { transaction }
      );
      let lessonPos = 1;
      for (const l of s.lessons) {
        await Lesson.create(
          {
            sectionId: section.id,
            courseId: course.id,
            title: l.title,
            type: l.type,
            content: l.content ?? null,
            videoUrl: l.video ? yt(l.video) : null,
            videoAssetId: null,
            videoDurationSec: l.dur ?? null,
            isPreview: !!l.preview,
            position: lessonPos++,
          },
          { transaction }
        );
      }
    }
  }
}
