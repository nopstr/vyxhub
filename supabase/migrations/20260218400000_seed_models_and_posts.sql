-- Seed 5 model profiles and 20 posts for testing
-- Uses fixed UUIDs so the migration is idempotent
-- post_type enum extended in prior migration (20260218350000)

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- 5 Model users
-- ============================================================

-- Luna Vyx
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES ('a1111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','luna@vyxhub.test',extensions.crypt('TestPass123!',extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}','{"username":"lunavyx","display_name":"Luna Vyx"}','authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
VALUES ('a1111111-1111-1111-1111-111111111111','a1111111-1111-1111-1111-111111111111','{"sub":"a1111111-1111-1111-1111-111111111111","email":"luna@vyxhub.test"}','email','a1111111-1111-1111-1111-111111111111',now(),now())
ON CONFLICT (provider_id, provider) DO NOTHING;

-- Jade Rivers
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES ('a2222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','jade@vyxhub.test',extensions.crypt('TestPass123!',extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}','{"username":"jaderivers","display_name":"Jade Rivers"}','authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
VALUES ('a2222222-2222-2222-2222-222222222222','a2222222-2222-2222-2222-222222222222','{"sub":"a2222222-2222-2222-2222-222222222222","email":"jade@vyxhub.test"}','email','a2222222-2222-2222-2222-222222222222',now(),now())
ON CONFLICT (provider_id, provider) DO NOTHING;

-- Marcus Steel
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES ('a3333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','marcus@vyxhub.test',extensions.crypt('TestPass123!',extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}','{"username":"marcussteel","display_name":"Marcus Steel"}','authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
VALUES ('a3333333-3333-3333-3333-333333333333','a3333333-3333-3333-3333-333333333333','{"sub":"a3333333-3333-3333-3333-333333333333","email":"marcus@vyxhub.test"}','email','a3333333-3333-3333-3333-333333333333',now(),now())
ON CONFLICT (provider_id, provider) DO NOTHING;

-- Ember & Cole
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES ('a4444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','embercole@vyxhub.test',extensions.crypt('TestPass123!',extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}','{"username":"embercole","display_name":"Ember & Cole"}','authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
VALUES ('a4444444-4444-4444-4444-444444444444','a4444444-4444-4444-4444-444444444444','{"sub":"a4444444-4444-4444-4444-444444444444","email":"embercole@vyxhub.test"}','email','a4444444-4444-4444-4444-444444444444',now(),now())
ON CONFLICT (provider_id, provider) DO NOTHING;

-- Sky Noir
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES ('a5555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-000000000000','sky@vyxhub.test',extensions.crypt('TestPass123!',extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}','{"username":"skynoir","display_name":"Sky Noir"}','authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
VALUES ('a5555555-5555-5555-5555-555555555555','a5555555-5555-5555-5555-555555555555','{"sub":"a5555555-5555-5555-5555-555555555555","email":"sky@vyxhub.test"}','email','a5555555-5555-5555-5555-555555555555',now(),now())
ON CONFLICT (provider_id, provider) DO NOTHING;

-- ============================================================
-- Update profiles (created by signup trigger)
-- ============================================================

UPDATE public.profiles SET
  display_name = 'Luna Vyx', username = 'lunavyx',
  bio = E'✨ Fitness model & cosplay enthusiast 🎮\nDaily posts • Custom content available\n🔥 Top 1% creator\n📍 Los Angeles, CA',
  is_creator = true, is_verified = true, subscription_price = 12.99,
  creator_category = 'female', tags = ARRAY['fitness','cosplay','lingerie','lifestyle'],
  location = 'Los Angeles, CA', website_url = 'https://lunavyx.com',
  welcome_message = 'Hey babe! Thanks for subscribing 💕 Check my pinned post for my content schedule!',
  is_accepting_customs = true, custom_request_price = 35, show_activity_status = true, watermark_enabled = true,
  follower_count = 15420, following_count = 342, subscriber_count = 2840,
  avatar_url = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop&crop=face',
  banner_url = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=400&fit=crop'
WHERE id = 'a1111111-1111-1111-1111-111111111111';

UPDATE public.profiles SET
  display_name = 'Jade Rivers', username = 'jaderivers',
  bio = E'🌿 Nature lover & free spirit\nArtistic nudes • Behind the scenes\n💎 Premium content daily\nDM me for collabs',
  is_creator = true, is_verified = true, subscription_price = 9.99,
  creator_category = 'female', tags = ARRAY['artistic','nature','photography','beauty'],
  location = 'Portland, OR',
  welcome_message = 'Welcome to my world! 🌿 I post new content every single day. Enjoy!',
  is_accepting_customs = true, custom_request_price = 50, show_activity_status = true, watermark_enabled = false,
  follower_count = 8760, following_count = 198, subscriber_count = 1540,
  avatar_url = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&crop=face',
  banner_url = 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200&h=400&fit=crop'
WHERE id = 'a2222222-2222-2222-2222-222222222222';

UPDATE public.profiles SET
  display_name = 'Marcus Steel', username = 'marcussteel',
  bio = E'💪 Fitness coach & model\nWorkout routines • Physique updates\n🏆 IFBB competitor\n📧 Business: marcus@steel.fit',
  is_creator = true, is_verified = true, subscription_price = 7.99,
  creator_category = 'male', tags = ARRAY['fitness','bodybuilding','workout','motivation'],
  location = 'Miami, FL', website_url = 'https://marcussteel.fit',
  welcome_message = 'Yo! Welcome aboard 💪 Check out my workout plans in the pinned post.',
  is_accepting_customs = true, custom_request_price = 25, show_activity_status = true, watermark_enabled = false,
  follower_count = 22100, following_count = 510, subscriber_count = 3200,
  avatar_url = 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop&crop=face',
  banner_url = 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&h=400&fit=crop'
WHERE id = 'a3333333-3333-3333-3333-333333333333';

UPDATE public.profiles SET
  display_name = 'Ember & Cole', username = 'embercole',
  bio = E'🔥 Couple content creators\nReal relationship, real content\n💑 Together 4 years\n📸 New sets every weekend',
  is_creator = true, is_verified = false, subscription_price = 14.99,
  creator_category = 'couple', tags = ARRAY['couple','romance','lifestyle','travel'],
  location = 'Austin, TX',
  welcome_message = 'Hey there! Welcome to our page 🔥 We post new couple content every weekend!',
  is_accepting_customs = true, custom_request_price = 75, show_activity_status = true, watermark_enabled = true,
  follower_count = 5430, following_count = 267, subscriber_count = 980,
  avatar_url = 'https://images.unsplash.com/photo-1522556189639-b150ed9c4330?w=400&h=400&fit=crop&crop=face',
  banner_url = 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200&h=400&fit=crop'
WHERE id = 'a4444444-4444-4444-4444-444444444444';

UPDATE public.profiles SET
  display_name = 'Sky Noir', username = 'skynoir',
  bio = E'🖤 Alternative model & artist\nGothic aesthetics • Dark art\n🎨 Every photo is a story\n🌙 Nocturnal creature',
  is_creator = true, is_verified = true, subscription_price = 11.99,
  creator_category = 'nonbinary', tags = ARRAY['alternative','gothic','art','photography','tattoos'],
  location = 'Berlin, Germany', amazon_wishlist_url = 'https://amazon.com/wishlist/skynoir',
  welcome_message = 'Welcome to the dark side 🖤 New art drops every week.',
  is_accepting_customs = false, show_activity_status = false, watermark_enabled = true,
  geoblocking_regions = ARRAY['Russia','China'],
  follower_count = 11200, following_count = 445, subscriber_count = 1870,
  avatar_url = 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=400&fit=crop&crop=face',
  banner_url = 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=1200&h=400&fit=crop'
WHERE id = 'a5555555-5555-5555-5555-555555555555';

-- ============================================================
-- 20 Posts (mixed types and visibilities)
-- ============================================================

-- Abbreviations:
--   L = a1111111... (Luna)
--   J = a2222222... (Jade)
--   M = a3333333... (Marcus)
--   E = a4444444... (EmberCole)
--   S = a5555555... (Sky)

-- Post 1: Luna - public text+image
INSERT INTO public.posts (id, author_id, content, post_type, visibility, like_count, comment_count, created_at)
VALUES ('b0000001-0001-0001-0001-000000000001','a1111111-1111-1111-1111-111111111111',
  E'Good morning everyone! ☀️ Starting the day with a sunrise yoga session. Nothing beats that golden hour glow 🧘‍♀️✨\n\nWho else is an early bird?',
  'post','public',342,48,now()-interval '2 hours') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview)
VALUES ('c0000001-0001-0001-0001-000000000001','b0000001-0001-0001-0001-000000000001','a1111111-1111-1111-1111-111111111111',
  'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=600&fit=crop','image',0,false) ON CONFLICT (id) DO NOTHING;

-- Post 2: Luna - subscribers only
INSERT INTO public.posts (id, author_id, content, post_type, visibility, like_count, comment_count, created_at)
VALUES ('b0000002-0002-0002-0002-000000000002','a1111111-1111-1111-1111-111111111111',
  E'🔥 New lingerie try-on! Which one is your favorite? Let me know in the comments 👇\n\n#exclusive #subscribers',
  'post','subscribers_only',856,124,now()-interval '5 hours') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview) VALUES
  ('c0000002-0001-0001-0001-000000000001','b0000002-0002-0002-0002-000000000002','a1111111-1111-1111-1111-111111111111','https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&h=1000&fit=crop','image',0,false),
  ('c0000002-0002-0002-0002-000000000002','b0000002-0002-0002-0002-000000000002','a1111111-1111-1111-1111-111111111111','https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=800&h=1000&fit=crop','image',1,false)
ON CONFLICT (id) DO NOTHING;

-- Post 3: Luna - PPV set
INSERT INTO public.posts (id, author_id, content, post_type, visibility, price, like_count, comment_count, created_at)
VALUES ('b0000003-0003-0003-0003-000000000003','a1111111-1111-1111-1111-111111111111',
  E'🎮 My new cosplay set is HERE! 15 exclusive photos from my latest shoot. You won''t want to miss this one 💫',
  'set','public',8.99,445,67,now()-interval '1 day') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview) VALUES
  ('c0000003-0001-0001-0001-000000000001','b0000003-0003-0003-0003-000000000003','a1111111-1111-1111-1111-111111111111','https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&h=600&fit=crop','image',0,true),
  ('c0000003-0002-0002-0002-000000000002','b0000003-0003-0003-0003-000000000003','a1111111-1111-1111-1111-111111111111','https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=600&fit=crop','image',1,true),
  ('c0000003-0003-0003-0003-000000000003','b0000003-0003-0003-0003-000000000003','a1111111-1111-1111-1111-111111111111','https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=600&h=600&fit=crop','image',2,false),
  ('c0000003-0004-0004-0004-000000000004','b0000003-0003-0003-0003-000000000003','a1111111-1111-1111-1111-111111111111','https://images.unsplash.com/photo-1496440737103-cd596325d314?w=600&h=600&fit=crop','image',3,false),
  ('c0000003-0005-0005-0005-000000000005','b0000003-0003-0003-0003-000000000003','a1111111-1111-1111-1111-111111111111','https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&h=600&fit=crop','image',4,false)
ON CONFLICT (id) DO NOTHING;

-- Post 4: Luna - subscribers only video
INSERT INTO public.posts (id, author_id, content, post_type, visibility, like_count, comment_count, created_at)
VALUES ('b0000004-0004-0004-0004-000000000004','a1111111-1111-1111-1111-111111111111',
  E'🏋️‍♀️ Full workout routine video! 30 min glute & core session. Follow along with me!',
  'video','subscribers_only',623,89,now()-interval '2 days') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview)
VALUES ('c0000004-0001-0001-0001-000000000001','b0000004-0004-0004-0004-000000000004','a1111111-1111-1111-1111-111111111111',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4','video',0,false) ON CONFLICT (id) DO NOTHING;

-- Post 5: Jade - public nature photo
INSERT INTO public.posts (id, author_id, content, post_type, visibility, like_count, comment_count, created_at)
VALUES ('b0000005-0005-0005-0005-000000000005','a2222222-2222-2222-2222-222222222222',
  E'Found the most magical forest clearing today 🌿🍃 Nature is the best studio. No filter needed.\n\nShould I do more outdoor shoots?',
  'post','public',567,72,now()-interval '3 hours') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview) VALUES
  ('c0000005-0001-0001-0001-000000000001','b0000005-0005-0005-0005-000000000005','a2222222-2222-2222-2222-222222222222','https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&h=600&fit=crop','image',0,false),
  ('c0000005-0002-0002-0002-000000000002','b0000005-0005-0005-0005-000000000005','a2222222-2222-2222-2222-222222222222','https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&h=600&fit=crop','image',1,false)
ON CONFLICT (id) DO NOTHING;

-- Post 6: Jade - subscribers only artistic set
INSERT INTO public.posts (id, author_id, content, post_type, visibility, like_count, comment_count, created_at)
VALUES ('b0000006-0006-0006-0006-000000000006','a2222222-2222-2222-2222-222222222222',
  E'🎨 "Golden Hour" - my latest artistic series. 12 photos shot at sunset by the river. This one is special to me 💛',
  'set','subscribers_only',892,134,now()-interval '8 hours') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview) VALUES
  ('c0000006-0001-0001-0001-000000000001','b0000006-0006-0006-0006-000000000006','a2222222-2222-2222-2222-222222222222','https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=600&fit=crop','image',0,true),
  ('c0000006-0002-0002-0002-000000000002','b0000006-0006-0006-0006-000000000006','a2222222-2222-2222-2222-222222222222','https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=600&h=600&fit=crop','image',1,true),
  ('c0000006-0003-0003-0003-000000000003','b0000006-0006-0006-0006-000000000006','a2222222-2222-2222-2222-222222222222','https://images.unsplash.com/photo-1524638431109-93d95c968f03?w=600&h=600&fit=crop','image',2,false),
  ('c0000006-0004-0004-0004-000000000004','b0000006-0006-0006-0006-000000000006','a2222222-2222-2222-2222-222222222222','https://images.unsplash.com/photo-1504703395950-b89145a5425b?w=600&h=600&fit=crop','image',3,false)
