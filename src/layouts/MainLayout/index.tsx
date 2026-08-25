import { Outlet } from 'react-router-dom'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import AnnouncementModal from '@/components/AnnouncementModal'
import './index.css'

export default function MainLayout() {
  return (
    <div className="main-layout">
      <Header />
      <main className="main-content">
        <Outlet />
      </main>
      <Footer />
      <AnnouncementModal />
    </div>
  )
}
