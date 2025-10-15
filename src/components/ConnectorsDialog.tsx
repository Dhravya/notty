"use client";

import { useState, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { connectGoogle } from "@/lib/connectors/google";
import { connectOneDrive } from "@/lib/connectors/onedrive";
import { connectNotion } from "@/lib/connectors/notion";
import { connectCanvas } from "@/lib/connectors/canvas";

interface ConnectionStatus {
  connected: boolean;
  email?: string;
  createdAt?: string;
  documentCount?: number;
}

export function ConnectorsDialog() {
  const [open, setOpen] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<ConnectionStatus>({ connected: false });
  const [notionStatus, setNotionStatus] = useState<ConnectionStatus>({ connected: false });
  const [oneDriveStatus, setOneDriveStatus] = useState<ConnectionStatus>({ connected: false });
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Check connection status on mount and when dialog opens
  useEffect(() => {
    if (open) {
      checkConnectionStatus();
    }
  }, [open]);

  // Check for OAuth callback success
  useEffect(() => {
    const success = searchParams.get('success');
    if (success === 'google_connected' || success === 'notion_connected' || success === 'onedrive_connected') {
      console.log('Connection successful');
      checkConnectionStatus();
    }
  }, [searchParams]);

  const checkConnectionStatus = async () => {
    setLoading(true);
    try {
      // Check Google status
      const googleResponse = await fetch('/api/connectors/google/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user' })
      });
      const googleData = await googleResponse.json();
      setGoogleStatus(googleData);

      // Check Notion status
      const notionResponse = await fetch('/api/connectors/notion/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user' })
      });
      const notionData = await notionResponse.json();
      setNotionStatus(notionData);

      // Check OneDrive status
      const oneDriveResponse = await fetch('/api/connectors/onedrive/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user' })
      });
      const oneDriveData = await oneDriveResponse.json();
      setOneDriveStatus(oneDriveData);
    } catch (error) {
      console.error('Error checking connection status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (service: string) => {
    console.log(`Connecting to ${service}...`);
    
    try {
      switch (service) {
        case 'Google':
          await connectGoogle();
          break;
        case 'Notion':
          await connectNotion();
          break;
        case 'OneDrive':
          await connectOneDrive();
          break;
        case 'Canvas':
          await connectCanvas();
          break;
        default:
          console.log(`${service} integration coming soon`);
      }
    } catch (error) {
      console.error(`Failed to connect to ${service}:`, error);
      // TODO: Show error toast to user
    }
  };

  // Only show on home page
  if (pathname !== '/') {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="fixed border bottom-5 left-40 z-10 flex max-h-fit gap-2 rounded-lg bg-white dark:bg-gray-950 p-2 transition-colors duration-200 hover:bg-stone-100 dark:hover:bg-stone-800 sm:bottom-auto sm:top-5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          Add Connectors
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Connect Your Services</DialogTitle>
          <DialogDescription>
            Connect your favorite apps to Supermemory to sync your notes and data.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="canvas" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="canvas">Canvas</TabsTrigger>
            <TabsTrigger value="google">Google</TabsTrigger>
            <TabsTrigger value="notion">Notion</TabsTrigger>
            <TabsTrigger value="onedrive">OneDrive</TabsTrigger>
          </TabsList>

          {/* Canvas Tab */}
          <TabsContent value="canvas" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Canvas Connect</CardTitle>
                <CardDescription>
                  Connect your Canvas workspace to visualize and sync your notes in an infinite canvas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Status</p>
                    <p className="text-sm text-muted-foreground">Not connected</p>
                  </div>
                  <Button onClick={() => handleConnect("Canvas")}>
                    Connect Canvas
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Google Tab */}
          <TabsContent value="google" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Google Drive</CardTitle>
                <CardDescription>
                  Sync your Google Docs, Sheets, and Drive files with Supermemory.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Status</p>
                    {loading ? (
                      <p className="text-sm text-muted-foreground">Checking...</p>
                    ) : googleStatus.connected ? (
                      <div>
                        <p className="text-sm text-green-600 dark:text-green-400 font-medium">✓ Connected</p>
                        {googleStatus.email && (
                          <p className="text-xs text-muted-foreground">{googleStatus.email}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Not connected</p>
                    )}
                  </div>
                  <Button onClick={() => handleConnect("Google")} disabled={loading}>
                    {googleStatus.connected ? 'Reconnect' : 'Connect Google'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notion Tab */}
          <TabsContent value="notion" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Notion</CardTitle>
                <CardDescription>
                  Import and sync your Notion pages and databases with Supermemory.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Status</p>
                    {loading ? (
                      <p className="text-sm text-muted-foreground">Checking...</p>
                    ) : notionStatus.connected ? (
                      <div>
                        <p className="text-sm text-green-600 dark:text-green-400 font-medium">✓ Connected</p>
                        {notionStatus.email && (
                          <p className="text-xs text-muted-foreground">{notionStatus.email}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Not connected</p>
                    )}
                  </div>
                  <Button onClick={() => handleConnect("Notion")} disabled={loading}>
                    {notionStatus.connected ? 'Reconnect' : 'Connect Notion'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* OneDrive Tab */}
          <TabsContent value="onedrive" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Microsoft OneDrive</CardTitle>
                <CardDescription>
                  Sync your OneDrive documents and files with Supermemory.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Status</p>
                    {loading ? (
                      <p className="text-sm text-muted-foreground">Checking...</p>
                    ) : oneDriveStatus.connected ? (
                      <div>
                        <p className="text-sm text-green-600 dark:text-green-400 font-medium">✓ Connected</p>
                        {oneDriveStatus.email && (
                          <p className="text-xs text-muted-foreground">{oneDriveStatus.email}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Not connected</p>
                    )}
                  </div>
                  <Button onClick={() => handleConnect("OneDrive")} disabled={loading}>
                    {oneDriveStatus.connected ? 'Reconnect' : 'Connect OneDrive'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