ON CONFLICT (id) DO NOTHING;

-- Post 7: Jade - PPV video
INSERT INTO public.posts (id, author_id, content, post_type, visibility, price, like_count, comment_count, created_at)
VALUES ('b0000007-0007-0007-0007-000000000007','a2222222-2222-2222-2222-222222222222',
  E'🎬 Behind the scenes of my latest photoshoot! See the full creative process from start to finish 🌸',
  'video','public',5.99,334,45,now()-interval '1 day 4 hours') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview)
VALUES ('c0000007-0001-0001-0001-000000000001','b0000007-0007-0007-0007-000000000007','a2222222-2222-2222-2222-222222222222',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4','video',0,false) ON CONFLICT (id) DO NOTHING;

-- Post 8: Jade - public text-only
INSERT INTO public.posts (id, author_id, content, post_type, visibility, like_count, comment_count, created_at)
VALUES ('b0000008-0008-0008-0008-000000000008','a2222222-2222-2222-2222-222222222222',
  E'Just booked my flight to Bali for next month''s shoot! 🌴 Who wants to see tropical content? Drop a 🔥 if you''re excited!\n\nAlso taking custom requests for the trip - DM me!',
  'post','public',245,89,now()-interval '6 hours') ON CONFLICT (id) DO NOTHING;

-- Post 9: Marcus - public gym post
INSERT INTO public.posts (id, author_id, content, post_type, visibility, like_count, comment_count, created_at)
VALUES ('b0000009-0009-0009-0009-000000000009','a3333333-3333-3333-3333-333333333333',
  E'Chest day is the best day 💪🔥\n\nNew PR: 315lb bench press! Hard work pays off.\n\nFull workout breakdown in the comments 👇',
  'post','public',1243,267,now()-interval '4 hours') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview)
