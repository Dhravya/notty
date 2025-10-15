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
    const oneDriveConnection = connections.find((conn: any) => conn.provider === 'onedrive');

    if (oneDriveConnection) {
      console.log('[OneDrive Status] Connection found', {
        email: oneDriveConnection.email,
        createdAt: oneDriveConnection.createdAt
      });

      let documentCount = 0;
      try {
        const documents = await client.connections.listDocuments('onedrive', {
          containerTags: [userId || 'user', 'onedrive-sync']
        });
        documentCount = documents?.length || 0;
        console.log('[OneDrive Status] Documents synced:', documentCount);
      } catch (docError) {
        console.error('[OneDrive Status] Failed to fetch documents:', docError);
      }

      return NextResponse.json({
        connected: true,
        email: oneDriveConnection.email,
        createdAt: oneDriveConnection.createdAt,
        documentCount
      });
    }

    console.log('[OneDrive Status] No connection found');
    return NextResponse.json({
      connected: false
    });
  } catch (error: any) {
    console.error('[OneDrive Status] Error checking connection:', error);
    return NextResponse.json({
      connected: false,
      errorDetails: error?.message || 'Unknown error'
    });
  }
}
