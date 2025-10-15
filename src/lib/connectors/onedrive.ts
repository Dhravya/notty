export const connectOneDrive = async () => {
  try {
    const response = await fetch('/api/connectors/onedrive/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user' })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to initiate OneDrive connection');
    }

    if (data.authLink) {
      window.location.href = data.authLink;
    }
  } catch (error) {
    console.error('Failed to connect OneDrive:', error);
    throw error;
  }
};