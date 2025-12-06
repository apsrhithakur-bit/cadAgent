-- Add patent_searches_used column to usage_tracking table
-- This column tracks the number of patent searches used by each user per month

ALTER TABLE usage_tracking 
ADD COLUMN IF NOT EXISTS patent_searches_used INTEGER DEFAULT 0;

-- Update any existing records to have 0 patent searches used
UPDATE usage_tracking 
SET patent_searches_used = 0 
WHERE patent_searches_used IS NULL;

-- Add a check constraint to ensure patent_searches_used is non-negative
ALTER TABLE usage_tracking 
ADD CONSTRAINT check_patent_searches_non_negative 
CHECK (patent_searches_used >= 0);