import { describe, expect, it } from 'vitest';
import { signInBrand } from './config';

/**
 * The sign-in screen is the only one that renders before a session
 * exists, so it cannot read the tenant from a verified JWT. It used to
 * hard-code "Angono National High School" and an "ANHS" badge, which is
 * the single most ANHS-specific thing in the application.
 *
 * These pin the resolution order. Nothing here is a security control —
 * the tenant a user actually belongs to is still decided by their JWT
 * after they sign in. This only decides whose name is on the door.
 */
describe('sign-in branding', () => {
  it('names the platform, not a school, on an unknown host', () => {
    // The important case. A fresh deployment must not greet every school
    // with the first customer's name.
    expect(signInBrand('app.mendtrix.example')).toEqual({
      name: 'Mendtrix Academic Records', mark: 'MAR',
    });
  });

  it('recognises a known school by its subdomain', () => {
    expect(signInBrand('anhs.mendtrix.app')).toEqual({
      name: 'Angono National High School', mark: 'ANHS',
    });
  });

  it('is case-insensitive about the host', () => {
    expect(signInBrand('ANHS.Mendtrix.App').mark).toBe('ANHS');
  });

  it('falls back to the platform for a bare hostname', () => {
    expect(signInBrand('localhost').name).toBe('Mendtrix Academic Records');
    expect(signInBrand('').name).toBe('Mendtrix Academic Records');
  });
});
