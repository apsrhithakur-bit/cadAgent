import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check database connectivity and recent activity
    const { data: recentProfiles, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email, subscription_tier, subscription_status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(5);

    const { data: recentSubscriptions, error: subscriptionError } = await supabase
      .from('stripe_subscriptions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(5);

    const { data: recentCustomers, error: customerError } = await supabase
      .from('stripe_customers')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(5);

    // Check for sync mismatches
    const { data: syncDebug, error: debugError } = await supabase
      .from('subscription_sync_debug')
      .select('*')
      .eq('sync_status', 'MISMATCH')
      .limit(10);

    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: {
        hasWebhookSecret: !!stripeWebhookSecret,
        webhookSecretLength: stripeWebhookSecret?.length || 0,
        hasSupabaseUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey
      },
      database: {
        profilesCount: recentProfiles?.length || 0,
        subscriptionsCount: recentSubscriptions?.length || 0,
        customersCount: recentCustomers?.length || 0,
        mismatchCount: syncDebug?.length || 0,
        errors: {
          profileError: profileError?.message,
          subscriptionError: subscriptionError?.message,
          customerError: customerError?.message,
          debugError: debugError?.message
        }
      },
      recentActivity: {
        profiles: recentProfiles || [],
        subscriptions: recentSubscriptions || [],
        customers: recentCustomers || [],
        mismatches: syncDebug || []
      },
      webhookEndpoint: `${supabaseUrl}/functions/v1/stripe-webhook`,
      recommendations: [] as string[]
    };

    // Add recommendations based on findings
    if (!stripeWebhookSecret) {
      diagnostics.recommendations.push('STRIPE_WEBHOOK_SECRET environment variable is missing');
    }

    if ((recentCustomers?.length || 0) > 0 && (recentSubscriptions?.length || 0) === 0) {
      diagnostics.recommendations.push('Customers are being created but no subscriptions - webhook processing may be failing');
    }

    if ((syncDebug?.length || 0) > 0) {
      diagnostics.recommendations.push(`Found ${syncDebug?.length} profile/subscription mismatches that need correction`);
    }

    if ((recentProfiles?.length || 0) === 0) {
      diagnostics.recommendations.push('No user profiles found - check if user registration is working');
    }

    return new Response(JSON.stringify(diagnostics, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Webhook debug error:', error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}); 