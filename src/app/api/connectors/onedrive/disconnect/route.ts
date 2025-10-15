import { NextResponse } from 'next/server';
import Supermemory from 'supermemory';
import { env } from '@/env';

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!env.SUPERMEMORY_API_KEY) {
      console.error('[OneDrive Disconnect] API key not configured');
      return NextResponse.json(
        { error: 'Supermemory API key not configured' },
        { status: 500 }
      );
    }

    const client = new Supermemory({
      apiKey: env.SUPERMEMORY_API_KEY
    });

    console.log('[OneDrive Disconnect] Disconnecting OneDrive', {
      userId: userId || 'user'
    });

    const result = await client.connections.deleteByProvider('onedrive', {
      containerTags: [userId || 'user', 'onedrive-sync']
    });

    console.log('[OneDrive Disconnect] Disconnected successfully');

    return NextResponse.json({
      success: true,
      message: 'OneDrive disconnected successfully',
      result
    });
  } catch (error) {
    console.error('[OneDrive Disconnect] Failed to disconnect:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect OneDrive', details: error },
      { status: 500 }
    );
  }
}
