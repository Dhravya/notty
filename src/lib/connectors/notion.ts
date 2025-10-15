export const connectNotion = async (userId?: string) => {
  try {
    // Call the server API to initiate the OAuth flow
    const response = await fetch('/api/connectors/notion/connect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId || 'anonymous',
        redirectUrl: `${window.location.origin}/api/connectors/notion/callback`,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to initiate Notion connection:', error);
      throw new Error(error.error || 'Failed to connect to Notion');
    }

    const data = await response.json();
    
    // Redirect user to Notion OAuth
    if (data.authLink) {
      window.location.href = data.authLink;
    } else {
      throw new Error('No auth link received');
    }
  } catch (error) {
    console.error('Error connecting to Notion:', error);
    throw error;
  }
};