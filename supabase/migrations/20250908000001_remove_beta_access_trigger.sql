-- Remove the problematic HTTP trigger and use frontend-based notifications instead
-- This fixes the "schema 'net' does not exist" error

-- Drop the trigger first
DROP TRIGGER IF EXISTS beta_access_request_notification_trigger ON beta_access_requests;

-- Drop the function
DROP FUNCTION IF EXISTS notify_beta_access_request();

-- Add comment explaining the new approach
COMMENT ON TABLE beta_access_requests IS 'Beta access requests table - email notifications are sent from frontend via Edge Function calls';