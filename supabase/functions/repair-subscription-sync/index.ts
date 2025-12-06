import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all users with sync mismatches
    const { data: mismatches, error: mismatchError } = await supabase
      .from('subscription_sync_debug')
      .select('*')
      .eq('sync_status', 'MISMATCH');

    if (mismatchError) {
      throw new Error(`Error fetching mismatches: ${mismatchError.message}`);
    }

    const repairResults = [] as any[];

    for (const mismatch of mismatches || []) {
      console.log(`Repairing user ${mismatch.email} (${mismatch.user_id})`);
      
      const repairResult = {
        userId: mismatch.user_id,
        email: mismatch.email,
        oldTier: mismatch.profile_tier,
        oldStatus: mismatch.profile_status,
        action: 'none',
        newTier: mismatch.profile_tier,
        newStatus: mismatch.profile_status,
        error: null
      };

      try {
        // If user has a paid tier but no Stripe subscription
        if (mismatch.profile_tier !== 'free' && !mismatch.stripe_subscription_id) {
          console.log(`User ${mismatch.email} has ${mismatch.profile_tier} tier but no Stripe subscription`);
          
          // Check if there's a very recent Stripe subscription we might have missed
          // by looking at the customer's Stripe data more thoroughly
          const { data: allCustomerSubs } = await supabase
            .from('stripe_subscriptions')
            .select('*')
            .eq('customer_id', mismatch.stripe_customer_id)
            .order('created_at', { ascending: false });

          if (allCustomerSubs && allCustomerSubs.length > 0) {
            const latestSub = allCustomerSubs[0];
            console.log(`Found subscription for ${mismatch.email}:`, latestSub);
            
            if (latestSub.status === 'active' && latestSub.price_id) {
              // There is an active subscription, update the profile to match
              let correctTier = 'free';
              if (latestSub.price_id === 'price_1ReRffQlr7BhgPjLRYQKCMwi') {
                correctTier = 'plus';
              } else if (latestSub.price_id === 'price_1ReRgCQlr7BhgPjLzPv64mSG') {
                correctTier = 'pro';
              }

              const { error: updateError } = await supabase
                .from('user_profiles')
                .update({
                  subscription_tier: correctTier,
                  subscription_status: 'active',
                  stripe_subscription_id: latestSub.subscription_id,
                  current_period_start: latestSub.current_period_start 
                    ? new Date(latestSub.current_period_start * 1000).toISOString()
                    : null,
                  current_period_end: latestSub.current_period_end 
                    ? new Date(latestSub.current_period_end * 1000).toISOString()
                    : null,
                  updated_at: new Date().toISOString()
                })
                .eq('id', mismatch.user_id);

              if (updateError) {
                throw new Error(`Failed to update profile: ${updateError.message}`);
              }

              repairResult.action = 'updated_to_match_subscription';
              repairResult.newTier = correctTier;
              repairResult.newStatus = 'active';
            }
          } else {
            // No subscription found - user should be on free tier
            console.log(`No subscription found for ${mismatch.email}, resetting to free`);
            
            const { error: resetError } = await supabase
              .from('user_profiles')
              .update({
                subscription_tier: 'free',
                subscription_status: null,
                stripe_subscription_id: null,
                current_period_start: null,
                current_period_end: null,
                updated_at: new Date().toISOString()
              })
              .eq('id', mismatch.user_id);

            if (resetError) {
              throw new Error(`Failed to reset profile: ${resetError.message}`);
            }

            repairResult.action = 'reset_to_free';
            repairResult.newTier = 'free';
            repairResult.newStatus = null;
          }
        }
        // If user is on free tier but has an active subscription
        else if (mismatch.profile_tier === 'free' && mismatch.stripe_subscription_id && mismatch.stripe_status === 'active') {
          console.log(`User ${mismatch.email} is on free but has active subscription`);
          
          let correctTier = 'free';
          if (mismatch.price_id === 'price_1ReRffQlr7BhgPjLRYQKCMwi') {
            correctTier = 'plus';
          } else if (mismatch.price_id === 'price_1ReRgCQlr7BhgPjLzPv64mSG') {
            correctTier = 'pro';
          }

          if (correctTier !== 'free') {
            const { error: upgradeError } = await supabase
              .from('user_profiles')
              .update({
                subscription_tier: correctTier,
                subscription_status: 'active',
                updated_at: new Date().toISOString()
              })
              .eq('id', mismatch.user_id);

            if (upgradeError) {
              throw new Error(`Failed to upgrade profile: ${upgradeError.message}`);
            }

            repairResult.action = 'upgraded_to_match_subscription';
            repairResult.newTier = correctTier;
            repairResult.newStatus = 'active';
          }
        }

      } catch (error: any) {
        console.error(`Error repairing user ${mismatch.email}:`, error);
        repairResult.error = error.message;
      }

      repairResults.push(repairResult);
    }

    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      mismatchesFound: mismatches?.length || 0,
      repairResults
    }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Repair function error:', error);
    
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