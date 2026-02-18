import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
      { status: 400 }
    );
  }

  const { email, password, full_name } = parsed.data;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'SUPABASE_SERVICE_ROLE_KEY is not configured' } },
      { status: 500 }
    );
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 1. Create user with email auto-confirmed (no verification email needed)
  const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (createError) {
    if (createError.message.includes('already') || createError.message.includes('exists')) {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: 'このメールアドレスは既に登録されています' } },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: createError.message } },
      { status: 500 }
    );
  }

  const userId = userData.user.id;

  // 2. Create profile (no tenant assignment — user will create/join tenant via onboarding)
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      user_id: userId,
      email,
      full_name,
    }, { onConflict: 'user_id' });

  if (profileError) {
    return NextResponse.json(
      { message: 'ユーザーは作成されましたが、プロフィールの作成に失敗しました。', userId, warning: profileError.message },
      { status: 201 }
    );
  }

  return NextResponse.json(
    { message: 'ユーザーを作成しました。ログインしてください。', userId },
    { status: 201 }
  );
}
