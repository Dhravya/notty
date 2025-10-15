import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import Supermemory from 'supermemory';
import { env } from '@/env';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const success = searchParams.get('success');

    console.log('[Google Callback] OAuth callback received', {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
      success
    });

    if (error) {
      console.error('[Google Callback] OAuth error:', error);
      return NextResponse.redirect(
        new URL(`/?error=${encodeURIComponent(error)}`, request.url)
      );
    }

    if (success === 'true' || success === '1') {
      console.log('[Google Callback] Connection already handled by Supermemory');
      return NextResponse.redirect(
        new URL('/?success=google_connected', request.url)
      );
    }

    if (!code) {
      console.log('[Google Callback] No authorization code received, may be handled server-side');
      return NextResponse.redirect(
        new URL('/?info=google_check_status', request.url)
      );
    }

    if (!env.SUPERMEMORY_API_KEY) {
      console.error('[Google Callback] API key not configured');
      return NextResponse.redirect(
        new URL('/?error=api_key_missing', request.url)
      );
    }

    const client = new Supermemory({
      apiKey: env.SUPERMEMORY_API_KEY
    });

    console.log('[Google Callback] Confirming connection with Supermemory');

    await client.connections.confirm('google-drive', {
      code,
      state
    });

    console.log('[Google Callback] Connection confirmed successfully');

    return NextResponse.redirect(
      new URL('/?success=google_connected', request.url)
    );
  } catch (error) {
    console.error('[Google Callback] Failed to handle callback:', error);
    return NextResponse.redirect(
      new URL('/?error=callback_failed', request.url)
    );
  }
}