VALUES ('c0000009-0001-0001-0001-000000000001','b0000009-0009-0009-0009-000000000009','a3333333-3333-3333-3333-333333333333',
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&h=600&fit=crop','image',0,false) ON CONFLICT (id) DO NOTHING;

-- Post 10: Marcus - subscribers only physique update
INSERT INTO public.posts (id, author_id, content, post_type, visibility, like_count, comment_count, created_at)
VALUES ('b0000010-0010-0010-0010-000000000010','a3333333-3333-3333-3333-333333333333',
  E'Monthly physique update! 📸 Down to 8% body fat for competition prep. 12 weeks out.\n\nSubscribers get my full meal plan + training split.',
  'post','subscribers_only',987,156,now()-interval '12 hours') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview) VALUES
  ('c0000010-0001-0001-0001-000000000001','b0000010-0010-0010-0010-000000000010','a3333333-3333-3333-3333-333333333333','https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800&h=1000&fit=crop','image',0,false),
  ('c0000010-0002-0002-0002-000000000002','b0000010-0010-0010-0010-000000000010','a3333333-3333-3333-3333-333333333333','https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&h=1000&fit=crop','image',1,false)
ON CONFLICT (id) DO NOTHING;

-- Post 11: Marcus - PPV workout video
INSERT INTO public.posts (id, author_id, content, post_type, visibility, price, like_count, comment_count, created_at)
VALUES ('b0000011-0011-0011-0011-000000000011','a3333333-3333-3333-3333-333333333333',
  E'🎬 FULL 45-minute Push/Pull/Legs routine! This is the exact program that got me to the IFBB stage. No BS, just results.',
  'video','public',4.99,567,78,now()-interval '2 days 3 hours') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview)
