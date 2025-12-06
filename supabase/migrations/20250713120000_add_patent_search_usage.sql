-- Add patent search usage tracking to the usage_tracking table
-- This migration adds a new column to track patent search usage per user per month

-- Add patent_searches_used column to usage_tracking table
ALTER TABLE usage_tracking 
ADD COLUMN IF NOT EXISTS patent_searches_used INTEGER DEFAULT 0;

-- Add comment to document the new column
COMMENT ON COLUMN usage_tracking.patent_searches_used IS 'Number of patent searches used in this billing period';

-- Update existing records to have 0 patent searches used
UPDATE usage_tracking 
SET patent_searches_used = 0 
WHERE patent_searches_used IS NULL;

-- Ensure the column is not null going forward
ALTER TABLE usage_tracking 
ALTER COLUMN patent_searches_used SET NOT NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_usage_tracking_patent_searches 
ON usage_tracking(user_id, patent_searches_used);

-- Update the usage tracking function to include patent searches in the monthly reset
-- This ensures that when a new month starts, patent searches are also reset to 0
CREATE OR REPLACE FUNCTION create_monthly_usage_record()
RETURNS TRIGGER AS $$
BEGIN
    -- This function is called when a new user is created or when checking usage
    -- It ensures there's always a current month usage record
    INSERT INTO usage_tracking (
        user_id,
        designs_used,
        refine_chats_used,
        patent_searches_used,
        period_start,
        period_end
    ) VALUES (
        NEW.user_id,
        0,
        0,
        0,
        DATE_TRUNC('month', NOW()),
        (DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second')
    )
    ON CONFLICT (user_id, period_start) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;