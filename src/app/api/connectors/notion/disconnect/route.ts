import { NextResponse } from 'next/server';
import Supermemory from 'supermemory';
import { env } from '@/env';

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!env.SUPERMEMORY_API_KEY) {
      console.error('[Notion Disconnect] API key not configured');
      return NextResponse.json(
        { error: 'Supermemory API key not configured' },
        { status: 500 }
      );
    }

    const client = new Supermemory({
      apiKey: env.SUPERMEMORY_API_KEY
    });

    console.log('[Notion Disconnect] Disconnecting Notion', {
      userId: userId || 'user'
    });

    const result = await client.connections.deleteByProvider('notion', {
      containerTags: [userId || 'user', 'notion-workspace']
    });

    console.log('[Notion Disconnect] Disconnected successfully');

    return NextResponse.json({
      success: true,
      message: 'Notion disconnected successfully',
      result
    });
  } catch (error) {
    console.error('[Notion Disconnect] Failed to disconnect:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Notion', details: error },
      { status: 500 }
    );
  }
}