VALUES ('c0000011-0001-0001-0001-000000000001','b0000011-0011-0011-0011-000000000011','a3333333-3333-3333-3333-333333333333',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4','video',0,false) ON CONFLICT (id) DO NOTHING;

-- Post 12: Marcus - public motivation (text only)
INSERT INTO public.posts (id, author_id, content, post_type, visibility, like_count, comment_count, created_at)
VALUES ('b0000012-0012-0012-0012-000000000012','a3333333-3333-3333-3333-333333333333',
  E'Remember: consistency beats intensity every single time. 🏆\n\nIt doesn''t matter if you have the "perfect" workout plan. What matters is showing up every single day.\n\n365 days of showing up > 30 days of going "hard"\n\nStay disciplined. 💪',
  'post','public',2156,312,now()-interval '1 day 8 hours') ON CONFLICT (id) DO NOTHING;

-- Post 13: EmberCole - public couple post
INSERT INTO public.posts (id, author_id, content, post_type, visibility, like_count, comment_count, created_at)
VALUES ('b0000013-0013-0013-0013-000000000013','a4444444-4444-4444-4444-444444444444',
  E'Date night turned into a whole photoshoot 😂📸 We can''t help ourselves!\n\n4 years together and still can''t keep our hands off each other 💕',
  'post','public',756,98,now()-interval '5 hours') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview) VALUES
  ('c0000013-0001-0001-0001-000000000001','b0000013-0013-0013-0013-000000000013','a4444444-4444-4444-4444-444444444444','https://images.unsplash.com/photo-1522556189639-b150ed9c4330?w=800&h=600&fit=crop','image',0,false),
  ('c0000013-0002-0002-0002-000000000002','b0000013-0013-0013-0013-000000000013','a4444444-4444-4444-4444-444444444444','https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=800&h=600&fit=crop','image',1,false)
