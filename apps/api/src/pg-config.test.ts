import { describe, it, expect } from 'vitest';
import { postgresConfig } from './pg-config.js';
describe('TLS PostgreSQL hospedado', () => {
  it('valida certificados Supabase com CA oficial sem relaxar hostname', () => {
    const config = postgresConfig(
      'postgresql://user:example@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require',
    );
    expect(config.ssl).toMatchObject({
      rejectUnauthorized: true,
      ca: expect.stringContaining('BEGIN CERTIFICATE'),
    });
    expect(new URL(config.connectionString!).searchParams.has('sslmode')).toBe(false);
  });
  it('preserva configuração de outros bancos e do desenvolvimento local', () => {
    const value = 'postgresql://user:example@localhost:5433/example';
    expect(postgresConfig(value)).toEqual({ connectionString: value });
  });
  it('erro de conexão malformada não contém o valor informado', () => {
    expect(() => postgresConfig('invalid-example')).toThrow('Conexão PostgreSQL inválida.');
  });
});
