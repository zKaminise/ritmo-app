# Ritmo na Vercel Hobby + Supabase Free

Publicado em **https://ritmo-app-rho.vercel.app** em 8 de outubro de 2026.
Projeto Vercel `ritmo-app`, branch de produção `main`, banco Supabase Free vinculado
somente a Production. Onze variáveis do backend foram importadas como Sensitive em
Production; a integração mantém suas variáveis adicionais no mesmo ambiente.
As seis migrations foram aplicadas e somente a conta pessoal foi migrada.
O job `ritmo-reminders` está ativo a cada minuto, com respostas HTTP 201 e heartbeat
registrado. Login, sessão, dados, CRUD de evento, telas 390×844/1920×1080 e PWA HTTPS
foram verificados no domínio público. Push nativo ainda exige permissão no celular.

O deploy usa o `vercel.json` na raiz, preset **Services**, Root Directory **./** e um
único serviço HTTP construído por `Dockerfile.vercel`. A API serve o frontend compilado,
o manifest, os ícones e o Service Worker no mesmo domínio HTTPS.

## Recursos

- Vercel: frontend e API no mesmo domínio; o container pode escalar a zero.
- Supabase: PostgreSQL, `pg_cron`, `pg_net` e Vault para acionar lembretes.
- Nenhum cron de minuto da Vercel Hobby é necessário.
- O funcionamento local mantém PostgreSQL em 5433 e worker contínuo a cada 15 segundos.

## Variáveis na Vercel

| Variável            | Valor                                                                              |
| ------------------- | ---------------------------------------------------------------------------------- |
| `DATABASE_URL`      | Conexão privada do pooler Supabase em modo transaction (6543)                      |
| `DIRECT_URL`        | Conexão privada do pooler em modo session (5432), usada nas migrations             |
| `NODE_ENV`          | `production`                                                                       |
| `PORT`              | `3000`                                                                             |
| `SCHEDULER_MODE`    | `external`                                                                         |
| `DB_POOL_MAX`       | `3`                                                                                |
| `SESSION_DAYS`      | `30`                                                                               |
| `CRON_SECRET`       | Segredo aleatório de pelo menos 32 caracteres, somente no servidor/Vault           |
| `VAPID_PUBLIC_KEY`  | Chave pública da instalação                                                        |
| `VAPID_PRIVATE_KEY` | Chave privada, somente no servidor                                                 |
| `VAPID_SUBJECT`     | Contato VAPID válido                                                               |
| `APP_URL`           | Opcional: domínio HTTPS definitivo; sem valor, usa `VERCEL_PROJECT_PRODUCTION_URL` |

O Supabase pode fornecer `POSTGRES_URL` e `POSTGRES_URL_NON_POOLING`; os scripts locais
convertem esses nomes em `DATABASE_URL`/`DIRECT_URL`. Não use endereço localhost no deploy.
Variáveis privadas não devem usar prefixo `VITE_` e não devem ser commitadas.

O backend valida certificados e hostname do PostgreSQL com a CA pública oficial
do Supabase em `apps/api/certs/supabase-ca.crt`, obtida pelo link Download certificate
do painel. Não há `rejectUnauthorized: false`. A CA pública não é uma chave privada.
Migrations no Supabase usam a mesma CA e `sslaccept=strict`.

## Banco e migração da conta

1. Crie um recurso Supabase Free na integração da Vercel.
2. Guarde as variáveis fornecidas em `work/remote.env`, ignorado pelo Git.
3. Execute `npm run deployment:env` para preparar `work/deployment.env`, também ignorado.
4. Aplique as migrations com `DATABASE_URL` e `DIRECT_URL` do destino no ambiente do processo.
5. Use `BOOTSTRAP_USER_EMAIL` e `npm run data:migrate` para copiar somente a conta selecionada.

A cópia preserva o hash da senha, configurações, rotinas, metas, eventos, ocorrências,
conclusões, sessões de foco e incidentes. Não copia cookies/sessões de login, inscrições
push de localhost, dados de contas fictícias nem lembretes de teste.
Reexecutar é idempotente e não substitui registros já existentes no destino.
Conexões remotas administrativas podem levar mais tempo; a materialização inicial tem
timeout maior, enquanto a API mantém o limite normal.

As tabelas do aplicativo ficam com RLS e sem privilégios para `anon`/`authenticated`
quando esses papéis do Supabase existem. O aplicativo continua usando sua autenticação
própria e a conexão privada do backend; a Data API pública não expõe dados pessoais.

## Agendamento independente do computador

Após o deploy, defina `DEPLOYMENT_APP_URL` com a URL HTTPS definitiva e execute:

```powershell
npm run build -w @ritmo/api
npm run scheduler:configure
```

O script ativa `pg_cron`, `pg_net` e Vault. Guarda URL e `CRON_SECRET` no Vault e cria
o job `ritmo-reminders`, que chama `POST /api/internal/scheduler` a cada minuto com
Authorization Bearer. Nenhum segredo aparece no comando persistido do cron.

O cron apenas aciona o worker existente: os lembretes continuam na fila persistida,
com reserva atômica, entregas idempotentes, retries por dispositivo e desativação de 410.
Um lease em `SchedulerState` impede ciclos HTTP concorrentes. Cada ciclo registra
heartbeat, estado de erro e reposição do horizonte. Reposição ocorre a cada seis horas,
além da atualização normal ao editar rotinas ou consultar o calendário.
Previews não executam entregas automáticas. Cookies Secure e a verificação de origem
permanecem ativos em produção.

## Teste no celular

1. Abra a URL HTTPS de produção e entre na conta configurada.
2. Confira horários, timezone, rotinas e metas.
3. No iPhone, Safari → Compartilhar → Adicionar à Tela de Início.
4. Abra pelo ícone e vá a Perfil → Notificações → Ativar notificações.
5. Envie o push de teste e crie o lembrete de 1 minuto.
6. Feche o app. Toque na notificação para abrir Hoje ou o compromisso correspondente.
7. Confira o último ciclo do agendador, último envio e último recebimento no Diagnóstico.

O agendamento remoto pode acrescentar até cerca de um minuto, além de cold start e
latência do serviço push. PWA não é alarme de sistema e pode ser afetada por modos Foco,
permissões e restrições do telefone. Plano gratuito tem limites de recursos; monitore
uso e estado do job. Não é contratado plano pago automaticamente por estes scripts.

## Atualizações

Push em `main` dispara novos deploys do projeto conectado. Mudanças de schema exigem
aplicar as migrations no banco remoto antes de usar o código novo. Segredos, URLs de
conexão e relatórios locais ficam fora do Git. Backup dos dados privados é separado do
versionamento do aplicativo.
