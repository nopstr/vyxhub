-- Add accepts_tips column to profiles for creators to toggle tip button visibility
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accepts_tips BOOLEAN DEFAULT TRUE;
