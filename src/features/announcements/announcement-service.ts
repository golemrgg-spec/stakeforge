import { supabase } from '@/lib/supabase';

export interface Announcement {
  id: string;
  message: string;
  is_active: boolean;
  sort_order: number;
}

export async function getActiveAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('platform_announcements')
    .select('id, message, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    return [];
  }
  return data as Announcement[];
}
