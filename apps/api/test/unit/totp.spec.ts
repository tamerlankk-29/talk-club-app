import {
  base32Decode,
  base32Encode,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  totpCode,
  totpStep,
  verifyTotp,
} from '../../src/modules/auth/totp';

describe('TOTP (RFC 6238)', () => {
  // RFC 6238 appendix B test secret "12345678901234567890" (SHA-1), 8-digit vectors truncated to 6.
  const secret = base32Encode(Buffer.from('12345678901234567890'));

  it('matches the RFC test vectors', () => {
    expect(totpCode(secret, totpStep(59_000))).toBe('287082');
    expect(totpCode(secret, totpStep(1_111_111_109_000))).toBe('081804');
    expect(totpCode(secret, totpStep(1_234_567_890_000))).toBe('005924');
    expect(totpCode(secret, totpStep(2_000_000_000_000))).toBe('279037');
  });

  it('round-trips base32', () => {
    const buf = Buffer.from('any bytes \u0000ÿ');
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });

  it('accepts the neighbouring steps and refuses replays', () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    expect(verifyTotp(secret, totpCode(secret, step), now, null)).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step - 2), now, null)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, step), now, step)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now, null)).toBeNull();
  });

  it('encrypts the stored secret with the app secret', () => {
    const stored = encryptTotpSecret(secret, 'app-secret');
    expect(stored).not.toContain(secret);
    expect(decryptTotpSecret(stored, 'app-secret')).toBe(secret);
    expect(() => decryptTotpSecret(stored, 'other-secret')).toThrow();
  });

  it('makes distinct recovery codes that hash case-insensitively', () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
    expect(hashRecoveryCode(codes[0].toUpperCase())).toBe(hashRecoveryCode(codes[0]));
  });
});
