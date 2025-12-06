import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

// Initialize with environment variable validation
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

console.log('Public webhook environment check:', {
  hasStripeSecret: !!stripeSecret,
  hasWebhookSecret: !!stripeWebhookSecret,
  hasSupabaseUrl: !!supabaseUrl,
  hasSupabaseServiceKey: !!supabaseServiceKey,
});

if (!stripeSecret || !stripeWebhookSecret || !supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
}

const stripe = new Stripe(stripeSecret || '', {
  appInfo: {
    name: 'AgentiCAD Integration',
    version: '1.0.0',
  },
});

const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '');

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'stripe-signature, content-type',
};

Deno.serve(async (req: Request) => {
  // Always return CORS headers
  console.log('Received request:', req.method, req.url);
  
  try {
    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      console.log('Handling CORS preflight');
      return new Response(null, { 
        status: 204,
        headers: corsHeaders
      });
    }

    if (req.method !== 'POST') {
      console.log('Method not allowed:', req.method);
      return new Response('Method not allowed', { 
        status: 405,
        headers: corsHeaders
      });
    }

    // Get the signature from the header
    const signature = req.headers.get('stripe-signature');
    console.log('Stripe signature present:', !!signature);

    if (!signature) {
      console.error('No Stripe signature found in headers');
      console.log('Available headers:', Object.fromEntries(req.headers.entries()));
      return new Response('No signature found', { 
        status: 400,
        headers: corsHeaders
      });
    }

    // Get the raw body
    const body = await req.text();
    console.log('Body length:', body.length);

    // If we don't have webhook secret, log the event but don't verify
    if (!stripeWebhookSecret) {
      console.error('No webhook secret configured - processing anyway');
      try {
        const event = JSON.parse(body);
        console.log('Processing unverified event:', event.type);
        EdgeRuntime.waitUntil(handleEvent(event));
        return Response.json({ received: true }, { headers: corsHeaders });
      } catch (parseError) {
        console.error('Error parsing webhook body:', parseError);
        return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders });
      }
    }

    // Verify the webhook signature
    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
      console.log('Successfully verified webhook signature for event:', event.type);
    } catch (error: any) {
      console.error(`Webhook signature verification failed: ${error.message}`);
      return new Response(`Webhook signature verification failed: ${error.message}`, { 
        status: 400,
        headers: corsHeaders
      });
    }

    console.log('Processing webhook event:', event.type, 'with ID:', event.id);

    // Process the event in the background
    EdgeRuntime.waitUntil(handleEvent(event));

    return Response.json({ received: true }, {
      headers: corsHeaders
    });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    console.error('Error stack:', error.stack);
    return Response.json({ error: error.message }, { 
      status: 500,
      headers: corsHeaders
    });
  }
});

async function handleEvent(event: Stripe.Event) {
  try {
    console.log('Handling event:', event.type);
    
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      default:
        console.log('Unhandled event type:', event.type);
    }
  } catch (error) {
    console.error('Error in handleEvent:', error);
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log('Processing invoice payment succeeded:', invoice.id);
  console.log('Customer ID:', invoice.customer);
  console.log('Invoice metadata:', invoice.metadata);
  
  // Extract metadata from the invoice line items
  const lineItem = invoice.lines?.data?.[0];
  if (lineItem?.metadata) {
    const { userId, tier } = lineItem.metadata;
    console.log('Found metadata in line item:', { userId, tier });
    
    if (userId && tier) {
      await updateUserProfile(userId, tier, invoice.customer as string);
    }
  }
  
  // Also try to get from subscription metadata if available
  if (invoice.parent?.subscription_details?.metadata) {
    const { userId, tier } = invoice.parent.subscription_details.metadata;
    console.log('Found metadata in subscription:', { userId, tier });
    
    if (userId && tier) {
      await updateUserProfile(userId, tier, invoice.customer as string);
    }
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  console.log('Processing subscription change:', subscription.id, 'status:', subscription.status);
  console.log('Subscription metadata:', subscription.metadata);
  
  const { userId, tier } = subscription.metadata || {};
  
  if (userId && tier) {
    await updateUserProfile(userId, tier, subscription.customer as string);
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('Processing checkout session completed:', session.id);
  console.log('Session metadata:', session.metadata);
  
  const { userId, tier } = session.metadata || {};
  
  if (userId && tier) {
    await updateUserProfile(userId, tier, session.customer as string);
  }
}

async function updateUserProfile(userId: string, tier: string, customerId: string) {
  try {
    console.log('Updating user profile:', { userId, tier, customerId });
    
    const status = tier === 'free' ? null : 'active';
    const now = new Date().toISOString();
    
    // Get the latest subscription data from Stripe to get accurate period dates
    let subscriptionData = null;
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
        status: 'all'
      });
      
      if (subscriptions.data.length > 0) {
        subscriptionData = subscriptions.data[0];
        console.log('Found Stripe subscription data:', {
          id: subscriptionData.id,
          status: subscriptionData.status,
          current_period_start: subscriptionData.current_period_start,
          current_period_end: subscriptionData.current_period_end
        });
      }
    } catch (stripeError) {
      console.error('Error fetching subscription from Stripe:', stripeError);
    }
    
    // Prepare the update data
    const updateData = {
      subscription_tier: tier,
      subscription_status: status,
      stripe_customer_id: customerId,
      updated_at: now
    };
    
    // Add subscription-specific fields if we have subscription data
    if (subscriptionData) {
      (updateData as any).stripe_subscription_id = subscriptionData.id;
      (updateData as any).current_period_start = new Date(subscriptionData.current_period_start * 1000).toISOString();
      (updateData as any).current_period_end = new Date(subscriptionData.current_period_end * 1000).toISOString();
      
      console.log('Adding subscription fields to update:', {
        stripe_subscription_id: (updateData as any).stripe_subscription_id,
        current_period_start: (updateData as any).current_period_start,
        current_period_end: (updateData as any).current_period_end
      });
    } else {
      console.log('No subscription data found, updating basic fields only');
    }

    // Update the user profile
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating user profile:', updateError);
    } else {
      console.log('Successfully updated user profile for:', userId, 'with data:', updateData);
      
      // Trigger additional update to ensure real-time subscriptions pick up the change
      setTimeout(async () => {
        await supabase
          .from('user_profiles')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', userId);
        console.log('Triggered additional real-time update for user:', userId);
      }, 500);
    }
  } catch (error) {
    console.error('Error in updateUserProfile:', error);
  }
} 