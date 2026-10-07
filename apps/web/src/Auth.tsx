import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { loginSchema, registerSchema } from '@ritmo/shared';
import { ArrowRight, Sparkles } from 'lucide-react';
import { api, queryClient } from './api';
import type { User } from './models';
import { Button, Field, useAction } from './ui';
export function Auth() {
  const [registerMode, setRegisterMode] = useState(false);
  const action = useAction();
  const schema = registerMode
    ? registerSchema.omit({ timezone: true })
    : loginSchema.extend({ name: z.string().optional() });
  const form = useForm<{ name?: string; email: string; password: string }>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const submit = form.handleSubmit(async (values) => {
    const user = await action.run(
      () =>
        api<User>(registerMode ? '/auth/register' : '/auth/login', 'POST', {
          ...values,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      '',
    );
    if (user) {
      localStorage.setItem('ritmo:user', user.id);
      localStorage.setItem(`ritmo:cache:${user.id}:/auth/me`, JSON.stringify(user));
      queryClient.setQueryData(['/auth/me'], user);
    }
  });
  return (
    <main className="auth-page">
      <aside className="auth-story">
        <div className="brand">
          <span className="brand-mark">r</span>ritmo<span className="brand-dot">.</span>
        </div>
        <div>
          <span className="pill">
            <Sparkles size={14} /> UM DIA DE CADA VEZ
          </span>
          <h1>
            Tempo para
            <br />o que <em>importa.</em>
          </h1>
          <p>
            Uma rotina que acompanha a sua vida.
            <br />
            Encontre espaço. Cuide de você. Siga seu ritmo.
          </p>
          <div className="orbit">
            <span>☀️</span>
            <span>📚</span>
            <span>🌙</span>
            <span>🏋️</span>
            <div className="orbit-center">
              Seu
              <br />
              <b>ritmo.</b>
            </div>
          </div>
        </div>
        <small>SUA ROTINA, COM MAIS LEVEZA.</small>
      </aside>
      <section className="auth-form">
        <div className="mobile-brand brand">
          <span className="brand-mark">r</span>ritmo.
        </div>
        <p className="eyebrow">SEU PRÓXIMO PASSO</p>
        <h2>{registerMode ? 'Vamos encontrar seu ritmo.' : 'Bom ter você de volta.'}</h2>
        <p className="muted">
          {registerMode
            ? 'Comece com uma conta. O resto a gente organiza juntos.'
            : 'Entre para ver o que seu dia tem reservado.'}
        </p>
        <form onSubmit={submit}>
          {registerMode && (
            <Field label="Seu nome">
              <input autoComplete="name" {...form.register('name')} />
              <small className="error">{form.formState.errors.name?.message}</small>
            </Field>
          )}
          <Field label="E-mail">
            <input
              type="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              {...form.register('email')}
            />
            <small className="error">{form.formState.errors.email?.message}</small>
          </Field>
          <Field label="Senha">
            <input
              type="password"
              autoComplete={registerMode ? 'new-password' : 'current-password'}
              placeholder={registerMode ? 'Pelo menos 10 caracteres' : 'Sua senha'}
              {...form.register('password')}
            />
            <small className="error">{form.formState.errors.password?.message}</small>
          </Field>
          <Button loading={action.pending} type="submit" className="full">
            {registerMode ? 'Criar minha conta' : 'Entrar no meu dia'}
            <ArrowRight size={18} />
          </Button>
        </form>
        <p className="auth-switch">
          {registerMode ? 'Já tem uma conta?' : 'Ainda não tem conta?'}{' '}
          <button
            onClick={() => {
              setRegisterMode(!registerMode);
              form.clearErrors();
            }}
          >
            {registerMode ? 'Entrar' : 'Começar agora'}
          </button>
        </p>
      </section>
    </main>
  );
}