ON CONFLICT (id) DO NOTHING;

-- Post 14: EmberCole - subscribers only set
INSERT INTO public.posts (id, author_id, content, post_type, visibility, like_count, comment_count, created_at)
VALUES ('b0000014-0014-0014-0014-000000000014','a4444444-4444-4444-4444-444444444444',
  E'🔥 Weekend getaway set! 20 photos from our cabin trip. Things got... heated 👀 Subscribers only!',
  'set','subscribers_only',1123,189,now()-interval '1 day') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview) VALUES
  ('c0000014-0001-0001-0001-000000000001','b0000014-0014-0014-0014-000000000014','a4444444-4444-4444-4444-444444444444','https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=600&h=600&fit=crop','image',0,true),
  ('c0000014-0002-0002-0002-000000000002','b0000014-0014-0014-0014-000000000014','a4444444-4444-4444-4444-444444444444','https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&h=600&fit=crop','image',1,true),
  ('c0000014-0003-0003-0003-000000000003','b0000014-0014-0014-0014-000000000014','a4444444-4444-4444-4444-444444444444','https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600&h=600&fit=crop','image',2,false),
  ('c0000014-0004-0004-0004-000000000004','b0000014-0014-0014-0014-000000000014','a4444444-4444-4444-4444-444444444444','https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&h=600&fit=crop','image',3,false),
  ('c0000014-0005-0005-0005-000000000005','b0000014-0014-0014-0014-000000000014','a4444444-4444-4444-4444-444444444444','https://images.unsplash.com/photo-1454391304352-2bf4678b1a7a?w=600&h=600&fit=crop','image',4,false)
ON CONFLICT (id) DO NOTHING;

-- Post 15: EmberCole - PPV video
INSERT INTO public.posts (id, author_id, content, post_type, visibility, price, like_count, comment_count, created_at)
VALUES ('b0000015-0015-0015-0015-000000000015','a4444444-4444-4444-4444-444444444444',
  E'Our most requested video is finally here! 🎬🔥 ''A Day in Our Life'' - 15 min uncut vlog showing everything.',
  'video','public',12.99,445,67,now()-interval '3 days') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview)
