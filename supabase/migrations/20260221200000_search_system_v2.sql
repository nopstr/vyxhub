-- ============================================================================
-- SEARCH SYSTEM V2
-- Features: fuzzy search (pg_trgm), search history, unified search RPC,
--           autocomplete, advanced filters
-- ============================================================================

-- 1. Enable pg_trgm for fuzzy/typo-tolerant search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Add trigram indexes for fuzzy matching on profiles
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm ON profiles USING gin(username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm ON profiles USING gin(display_name gin_trgm_ops);

-- 3. Add trigram index on hashtags for fuzzy hashtag search
CREATE INDEX IF NOT EXISTS idx_hashtags_name_trgm ON hashtags USING gin(name gin_trgm_ops);

-- 4. Search history table
CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  result_type TEXT DEFAULT 'all', -- 'all', 'creators', 'posts', 'hashtags'
  result_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_search_history_user ON search_history(user_id, created_at DESC);
CREATE INDEX idx_search_history_query ON search_history USING gin(query gin_trgm_ops);

-- RLS
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own search history"
  ON search_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own search history"
  ON search_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own search history"
  ON search_history FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Save search query (deduplicates, max 20 per user)
CREATE OR REPLACE FUNCTION save_search_query(
  p_user_id UUID,
  p_query TEXT,
  p_result_type TEXT DEFAULT 'all',
  p_result_count INTEGER DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Delete existing same query to move it to top
  DELETE FROM search_history
  WHERE user_id = p_user_id AND lower(query) = lower(p_query);

  -- Insert new entry
  INSERT INTO search_history (user_id, query, result_type, result_count)
  VALUES (p_user_id, p_query, p_result_type, p_result_count);

  -- Keep only last 20
  DELETE FROM search_history
  WHERE id IN (
    SELECT id FROM search_history
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    OFFSET 20
  );
END;
$$;

-- 6. Clear search history
CREATE OR REPLACE FUNCTION clear_search_history(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM search_history WHERE user_id = p_user_id;
END;
$$;

-- 7. Autocomplete RPC — returns mixed results (profiles + hashtags + recent searches)
CREATE OR REPLACE FUNCTION search_autocomplete(
  p_user_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 8
)
RETURNS TABLE (
  item_type TEXT,        -- 'creator', 'hashtag', 'recent'
  item_id TEXT,
  label TEXT,
  sublabel TEXT,
  avatar_url TEXT,
  is_verified BOOLEAN,
  similarity_score REAL
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_query TEXT := lower(trim(p_query));
  v_each_limit INTEGER := GREATEST(2, p_limit / 3);
BEGIN
  IF length(v_query) < 1 THEN
    -- Return recent searches only
    RETURN QUERY
    SELECT
      'recent'::TEXT,
      sh.id::TEXT,
      sh.query,
      sh.result_type,
      NULL::TEXT,
      NULL::BOOLEAN,
      1.0::REAL
    FROM search_history sh
    WHERE sh.user_id = p_user_id
    ORDER BY sh.created_at DESC
    LIMIT p_limit;
    RETURN;
  END IF;

  -- Hashtag-specific search if starts with #
  IF v_query LIKE '#%' THEN
    v_query := substr(v_query, 2);
    RETURN QUERY
    SELECT
      'hashtag'::TEXT,
      h.id::TEXT,
      '#' || h.name,
      h.post_count || ' posts',
      NULL::TEXT,
      NULL::BOOLEAN,
      similarity(h.name, v_query)
    FROM hashtags h
    WHERE h.name % v_query OR h.name ILIKE v_query || '%'
    ORDER BY
      CASE WHEN h.name ILIKE v_query || '%' THEN 0 ELSE 1 END,
      similarity(h.name, v_query) DESC,
      h.post_count DESC
    LIMIT p_limit;
    RETURN;
  END IF;

  -- Mixed results: recent searches + creators + hashtags
  RETURN QUERY
  (
    -- Recent searches matching query
    SELECT
      'recent'::TEXT,
      sh.id::TEXT,
      sh.query,
      sh.result_type,
      NULL::TEXT,
      NULL::BOOLEAN,
      similarity(sh.query, v_query)
    FROM search_history sh
    WHERE sh.user_id = p_user_id
      AND (sh.query ILIKE '%' || v_query || '%' OR sh.query % v_query)
    ORDER BY sh.created_at DESC
    LIMIT v_each_limit
  )
  UNION ALL
  (
    -- Creator profiles (fuzzy match on username + display_name)
    SELECT
      'creator'::TEXT,
      p.id::TEXT,
      p.display_name,
      '@' || p.username,
      p.avatar_url,
      p.is_verified,
      GREATEST(
        similarity(p.username, v_query),
        similarity(p.display_name, v_query)
      )
    FROM profiles p
    WHERE p.is_creator = true
      AND (
        p.username % v_query
        OR p.display_name % v_query
        OR p.username ILIKE v_query || '%'
        OR p.display_name ILIKE '%' || v_query || '%'
      )
    ORDER BY
      CASE WHEN p.username ILIKE v_query || '%' THEN 0 ELSE 1 END,
      GREATEST(similarity(p.username, v_query), similarity(p.display_name, v_query)) DESC,
      p.follower_count DESC
    LIMIT v_each_limit
  )
  UNION ALL
  (
    -- Hashtags (fuzzy match)
    SELECT
      'hashtag'::TEXT,
      h.id::TEXT,
      '#' || h.name,
      h.post_count || ' posts',
      NULL::TEXT,
      NULL::BOOLEAN,
      similarity(h.name, v_query)
    FROM hashtags h
    WHERE h.name % v_query OR h.name ILIKE v_query || '%'
    ORDER BY
      CASE WHEN h.name ILIKE v_query || '%' THEN 0 ELSE 1 END,
      similarity(h.name, v_query) DESC,
      h.post_count DESC
    LIMIT v_each_limit
  )
  LIMIT p_limit;
END;
$$;

-- 8. Unified search RPC — full results with filters
CREATE OR REPLACE FUNCTION unified_search(
  p_user_id UUID,
  p_query TEXT,
  p_type TEXT DEFAULT 'all',        -- 'all', 'creators', 'posts', 'hashtags'
  p_sort TEXT DEFAULT 'relevance',  -- 'relevance', 'latest', 'popular'
  p_media_type TEXT DEFAULT NULL,   -- NULL, 'image', 'video', 'set'
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_verified_only BOOLEAN DEFAULT false,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  result_type TEXT,
  result_id UUID,
  -- Profile fields
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  bio TEXT,
  is_verified BOOLEAN,
  is_creator BOOLEAN,
  follower_count BIGINT,
  post_count BIGINT,
  subscription_price NUMERIC,
  -- Post fields
  post_content TEXT,
  post_type TEXT,
  post_visibility TEXT,
  post_author_id UUID,
  post_author_username TEXT,
  post_author_display_name TEXT,
  post_author_avatar TEXT,
  post_author_verified BOOLEAN,
  post_like_count BIGINT,
  post_comment_count BIGINT,
  post_created_at TIMESTAMPTZ,
  post_media_count INTEGER,
  -- Hashtag fields
  hashtag_name TEXT,
  hashtag_post_count BIGINT,
  -- Relevance
  relevance_score REAL,
  total_results BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_query TEXT := lower(trim(p_query));
  v_ts_query TSQUERY;
  v_total BIGINT := 0;
BEGIN
  -- Build tsquery for full-text search
  BEGIN
    v_ts_query := plainto_tsquery('english', v_query);
  EXCEPTION WHEN OTHERS THEN
    v_ts_query := NULL;
  END;

  -- CREATORS
  IF p_type IN ('all', 'creators') THEN
    RETURN QUERY
    WITH matched AS (
      SELECT
        p.id,
        p.username AS p_username,
        p.display_name AS p_display_name,
        p.avatar_url AS p_avatar,
        p.banner_url AS p_banner,
        p.bio AS p_bio,
        p.is_verified AS p_verified,
        p.is_creator AS p_is_creator,
        p.follower_count AS p_followers,
        p.post_count AS p_posts,
        p.subscription_price AS p_price,
        GREATEST(
          similarity(p.username, v_query),
          similarity(p.display_name, v_query)
        ) AS sim_score,
        COUNT(*) OVER() AS cnt
      FROM profiles p
      WHERE (
        p.username % v_query
        OR p.display_name % v_query
        OR p.username ILIKE '%' || v_query || '%'
        OR p.display_name ILIKE '%' || v_query || '%'
      )
      AND (NOT p_verified_only OR p.is_verified = true)
    )
    SELECT
      'creator'::TEXT,
      m.id,
      m.p_username,
      m.p_display_name,
      m.p_avatar,
      m.p_banner,
      m.p_bio,
      m.p_verified,
      m.p_is_creator,
      m.p_followers,
      m.p_posts,
      m.p_price,
      -- Post fields null
      NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::UUID,
      NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::BOOLEAN,
      NULL::BIGINT, NULL::BIGINT, NULL::TIMESTAMPTZ, NULL::INTEGER,
      -- Hashtag fields null
      NULL::TEXT, NULL::BIGINT,
      m.sim_score,
      m.cnt
    FROM matched m
    ORDER BY
      CASE p_sort
        WHEN 'popular' THEN -m.p_followers
        WHEN 'latest' THEN 0
        ELSE -m.sim_score::BIGINT
      END,
      CASE WHEN p_sort = 'popular' THEN -m.p_followers ELSE 0 END,
      m.sim_score DESC,
      m.p_followers DESC
    LIMIT p_limit OFFSET p_offset;
  END IF;

  -- POSTS
  IF p_type IN ('all', 'posts') THEN
    RETURN QUERY
    WITH matched_posts AS (
      SELECT
        po.id AS po_id,
        po.content AS po_content,
        po.post_type::TEXT AS po_type,
        po.visibility::TEXT AS po_vis,
        po.author_id AS po_author_id,
        pr.username AS pr_username,
        pr.display_name AS pr_display_name,
        pr.avatar_url AS pr_avatar,
        pr.is_verified AS pr_verified,
        po.like_count AS po_likes,
        po.comment_count AS po_comments,
        po.created_at AS po_created,
        (SELECT count(*)::INTEGER FROM media med WHERE med.post_id = po.id) AS po_media_count,
        CASE
          WHEN v_ts_query IS NOT NULL AND po.search_vector @@ v_ts_query
            THEN ts_rank(po.search_vector, v_ts_query)
          ELSE similarity(po.content, v_query) * 0.5
        END AS rel_score,
        COUNT(*) OVER() AS cnt
      FROM posts po
      JOIN profiles pr ON pr.id = po.author_id
      WHERE po.visibility = 'public'
        AND (
          (v_ts_query IS NOT NULL AND po.search_vector @@ v_ts_query)
          OR po.content ILIKE '%' || v_query || '%'
        )
        AND (p_media_type IS NULL OR po.post_type::TEXT = p_media_type)
        AND (p_date_from IS NULL OR po.created_at >= p_date_from)
        AND (p_date_to IS NULL OR po.created_at <= p_date_to)
        AND (NOT p_verified_only OR pr.is_verified = true)
    )
    SELECT
      'post'::TEXT,
      mp.po_id,
      -- Profile fields null
      NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::BOOLEAN, NULL::BOOLEAN, NULL::BIGINT, NULL::BIGINT, NULL::NUMERIC,
      -- Post fields
      mp.po_content,
      mp.po_type,
      mp.po_vis,
      mp.po_author_id,
      mp.pr_username,
      mp.pr_display_name,
      mp.pr_avatar,
      mp.pr_verified,
      mp.po_likes,
      mp.po_comments,
      mp.po_created,
      mp.po_media_count,
      -- Hashtag fields null
      NULL::TEXT, NULL::BIGINT,
      mp.rel_score,
      mp.cnt
    FROM matched_posts mp
    ORDER BY
      CASE p_sort
        WHEN 'latest' THEN extract(epoch FROM now() - mp.po_created) * -1
        WHEN 'popular' THEN -(mp.po_likes + mp.po_comments * 2)::DOUBLE PRECISION
        ELSE -mp.rel_score::DOUBLE PRECISION
      END
    LIMIT p_limit OFFSET p_offset;
  END IF;

  -- HASHTAGS
  IF p_type IN ('all', 'hashtags') THEN
    RETURN QUERY
    SELECT
      'hashtag'::TEXT,
      h.id,
      NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::BOOLEAN, NULL::BOOLEAN, NULL::BIGINT, NULL::BIGINT, NULL::NUMERIC,
      NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::UUID,
      NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::BOOLEAN,
      NULL::BIGINT, NULL::BIGINT, NULL::TIMESTAMPTZ, NULL::INTEGER,
      h.name,
      h.post_count,
      similarity(h.name, v_query),
      (COUNT(*) OVER())::BIGINT
    FROM hashtags h
    WHERE h.name % v_query
      OR h.name ILIKE '%' || v_query || '%'
    ORDER BY
      CASE WHEN h.name ILIKE v_query || '%' THEN 0 ELSE 1 END,
      similarity(h.name, v_query) DESC,
      h.post_count DESC
    LIMIT CASE WHEN p_type = 'all' THEN 5 ELSE p_limit END
    OFFSET CASE WHEN p_type = 'all' THEN 0 ELSE p_offset END;
  END IF;
END;
$$;

-- 9. Popular searches (anonymized, for suggestions to non-logged-in users)
CREATE OR REPLACE FUNCTION popular_searches(p_limit INTEGER DEFAULT 5)
RETURNS TABLE (query TEXT, search_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT lower(sh.query), count(*) AS search_count
  FROM search_history sh
  WHERE sh.created_at > now() - interval '7 days'
  GROUP BY lower(sh.query)
  HAVING count(*) >= 2
  ORDER BY search_count DESC
  LIMIT p_limit;
$$;
