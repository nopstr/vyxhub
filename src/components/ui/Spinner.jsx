export default function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <svg className={`animate-spin ${sizes[size]} text-red-500`} viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  )
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <p className="text-sm text-zinc-500 animate-pulse">Loading...</p>
      </div>
    </div>
  )
}

export function SkeletonPost() {
  return (
    <div className="mb-6 bg-zinc-900/30 rounded-3xl border border-zinc-800/50 p-5 animate-pulse">
      <div className="flex space-x-4">
        <div className="w-14 h-14 rounded-2xl bg-zinc-800" />
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-4 w-28 bg-zinc-800 rounded" />
            <div className="h-3 w-20 bg-zinc-800/60 rounded" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full bg-zinc-800/60 rounded" />
            <div className="h-3 w-3/4 bg-zinc-800/60 rounded" />
          </div>
          <div className="h-52 w-full bg-zinc-800 rounded-2xl" />
          <div className="flex gap-8 pt-2">
            <div className="h-4 w-12 bg-zinc-800/60 rounded" />
            <div className="h-4 w-12 bg-zinc-800/60 rounded" />
            <div className="h-4 w-12 bg-zinc-800/60 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function SkeletonProfile() {
  return (
    <div className="animate-pulse">
      <div className="h-48 bg-zinc-800 rounded-2xl mb-4" />
      <div className="flex items-end -mt-16 ml-6 gap-4">
        <div className="w-28 h-28 rounded-3xl bg-zinc-700 border-4 border-zinc-900" />
        <div className="space-y-2 pb-2">
          <div className="h-5 w-32 bg-zinc-800 rounded" />
          <div className="h-3 w-24 bg-zinc-800/60 rounded" />
        </div>
      </div>
    </div>
  )
}