VALUES ('c0000015-0001-0001-0001-000000000001','b0000015-0015-0015-0015-000000000015','a4444444-4444-4444-4444-444444444444',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4','video',0,false) ON CONFLICT (id) DO NOTHING;

-- Post 16: EmberCole - public text-only Q&A
INSERT INTO public.posts (id, author_id, content, post_type, visibility, like_count, comment_count, created_at)
VALUES ('b0000016-0016-0016-0016-000000000016','a4444444-4444-4444-4444-444444444444',
  E'Q&A time! We get asked so many questions about our relationship and how we create content together. Drop your questions below and we''ll answer them in our next video! ❓💕\n\nNothing is off limits 😏',
  'post','public',389,234,now()-interval '2 days 6 hours') ON CONFLICT (id) DO NOTHING;

-- Post 17: Sky - public dark art post
INSERT INTO public.posts (id, author_id, content, post_type, visibility, like_count, comment_count, created_at)
VALUES ('b0000017-0017-0017-0017-000000000017','a5555555-5555-5555-5555-555555555555',
  E'🖤 "Shadows" - new photo series exploring light and darkness. Shot in an abandoned cathedral at midnight.\n\nArt is about feeling something, not understanding it.',
  'post','public',678,56,now()-interval '7 hours') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview) VALUES
  ('c0000017-0001-0001-0001-000000000001','b0000017-0017-0017-0017-000000000017','a5555555-5555-5555-5555-555555555555','https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=800&h=600&fit=crop','image',0,false),
  ('c0000017-0002-0002-0002-000000000002','b0000017-0017-0017-0017-000000000017','a5555555-5555-5555-5555-555555555555','https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=800&h=600&fit=crop','image',1,false),
  ('c0000017-0003-0003-0003-000000000003','b0000017-0017-0017-0017-000000000017','a5555555-5555-5555-5555-555555555555','https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=800&h=600&fit=crop','image',2,false)
ON CONFLICT (id) DO NOTHING;

-- Post 18: Sky - subscribers only tattoo set
INSERT INTO public.posts (id, author_id, content, post_type, visibility, like_count, comment_count, created_at)
VALUES ('b0000018-0018-0018-0018-000000000018','a5555555-5555-5555-5555-555555555555',
  E'🎨 Full tattoo showcase set. 18 close-up shots of every piece of ink on my body + the stories behind each one 🖋️',
  'set','subscribers_only',445,78,now()-interval '1 day 2 hours') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview) VALUES
  ('c0000018-0001-0001-0001-000000000001','b0000018-0018-0018-0018-000000000018','a5555555-5555-5555-5555-555555555555','https://images.unsplash.com/photo-1542727365-08154507b6f4?w=600&h=600&fit=crop','image',0,true),
  ('c0000018-0002-0002-0002-000000000002','b0000018-0018-0018-0018-000000000018','a5555555-5555-5555-5555-555555555555','https://images.unsplash.com/photo-1562962230-16e4623d36e6?w=600&h=600&fit=crop','image',1,true),
  ('c0000018-0003-0003-0003-000000000003','b0000018-0018-0018-0018-000000000018','a5555555-5555-5555-5555-555555555555','https://images.unsplash.com/photo-1611501275019-9b5cda994e8d?w=600&h=600&fit=crop','image',2,false),
  ('c0000018-0004-0004-0004-000000000004','b0000018-0018-0018-0018-000000000018','a5555555-5555-5555-5555-555555555555','https://images.unsplash.com/photo-1598371839696-5c5bb00bdc28?w=600&h=600&fit=crop','image',3,false)
ON CONFLICT (id) DO NOTHING;

-- Post 19: Sky - PPV art video
INSERT INTO public.posts (id, author_id, content, post_type, visibility, price, like_count, comment_count, created_at)
VALUES ('b0000019-0019-0019-0019-000000000019','a5555555-5555-5555-5555-555555555555',
  E'🎬 "Metamorphosis" - 10 min art film. Body paint transformation from start to finish. My most ambitious project yet.',
  'video','public',7.99,334,45,now()-interval '4 days') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.media (id, post_id, uploader_id, url, media_type, sort_order, is_preview)
VALUES ('c0000019-0001-0001-0001-000000000001','b0000019-0019-0019-0019-000000000019','a5555555-5555-5555-5555-555555555555',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4','video',0,false) ON CONFLICT (id) DO NOTHING;

-- Post 20: Sky - public text post
INSERT INTO public.posts (id, author_id, content, post_type, visibility, like_count, comment_count, created_at)
VALUES ('b0000020-0020-0020-0020-000000000020','a5555555-5555-5555-5555-555555555555',
  E'To all my fellow creatives: the algorithm doesn''t define your art. The numbers don''t define your worth. Create because you HAVE to, not because you want to go viral.\n\n🖤 Keep making weird, beautiful, uncomfortable things.\n\nNew collection dropping this Friday. Stay dark. 🌙',
  'post','public',1567,234,now()-interval '10 hours') ON CONFLICT (id) DO NOTHING;
