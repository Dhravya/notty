import { NextResponse } from 'next/server';
import Supermemory from 'supermemory';
import { env } from '@/env';

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!env.SUPERMEMORY_API_KEY) {
      return NextResponse.json(
        { error: 'Supermemory API key not configured' },
        { status: 500 }
      );
    }

    const client = new Supermemory({
      apiKey: env.SUPERMEMORY_API_KEY
    });

    const connections = await client.connections.list();
    const notionConnection = connections.find((conn: any) => conn.provider === 'notion');

    if (notionConnection) {
      console.log('[Notion Status] Connection found', {
        email: notionConnection.email,
        createdAt: notionConnection.createdAt
      });

      let documentCount = 0;
      try {
        const documents = await client.connections.listDocuments('notion', {
          containerTags: [userId || 'user', 'notion-workspace']
        });
        documentCount = documents?.length || 0;
        console.log('[Notion Status] Documents synced:', documentCount);
      } catch (docError) {
        console.error('[Notion Status] Failed to fetch documents:', docError);
      }

      return NextResponse.json({
        connected: true,
        email: notionConnection.email,
        createdAt: notionConnection.createdAt,
        documentCount
      });
    }

    console.log('[Notion Status] No connection found');
    return NextResponse.json({
      connected: false
    });
  } catch (error: any) {
    console.error('[Notion Status] Error checking connection:', error);
    return NextResponse.json({
      connected: false,
      errorDetails: error?.message || 'Unknown error'
    });
  }
}

