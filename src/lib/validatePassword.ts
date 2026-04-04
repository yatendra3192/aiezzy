/**
 * Server-side password strength validation.
 * Returns null if valid, or an error message string if invalid.
 */
export function validatePassword(password: string): string | null {
  if (!password || password.length < 10) {
    return 'Password must be at least 10 characters';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  return null;
}
