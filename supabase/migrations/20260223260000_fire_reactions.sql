-- Change default reaction type to 'fire'
ALTER TABLE likes ALTER COLUMN reaction_type SET DEFAULT 'fire';

-- Update existing 'heart' reactions to 'fire'
UPDATE likes SET reaction_type = 'fire' WHERE reaction_type = 'heart';
