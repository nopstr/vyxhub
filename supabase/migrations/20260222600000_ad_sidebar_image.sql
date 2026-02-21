-- Add separate sidebar image URL for affiliate ads
-- Feed ads use image_url (600x400), sidebar ads use sidebar_image_url (300x250)
ALTER TABLE affiliate_ads ADD COLUMN IF NOT EXISTS sidebar_image_url TEXT;

-- Update the get_affiliate_ads RPC to return sidebar_image_url
CREATE OR REPLACE FUNCTION get_affiliate_ads(
  p_placement TEXT DEFAULT 'feed',
  p_limit INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  image_url TEXT,
  sidebar_image_url TEXT,
  link_url TEXT,
  placement TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.title, a.description, a.image_url, a.sidebar_image_url, a.link_url, a.placement
  FROM affiliate_ads a
  WHERE a.is_active = TRUE
    AND (a.placement = p_placement OR a.placement = 'both')
    AND (a.starts_at IS NULL OR a.starts_at <= NOW())
    AND (a.ends_at IS NULL OR a.ends_at > NOW())
  ORDER BY random()
  LIMIT p_limit;
END;
$$;
