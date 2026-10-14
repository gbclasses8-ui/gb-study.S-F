import allBatchesFallback from '../data/allBatches.json';

export interface RawBatchItem {
  id: number | string;
  title: string;
  thumbnail?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
}

export interface FolderContentItem {
  id: string;
  parent_id: string;
  Title: string;
  title?: string;
  description?: string;
  material_type?: string;
  type?: string;
  file_link?: string;
  pdf_link?: string;
  download_link?: string;
  thumbnail?: string;
  videos_count?: string;
  files_count?: string;
  tests_count?: string;
  duration?: string;
  duration_in_secs?: string;
  event_date?: string;
  date_and_time?: string;
  course_id?: string;
  live_status?: number | string;
  video_id?: string;
  video_player_url?: string;
  video_player_token?: string;
}

export interface VideoDetailsResponse {
  success: boolean;
  video_id: string;
  course_id: string;
  title: string;
  duration?: string;
  thumbnail?: string;
  date?: string;
  video_player_token?: string;
  decoded_video_link?: string;
  player_url?: string;
  qualities?: Array<{
    quality: string;
    url: string;
    player_url?: string;
  }>;
  decoded_pdf_link?: string | null;
  pdf_viewer?: string | null;
  decoded_pdf_link2?: string | null;
  pdf_viewer2?: string | null;
  error?: string;
}

export interface EnhancedBatch {
  id: string;
  numericId: number;
  title: string;
  thumbnail: string;
  category: 'Class 12th' | 'Class 11th' | 'Class 10th' | 'Class 9th' | 'NDA & Defence' | 'Commerce & Other';
  year: string;
  mode: 'Live & Recorded' | 'Live' | 'Recorded';
  description: string;
}

// In-memory cache for ultra-smooth responsiveness
const folderCache = new Map<string, FolderContentItem[]>();
const videoDetailsCache = new Map<string, VideoDetailsResponse>();

export function classifyBatchCategory(title: string): EnhancedBatch['category'] {
  const lower = title.toLowerCase();
  if (lower.includes('nda') || lower.includes('defence') || lower.includes('tejas')) {
    return 'NDA & Defence';
  }
  if (lower.includes('12th') || lower.includes('12 th') || lower.includes('class 12')) {
    return 'Class 12th';
  }
  if (lower.includes('11th') || lower.includes('11 th') || lower.includes('class 11')) {
    return 'Class 11th';
  }
  if (lower.includes('10th') || lower.includes('10 th') || lower.includes('class 10')) {
    return 'Class 10th';
  }
  if (lower.includes('9th') || lower.includes('9 th') || lower.includes('class 9')) {
    return 'Class 9th';
  }
  return 'Commerce & Other';
}

export function detectBatchMode(title: string): EnhancedBatch['mode'] {
  const lower = title.toLowerCase();
  if (lower.includes('live') && lower.includes('recorded')) {
    return 'Live & Recorded';
  }
  if (lower.includes('recorded')) {
    return 'Recorded';
  }
  return 'Live & Recorded';
}

export function detectBatchYear(title: string): string {
  const match = title.match(/202\d[-–]\d{2,4}/);
  if (match) return match[0];
  return '2025-26';
}

export async function fetchAllBatches(): Promise<EnhancedBatch[]> {
  let rawList: RawBatchItem[] = [];

  try {
    const res = await fetch('/api/batches');
    if (res.ok) {
      const json = await res.json();
      if (json.data && Array.isArray(json.data) && json.data.length > 0) {
        rawList = json.data;
      }
    }
  } catch (err) {
    console.warn('Using bundled batch fallback:', err);
  }

  if (rawList.length === 0) {
    rawList = allBatchesFallback as RawBatchItem[];
  }

  return rawList.map((item) => {
    const numId = typeof item.id === 'number' ? item.id : parseInt(String(item.id), 10);
    const title = item.title || `Batch #${item.id}`;
    const category = classifyBatchCategory(title);
    const mode = detectBatchMode(title);
    const year = detectBatchYear(title);

    // Fallback thumbnail if missing
    let thumb = item.thumbnail;
    if (!thumb || thumb.trim() === '') {
      thumb = 'https://appx-content-v2.classx.co.in/paid_course3/2025-10-25-0_14983521030015323.jpg';
    }

    return {
      id: String(item.id),
      numericId: numId,
      title,
      thumbnail: thumb,
      category,
      year,
      mode,
      description: item.description || `Complete ${category} curriculum with live classes, recorded lectures, topper notes, and chapterwise revision.`,
    };
  });
}

export async function fetchFolderContents(courseId: string | number, parentId: string | number = '-1'): Promise<FolderContentItem[]> {
  const cacheKey = `${courseId}_${parentId}`;
  if (folderCache.has(cacheKey)) {
    return folderCache.get(cacheKey)!;
  }

  try {
    const res = await fetch(`/api/folder_contentsv3?course_id=${encodeURIComponent(String(courseId))}&parent_id=${encodeURIComponent(String(parentId))}&start=0`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    if (json.status === 200 && Array.isArray(json.data)) {
      folderCache.set(cacheKey, json.data);
      return json.data;
    }
    return [];
  } catch (err) {
    console.error(`Error loading folder contents (${courseId}, ${parentId}):`, err);
    throw err;
  }
}

export async function fetchVideoDetails(courseId: string | number, videoId: string | number): Promise<VideoDetailsResponse> {
  const cacheKey = `${courseId}_${videoId}`;
  if (videoDetailsCache.has(cacheKey)) {
    return videoDetailsCache.get(cacheKey)!;
  }

  try {
    const res = await fetch(`/api/fetchVideoDetailsById?course_id=${encodeURIComponent(String(courseId))}&video_id=${encodeURIComponent(String(videoId))}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    if (json.success) {
      videoDetailsCache.set(cacheKey, json);
      return json;
    }
    throw new Error(json.error || 'Invalid video details response');
  } catch (err) {
    console.error(`Error fetching video details (${courseId}, ${videoId}):`, err);
    throw err;
  }
}

export function getProxyVideoUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  return `/api/video?url=${encodeURIComponent(rawUrl)}`;
}

export function getProxyPdfUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  return `/api/pdf?url=${encodeURIComponent(rawUrl)}`;
}

export function formatDuration(durationText?: string, secsStr?: string): string {
  if (secsStr && parseInt(secsStr, 10) > 0) {
    let s = parseInt(secsStr, 10);
    const h = Math.floor(s / 3600);
    s %= 3600;
    const m = Math.floor(s / 60);
    s %= 60;
    if (h > 0) {
      return `${h}h ${m}m ${s}s`;
    }
    return `${m}m ${s}s`;
  }
  if (durationText) {
    return durationText.replace('mins', 'm').replace('secs', 's').replace('hrs', 'h').trim();
  }
  return '';
}

export function formatDateTime(dateStr?: string): string {
  if (!dateStr) return 'Recently Added';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
