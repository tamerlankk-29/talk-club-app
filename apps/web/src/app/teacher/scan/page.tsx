'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import jsQR from 'jsqr';
import { CameraOff, CircleCheckBig, CircleX } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/feedback';
import { Select } from '@/components/ui/inputs';
import { Card } from '@/components/ui/layout';
import { api, call, errorMessage } from '@/lib/api/client';
import type { S } from '@/lib/api/types';

type Result = { ok: true; data: S<'CheckinResultDto'> } | { ok: false; message: string };

interface Detector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

/** Camera scanner for clients' rotating check-in QR codes. */
function Scanner() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastToken = useRef<{ token: string; at: number } | null>(null);
  const busy = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [sessionId, setSessionId] = useState(params.get('session') ?? '');
  const today = useQuery({ queryKey: ['teacher', 'sessions', 'today'], queryFn: () => call(api.GET('/api/teacher/sessions', { params: { query: { scope: 'today' } } })) });

  const checkin = useMutation({
    mutationFn: (token: string) => call(api.POST('/api/attendance/check-in', { body: { token, sessionId: sessionId || undefined } })),
  });

  const handle = useCallback(
    async (token: string) => {
      const now = Date.now();
      if (busy.current || (lastToken.current && lastToken.current.token === token && now - lastToken.current.at < 4000)) return;
      busy.current = true;
      lastToken.current = { token, at: now };
      try {
        const data = await checkin.mutateAsync(token);
        setResults((r) => [{ ok: true as const, data }, ...r].slice(0, 8));
        navigator.vibrate?.(80);
        await qc.invalidateQueries({ queryKey: ['teacher'] });
      } catch (e) {
        setResults((r) => [{ ok: false as const, message: errorMessage(e) }, ...r].slice(0, 8));
        navigator.vibrate?.([60, 60, 60]);
      } finally {
        busy.current = false;
      }
    },
    [checkin, qc],
  );

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector: Detector | null =
      typeof window !== 'undefined' && 'BarcodeDetector' in window
        ? new (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector({ formats: ['qr_code'] })
        : null;

    const tick = async () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          let value: string | null = null;
          if (detector) {
            try {
              value = (await detector.detect(canvas))[0]?.rawValue ?? null;
            } catch {
              value = null;
            }
          } else {
            const img = ctx.getImageData(0, 0, w, h);
            value = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null;
          }
          if (value) void handle(value);
        }
      }
      raf = requestAnimationFrame(() => void tick());
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        raf = requestAnimationFrame(() => void tick());
      } catch (e) {
        setCameraError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Camera access was denied. Allow it in the browser settings.' : 'No camera available on this device.');
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [handle]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">Check-in</h1>
      <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)} aria-label="Session">
        <option value="">Current session (automatic)</option>
        {today.data?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.startTime} · {s.title}
          </option>
        ))}
      </Select>
      <Card padded={false} className="relative aspect-square overflow-hidden bg-ink">
        {cameraError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-white">
            <CameraOff className="h-10 w-10" />
            <p className="text-sm">{cameraError}</p>
            <Button variant="white" size="sm" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            <div className="pointer-events-none absolute inset-[18%] rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(27,21,48,0.45)]" aria-hidden="true" />
            <p className="absolute inset-x-0 bottom-4 text-center text-sm font-semibold text-white">Point the camera at the client&apos;s QR code</p>
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </Card>
      <div className="space-y-2" aria-live="polite">
        {results.map((r, i) =>
          r.ok ? (
            <InlineAlert key={i} tone="success" icon={<CircleCheckBig className="h-5 w-5" />} title={`${r.data.clientName} — ${r.data.status === 'LATE' ? 'late' : 'present'}`}>
              {r.data.startTime} · {r.data.sessionTitle}
              {r.data.previousStatus ? ` (was ${r.data.previousStatus.toLowerCase()})` : ''}
            </InlineAlert>
          ) : (
            <InlineAlert key={i} tone="danger" icon={<CircleX className="h-5 w-5" />}>
              {r.message}
            </InlineAlert>
          ),
        )}
      </div>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense>
      <Scanner />
    </Suspense>
  );
}
