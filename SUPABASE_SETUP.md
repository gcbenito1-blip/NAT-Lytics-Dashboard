# Supabase Setup Guide

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project" and fill in the details
3. Wait for the project to be created (takes ~1 minute)

## 2. Get API Credentials

1. Go to **Settings** (gear icon) → **API**
2. Copy the following values:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon/public key** → `VITE_SUPABASE_ANON_KEY`

## 3. Create the Profiles Table

Go to **SQL Editor** and run this SQL:

```sql
-- Create profiles table
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  name TEXT,
  role TEXT CHECK (role IN ('teacher', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'name',
    COALESCE(new.raw_user_meta_data->>'role', 'teacher')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## 4. Create Admin Account

1. Go to **Authentication** → **Users**
2. Click "Add User" → "Create new user"
3. Enter admin credentials:
   - Email: `admin@school.com` (or your preferred admin email)
   - Password: Choose a strong password
   - Auto Confirm User: ✅ Check this
4. After creating, go to **Table Editor** → **profiles**
5. Verify the admin user appears with `role = 'admin'`

If the profile wasn't created automatically, insert it manually in SQL Editor:

```sql
INSERT INTO profiles (id, email, name, role)
SELECT id, email, 'Admin User', 'admin'
FROM auth.users
WHERE email = 'admin@school.com';
```

## 5. Configure Environment Variables

Create a `.env` file in your project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## 6. Test Authentication

1. Start the development server: `npm run dev`
2. Go to the signup page
3. Create a teacher account
4. Verify you can login and access the dashboard

## 7. Email Configuration (Optional)

For production, configure email templates:

1. Go to **Authentication** → **Email Templates**
2. Customize the confirmation and reset password emails
3. Configure SMTP settings under **Project Settings** → **Auth**

## Troubleshooting

### User can't sign up
- Check that the `handle_new_user()` trigger is created
- Verify RLS policies are in place

### Profile not created
- Run the trigger creation SQL again
- Check the Supabase logs for errors

### Can't login
- Verify email confirmation is disabled or user has confirmed
- Check that the password meets minimum requirements (6+ characters)

## Role Management

- **Teachers**: Can self-register through the signup form
- **Admins**: Must be created manually in Supabase dashboard
- To change a user's role, update the `role` field in the `profiles` table

## 8. Create Sessions Table

To enable the Home page session management feature, create the sessions table:

```sql
-- Create sessions table for predictive analytics sessions
CREATE TABLE sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  
  -- Store the uploaded dataset filename
  file_name TEXT,
  
  -- Store analysis summary (columns, row count, etc.)
  analysis_summary JSONB,
  
  -- Store prediction results
  predictions JSONB,
  
  -- Store feature importance data
  feature_importance JSONB,
  
  -- Statistics
  total_predictions INTEGER,
  passed_count INTEGER,
  failed_count INTEGER,
  pass_rate DECIMAL(5,2),
  average_score DECIMAL(10,2)
);

-- Enable Row Level Security
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
CREATE POLICY "Users can view own sessions" ON sessions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own sessions
CREATE POLICY "Users can create sessions" ON sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own sessions
CREATE POLICY "Users can update own sessions" ON sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own sessions
CREATE POLICY "Users can delete own sessions" ON sessions
  FOR DELETE USING (auth.uid() = user_id);
```

**Note:** If you need to store raw data for explanations, add this column:
```sql
ALTER TABLE sessions ADD COLUMN raw_data JSONB;
```
