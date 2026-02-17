'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Shield, ShieldCheck, Loader2, Copy, Check } from 'lucide-react';

type MfaState =
  | { step: 'idle'; enrolled: boolean; factorId?: string }
  | { step: 'enrolling'; qrCode: string; secret: string; factorId: string }
  | { step: 'verifying'; factorId: string }
  | { step: 'unenrolling' };

export default function SecuritySettingsPage() {
  const [mfa, setMfa] = useState<MfaState>({ step: 'idle', enrolled: false });
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const checkMfaStatus = useCallback(async () => {
    if (initialized) return;
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    if (data?.totp && data.totp.length > 0) {
      const verified = data.totp.find(f => f.status === 'verified');
      if (verified) {
        setMfa({ step: 'idle', enrolled: true, factorId: verified.id });
      }
    }
    setInitialized(true);
  }, [initialized]);

  // Check on mount
  if (!initialized) {
    checkMfaStatus();
  }

  async function handleEnroll() {
    setError('');
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'AIBO Authenticator',
      });

      if (enrollError || !data) {
        setError(enrollError?.message ?? 'MFA登録に失敗しました');
        return;
      }

      setMfa({
        step: 'enrolling',
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        factorId: data.id,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (mfa.step !== 'enrolling') return;
    setError('');
    setLoading(true);
    try {
      const supabase = createClient();

      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: mfa.factorId });

      if (challengeError || !challengeData) {
        setError(challengeError?.message ?? 'チャレンジの作成に失敗しました');
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfa.factorId,
        challengeId: challengeData.id,
        code: totpCode,
      });

      if (verifyError) {
        setError('認証コードが正しくありません。もう一度お試しください。');
        return;
      }

      setMfa({ step: 'idle', enrolled: true, factorId: mfa.factorId });
      setSuccess('二要素認証が有効になりました');
      setTotpCode('');
    } finally {
      setLoading(false);
    }
  }

  async function handleUnenroll() {
    if (mfa.step !== 'idle' || !mfa.factorId) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId: mfa.factorId,
      });

      if (unenrollError) {
        setError(unenrollError.message);
        return;
      }

      setMfa({ step: 'idle', enrolled: false });
      setSuccess('二要素認証が無効になりました');
    } finally {
      setLoading(false);
    }
  }

  function handleCopySecret() {
    if (mfa.step !== 'enrolling') return;
    navigator.clipboard.writeText(mfa.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-2xl space-y-6">
      {error && (
        <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="rounded bg-green-50 p-3 text-sm text-green-700">{success}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {mfa.step === 'idle' && mfa.enrolled ? (
              <ShieldCheck className="h-5 w-5 text-green-600" />
            ) : (
              <Shield className="h-5 w-5" />
            )}
            二要素認証 (TOTP)
          </CardTitle>
          <CardDescription>
            認証アプリ (Google Authenticator, Authy等) を使用してアカウントを保護します。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mfa.step === 'idle' && !mfa.enrolled && (
            <Button onClick={handleEnroll} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              MFAを有効にする
            </Button>
          )}

          {mfa.step === 'idle' && mfa.enrolled && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <ShieldCheck className="h-4 w-4" />
                二要素認証は有効です
              </div>
              <Button variant="destructive" size="sm" onClick={handleUnenroll} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                MFAを無効にする
              </Button>
            </div>
          )}

          {mfa.step === 'enrolling' && (
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  1. 認証アプリで以下のQRコードをスキャンしてください。
                </p>
                <div className="flex justify-center rounded-lg border bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mfa.qrCode}
                    alt="MFA QR Code"
                    className="h-48 w-48"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  QRコードをスキャンできない場合は、以下のシークレットキーを手動で入力してください:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-gray-100 px-3 py-2 text-sm font-mono break-all">
                    {mfa.secret}
                  </code>
                  <Button variant="outline" size="sm" onClick={handleCopySecret}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="totp-code">
                  2. 認証アプリに表示された6桁のコードを入力してください。
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="totp-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={totpCode}
                    onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    className="max-w-[160px] text-center text-lg tracking-widest"
                  />
                  <Button
                    onClick={handleVerify}
                    disabled={loading || totpCode.length !== 6}
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    確認
                  </Button>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMfa({ step: 'idle', enrolled: false });
                  setTotpCode('');
                  setError('');
                }}
              >
                キャンセル
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
