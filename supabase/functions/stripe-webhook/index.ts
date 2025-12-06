import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

// Initialize with environment variable validation
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

console.log('Webhook environment check:', {
  hasStripeSecret: !!stripeSecret,
  hasWebhookSecret: !!stripeWebhookSecret,
  hasSupabaseUrl: !!supabaseUrl,
  hasSupabaseServiceKey: !!supabaseServiceKey,
  stripeSecretPrefix: stripeSecret?.substring(0, 7) || 'none'
});

if (!stripeSecret) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

if (!stripeWebhookSecret) {
  throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required');
}

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL environment variable is required');
}

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
}

const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'AgentiCAD Integration',
    version: '1.0.0',
  },
});

const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  try {
    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { 
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        }
      });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // get the signature from the header
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      console.error('No Stripe signature found in headers');
      return new Response('No signature found', { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // get the raw body
    const body = await req.text();
    console.log('Received webhook with signature:', signature.substring(0, 20) + '...');

    // verify the webhook signature
    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
      console.log('Successfully verified webhook signature for event:', event.type);
    } catch (error: any) {
      console.error(`Webhook signature verification failed: ${error.message}`);
      return new Response(`Webhook signature verification failed: ${error.message}`, { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    console.log('Processing webhook event:', event.type, 'with ID:', event.id);

    EdgeRuntime.waitUntil(handleEvent(event));

    return Response.json({ received: true }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    console.error('Error stack:', error.stack);
    return Response.json({ error: error.message }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
});

async function handleEvent(event: Stripe.Event) {
  try {
    console.log('Handling event:', event.type);
    
    const stripeData = event?.data?.object ?? {};

    if (!stripeData) {
      console.log('No data object in event, skipping');
      return;
    }

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'charge.dispute.created':
        await handleChargeDispute(event.data.object as Stripe.Dispute);
        break;
      case 'refund.created':
        // DISABLED: Manual refunds only via Stripe dashboard
        console.log('⚠️ Refund detected, but automatic processing is disabled. Manual review required.');
        console.log('Refund details:', event.data.object);
        // await handleRefundCreated(event.data.object as Stripe.Refund);
        break;
      default:
        console.log('Unhandled event type:', event.type);
    }
  } catch (error) {
    console.error('Error in handleEvent:', error);
    throw error;
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('Processing checkout.session.completed for session:', session.id);
  console.log('Session metadata:', session.metadata);
  
  const customerId = session.customer as string;
  if (!customerId) {
    console.error('No customer ID in checkout session');
    return;
  }

  if (session.mode === 'subscription') {
    console.log('Subscription checkout completed, syncing customer data');
    
    // SIMPLE FIX: Check if this is Manufacturing Connect addon purchase
    try {
      const sessionWithLineItems = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items.data.price']
      });
      
      const lineItem = sessionWithLineItems.line_items?.data?.[0];
      const priceId = lineItem?.price?.id;
      
      console.log('Checkout session price_id:', priceId);
      
      // If this is Manufacturing Connect addon, directly set manufacturer_access = true
      if (priceId === 'price_1RjsBpQlr7BhgPjLEDrIvngq') {
        console.log('🏭 Manufacturing Connect addon purchased! Setting manufacturer_access = true');
        
        // Get user ID from customer
        const { data: customer } = await supabase
          .from('stripe_customers')
          .select('user_id')
          .eq('customer_id', customerId)
          .single();
        
        if (customer?.user_id) {
          const { error: updateError } = await supabase
            .from('user_profiles')
            .update({
              manufacturer_access: true,
              updated_at: new Date().toISOString()
            })
            .eq('id', customer.user_id);
          
          if (updateError) {
            console.error('❌ Error setting manufacturer_access:', updateError);
          } else {
            console.log('✅ Successfully set manufacturer_access = true for user:', customer.user_id);
          }
        }
      }
    } catch (error) {
      console.error('Error checking for Manufacturing Connect addon:', error);
    }
    
    // If we have metadata with user info, use it for immediate update
    if (session.metadata?.userId && session.metadata?.tier) {
      console.log('Using checkout metadata for immediate profile update');
      await forceUpdateUserProfileWithMetadata(session.metadata.userId, session.metadata.tier);
    }
    
    // Also sync from Stripe as backup
    await syncCustomerFromStripe(customerId);
    
    // Force immediate profile update with multiple retries
    await forceUpdateUserProfile(customerId);
    
    // Additional retries with delays to ensure update takes
    setTimeout(async () => {
      await forceUpdateUserProfile(customerId);
    }, 1000);
    
    setTimeout(async () => {
      await forceUpdateUserProfile(customerId);
    }, 3000);
    
    setTimeout(async () => {
      await forceUpdateUserProfile(customerId);
    }, 5000);
    
  } else if (session.mode === 'payment' && session.payment_status === 'paid') {
    console.log('One-time payment completed');
    await handleOneTimePayment(session);
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  console.log('Processing subscription change:', subscription.id, 'status:', subscription.status);
  console.log('Subscription metadata:', subscription.metadata);
  
  const customerId = subscription.customer as string;
  if (!customerId) {
    console.error('No customer ID in subscription');
    return;
  }

  // SIMPLE FIX: Check if this is Manufacturing Connect addon subscription
  const priceId = subscription.items.data[0]?.price?.id;
  console.log('Subscription price_id:', priceId);
  
  if (priceId === 'price_1RkpR3Ho63JmGM47kZ3J7zUi' && subscription.status === 'active') {
    console.log('🏭 Manufacturing Connect addon subscription activated! Setting manufacturer_access = true');
    
    try {
      // Get user ID from customer
      const { data: customer } = await supabase
        .from('stripe_customers')
        .select('user_id')
        .eq('customer_id', customerId)
        .single();
      
      if (customer?.user_id) {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({
            manufacturer_access: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', customer.user_id);
        
        if (updateError) {
          console.error('❌ Error setting manufacturer_access:', updateError);
        } else {
          console.log('✅ Successfully set manufacturer_access = true for user:', customer.user_id);
        }
      }
    } catch (error) {
      console.error('Error setting manufacturer_access in subscription change:', error);
    }
  }

  // First sync the subscription data from Stripe
  await syncCustomerFromStripe(customerId);
  
  // Force immediate profile update
  await forceUpdateUserProfile(customerId);
  
  // If we have metadata with user info, use it for immediate update as well
  if (subscription.metadata?.userId && subscription.metadata?.tier) {
    console.log('Using subscription metadata for immediate profile update');
    await forceUpdateUserProfileWithMetadata(subscription.metadata.userId, subscription.metadata.tier);
  }
  
  // Additional delayed updates to ensure persistence
  setTimeout(async () => {
    await forceUpdateUserProfile(customerId);
  }, 2000);
  
  setTimeout(async () => {
    await forceUpdateUserProfile(customerId);
  }, 5000);
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log('Processing invoice payment succeeded:', invoice.id);
  
  const customerId = invoice.customer as string;
  if (!customerId) {
    console.error('No customer ID in invoice');
    return;
  }

  await syncCustomerFromStripe(customerId);
  await forceUpdateUserProfile(customerId);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log('Processing invoice payment failed:', invoice.id);
  
  const customerId = invoice.customer as string;
  if (!customerId) {
    console.error('No customer ID in invoice');
    return;
  }

  await syncCustomerFromStripe(customerId);
  await forceUpdateUserProfile(customerId);
}

async function handleChargeDispute(dispute: Stripe.Dispute) {
  console.log('Processing charge dispute:', dispute.id);
  console.log('Dispute metadata:', dispute.metadata);

  const customerId = dispute.charge?.customer as string;
  if (!customerId) {
    console.error('No customer ID in charge dispute');
    return;
  }

  // If the dispute is created, it means the charge was refunded.
  // We need to reduce the extra_patent_searches count for the user.
  // This is a bit complex because we need to find the original charge
  // and then the refund to get the correct quantity.
  // For simplicity, we'll assume the refund quantity is the same as the charge quantity.
  // A more robust solution would involve linking the charge to the refund.

  try {
    const charge = await stripe.charges.retrieve(dispute.charge as string);
    const refund = await stripe.refunds.retrieve(dispute.id);

    console.log('Retrieved charge:', charge.id, 'amount:', charge.amount);
    console.log('Retrieved refund:', refund.id, 'amount:', refund.amount);

    if (charge.amount === refund.amount) {
      console.log('Charge amount matches refund amount. Assuming full refund.');
      const userId = charge.metadata?.userId;
      if (userId) {
        console.log(`👤 Processing for user ID: ${userId}`);
        await reduceExtraPatentSearches(userId);
      } else {
        console.error('❌ No userId in charge metadata for refund handling.');
      }
    } else {
      console.warn('Charge amount does not match refund amount. Cannot determine quantity for refund.');
    }
  } catch (error) {
    console.error('Error retrieving charge or refund for dispute:', error);
  }
}

async function handleRefundCreated(refund: Stripe.Refund) {
  console.log('🔄 Processing refund created:', refund.id, 'amount:', refund.amount);
  
  try {
    // Get the original charge to find the customer and metadata
    const charge = await stripe.charges.retrieve(refund.charge as string);
    console.log('📋 Retrieved charge:', charge.id, 'customer:', charge.customer);
    
    // Check if this refund is for an extra patent searches purchase
    if (charge.metadata?.purchaseType === 'extra_patent_searches') {
      console.log('🔍 This is a refund for extra patent searches purchase');
      
      const userId = charge.metadata?.userId;
      const extraSearchesStr = charge.metadata?.extraPatentSearches;
      
      if (!userId) {
        console.error('❌ No userId in charge metadata');
        return;
      }
      
      if (!extraSearchesStr) {
        console.error('❌ No extraPatentSearches in charge metadata');
        return;
      }
      
      const extraSearchesPurchased = parseInt(extraSearchesStr);
      console.log(`📊 Original purchase: ${extraSearchesPurchased} searches`);
      
      // Calculate how many searches to refund based on refund amount
      const originalAmount = charge.amount;
      const refundAmount = refund.amount;
      const refundRatio = refundAmount / originalAmount;
      const searchesToRefund = Math.floor(extraSearchesPurchased * refundRatio);
      
      console.log(`💰 Refund ratio: ${refundRatio} (${refundAmount}/${originalAmount})`);
      console.log(`🔍 Will refund ${searchesToRefund} searches`);
      
      if (searchesToRefund > 0) {
        await reduceExtraPatentSearches(userId, searchesToRefund);
      } else {
        console.log('ℹ️ No searches to refund (amount too small)');
      }
      
    } else {
      console.log('ℹ️ This refund is not for extra patent searches');
    }
    
  } catch (error) {
    console.error('❌ Error processing refund:', error);
  }
}

async function handleOneTimePayment(session: Stripe.Checkout.Session) {
  try {
    console.log('🔄 STARTING handleOneTimePayment for session:', session.id);
    console.log('📋 Full session data:', JSON.stringify({
      id: session.id,
      customer: session.customer,
      mode: session.mode,
      payment_status: session.payment_status,
      metadata: session.metadata,
      amount_total: session.amount_total,
      currency: session.currency
    }, null, 2));
    
    const customerId = session.customer as string;
    
    // Insert the order into the stripe_orders table
    console.log('💾 Inserting order record...');
    const { error: orderError } = await supabase.from('stripe_orders').insert({
      checkout_session_id: session.id,
      payment_intent_id: session.payment_intent as string,
      customer_id: customerId,
      amount_subtotal: session.amount_subtotal,
      amount_total: session.amount_total,
      currency: session.currency,
      payment_status: session.payment_status,
      status: 'completed',
    });

    if (orderError) {
      console.error('❌ Error inserting order:', orderError);
      return;
    }
    console.log('✅ Order record inserted successfully');

    // Check if this is an extra patent searches purchase
    console.log('🔍 Checking if this is extra patent searches purchase...');
    console.log('🔍 session.metadata?.purchaseType:', session.metadata?.purchaseType);
    
    if (session.metadata?.purchaseType === 'extra_patent_searches') {
      console.log('🎯 CONFIRMED: This is an extra patent searches purchase!');
      console.log('📋 Processing extra patent searches purchase');
      console.log('🔍 Session metadata:', JSON.stringify(session.metadata, null, 2));
      
      const userId = session.metadata.userId;
      
      if (!userId) {
        console.error('❌ CRITICAL ERROR: No userId in session metadata for extra patent searches');
        console.error('❌ Available metadata keys:', Object.keys(session.metadata || {}));
        console.error('❌ Full metadata:', JSON.stringify(session.metadata, null, 2));
        return;
      }

      console.log(`👤 Processing for user ID: ${userId}`);

      // Check if user exists first
      console.log('🔍 Checking if user exists in database...');
      const { data: existingUser, error: userCheckError } = await supabase
        .from('user_profiles')
        .select('id, email, subscription_tier, extra_patent_searches')
        .eq('id', userId)
        .single();

      if (userCheckError || !existingUser) {
        console.error('❌ CRITICAL ERROR: User not found in database');
        console.error('❌ User check error:', userCheckError);
        console.error('❌ User ID searched:', userId);
        return;
      }

      console.log(`✅ Found user: ${existingUser.email}`);
      console.log(`📊 Current extra searches: ${existingUser.extra_patent_searches || 0}`);

      // Get the actual quantity purchased from line items (in case user adjusted quantity)
      let extraSearches = 10; // Each purchase always gives 10 searches
      try {
        console.log('🔍 Retrieving line items to get actual quantity...');
        const sessionWithLineItems = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['line_items.data']
        });
        
        console.log('📋 Line items data:', JSON.stringify(sessionWithLineItems.line_items?.data, null, 2));
        
        // Each line item represents a "pack" of 10 searches
        // So if quantity = 1, user gets 10 searches
        // If quantity = 2, user gets 20 searches, etc.
        if (sessionWithLineItems.line_items?.data?.[0]?.quantity) {
          const packQuantity = sessionWithLineItems.line_items.data[0].quantity;
          extraSearches = packQuantity * 10; // Each pack = 10 searches
          console.log(`📊 User purchased ${packQuantity} pack(s) = ${extraSearches} searches`);
        } else {
          // Fallback: always give 10 searches per purchase
          extraSearches = 10;
          console.log(`📊 Using fallback: 10 searches per purchase`);
        }
      } catch (error) {
        console.error('❌ Error retrieving line items, using fallback:', error);
        extraSearches = 10; // Always give 10 searches as fallback
        console.log(`📊 Using error fallback: 10 searches per purchase`);
      }

      console.log(`🎯 UPDATING USER: Adding ${extraSearches} extra patent searches to user ${userId}`);
      console.log(`📊 Current extra searches: ${existingUser.extra_patent_searches || 0}`);
      
      const newTotalExtra = (existingUser.extra_patent_searches || 0) + extraSearches;
      console.log(`📊 Will have after update: ${newTotalExtra}`);

      // Try direct update first (simpler approach)
      console.log('💾 Attempting database update...');
      const { data: updatedProfile, error: updateError } = await supabase
        .from('user_profiles')
        .update({
          extra_patent_searches: newTotalExtra,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select('extra_patent_searches')
        .single();

      if (updateError) {
        console.error('❌ CRITICAL ERROR: Database update failed');
        console.error('❌ Update error:', updateError);
        console.error('❌ Update details:', { userId, extraSearches, newTotalExtra });
        console.error('❌ Error code:', updateError.code);
        console.error('❌ Error message:', updateError.message);
        console.error('❌ Error details:', updateError.details);
      } else {
        console.log(`🎉 SUCCESS! Successfully added ${extraSearches} extra patent searches to user ${userId}`);
        console.log(`✅ Updated profile:`, JSON.stringify(updatedProfile, null, 2));
        console.log(`🔍 User ${userId} now has ${updatedProfile?.extra_patent_searches || 0} extra patent searches`);
        
        // Additional verification - read back the user to confirm update
        console.log('🔍 Verifying update by reading user profile again...');
        const { data: verifyUser, error: verifyError } = await supabase
          .from('user_profiles')
          .select('extra_patent_searches')
          .eq('id', userId)
          .single();
          
        if (verifyError) {
          console.error('❌ Error verifying update:', verifyError);
        } else {
          console.log(`✅ Verification: User now has ${verifyUser?.extra_patent_searches} extra patent searches`);
        }
      }
    } else {
      console.log('ℹ️ This is not an extra patent searches purchase');
      console.log('ℹ️ Purchase type:', session.metadata?.purchaseType || 'undefined');
    }
    
    console.info(`✅ Successfully processed one-time payment for session: ${session.id}`);
  } catch (error) {
    console.error('💥 CRITICAL ERROR in handleOneTimePayment:', error);
    console.error('💥 Error stack:', error.stack);
  }
}

async function forceUpdateUserProfileWithMetadata(userId: string, tier: string) {
  try {
    console.log('Force updating user profile with metadata - userId:', userId, 'tier:', tier);
    
    // Determine status based on tier
    const status = tier === 'free' ? null : 'active';

    const now = new Date().toISOString();
    
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        subscription_tier: tier,
        subscription_status: status,
        updated_at: now
      })
      .eq('id', userId);

    if (!updateError) {
      console.log('Successfully updated profile using metadata for user:', userId, 'to tier:', tier);
      
      // Additional trigger to ensure real-time subscriptions pick up the change
      setTimeout(async () => {
        await supabase
          .from('user_profiles')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', userId);
        console.log('Triggered additional real-time update for user:', userId);
      }, 500);
    } else {
      console.error('Error updating profile with metadata:', updateError);
    }
  } catch (error) {
    console.error('Error in forceUpdateUserProfileWithMetadata:', error);
  }
}

async function forceUpdateUserProfile(customerId: string) {
  try {
    console.log('Force updating user profile for customer:', customerId);
    
    // Get the user ID from the customer
    const { data: customer } = await supabase
      .from('stripe_customers')
      .select('user_id')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .single();

    if (!customer) {
      console.error('Customer not found for force update:', customerId);
      return;
    }

    // Get ALL active subscriptions for this customer - CRITICAL FIX
    // Users can have multiple subscriptions: base plan + Manufacturing Connect addon
    const allSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 10  // Increased from 1 to handle multiple subscriptions
    });

    console.log(`Found ${allSubscriptions.data.length} active subscriptions for customer ${customerId}`);

    if (allSubscriptions.data.length === 0) {
      console.log('No active subscriptions found for customer:', customerId);
      
      // Set to free tier if no active subscriptions
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          subscription_tier: 'free',
          subscription_status: null,
          manufacturer_access: false,
          stripe_customer_id: customerId,
          stripe_subscription_id: null,
          current_period_start: null,
          current_period_end: null,
          updated_at: now
        })
        .eq('id', customer.user_id);

      if (updateError) {
        console.error('Error updating profile to free:', updateError);
      }
      return;
    }

    // Process all subscriptions to determine tier and manufacturer access
    let baseTier = 'free';
    let manufacturerAccess = false;
    let primarySubscription = null;
    let manufacturingSubscription = null;

    for (const subscription of allSubscriptions.data) {
      const priceId = subscription.items.data[0]?.price?.id;
      console.log('Processing subscription:', subscription.id, 'with price_id:', priceId, 'status:', subscription.status);

      if (subscription.status === 'active' && priceId) {
        switch (priceId) {
          case 'price_1ReRffQlr7BhgPjLRYQKCMwi': // Plus subscription
            baseTier = 'plus';
            primarySubscription = subscription;
            console.log('Found Plus subscription:', subscription.id);
            break;
          case 'price_1ReRgCQlr7BhgPjLzPv64mSG': // Pro subscription
            baseTier = 'pro';
            primarySubscription = subscription;
            console.log('Found Pro subscription:', subscription.id);
            break;
          case 'price_1RjsBpQlr7BhgPjLEDrIvngq': // Manufacturing Connect addon
            manufacturerAccess = true;
            manufacturingSubscription = subscription;
            console.log('Found Manufacturing Connect addon:', subscription.id);
            break;
          default:
            console.log('Unknown price_id:', priceId, 'for subscription:', subscription.id);
        }
      }
    }

    // Use the primary subscription for period dates, or manufacturing if no base subscription
    const referenceSubscription = primarySubscription || manufacturingSubscription || allSubscriptions.data[0];

    if (!referenceSubscription) {
      console.error('No reference subscription found for customer:', customerId);
      return;
    }

    console.log('Final determination:', {
      baseTier,
      manufacturerAccess,
      primarySubscription: primarySubscription?.id,
      manufacturingSubscription: manufacturingSubscription?.id,
      referenceSubscription: referenceSubscription.id
    });

    // Update the most recent subscription in our database for tracking
    const latestSubscription = allSubscriptions.data[0];
    const { data: existingSubscription } = await supabase
      .from('stripe_subscriptions')
      .select('*')
      .eq('customer_id', customerId)
      .single();

    if (existingSubscription) {
      // Extract payment method information
      let paymentMethodBrand = null;
      let paymentMethodLast4 = null;
      
      if (latestSubscription.default_payment_method && typeof latestSubscription.default_payment_method !== 'string') {
        paymentMethodBrand = latestSubscription.default_payment_method.card?.brand ?? null;
        paymentMethodLast4 = latestSubscription.default_payment_method.card?.last4 ?? null;
      }

      const subscriptionData = {
        subscription_id: latestSubscription.id,
        price_id: latestSubscription.items.data[0]?.price?.id || null,
        current_period_start: latestSubscription.current_period_start,
        current_period_end: latestSubscription.current_period_end,
        cancel_at_period_end: latestSubscription.cancel_at_period_end,
        payment_method_brand: paymentMethodBrand,
        payment_method_last4: paymentMethodLast4,
        status: latestSubscription.status,
        updated_at: new Date().toISOString()
      };

      const { error: subError } = await supabase
        .from('stripe_subscriptions')
        .update(subscriptionData)
        .eq('customer_id', customerId);

      if (subError) {
        console.error('Error updating subscription record:', subError);
      }
    }

    // Force update the user profile directly with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      const now = new Date().toISOString();
      
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          subscription_tier: baseTier,
          subscription_status: 'active',
          stripe_customer_id: customerId,
          stripe_subscription_id: referenceSubscription.id,
          manufacturer_access: manufacturerAccess,
          current_period_start: referenceSubscription.current_period_start 
            ? new Date(referenceSubscription.current_period_start * 1000).toISOString()
            : null,
          current_period_end: referenceSubscription.current_period_end 
            ? new Date(referenceSubscription.current_period_end * 1000).toISOString()
            : null,
          updated_at: now
        })
        .eq('id', customer.user_id);

      if (!updateError) {
        console.log('Successfully force updated profile for user:', customer.user_id, 'to tier:', baseTier, 'manufacturer_access:', manufacturerAccess, 'on attempt:', retryCount + 1);
        
        // Additional trigger to ensure real-time subscriptions pick up the change
        setTimeout(async () => {
          await supabase
            .from('user_profiles')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', customer.user_id);
          console.log('Triggered additional real-time update for user:', customer.user_id);
        }, 500);
        
        break;
      }

      console.error('Error force updating profile on attempt:', retryCount + 1, updateError);
      retryCount++;
      
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }

    if (retryCount === maxRetries) {
      console.error('Failed to update user profile after max retries for user:', customer.user_id);
    }
  } catch (error) {
    console.error('Error in forceUpdateUserProfile:', error);
  }
}

