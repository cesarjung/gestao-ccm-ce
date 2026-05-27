import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = 'https://djnysigashxtjfhxpzyj.supabase.co';

interface SyncResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

async function getAuthHeaders(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

async function isGoogleCalendarConnected(): Promise<boolean> {
  const headers = await getAuthHeaders();
  if (!headers) return false;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=status`,
      { headers }
    );
    const result = await response.json();
    return result.connected && !result.expired;
  } catch {
    return false;
  }
}

export async function syncTaskToCalendar(
  taskId: string,
  title: string,
  description?: string | null,
  startDate?: string | null,
  dueDate?: string | null
): Promise<SyncResult> {
  const headers = await getAuthHeaders();
  if (!headers) return { success: false, error: 'Not authenticated' };

  const isConnected = await isGoogleCalendarConnected();
  if (!isConnected) return { success: false, error: 'Google Calendar not connected' };

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/google-calendar-sync?action=create-event`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          taskId,
          title,
          description,
          startDate,
          dueDate,
        }),
      }
    );

    const result = await response.json();

    if (result.success) {
      console.log(`Task ${taskId} synced to Google Calendar: ${result.eventId}`);
      return { success: true, eventId: result.eventId };
    }

    return { success: false, error: result.error };
  } catch (error) {
    console.error('Error syncing task to calendar:', error);
    return { success: false, error: 'Sync failed' };
  }
}

export async function updateCalendarEvent(
  eventId: string,
  title: string,
  description?: string | null,
  startDate?: string | null,
  dueDate?: string | null,
  status?: string
): Promise<SyncResult> {
  const headers = await getAuthHeaders();
  if (!headers) return { success: false, error: 'Not authenticated' };

  const isConnected = await isGoogleCalendarConnected();
  if (!isConnected) return { success: false, error: 'Google Calendar not connected' };

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/google-calendar-sync?action=update-event`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          eventId,
          title,
          description,
          startDate,
          dueDate,
          status,
        }),
      }
    );

    const result = await response.json();

    if (result.success) {
      console.log(`Calendar event ${eventId} updated`);
      return { success: true };
    }

    return { success: false, error: result.error };
  } catch (error) {
    console.error('Error updating calendar event:', error);
    return { success: false, error: 'Update failed' };
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<SyncResult> {
  const headers = await getAuthHeaders();
  if (!headers) return { success: false, error: 'Not authenticated' };

  const isConnected = await isGoogleCalendarConnected();
  if (!isConnected) return { success: false, error: 'Google Calendar not connected' };

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/google-calendar-sync?action=delete-event`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ eventId }),
      }
    );

    const result = await response.json();

    if (result.success) {
      console.log(`Calendar event ${eventId} deleted`);
      return { success: true };
    }

    return { success: false, error: result.error };
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    return { success: false, error: 'Delete failed' };
  }
}
