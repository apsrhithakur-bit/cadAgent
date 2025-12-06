-- Create prompt_history table to store successful and failed prompts
CREATE TABLE IF NOT EXISTS prompt_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  prompt TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  source TEXT, -- 'ai', 'rules', 'original', etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_prompt_history_user_id ON prompt_history(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_history_success ON prompt_history(success);
CREATE INDEX IF NOT EXISTS idx_prompt_history_created_at ON prompt_history(created_at);
CREATE INDEX IF NOT EXISTS idx_prompt_history_user_success ON prompt_history(user_id, success);

-- Enable Row Level Security
ALTER TABLE prompt_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own prompt history" ON prompt_history;
DROP POLICY IF EXISTS "Users can insert their own prompt history" ON prompt_history;
DROP POLICY IF EXISTS "Users can update their own prompt history" ON prompt_history;
DROP POLICY IF EXISTS "Users can delete their own prompt history" ON prompt_history;

-- Create RLS policies
CREATE POLICY "Users can view their own prompt history" ON prompt_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own prompt history" ON prompt_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own prompt history" ON prompt_history
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own prompt history" ON prompt_history
  FOR DELETE USING (auth.uid() = user_id);

-- Add comment
COMMENT ON TABLE prompt_history IS 'Stores CAD generation prompt history for learning and improvement';