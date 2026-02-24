import { Outlet, Link } from 'react-router-dom'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'
import RightPanel from './RightPanel'

export default function Layout() {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 safe-area-top">
      {/* Background decor */}
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-red-600/5 blur-[150px] rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-orange-600/3 blur-[120px] rounded-full translate-x-1/3 translate-y-1/3 pointer-events-none" />

      <div className="max-w-[1440px] mx-auto flex h-screen overflow-hidden relative">
        <Sidebar />

        <main className="flex-1 min-w-0 border-r border-zinc-800/50 h-screen overflow-y-auto custom-scrollbar">
          <Outlet />

          {/* Legal footer */}
          <footer className="border-t border-zinc-800/50 px-5 py-6 mt-8">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-600">
              <Link to="/terms" className="hover:text-zinc-400 transition-colors">Terms</Link>
              <Link to="/privacy" className="hover:text-zinc-400 transition-colors">Privacy</Link>
              <Link to="/2257" className="hover:text-zinc-400 transition-colors">2257 Compliance</Link>
              <span className="ml-auto">&copy; {new Date().getFullYear()} Heatly</span>
            </div>
          </footer>
        </main>

        <RightPanel />
      </div>

      <MobileNav />

      {/* Spacer for mobile nav */}
      <div className="md:hidden h-20" />
    </div>
  )
}
