-- Drop the old FLOAT version of update_user_affinity to resolve ambiguous function call error
DROP FUNCTION IF EXISTS update_user_affinity(UUID, UUID, FLOAT);
