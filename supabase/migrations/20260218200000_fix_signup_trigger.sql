-- Fix signup trigger: handle_new_user fails with 500 on signup
-- Root cause: SECURITY DEFINER function needs explicit search_path and
-- profiles table needs an INSERT policy for the auth trigger context

-- 1. Add INSERT policy for profiles (the trigger runs in auth context)
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 2. Recreate handle_new_user with explicit search_path and schema references
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || LEFT(NEW.id::text, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'New User')
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- If username already taken, append random suffix
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (
      NEW.id,
      'user_' || LEFT(NEW.id::text, 8) || '_' || floor(random() * 1000)::text,
      COALESCE(NEW.raw_user_meta_data->>'display_name', 'New User')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Ensure trigger exists (recreate to use updated function)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
