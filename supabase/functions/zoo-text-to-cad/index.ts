import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

interface ZooAPIRequest {
  action: 'generate' | 'status' | 'convert';
  prompt?: string;
  outputFormat?: string;
  units?: string;
  scale?: number;
  id?: string;
  convertFormat?: string;
}

serve(async (req) => {
  try {
    console.log('🚀 Zoo API function called:', req.method, req.url);
    
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      console.log('✅ Handling CORS preflight request');
      return new Response(null, { 
        status: 200,
        headers: corsHeaders
      });
    }

    console.log('📥 Processing request...');
    
    // Add health check endpoint
    if (req.url.includes('/health') || !req.body) {
      return new Response(
        JSON.stringify({ 
          status: 'healthy', 
          timestamp: new Date().toISOString(),
          message: 'Zoo API proxy is running'
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Skip authentication for now to test basic functionality
    console.log('⚠️ Skipping authentication for testing purposes');

    // Parse request body with error handling
    let requestBody: ZooAPIRequest;
    try {
      requestBody = await req.json() as ZooAPIRequest;
    } catch (e) {
      console.error('Failed to parse request body:', e);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { action, prompt, outputFormat = 'gltf', units = 'mm', scale = 1, id, convertFormat } = requestBody;
    
    // Get Zoo API token from environment
    const zooApiToken = Deno.env.get('ZOO_API_TOKEN');
    if (!zooApiToken) {
      console.error('❌ Zoo API token not configured');
      return new Response(
        JSON.stringify({ error: 'Zoo API token not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('🔑 Zoo API token found:', zooApiToken.substring(0, 10) + '...');

    // Define Zoo API base URL and headers
    const zooApiBase = 'https://api.zoo.dev';
    const zooHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${zooApiToken}`
    };

    let zooResponse: Response;
    let responseData: any;

    switch (action) {
      case 'generate':
        if (!prompt) {
          return new Response(
            JSON.stringify({ error: 'Prompt is required for generate action' }),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }

        console.log('🎯 Generating CAD model with prompt:', prompt);
        console.log('📋 Output format:', outputFormat);
        console.log('📏 Units:', units);
        
        // Use correct Zoo API endpoint
        const endpoint = `${zooApiBase}/ai/text-to-cad/${outputFormat}`;
        console.log(`Making request to: ${endpoint}`);
        
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: zooHeaders,
            body: JSON.stringify({
              prompt: prompt
            })
          });

          if (response.ok) {
            console.log(`✅ Success with Zoo API`);
            zooResponse = response;
          } else {
            const responseText = await response.text();
            console.log(`❌ Zoo API failed: ${response.status} ${response.statusText}`);
            console.log(`Response body:`, responseText);
            
            return new Response(
              JSON.stringify({
                error: 'Zoo API generation failed',
                status: response.status,
                statusText: response.statusText,
                details: responseText,
                endpoint: endpoint,
                timestamp: new Date().toISOString()
              }),
              { 
                status: response.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            );
          }
        } catch (error) {
          console.log(`❌ Network error:`, error);
          return new Response(
            JSON.stringify({
              error: 'Network error calling Zoo API',
              details: error instanceof Error ? error.message : 'Unknown error',
              endpoint: endpoint,
              timestamp: new Date().toISOString()
            }),
            { 
              status: 503,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
        
        break;

      case 'status':
        if (!id) {
          return new Response(
            JSON.stringify({ error: 'ID is required for status action' }),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }

        console.log('📊 Checking status for ID:', id);
        
        try {
          const response = await fetch(`${zooApiBase}/user/text-to-cad/${id}`, {
            method: 'GET',
            headers: zooHeaders
          });

          if (response.ok) {
            console.log(`✅ Status check successful`);
            zooResponse = response;
          } else {
            const responseText = await response.text();
            console.log(`❌ Status check failed: ${response.status} ${response.statusText}`);
            
            return new Response(
              JSON.stringify({
                error: 'Zoo API status check failed',
                status: response.status,
                details: responseText,
                id: id,
                timestamp: new Date().toISOString()
              }),
              { 
                status: response.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            );
          }
        } catch (error) {
          return new Response(
            JSON.stringify({
              error: 'Network error during status check',
              details: error instanceof Error ? error.message : 'Unknown error',
              id: id,
              timestamp: new Date().toISOString()
            }),
            { 
              status: 503,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
        
        break;

      case 'convert':
        if (!id || !convertFormat) {
          return new Response(
            JSON.stringify({ error: 'ID and convertFormat are required for convert action' }),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }

        console.log('🔄 Converting model:', id, 'to', convertFormat);
        
        try {
          const response = await fetch(`${zooApiBase}/user/text-to-cad/${id}`, {
            method: 'GET',
            headers: zooHeaders
          });

          if (response.ok) {
            console.log(`✅ Conversion successful`);
            zooResponse = response;
          } else {
            const responseText = await response.text();
            console.log(`❌ Conversion failed: ${response.status} ${response.statusText}`);
            
            return new Response(
              JSON.stringify({
                error: 'Zoo API conversion failed',
                status: response.status,
                details: responseText,
                id: id,
                format: convertFormat,
                timestamp: new Date().toISOString()
              }),
              { 
                status: response.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            );
          }
        } catch (error) {
          return new Response(
            JSON.stringify({
              error: 'Network error during conversion',
              details: error instanceof Error ? error.message : 'Unknown error',
              id: id,
              format: convertFormat,
              timestamp: new Date().toISOString()
            }),
            { 
              status: 503,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
        
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
    }

    // Process successful response
    responseData = await zooResponse.json();
    console.log('Zoo API response:', responseData);

    return new Response(
      JSON.stringify({
        ...responseData,
        _debug: {
          action,
          endpoint_used: zooResponse.url,
          status: zooResponse.status,
          timestamp: new Date().toISOString()
        }
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (outerError) {
    console.error('❌ Critical error in Zoo API function:', outerError);
    
    return new Response(
      JSON.stringify({
        error: 'Critical server error',
        details: outerError instanceof Error ? outerError.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});