# VyxHub Platform Architecture

## 🎯 Overview
VyxHub is an adult content platform similar to OnlyFans with Twitter-like social features.

## 🔗 Service URLs
- **Production Site**: https://vyxhub.vercel.app
- **GitHub Repo**: https://github.com/nopstr/vyxhub
- **Supabase Dashboard**: https://supabase.com/dashboard/project/agoekmugbrswrdjscwek
- **Vercel Dashboard**: https://vercel.com/nopstrs-projects/vyxhub

## 🛠 Tech Stack (Free Tier Optimized)

### Frontend
- **Framework**: React 19 + Vite 7
- **Styling**: Tailwind CSS 4
- **Icons**: Lucide React
- **Hosting**: Vercel (Free tier: 100GB bandwidth/month)

### Backend & Database
- **Database**: Supabase PostgreSQL (Free tier: 500MB, 50k MAU)
- **Auth**: Supabase Auth (Email, Google, Twitter OAuth)
- **Storage**: Supabase Storage (1GB free)
- **Realtime**: Supabase Realtime (websockets for live features)

### Future Services (When Revenue Comes)
- **Payments**: Stripe Connect (for creator payouts)
- **Video Transcoding**: Cloudflare Stream or Mux (for reels/livestreams)
- **CDN**: Cloudflare (for media delivery)
- **Livestreaming**: Cloudflare Stream or OBS + custom RTMP

## 📊 Database Schema

### Core Tables
- `profiles` - User profiles with creator options
- `posts` - Content (posts, reels, stories)
- `media` - Photos/videos attached to posts
- `follows` - Social graph
- `subscriptions` - Paid subscriptions to creators
- `likes`, `comments`, `bookmarks` - Engagement
- `messages`, `conversations` - Direct messages
- `livestreams` - Live streaming data
- `transactions` - Payment tracking
- `notifications` - User notifications

### Visibility Levels
- `public` - Anyone can view
- `followers_only` - Only followers can view
- `subscribers_only` - Only paying subscribers can view

## 🚀 Key Features

### Phase 1 (MVP)
- [x] User authentication
- [ ] Profile creation/editing
- [ ] Post creation (text, photos)
- [ ] Feed (home, explore)
- [ ] Follow system
- [ ] Like/comment

### Phase 2 (Monetization)
- [ ] Creator subscriptions
- [ ] PPV posts/messages
- [ ] Tipping
- [ ] Stripe integration

### Phase 3 (Advanced)
- [ ] Reels (short videos)
- [ ] Stories (24h content)
- [ ] Livestreaming
- [ ] DMs with media

## 💰 Free Tier Limits

| Service | Free Limit | Notes |
|---------|-----------|-------|
| Vercel | 100GB bandwidth | Generous for starting |
| Supabase DB | 500MB | Enough for MVP |
| Supabase Auth | 50k MAU | Very generous |
| Supabase Storage | 1GB | Will need upgrade for media |
| Supabase Realtime | Included | Free with project |

## 📝 Environment Variables
```
VITE_SUPABASE_URL=https://agoekmugbrswrdjscwek.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 🎬 Livestreaming Strategy

For free tier, we'll use:
1. **OBS/Streamlabs** - Users stream via RTMP
2. **Supabase Edge Functions** - Validate stream keys
3. **HLS.js player** - For playback

When monetizing:
- **Cloudflare Stream** - $5/1000 min delivered
- **Mux** - Pay-as-you-go pricing

## 📱 Storage Strategy

For images:
- Compress client-side before upload
- Store in Supabase Storage
- Generate blur hashes for locked content preview

For videos:
- Client-side compression (ffmpeg.wasm)
- Store short clips (<30s) in Supabase
- Longer content needs external service

## 🔐 Security
- Row Level Security (RLS) on all tables
- Content visibility enforced at database level
- Age verification required for creator accounts
