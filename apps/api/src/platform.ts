export function schedulerMode(): 'external' | 'continuous' | 'preview-disabled' {
  if (process.env.VERCEL_ENV === 'preview') return 'preview-disabled';
  if (process.env.SCHEDULER_MODE === 'external' || process.env.VERCEL === '1') return 'external';
  return 'continuous';
}
export function appOrigin() {
  const configured = process.env.APP_URL || undefined;
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const url = configured ?? (production ? `https://${production}` : 'http://localhost:5173');
  return new URL(url).origin;
}
