import { spawn } from 'child_process';

/** stdout/stderr tampon tavanı — kötü niyetli dosya sonsuz log üretip belleği şişiremesin. */
const MAX_OUTPUT_BYTES = 1024 * 1024;

export class BinaryTimeoutError extends Error {}
export class BinaryFailedError extends Error {}

/**
 * C13 R7 — dış ikili çalıştırıcı (ffmpeg/ffprobe). `shell` YOK, argüman DİZİSİ, stdin kapalı,
 * zaman aşımında süreç öldürülür. Çıkış kodu != 0 → BinaryFailedError (stderr'in sonu mesajda).
 */
export function runBinary(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() => reject(new BinaryTimeoutError(`${bin} zaman aşımı (${timeoutMs} ms)`)));
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += d.toString();
    });
    child.on('error', (err) => finish(() => reject(new BinaryFailedError(err.message))));
    child.on('close', (code) =>
      finish(() =>
        code === 0
          ? resolve(stdout)
          : reject(new BinaryFailedError(`${bin} çıkış kodu ${code}: ${stderr.slice(-500)}`)),
      ),
    );
  });
}
