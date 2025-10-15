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
    const googleConnection = connections.find((conn: any) => conn.provider === 'google-drive');

    if (googleConnection) {
      console.log('[Google Status] Connection found', {
        email: googleConnection.email,
        createdAt: googleConnection.createdAt
      });

      let documentCount = 0;
      try {
        const documents = await client.connections.listDocuments('google-drive', {
          containerTags: [userId || 'user', 'gdrive-sync']
        });
        documentCount = documents?.length || 0;
        console.log('[Google Status] Documents synced:', documentCount);
      } catch (docError) {
        console.error('[Google Status] Failed to fetch documents:', docError);
      }

      return NextResponse.json({
        connected: true,
        email: googleConnection.email,
        createdAt: googleConnection.createdAt,
        documentCount
      });
    }

    console.log('[Google Status] No connection found');
    return NextResponse.json({
      connected: false
    });
  } catch (error: any) {
    console.error('[Google Status] Error checking connection:', error);
    return NextResponse.json({
      connected: false,
      errorDetails: error?.message || 'Unknown error'
    });
  }
}

