import { Link } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'
import Button from '../components/ui/Button'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-8xl font-black text-indigo-500/20 mb-2">404</h1>
        <h2 className="text-2xl font-bold text-white mb-3">Page not found</h2>
        <p className="text-zinc-400 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="ghost" onClick={() => window.history.back()}>
            <ArrowLeft size={16} className="mr-2" />
            Go back
          </Button>
          <Link to="/">
            <Button>
              <Home size={16} className="mr-2" />
              Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
