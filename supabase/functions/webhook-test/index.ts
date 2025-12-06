import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

Deno.serve(async (req) => {
  console.log('=== WEBHOOK TEST START ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  
  // Log all headers
  console.log('Headers:');
  for (const [key, value] of req.headers.entries()) {
    console.log(`  ${key}: ${value}`);
  }

  try {
    // Handle OPTIONS for CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // Get body if POST
    let body = null;
    if (req.method === 'POST') {
      body = await req.text();
      console.log('Body length:', body?.length || 0);
      console.log('Body preview:', body?.substring(0, 200) || 'empty');
    }

    console.log('=== WEBHOOK TEST END ===');

    return new Response(JSON.stringify({
      success: true,
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
      bodyLength: body?.length || 0,
      timestamp: new Date().toISOString(),
      message: 'Test webhook received successfully'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Test webhook error:', error);
    
    return new Response(JSON.stringify({
      error: true,
      message: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}); 