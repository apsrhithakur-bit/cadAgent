import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BetaAccessRequest {
  id: string
  user_id: string
  email: string
  reason: string
  status: string
  created_at: string
  user_profile?: {
    email: string
    full_name?: string
  }
}

async function sendEmail(request: BetaAccessRequest) {
  const WEB3FORMS_ACCESS_KEY = Deno.env.get('WEB3FORMS_ACCESS_KEY')
  
  console.log('📧 Preparing to send beta access notification email...')
  console.log('Has Web3Forms key:', !!WEB3FORMS_ACCESS_KEY)
  
  if (!WEB3FORMS_ACCESS_KEY || WEB3FORMS_ACCESS_KEY === 'fallback') {
    console.log('⚠️ WEB3FORMS_ACCESS_KEY not configured properly')
    console.log('📧 MANUAL EMAIL REQUIRED - Beta Access Request:')
    console.log('=' .repeat(60))
    console.log('To: abhirooprt03@gmail.com')
    console.log(`From: ${request.email}`)
    console.log(`Subject: New Beta Access Request - AgentiCAD`)
    console.log(`Request ID: ${request.id}`)
    console.log(`Timestamp: ${request.created_at}`)
    console.log(`Reason: ${request.reason || 'No reason provided'}`)
    console.log('=' .repeat(60))
    return { success: true, method: 'logged', note: 'Web3Forms key not configured' }
  }

  const emailSubject = `🚀 New Beta Access Request - AgentiCAD`
  const emailMessage = `
🚀 NEW BETA ACCESS REQUEST - AGENTICAD OPTIMIZATION FEATURES

📧 User Email: ${request.email}
🆔 Request ID: ${request.id}
📅 Submitted: ${new Date(request.created_at).toLocaleString()}
📊 Status: ${request.status}

💬 REASON FOR REQUEST:
${request.reason || 'No reason provided'}

🔧 NEXT STEPS:
1. Review the user's request and reason above
2. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/xthmikzaolkfnucpoqyb
3. Navigate to SQL Editor
4. Run the beta access grant script with email: ${request.email}

📝 GRANT ACCESS SQL:
DO $$
DECLARE
  target_user_id UUID;
BEGIN
  SELECT id INTO target_user_id
  FROM user_profiles
  WHERE email = '${request.email}';
  
  IF target_user_id IS NOT NULL THEN
    PERFORM grant_beta_access(target_user_id, 'optimization');
    RAISE NOTICE 'Beta access granted to user %', target_user_id;
  ELSE
    RAISE NOTICE 'User not found with that email';
  END IF;
END $$;

---
This is an automated notification from your AgentiCAD beta access system.
  `

  try {
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_key: WEB3FORMS_ACCESS_KEY,
        subject: emailSubject,
        email: request.email, // The user who requested
        message: emailMessage,
        to: 'abhirooprt03@gmail.com' // Your email
      }),
    })

    console.log('📤 Sending request to Web3Forms...')
    
    if (response.ok) {
      const result = await response.json()
      if (result.success) {
        console.log('✅ Email sent successfully via Web3Forms')
        console.log('Response:', result)
        return { success: true, method: 'web3forms', result }
      } else {
        console.log('❌ Web3Forms returned success:false')
        console.log('Response:', result)
        throw new Error(`Web3Forms failed: ${result.message || 'Unknown error'}`)
      }
    } else {
      const errorText = await response.text()
      console.log('❌ Web3Forms failed with status:', response.status)
      console.log('Error response:', errorText)
      throw new Error(`Web3Forms API error: ${response.status} - ${errorText}`)
    }

  } catch (error) {
    console.error('❌ Failed to send email via Web3Forms:', error)
    // Fall back to logging
    console.log('Fallback - logging email notification:', {
      to: 'abhirooprt03@gmail.com',
      subject: emailSubject,
      userEmail: request.email,
      reason: request.reason,
      requestId: request.id
    })
    return { success: true, method: 'logged', error: error.message }
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { record, type } = await req.json()
    
    console.log('Processing beta access notification:', { type, requestId: record.id })

    if (type === 'INSERT' && record.table === 'beta_access_requests') {
      // Send notification email
      const emailResult = await sendEmail(record)
      
      console.log('Beta access notification processed:', {
        requestId: record.id,
        email: record.email,
        emailMethod: emailResult.method,
        success: emailResult.success
      })

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Beta access notification sent successfully',
          emailResult
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'No action required for this event' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error processing beta access notification:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})