import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface SyncRequest {
  user_id?: string;
  customer_id?: string;
  email?: string;
  action?: 'sync_from_stripe' | 'force_tier';
  tier?: string;
}

// Helper function to create responses with CORS headers
function corsResponse(body: string | object | null, status = 200) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };

  if (status === 204) {
    return new Response(null, { status, headers });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    if (req.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405);
    }

    const { user_id, customer_id, email, action, tier }: SyncRequest = await req.json();

    console.log('Manual sync request:', { user_id, customer_id, email, action, tier });

    let target_user_id = user_id;
    let target_customer_id = customer_id;

    // Find user by email if provided
    if (email && !target_user_id) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, stripe_customer_id')
        .eq('email', email)
        .single();

      if (profile) {
        target_user_id = profile.id;
        target_customer_id = profile.stripe_customer_id || target_customer_id;
      }
    }

    // Find customer ID if we have user ID
    if (target_user_id && !target_customer_id) {
      const { data: customer } = await supabase
        .from('stripe_customers')
        .select('customer_id')
        .eq('user_id', target_user_id)
        .single();

      if (customer) {
        target_customer_id = customer.customer_id;
      }
    }

    if (!target_user_id || !target_customer_id) {
      return corsResponse({ 
        error: 'Could not find user or customer',
        user_id: target_user_id,
        customer_id: target_customer_id
      }, 400);
    }

    console.log('Syncing for user:', target_user_id, 'customer:', target_customer_id);

    // SECURITY: Block manufacturer tier bypass
    if (action === 'force_tier') {
      if (tier === 'manufacturer') {
        throw new Error('SECURITY VIOLATION: Direct assignment to manufacturer tier is not allowed. Use pro tier with manufacturer_access = true instead.');
      }
      
      // SECURITY: Only allow service role for force tier changes
      if (!session || session.user.role !== 'service_role') {
        throw new Error('SECURITY VIOLATION: Force tier changes are only allowed for service role.');
      }
    }

    // Handle force tier change (bypass Stripe) - SECURITY HARDENED
    if (action === 'force_tier' && tier) {
      console.log('SECURITY AUDIT: Force setting tier to:', tier, 'for user:', target_user_id);
      
      const { error } = await supabase
        .from('user_profiles')
        .update({
          subscription_tier: tier,
          subscription_status: tier === 'free' ? null : 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', target_user_id);

      if (error) {
        throw error;
      }

      // Also update subscription record
      await supabase
        .from('stripe_subscriptions')
        .update({
          price_id: tier === 'plus' ? 'price_1ReRffQlr7BhgPjLRYQKCMwi' : 
                    tier === 'pro' ? 'price_1ReRgCQlr7BhgPjLzPv64mSG' : null,
          updated_at: new Date().toISOString()
        })
        .eq('customer_id', target_customer_id);

      return corsResponse({ 
        success: true,
        message: `SECURITY COMPLIANT: Forced tier change to ${tier}`,
        user_id: target_user_id,
        tier: tier
      });
    }

    // Fetch latest subscription from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: target_customer_id,
      limit: 1,
      status: 'all'
    });

    if (subscriptions.data.length === 0) {
      console.log('No subscriptions found, setting to free');
      
      // Update to free tier
      const { error } = await supabase
        .from('user_profiles')
        .update({
          subscription_tier: 'free',
          subscription_status: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', target_user_id);

      if (error) {
        throw error;
      }

      return corsResponse({ 
        success: true,
        message: 'Updated to free tier (no active subscriptions)',
        user_id: target_user_id
      });
    }

    const subscription = subscriptions.data[0];
    console.log('Found subscription:', subscription.id, 'status:', subscription.status);

    // Determine tier from price ID
    let tier_value = 'free';
    const price_id = subscription.items.data[0]?.price?.id;
    
    if (subscription.status === 'active' && price_id) {
      switch (price_id) {
        case 'price_1ReRffQlr7BhgPjLRYQKCMwi':
          tier_value = 'plus';
          break;
        case 'price_1ReRgCQlr7BhgPjLzPv64mSG':
          tier_value = 'pro';
          break;
        default:
          tier_value = 'free';
      }
    }

    // Map subscription status
    let status_value = null;
    switch (subscription.status) {
      case 'active':
        status_value = 'active';
        break;
      case 'canceled':
        status_value = 'canceled';
        break;
      case 'past_due':
        status_value = 'past_due';
        break;
      case 'incomplete':
        status_value = 'incomplete';
        break;
      case 'trialing':
        status_value = 'trialing';
        break;
    }

    console.log('Updating profile to tier:', tier_value, 'status:', status_value);

    // Update subscription in our database
    const { error: subError } = await supabase
      .from('stripe_subscriptions')
      .update({
        subscription_id: subscription.id,
        price_id: price_id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        updated_at: new Date().toISOString()
      })
      .eq('customer_id', target_customer_id);

    if (subError) {
      console.error('Error updating subscription:', subError);
    }

    // Update user profile
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({
        subscription_tier: tier_value,
        subscription_status: status_value,
        stripe_customer_id: target_customer_id,
        stripe_subscription_id: subscription.id,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', target_user_id);

    if (profileError) {
      throw profileError;
    }

    // Trigger additional update for real-time
    setTimeout(async () => {
      await supabase
        .from('user_profiles')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', target_user_id);
    }, 500);

    return corsResponse({ 
      success: true,
      message: 'Successfully synced subscription from Stripe',
      user_id: target_user_id,
      customer_id: target_customer_id,
      tier: tier_value,
      status: status_value,
      subscription_id: subscription.id,
      stripe_price_id: price_id
    });

  } catch (error: any) {
    console.error('Manual sync error:', error);
    return corsResponse({ 
      error: 'Sync failed',
      message: error.message
    }, 500);
  }
}); 