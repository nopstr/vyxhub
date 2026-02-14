import React, { useState, useEffect } from 'react';
import { 
  Home, 
  Search, 
  Bell, 
  Mail, 
  User, 
  MoreHorizontal, 
  Lock, 
  Heart, 
  MessageCircle, 
  Repeat, 
  Share, 
  CheckCircle2,
  DollarSign,
  Zap,
  Flame,
  Star,
  Settings,
  PlusCircle,
  LayoutGrid,
  TrendingUp,
  ShieldCheck
} from 'lucide-react';

// --- Mock Data ---
const CREATORS = [
  {
    id: 1,
    name: "Sasha Blue",
    handle: "sashablue",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150",
    verified: true,
    bio: "Digital artist & lifestyle creator. Exclusive sets every Tuesday. ✨",
    followers: "124K",
    price: 9.99
  },
  {
    id: 2,
    name: "Jordan Knight",
    handle: "jknight_official",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150",
    verified: true,
    bio: "Fitness, fashion, and everything in between. Full sets in the vault. 🏋️‍♂️",
    followers: "89K",
    price: 14.99
  }
];

const POSTS = [
  {
    id: 1,
    creatorId: 1,
    content: "Just finished the new sunset series. Can't wait for you all to see the full set! Here is a little teaser... 🌅",
    timestamp: "2h",
    likes: 1240,
    comments: 85,
    reposts: 42,
    isLocked: false,
    media: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=800",
    type: "image"
  },
  {
    id: 2,
    creatorId: 1,
    content: "The Midnight Collection is now LIVE. 20+ 4K images and a 10min BTS video. Only for my VIP subscribers! 🖤",
    timestamp: "5h",
    likes: 3400,
    comments: 210,
    reposts: 112,
    isLocked: true,
    previewBlur: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&q=10&w=800",
    type: "set"
  }
];

// --- Components ---

const CommandItem = ({ icon: Icon, active = false, label }) => (
  <div className={`group relative flex items-center justify-center w-12 h-12 my-2 rounded-2xl cursor-pointer transition-all duration-300 ${
    active 
    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/40' 
    : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'
  }`}>
    <Icon size={22} />
    {/* Tooltip */}
    <div className="absolute left-16 px-3 py-1 bg-zinc-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
      {label}
    </div>
  </div>
);

