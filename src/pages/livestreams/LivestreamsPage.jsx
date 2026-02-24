import { useState } from 'react'
import { Video, Users, PlayCircle } from 'lucide-react'

export default function LivestreamsPage() {
  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-red-600/10 rounded-2xl flex items-center justify-center">
          <Video className="text-red-500" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Livestreams</h1>
          <p className="text-zinc-400">Watch your favorite creators live</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-20 text-center bg-zinc-900/30 rounded-3xl border border-zinc-800/50">
        <div className="w-20 h-20 bg-zinc-800/50 rounded-full flex items-center justify-center mb-6">
          <PlayCircle size={40} className="text-zinc-600" />
        </div>
        <h2 className="text-xl font-bold mb-2">No active livestreams</h2>
        <p className="text-zinc-400 max-w-md">
          There are currently no creators live. Check back later or follow more creators to get notified when they go live!
        </p>
      </div>
    </div>
  )
}
