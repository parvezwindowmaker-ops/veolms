import { Routes, Route } from 'react-router-dom'
import { ScrollToTop } from '@/components/ScrollToTop'
import { Layout } from '@/components/layout/Layout'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { HomePage } from '@/pages/HomePage'
import { CoursesPage } from '@/pages/CoursesPage'
import { CourseDetailPage } from '@/pages/CourseDetailPage'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { TeachPage } from '@/pages/TeachPage'
import { AboutPage } from '@/pages/AboutPage'
import { PricingPage } from '@/pages/PricingPage'
import { ContactPage } from '@/pages/ContactPage'
import { MyLearningPage } from '@/pages/MyLearningPage'
import { LearnPage } from '@/pages/LearnPage'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { AdminCoursesPage } from '@/pages/admin/AdminCoursesPage'
import { AdminSalesPage } from '@/pages/admin/AdminSalesPage'
import { NewCoursePage } from '@/pages/admin/NewCoursePage'
import { CourseManagePage } from '@/pages/admin/CourseManagePage'
import { NotFoundPage, ForbiddenPage } from '@/pages/NotFoundPage'

function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      {/* Auth pages: standalone full-screen AuthShell, no marketing navbar/footer */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Public + student (with site chrome) */}
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/:id" element={<CourseDetailPage />} />
        <Route path="/teach" element={<TeachPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/forbidden" element={<ForbiddenPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/my-learning" element={<MyLearningPage />} />
          <Route path="/learn/:courseId" element={<LearnPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Admin / Instructor workspace (its own chrome) */}
      <Route element={<ProtectedRoute roles={['Admin', 'Instructor']} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="courses" element={<AdminCoursesPage />} />
          <Route path="courses/new" element={<NewCoursePage />} />
          <Route path="courses/:id" element={<CourseManagePage />} />
          <Route path="sales" element={<AdminSalesPage />} />
        </Route>
      </Route>
      </Routes>
    </>
  )
}

export default App
