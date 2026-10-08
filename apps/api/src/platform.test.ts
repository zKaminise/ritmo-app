import { afterEach, describe, expect, it, vi } from 'vitest';
import { appOrigin, schedulerMode } from './platform.js';
afterEach(() => vi.unstubAllEnvs());
describe('ambiente de hospedagem', () => {
  it('preserva scheduler contínuo local', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('SCHEDULER_MODE', 'continuous');
    expect(schedulerMode()).toBe('continuous');
  });
  it('usa chamadas externas na Vercel', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(schedulerMode()).toBe('external');
  });
  it('desativa entregas automáticas nos previews', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(schedulerMode()).toBe('preview-disabled');
  });
  it('resolve domínio HTTPS do projeto sem valor hardcoded', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'ritmo-exemplo.vercel.app');
    expect(appOrigin()).toBe('https://ritmo-exemplo.vercel.app');
  });
  it('respeita domínio personalizado configurado', () => {
    vi.stubEnv('APP_URL', 'https://rotina.example.com');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'ritmo-exemplo.vercel.app');
    expect(appOrigin()).toBe('https://rotina.example.com');
  });
});
