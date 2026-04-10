import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

const BUCKET = 'booking-docs';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/** Ensure storage bucket exists (creates on first use) */
async function ensureBucket(supabase: any) {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_FILE_SIZE,
    });
  }
}

/** POST /api/booking-docs - Upload a file */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).supabaseUserId;
  if (!userId) return NextResponse.json({ error: 'No user ID' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const tripId = formData.get('tripId') as string | null;
  const matchCities = formData.get('matchCities') as string | null; // comma-separated

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File too large' }, { status: 400 });

  const supabase = createServiceClient();
  await ensureBucket(supabase);

  // Generate unique path: userId/tripId/timestamp-filename
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/${tripId || 'general'}/${Date.now()}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    console.error('Upload error:', uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Generate a signed URL (valid for 1 year)
  const { data: urlData } = await supabase.storage.from(BUCKET).createSignedUrl(path, 365 * 24 * 60 * 60);

  return NextResponse.json({
    id: `doc-${Date.now()}`,
    name: file.name,
    storagePath: path,
    url: urlData?.signedUrl || '',
    mimeType: file.type,
    matchCities: matchCities ? matchCities.split(',').map(c => c.trim().toLowerCase()) : [],
    uploadedAt: new Date().toISOString(),
  });
}

/** DELETE /api/booking-docs - Delete a file */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).supabaseUserId;
  if (!userId) return NextResponse.json({ error: 'No user ID' }, { status: 401 });

  const { storagePath } = await req.json();
  if (!storagePath || !storagePath.startsWith(userId + '/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

/** GET /api/booking-docs?tripId=xxx - Refresh signed URLs for trip docs */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).supabaseUserId;

  const tripId = req.nextUrl.searchParams.get('tripId');
  const paths = req.nextUrl.searchParams.get('paths'); // comma-separated storage paths
  if (!paths) return NextResponse.json({ error: 'No paths' }, { status: 400 });

  const supabase = createServiceClient();
  const pathList = paths.split(',').filter(p => p.startsWith(userId + '/'));

  const urls: Record<string, string> = {};
  for (const p of pathList) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(p, 365 * 24 * 60 * 60);
    if (data?.signedUrl) urls[p] = data.signedUrl;
  }

  return NextResponse.json({ urls });
}
