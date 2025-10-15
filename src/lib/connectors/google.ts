export const connectGoogle = async (userId?: string) => {
  try {
    // Call the server API to initiate the OAuth flow
    const response = await fetch('/api/connectors/google/connect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId || 'anonymous',
        redirectUrl: `${window.location.origin}/api/connectors/google/callback`,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to initiate Google connection:', error);
      throw new Error(error.error || 'Failed to connect to Google');
    }

    const data = await response.json();
    
    // Redirect user to Google OAuth
    if (data.authLink) {
      window.location.href = data.authLink;
    } else {
      throw new Error('No auth link received');
    }
  } catch (error) {
    console.error('Error connecting to Google:', error);
    throw error;
  }
};