const PostCard = ({ post, creator }) => {
  const [liked, setLiked] = useState(false);

  return (
    <div className="mb-6 bg-zinc-900/30 rounded-3xl border border-zinc-800/50 p-5 hover:border-zinc-700/50 transition-all">
      <div className="flex space-x-4">
        <img src={creator.avatar} alt={creator.name} className="w-14 h-14 rounded-2xl object-cover ring-2 ring-zinc-800" />
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="flex items-center space-x-1">
                <span className="font-bold text-zinc-100 text-lg">{creator.name}</span>
                {creator.verified && <ShieldCheck size={16} className="text-indigo-400 fill-indigo-400/10" />}
              </div>
              <span className="text-zinc-500 text-sm">@{creator.handle} · {post.timestamp}</span>
            </div>
            <button className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500">
              <MoreHorizontal size={20} />
            </button>
          </div>
          
          <p className="text-zinc-300 mb-4 leading-relaxed text-[15px]">{post.content}</p>
          
          <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 aspect-[4/3] flex items-center justify-center group">
            {post.isLocked ? (
              <>
                <img src={post.previewBlur} alt="Locked" className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-40 scale-110" />
                <div className="relative z-10 flex flex-col items-center text-center p-8 bg-black/60 backdrop-blur-xl rounded-[2.5rem] border border-white/5 mx-4 max-w-sm shadow-2xl">
                  <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center mb-6 rotate-3">
                    <Lock size={28} className="text-white" />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-2 tracking-tight">VIP ACCESS ONLY</h3>
                  <p className="text-zinc-400 text-sm mb-6 leading-relaxed">Join the inner circle of @{creator.handle} to reveal this exclusive set.</p>
                  <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center space-x-2 active:scale-95 shadow-lg shadow-indigo-600/20">
                    <Zap size={18} className="fill-current" />
                    <span>Unlock for ${creator.price}/mo</span>
                  </button>
                </div>
              </>
            ) : (
              <img src={post.media} alt="Post content" className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-700" />
            )}
          </div>

          <div className="flex items-center space-x-8 mt-5 px-2">
            <button onClick={() => setLiked(!liked)} className={`flex items-center space-x-2 group ${liked ? 'text-rose-500' : 'text-zinc-500 hover:text-rose-400'}`}>
              <div className={`p-2 rounded-xl transition-colors ${liked ? 'bg-rose-500/10' : 'group-hover:bg-rose-500/5'}`}>
                <Heart size={20} fill={liked ? "currentColor" : "none"} />
              </div>
              <span className="text-sm font-semibold">{post.likes + (liked ? 1 : 0)}</span>
            </button>
            <button className="flex items-center space-x-2 text-zinc-500 hover:text-indigo-400 group">
              <div className="p-2 rounded-xl group-hover:bg-indigo-500/5">
                <MessageCircle size={20} />
              </div>
              <span className="text-sm font-semibold">{post.comments}</span>
            </button>
            <button className="flex items-center space-x-2 text-zinc-500 hover:text-indigo-400 group">
              <div className="p-2 rounded-xl group-hover:bg-indigo-500/5">
                <Share size={20} />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('Explore');

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      
      {/* Background Decor */}
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-indigo-600/10 blur-[120px] rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-violet-600/5 blur-[100px] rounded-full translate-x-1/3 translate-y-1/3 pointer-events-none" />

      {/* Main Layout Container */}
      <div className="max-w-[1440px] mx-auto flex min-h-screen relative">
        
        {/* Unique Command Bar (Replaces Sidebar) */}
        <nav className="hidden md:flex flex-col items-center py-8 w-24 sticky top-0 h-screen z-50">
          <div className="mb-10">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-2xl shadow-white/10 group cursor-pointer active:scale-90 transition-transform">
              <Zap className="text-black fill-black" size={24} />
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center space-y-2 bg-zinc-900/40 backdrop-blur-md border border-white/5 rounded-[2rem] p-2 shadow-xl">
            <CommandItem icon={LayoutGrid} label="Feed" active={activeTab === 'Explore'} />
            <CommandItem icon={TrendingUp} label="Trending" />
            <CommandItem icon={Mail} label="Inbox" />
            <CommandItem icon={Star} label="Favorites" />
            <div className="w-8 h-px bg-zinc-800 my-2" />
            <CommandItem icon={Search} label="Search" />
            <CommandItem icon={PlusCircle} label="New Post" />
          </div>
          <div className="mt-auto flex flex-col items-center space-y-4">
             <CommandItem icon={Settings} label="Settings" />
          </div>
        </nav>

        {/* Content Area */}
        <main className="flex-1 min-w-0 px-4 md:px-8">
          
          {/* Top Navbar */}
          <header className="flex items-center justify-between py-6 sticky top-0 bg-[#050505]/80 backdrop-blur-md z-40">
            <div className="flex items-center space-x-6">
              <h1 className="text-3xl font-black tracking-tighter bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">VERVE</h1>
              <div className="hidden lg:flex items-center bg-zinc-900/50 border border-zinc-800 rounded-2xl px-4 py-2 w-80">
                <Search size={18} className="text-zinc-500 mr-2" />
                <input type="text" placeholder="Search creators..." className="bg-transparent border-none outline-none text-sm w-full text-zinc-300" />
              </div>
            </div>

            {/* Profile Bar - Top Right */}
            <div className="flex items-center space-x-4 bg-zinc-900/40 border border-white/5 p-1.5 rounded-2xl backdrop-blur-md">
              <div className="flex items-center px-4 space-x-4 border-r border-zinc-800 py-1">
                <div className="flex flex-col items-end">
                   <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Balance</span>
                   <span className="text-sm font-bold text-emerald-400">$1,240.50</span>
                </div>
                <div className="relative">
                  <Bell size={20} className="text-zinc-400 cursor-pointer hover:text-white transition-colors" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full border-2 border-black" />
                </div>
              </div>
              <div className="flex items-center space-x-3 pl-2 pr-4 cursor-pointer group">
                <div className="w-10 h-10 rounded-xl overflow-hidden ring-2 ring-zinc-800 group-hover:ring-indigo-500 transition-all">
                  <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100" alt="User" />
                </div>
                <div className="hidden sm:flex flex-col">
                  <span className="text-sm font-bold">Alex Rivera</span>
                  <span className="text-[10px] text-zinc-500 font-medium">PREMIUM MEMBER</span>
                </div>
              </div>
            </div>
          </header>

          {/* Stories/Carousel */}
          <div className="mb-10 flex space-x-5 overflow-x-auto no-scrollbar py-2">
            {CREATORS.map(creator => (
              <div key={creator.id} className="flex-shrink-0 group cursor-pointer">
                <div className="w-20 h-20 rounded-[2rem] p-1 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 group-hover:scale-105 transition-transform duration-500">
                  <div className="w-full h-full rounded-[1.8rem] bg-black p-1">
                    <img src={creator.avatar} className="w-full h-full rounded-[1.6rem] object-cover" alt="" />
                  </div>
                </div>
                <p className="text-center text-[11px] font-bold text-zinc-500 mt-2 group-hover:text-white transition-colors uppercase tracking-tighter">@{creator.handle}</p>
              </div>
            ))}
            <div className="flex-shrink-0 flex flex-col items-center justify-center">
              <div className="w-20 h-20 rounded-[2rem] border-2 border-dashed border-zinc-800 flex items-center justify-center hover:border-zinc-500 transition-colors cursor-pointer group">
                <PlusCircle className="text-zinc-600 group-hover:text-zinc-300" size={28} />
              </div>
              <span className="text-[11px] font-bold text-zinc-600 mt-2 uppercase">Add Story</span>
            </div>
          </div>

          <div className="flex flex-col max-w-2xl mx-auto">
            {POSTS.map(post => (
              <PostCard 
                key={post.id} 
                post={post} 
                creator={CREATORS.find(c => c.id === post.creatorId)} 
              />
            ))}
          </div>
        </main>

        {/* Right Stats/Discovery Panel */}
        <aside className="hidden lg:block w-80 pt-24 pl-6 pr-4 sticky top-0 h-screen overflow-y-auto no-scrollbar">
           <div className="space-y-8">
              <section>
                <div className="flex items-center justify-between mb-4 px-2">
                  <h3 className="font-black text-sm uppercase tracking-widest text-zinc-500">Live Now</h3>
                  <div className="flex items-center space-x-1">
                    <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold text-rose-500">24K WATCHING</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {CREATORS.slice(0, 2).map(creator => (
                    <div key={creator.id} className="group flex items-center p-3 rounded-2xl bg-zinc-900/20 border border-white/0 hover:border-white/5 hover:bg-zinc-900/40 transition-all cursor-pointer">
                      <div className="relative">
                        <img src={creator.avatar} className="w-11 h-11 rounded-xl object-cover grayscale group-hover:grayscale-0 transition-all" alt="" />
                        <div className="absolute -top-1 -right-1 bg-rose-600 text-[8px] font-black px-1 rounded uppercase border border-black">Live</div>
                      </div>
                      <div className="ml-3 flex-1">
                        <p className="text-sm font-bold text-zinc-200">{creator.name}</p>
                        <p className="text-xs text-zinc-500">Late night chill & chat</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-gradient-to-br from-indigo-900/20 to-transparent p-6 rounded-[2.5rem] border border-white/5">
                <Flame className="text-indigo-400 mb-4" />
                <h3 className="text-xl font-black mb-2 leading-tight">THE VERVE COLLECTIVE</h3>
                <p className="text-xs text-zinc-400 leading-relaxed mb-6">Gain access to global events, physical merch drops, and VIP support.</p>
                <button className="w-full py-3 bg-white text-black font-black text-[11px] rounded-xl uppercase tracking-widest hover:invert transition-all">
                  Apply for Membership
                </button>
              </section>
           </div>
        </aside>

      </div>

      {/* Mobile Nav */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] bg-zinc-900/80 backdrop-blur-xl border border-white/10 p-3 rounded-[2.5rem] flex justify-around items-center z-50 shadow-2xl">
        <Home className="text-indigo-400" size={24} />
        <Search className="text-zinc-500" size={24} />
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-lg shadow-white/10 -mt-8">
          <PlusCircle className="text-black" size={24} />
        </div>
        <Mail className="text-zinc-500" size={24} />
        <User className="text-zinc-500" size={24} />
      </div>
    </div>
  );
}