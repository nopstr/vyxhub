import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'
import RightPanel from './RightPanel'

export default function Layout() {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100">
      {/* Background decor */}
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-indigo-600/5 blur-[150px] rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-violet-600/3 blur-[120px] rounded-full translate-x-1/3 translate-y-1/3 pointer-events-none" />

      <div className="max-w-[1440px] mx-auto flex min-h-screen relative">
        <Sidebar />

        <main className="flex-1 min-w-0 border-r border-zinc-800/50">
          <Outlet />
        </main>

        <RightPanel />
      </div>

      <MobileNav />

      {/* Spacer for mobile nav */}
      <div className="md:hidden h-20" />
    </div>
  )
}
