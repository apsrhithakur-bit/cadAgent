-- Create trigger function to send email notifications for new beta access requests
CREATE OR REPLACE FUNCTION notify_beta_access_request()
RETURNS trigger AS $$
BEGIN
  -- Call the edge function to send email notification
  PERFORM
    net.http_post(
      url := 'https://xthmikzaolkfnucpoqyb.supabase.co/functions/v1/beta-access-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'record', to_jsonb(NEW),
        'type', TG_OP,
        'table', TG_TABLE_NAME
      )
    );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on beta_access_requests table
DROP TRIGGER IF EXISTS beta_access_request_notification_trigger ON beta_access_requests;

CREATE TRIGGER beta_access_request_notification_trigger
  AFTER INSERT ON beta_access_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_beta_access_request();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION notify_beta_access_request() TO service_role;

-- Add comments
COMMENT ON FUNCTION notify_beta_access_request() IS 'Sends email notification when new beta access request is created';
COMMENT ON TRIGGER beta_access_request_notification_trigger ON beta_access_requests IS 'Triggers email notification for new beta access requests';

-- Note: You'll need to replace 'YOUR_PROJECT_ID' with your actual Supabase project ID
-- You can find this in your Supabase dashboard URL or project settings