async function syncCustomerFromStripe(customerId: string) {
  try {
    console.log('Syncing customer from Stripe:', customerId);
    
    // Fetch ALL subscription data from Stripe - not just the latest one
    // This is critical for users with multiple subscriptions (base plan + Manufacturing Connect)
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 10, // Increased from 1 to handle multiple subscriptions
      status: 'all',
      expand: ['data.default_payment_method'],
    });

    console.log(`Found ${subscriptions.data.length} subscriptions for customer ${customerId}`);

    // First, ensure the customer exists in our database
    const { data: existingCustomer } = await supabase
      .from('stripe_customers')
      .select('user_id')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .single();

    if (!existingCustomer) {
      console.error(`Customer ${customerId} not found in database`);
      return;
    }

    if (subscriptions.data.length === 0) {
      console.info(`No subscriptions found for customer: ${customerId}, setting to not_started`);
      
      // Update or insert subscription record with not_started status
      const { error: noSubError } = await supabase.from('stripe_subscriptions').upsert(
        {
          customer_id: customerId,
          subscription_id: null,
          price_id: null,
          status: 'not_started',
          current_period_start: null,
          current_period_end: null,
          cancel_at_period_end: false,
          payment_method_brand: null,
          payment_method_last4: null,
        },
        {
          onConflict: 'customer_id',
        },
      );

      if (noSubError) {
        console.error('Error updating subscription status:', noSubError);
        throw new Error('Failed to update subscription status in database');
      }
      
      console.log('Successfully updated subscription to not_started status');
      return;
    }

    // Process the most recent subscription for database tracking
    // (We'll let forceUpdateUserProfile handle the multiple subscription logic)
    const subscription = subscriptions.data[0];
    console.log('Processing latest subscription for DB sync:', subscription.id, 'with status:', subscription.status, 'price_id:', subscription.items.data[0]?.price?.id);

    // Extract payment method information
    let paymentMethodBrand = null;
    let paymentMethodLast4 = null;
    
    if (subscription.default_payment_method && typeof subscription.default_payment_method !== 'string') {
      paymentMethodBrand = subscription.default_payment_method.card?.brand ?? null;
      paymentMethodLast4 = subscription.default_payment_method.card?.last4 ?? null;
    }

    // Store subscription state
    const subscriptionData = {
      customer_id: customerId,
      subscription_id: subscription.id,
      price_id: subscription.items.data[0]?.price?.id || null,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end,
      payment_method_brand: paymentMethodBrand,
      payment_method_last4: paymentMethodLast4,
      status: subscription.status,
    };

    console.log('Upserting subscription data:', subscriptionData);

    const { error: subError } = await supabase.from('stripe_subscriptions').upsert(
      subscriptionData,
      {
        onConflict: 'customer_id',
      },
    );

    if (subError) {
      console.error('Error syncing subscription:', subError);
      throw new Error('Failed to sync subscription in database');
    }
    
    console.info(`Successfully synced subscription for customer: ${customerId}`);
    
  } catch (error) {
    console.error(`Failed to sync subscription for customer ${customerId}:`, error);
    throw error;
  }
}

async function reduceExtraPatentSearches(userId: string, searchesToReduce: number) {
  try {
    console.log(`🔄 Reducing ${searchesToReduce} extra patent searches for user:`, userId);

    const { data: existingUser, error: userError } = await supabase
      .from('user_profiles')
      .select('extra_patent_searches')
      .eq('id', userId)
      .single();

    if (userError || !existingUser) {
      console.error('❌ Error retrieving user profile:', userError);
      return;
    }

    const currentExtraSearches = existingUser.extra_patent_searches || 0;
    const newExtraSearches = Math.max(0, currentExtraSearches - searchesToReduce);

    console.log(`📊 Current extra searches: ${currentExtraSearches}`);
    console.log(`🎯 Will reduce to: ${newExtraSearches}`);

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        extra_patent_searches: newExtraSearches,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('❌ Error reducing extra patent searches:', updateError);
    } else {
      console.log(`✅ Successfully reduced ${searchesToReduce} extra patent searches for user:`, userId);
      console.log(`🔍 User ${userId} now has ${newExtraSearches} extra patent searches`);
    }
  } catch (error) {
    console.error('❌ Error in reduceExtraPatentSearches:', error);
  }
}