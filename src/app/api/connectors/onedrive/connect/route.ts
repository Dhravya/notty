import { NextResponse } from 'next/server';
import Supermemory from 'supermemory';
import { env } from '@/env';

export async function POST(request: Request) {
  try {
    const { userId, redirectUrl } = await request.json();

    if (!env.SUPERMEMORY_API_KEY) {
      console.error('[OneDrive Connect] API key not configured');
      return NextResponse.json(
        { error: 'Supermemory API key not configured' },
        { status: 500 }
      );
    }

    const client = new Supermemory({
      apiKey: env.SUPERMEMORY_API_KEY
    });

    const finalRedirectUrl = redirectUrl || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/connectors/onedrive/callback`;

    console.log('[OneDrive Connect] Initiating connection', {
      userId: userId || 'user',
      callbackUrl: finalRedirectUrl
    });

    const connection = await client.connections.create('onedrive', {
      redirectUrl: finalRedirectUrl,
      containerTags: [userId || 'user', 'onedrive-sync'],
      documentLimit: 1500,
      metadata: {
        source: 'onedrive',
        accountType: 'personal',
        userId: userId || 'anonymous'
      }
    });

    console.log('[OneDrive Connect] Connection created successfully', {
      expiresIn: connection.expiresIn
    });

    return NextResponse.json({
      authLink: connection.authLink,
      expiresIn: connection.expiresIn
    });
  } catch (error) {
    console.error('[OneDrive Connect] Failed to create connection:', error);
    return NextResponse.json(
      { error: 'Failed to create OneDrive connection' },
      { status: 500 }
    );
  }
}
