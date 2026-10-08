# Ritmo

Deploy na Vercel: consulte [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md) para a configuração
Services com Supabase Free, agendador protegido e teste da PWA no celular.

Aplicação de rotina e organização pessoal, mobile-first, com frontend React, API NestJS,
PostgreSQL, PWA e Web Push real. A pergunta principal é **“O que eu deveria estar fazendo agora?”**
Todo compromisso é configurável. Dados pessoais de rotina ficam no banco ou em arquivos locais ignorados pelo Git.

## Acesso nesta máquina

O projeto está em `D:\Importante\Codex\App Rotina`.
Foi criado um cluster **isolado** de PostgreSQL em `work/pgdata`, escutando somente em
`127.0.0.1:5433`. O PostgreSQL existente na porta 5432 não foi alterado.
As migrations e o seed já foram aplicados; as chaves VAPID locais estão no `.env` ignorado pelo Git.

Abra **http://localhost:3000** para usar o frontend compilado servido pela API.
Sua conta local pode ser configurada pelo bootstrap administrativo descrito abaixo.
Contas configuradas por importação de perfil abrem diretamente em Hoje; novas contas comuns fazem onboarding.
Também é possível usar o usuário demonstrativo
`gabriel@ritmo.local` com a senha gerada pelo seed. Nenhuma senha real é documentada neste projeto.

Após reiniciar o Windows:

```powershell
cd 'D:\Importante\Codex\App Rotina'
powershell -ExecutionPolicy Bypass -File scripts/local-db.ps1 start
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1
```

Para encerrar apenas os processos deste projeto:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/stop-local.ps1
powershell -ExecutionPolicy Bypass -File scripts/local-db.ps1 stop
```

Os scripts não controlam o serviço PostgreSQL preexistente. `local-db.ps1` é um auxiliar
para este cluster já inicializado; em outra máquina use Docker ou seu próprio PostgreSQL.

## Arquitetura e estrutura

```text
apps/
  web/
    src/              telas, formulários, cache privado de leitura, React Query
    public/           manifest, Service Worker, ícones, fallback offline
    dist/             frontend compilado
  api/
    src/
      auth.ts         Argon2id, sessões opacas e cookie HttpOnly
      agenda.ts       rotinas, eventos, exceções, conclusão, foco e onboarding
      materializer.ts materialização transacional e lembretes persistentes
      push.ts         VAPID, subscriptions e entregas por dispositivo
      worker.ts       reservas atômicas, retry, recuperação e reposição de horizonte
      insights.ts     dashboard, metas, resumo e planejador
      controllers.ts  endpoints REST e validação de entrada
      bootstrap.ts    segurança, Swagger e serviço do frontend
      generated/      cliente Prisma gerado; não editar
    dist/             backend compilado
packages/shared/src/  schemas Zod e algoritmos puros de tempo, recorrência e planner
prisma/
  schema.prisma
  migrations/         SQL versionado; inclui índices, FKs e restrições
  seed.ts
scripts/              chaves VAPID, precache de build e utilitários locais
tests/browser/        testes Playwright com o frontend real
work/                 logs, cluster local e resultados de teste; ignorado pelo Git
```

React 19, Vite 8, Tailwind 4, TanStack Query 5, React Router 7, React Hook Form 7,
Zod 4, NestJS 12 e Prisma 7.10. Versões exatas resolvidas estão no `package-lock.json`.
TypeScript 6 é utilizado por ser compatível com o ESLint e NestJS atuais. Prisma 8 RC
foi evitado por não ser uma versão estável. As dependências transitivas `shell-quote`,
`deepmerge-ts` e `mysql2` possuem overrides para versões corrigidas; os comandos Prisma
e os testes foram executados com essas versões.

O backend serve `apps/web/dist` e o fallback da SPA. Frontend e API compartilham um domínio.
No desenvolvimento, Vite encaminha `/api` para a API em 3000.

## Funcionalidades

- Cadastro, login, logout, sessão de 30 dias com hash do token no banco e senha Argon2id.
- Autorização de todos os dados por usuário, validação Zod nos pipes NestJS, Helmet,
  limites de requisição, verificação de origem e erros amigáveis.
- Onboarding com sono, início do dia, trabalho, faculdade, academia, estudo e lembretes.
- Rotinas semanais com prioridade, cor, emoji, categoria, flexibilidade, local, observações e vários lembretes.
- Eventos excepcionais com detecção prévia de conflitos: manter ambos, alterar ou pular uma ocorrência.
- Exceções por dia e divisão da recorrência a partir de uma data, preservando o histórico.
- Dashboard Agora/Próximo, contagem regressiva, progresso, timeline, períodos livres e sugestões.
- Calendário diário, semanal e mensal; editar tocando no compromisso.
- Metas diárias/semanais em minutos, horas ou vezes; filtro opcional por tópico (Java, Node etc.).
- CompletionLog idempotente: concluído, parcial, pulado e não registrado.
- Resumo semanal, percentual de rotina, streak de estudo e treinos concluídos na semana.
- Sessões de foco persistentes, uma por usuário, com registro do tempo real e recuperação após fechar o app.
- Planner determinístico com prioridades, sono, preferências, buffers e metas ainda não cumpridas.
  Sugestões só entram na agenda após clicar em Adicionar, salvo autorização explícita da opção automática.
- Preferências editáveis de sono, treino, estudo, timezone, tema e lembretes por categoria; categorias personalizadas.
- PWA, ícones 192/512 e maskable, instalação, orientação para iPhone e diagnósticos.
- Push API + Service Worker + VAPID + web-push; envio de teste e abertura do compromisso no clique.
- Snooze de 5/10/15/30 minutos sem modificar o horário da atividade; ação de 10 minutos na notificação quando suportada.
- Cache do shell e das páginas compiladas, agenda e rotina recentemente carregadas disponíveis offline.
  Alterações requerem conexão e nunca são apresentadas como sincronizadas enquanto offline.
- Tema escuro e claro, navegação inferior no celular e sidebar no desktop.
- Bootstrap administrativo seguro, idempotente, com redefinição explícita de senha e revogação das sessões anteriores.
- Perfil pt-BR, formato 24 horas e semana iniciando na segunda-feira; estudo mínimo/ideal editável.
- Meu aprendizado: tecnologias associadas a metas, duração 30/45/60 min ou personalizada, notas e histórico de hoje/semana/mês.
- Aprendizados de incidentes com CRUD, autorização por usuário e alerta para evitar informações confidenciais.
- Quick Add com categorias rápidas e opções avançadas recolhidas; relógio e countdown em segundos na tela Hoje.
- Diagnóstico com estado do backend, último push enviado/recebido e criação autenticada de lembrete para +1 minuto.

## Pré-requisitos e instalação nova

- Node.js 22.18 ou superior (recomendado Node 22 LTS ou 24 LTS).
- npm 10 ou superior.
- Docker Desktop/Engine ativo para Compose, ou PostgreSQL 16+ com um banco próprio.
- Para Web Push fora de localhost: domínio HTTPS e certificado válido.

```powershell
Copy-Item .env.example .env
# Preencha DATABASE_URL e TEST_DATABASE_URL com suas conexões locais.
# O Compose usa usuário/banco ritmo; configure uma senha própria em POSTGRES_PASSWORD.
docker compose up -d
npm install
npm run db:migrate
npm run vapid:generate
# Copie as duas chaves geradas para .env e configure VAPID_SUBJECT.
npm run db:seed
npm run dev
```

Desenvolvimento: **http://localhost:5173**. API: **http://localhost:3000/api**.
Swagger/OpenAPI: **http://localhost:3000/api/docs** e `/api/openapi.json`.

O Compose de desenvolvimento expõe o banco em `127.0.0.1:5432`. Se essa porta já estiver
ocupada, altere a porta do Compose e `DATABASE_URL`. Nesta instalação foi usada 5433.
Não use a URL do cluster local desta máquina em um servidor de produção.

Para servir a versão compilada localmente:

```powershell
npm run build
npm start
```

Abra http://localhost:3000. O worker inicia junto com a API. Para testar offline, use
**a versão compilada**; o servidor de desenvolvimento depende de módulos e HMR online.

## Variáveis de ambiente

| Variável            | Uso                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | PostgreSQL direto, por exemplo `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`                     |
| `APP_URL`           | Origem do app. Desenvolvimento: `http://localhost:5173`; produção: `https://rotina.seudominio.com` |
| `PORT`              | Porta HTTP da API, padrão 3000                                                                     |
| `NODE_ENV`          | `development`, `production` ou `test`                                                              |
| `SESSION_DAYS`      | Validade da sessão, padrão 30 dias                                                                 |
| `VAPID_PUBLIC_KEY`  | Chave pública para inscrição do navegador                                                          |
| `VAPID_PRIVATE_KEY` | Segredo usado no servidor; nunca enviar ao frontend ou commitar                                    |
| `VAPID_SUBJECT`     | Contato VAPID válido, `mailto:voce@dominio.com` ou URL HTTPS                                       |
| `DEMO_EMAIL`        | E-mail do seed opcional, padrão `gabriel@ritmo.local`                                              |
| `DEMO_PASSWORD`     | Senha de seed opcional; vazia gera uma senha aleatória no primeiro seed                            |
| `TEST_DATABASE_URL` | Banco isolado para E2E cujo nome termine em `_test`                                                |
| `POSTGRES_PASSWORD` | Senha do banco no Compose de produção; use valor forte e URL-encoded na conexão                    |
| `UI_TEST_URL`       | URL usada pelo Playwright, padrão `http://localhost:3000`                                          |

Não é usado JWT. A sessão é um token aleatório de 256 bits em cookie HttpOnly,
SameSite=Lax, Secure em produção. O banco guarda somente SHA-256 do token.
Nenhuma senha ou credencial de sessão fica em localStorage.

Se as chaves VAPID estiverem vazias, a agenda funciona e a tela explica que push precisa
ser configurado. Para ativar o recurso, preencha **as três** variáveis VAPID e reinicie a API.
Não regenere chaves a cada deploy: subscriptions existentes dependem da chave original.

## Banco, migrations e seed

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:studio
```

`db:migrate` executa migrations SQL reais com `prisma migrate deploy`.
Ao desenvolver uma alteração de schema, use `npm run db:migrate:dev -- --name nome_da_alteracao`
e versione a migration resultante. Não use `db push` para implantação.

O seed é idempotente: se o e-mail demonstrativo existe, preserva os dados. O exemplo
inclui trabalho dividido antes/depois do almoço, almoço flexível, horários de faculdade
por dia, academia, estudo Java, sono, acordar e metas. Pode haver conflito demonstrativo
entre o estudo flexível e a faculdade de quarta; o app permite ao usuário ajustar.
O seed não cria dados para outros usuários nem injeta compromissos na regra do sistema.
Não execute o seed em produção se não quiser uma conta demonstrativa.

## Notificações e confiabilidade

RoutineRule guarda dias, horário local e timezone IANA. ScheduledOccurrence guarda
datas concretas em `timestamptz`; Reminder guarda `scheduledAt` e `nextAttemptAt` em UTC.
O horizonte padrão é 16 datas locais (hoje e 15 dias à frente), garantindo pelo menos
14 dias futuros. É reposto a cada 10 minutos e após alterações; leituras de calendário
também materializam o intervalo consultado, limitado a 45 dias.

O loop de envio roda a cada **15 segundos**, independentemente da reposição de horizonte.
Reserva lembretes com `UPDATE … SELECT FOR UPDATE SKIP LOCKED`. Instâncias concorrentes
não reservam o mesmo lembrete. Chaves únicas impedem duplicação de ocorrências, lembretes
regulares e entregas por `(reminderId, subscriptionId)`. Exceções cancelam lembretes antigos.
Adiar cria um Reminder novo e não altera a ocorrência original.

Estados persistidos: PENDING, PROCESSING, SENT, FAILED, CANCELLED; attempts, sentAt,
claimedAt e lastError ficam disponíveis. Cada dispositivo tem seu registro de entrega.
404/410 desativam a subscription. 429/5xx possuem até três tentativas com backoff.
Entregas bem-sucedidas não são repetidas ao retentar os outros dispositivos.
Lembretes atrasados há mais de uma hora são cancelados; o payload tem TTL de uma hora.

Não existe garantia matemática de “exactly once” entre um banco e um serviço Web Push
externo sem protocolo de confirmação transacional. Se a resposta de rede for desconhecida,
ou o processo cair durante um envio, a entrega fica FAILED e **não é retentada automaticamente**,
evitando duplicação à custa de um possível lembrete perdido. Uma reserva sem envio pode
ser recuperada após 10 minutos. O Service Worker também deduplica reminderId em IndexedDB
e usa tag por lembrete. SENT significa aceito pelo serviço de push, não lido pelo usuário.

## Como testar no computador

1. Crie conta e conclua o onboarding.
2. Em Minha semana, adicione trabalho e faculdade, escolhendo dias e horários.
3. Em Metas, crie academia semanal e estudo diário.
4. Em Perfil, verifique timezone e preferências; salve as alterações.
5. Em Notificações, clique **Ativar notificações**, permita no navegador e confirme
   “Dispositivo inscrito”. A permissão nunca é solicitada sem esse clique.
6. Clique **Enviar notificação de teste**. Aguarde até 15 segundos; confira os estados em Diagnóstico.
7. Crie um evento para dois minutos à frente com lembrete `0`; feche todas as abas do Ritmo
   mantendo API e PostgreSQL ativos. Aguarde o push; clique e confirme a abertura do compromisso.
8. Conclua a atividade e confira a atualização da meta correspondente.
9. Crie um evento que sobreponha outro. O formulário permite manter ambos, alterar ou pular aquele dia.
10. Para offline, carregue Hoje, Calendário e Minha semana, aguarde a ativação do Service Worker,
    recarregue e desligue a rede. As telas previamente carregadas continuam disponíveis.
    Novas datas sem cache podem mostrar um estado de erro de conexão.

“App fechado” significa sem aba/janela do app; desligar o dispositivo, forçar o encerramento
do navegador ou bloquear execução em segundo plano pode impedir a entrega pela plataforma.
Notifications, Push API e a rede de push precisam estar disponíveis no navegador usado.

## iPhone e HTTPS

Web Push em iPhone requer iOS/iPadOS 16.4+ e o app adicionado à Tela de Início.
Referência: [Web Push no iOS/iPadOS, documentação WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
O telefone não interpreta o localhost do computador como um servidor remoto.
Use um domínio HTTPS acessível, com certificado válido, apontado para esta API.

1. Abra o endereço HTTPS no Safari.
2. Compartilhar → **Adicionar à Tela de Início**.
3. Abra pelo ícone do Ritmo, faça login e vá a Perfil → Notificações.
4. Toque em Ativar notificações e permita; confira a subscription ativa no Diagnóstico.
5. Envie o teste, feche o app e confirme a notificação e a abertura do compromisso.
6. Confira “Último push recebido”, timezone e estado do Service Worker no Diagnóstico.

A orientação de instalação desaparece quando o app está instalado. Som, vibração,
ações de notificação e badges dependem do sistema. Não existe dependência de som personalizado,
SpeechSynthesis ou timers no frontend para envio de lembretes. Modo foco usa o instante
persistido do servidor para reconstruir o cronômetro após reabrir.

## Testes e verificações

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm audit
```

Os testes E2E usam PostgreSQL real e removem somente usuários criados pelo próprio teste.
Eles recusam um banco cujo nome não termine em `_test`.
Crie previamente o banco, adicione `TEST_DATABASE_URL` ao `.env` e aplique migrations:

```powershell
# Substitua pela conexão do seu banco de teste isolado.
$env:DATABASE_URL='postgresql://USER:PASSWORD@HOST:PORT/DATABASE_test'
npm run db:migrate
Remove-Item Env:DATABASE_URL
npm run test:e2e
```

Testes de navegador (com a aplicação compilada em execução):

```powershell
npx playwright install chromium
npm run test:browser
```

O Playwright testa o frontend contra o backend real, cadastro, onboarding, rotinas,
metas, conflito, conclusão, foco persistente, diagnóstico, responsividade e cache offline.
Os testes unitários também executam o código real do Service Worker com adaptadores
de plataforma para verificar recebimento de push, deduplicação em IndexedDB, diagnóstico,
snooze e navegação no clique. As APIs nativas de notificação são simuladas nessa suíte;
o Chromium headless deste ambiente não concedeu permissão nativa ao worker.
O código de produção continua usando showNotification nativo e web-push real.
Relatório e screenshots ficam em `work/browser-report` e `work/browser-*.png`.
O transporte Web Push é simulado nos testes de concorrência do backend; o teste real
de aceitação no dispositivo é o roteiro anterior, pois depende da permissão e do serviço
de push externo. Nenhum teste automático significa que um iPhone físico foi validado.

## Deploy

O Dockerfile tem build em múltiplos estágios, usuário não root e healthcheck.
O Compose de produção espera secrets no `.env` e uma senha forte em POSTGRES_PASSWORD.

```bash
docker compose -f compose.production.yml up -d --build
```

A etapa migrate espera o banco saudável, aplica migrations e a etapa app espera
essa conclusão. Use reverse proxy (Caddy/Nginx/Traefik) com TLS para o domínio de APP_URL,
encaminhando **todo o domínio** para `127.0.0.1:3000`. Configure HTTP→HTTPS no proxy.
Produção recusa APP_URL sem HTTPS e utiliza cookies Secure.

Exemplo de Caddyfile:

```caddy
rotina.seudominio.com {
  reverse_proxy 127.0.0.1:3000
}
```

O banco não é exposto na configuração de produção. Restrinja o acesso à porta da API
ao proxy; `trust proxy=1` pressupõe um único proxy confiável. Faça backup do PostgreSQL
e das chaves VAPID, mantenha a API/worker ativos e monitore logs e entregas FAILED.
Não use proxy cache em `/api`, `/sw.js` ou `index.html`.

O rate limit básico usa memória por processo. Para várias réplicas, adicione um store
compartilhado de rate limiting. As reservas e a idempotência de lembretes já usam o banco
e suportam workers concorrentes. Em escala, separe o processo de materialização e de
envio, monitore atraso da fila e dimensione o pool PostgreSQL.

## Limitações conhecidas e próximos passos

- Alterações offline não entram em fila de sincronização. O cache de leitura é privado
  por conta e é removido ao sair; contém dados de agenda em localStorage, sem credenciais.
- Uma regra semanal tem um par de horários para seus dias selecionados. Para horários
  diferentes por dia, crie regras separadas. Não há RRULE mensal/anual nesta versão.
- O planner sugere novas atividades em janelas livres. Ele não move compromissos existentes
  e pode não encontrar espaço para todas as metas. O usuário resolve conflitos explicitamente.
- Som, badges, instalação e ações de notificação variam por plataforma. Push precisa de
  HTTPS (exceto localhost), permissão e servidor em execução; não é um alarme de sistema.
- Não há recuperação de senha por e-mail, login social, calendários externos ou cobrança.
  Esses recursos não fazem parte do fluxo MVP solicitado.
- Metas de sono e realização são baseadas em registros manuais, sem sensores de sono.
- O Docker Desktop desta máquina não disponibilizou seu engine. Migrations, seed, API,
  scheduler e testes foram validados no PostgreSQL 16 local isolado; a imagem Docker ainda
  precisa ser construída em uma máquina com Docker Engine ativo.
- iPhone físico, entrega pelo serviço de push externo e deploy público precisam ser
  validados no seu domínio HTTPS. A implementação e os diagnósticos estão prontos para esse teste.

Próximos passos: configurar o domínio HTTPS, executar o roteiro Web Push em dispositivos
reais, configurar backup/observabilidade e, conforme o uso crescer, recuperação de conta,
importação de calendários e uma política de sincronização offline.

## Bootstrap administrativo e perfil pessoal

`npm run bootstrap:user` cria um usuário com Argon2id e timezone válido. Os dados são
recebidos por `BOOTSTRAP_USER_EMAIL`, `BOOTSTRAP_USER_PASSWORD`, `BOOTSTRAP_USER_NAME`
e `BOOTSTRAP_USER_TIMEZONE`. E-mail, nome e timezone também podem ser passados como
`--email`, `--name`, `--timezone`. A senha é aceita **somente no ambiente**, para não
aparecer na linha de comando ou no histórico do terminal.

Exemplo PowerShell usando prompt protegido, sem inserir senha no histórico:

```powershell
$env:BOOTSTRAP_USER_EMAIL = Read-Host 'E-mail da conta'
$env:BOOTSTRAP_USER_NAME = Read-Host 'Nome'
$env:BOOTSTRAP_USER_TIMEZONE = 'America/Sao_Paulo'
$BootstrapSecurePassword = Read-Host 'Senha inicial' -AsSecureString
$env:BOOTSTRAP_USER_PASSWORD = [System.Net.NetworkCredential]::new('', $BootstrapSecurePassword).Password
try {
  npm run bootstrap:user
} finally {
  Remove-Item Env:BOOTSTRAP_USER_PASSWORD -ErrorAction SilentlyContinue
  $BootstrapSecurePassword = $null
}
```

Se a conta já existe, o script não duplica nem troca sua senha. Para redefinir a senha,
execute com a opção explícita `npm run bootstrap:user -- --reset-password`, utilizando
o mesmo processo de entrada protegida. A redefinição revoga as sessões anteriores.
O script não imprime senha, hash, token ou credenciais de conexão.
O cadastro público mantém o mínimo de 10 caracteres; o bootstrap aceita pelo menos 8
e o login verifica qualquer senha válida já existente, sem reaplicar a política de cadastro.

Para importar um perfil pessoal, crie um JSON **local** em `work/` com:

- `settings`: preferências aceitas pelo schema de configurações;
- `routines`: itens `{ key, managedKind?, data }`, em que `data` usa o schema de rotina;
- `goals`: itens `{ key, data }`, em que `data` usa o schema de meta.

O arquivo não deve conter senha. A conta é identificada separadamente pelo ambiente
ou por `--email`. Exemplo de execução:

```powershell
npm run profile:import -- --file work/meu-perfil.json
Remove-Item Env:BOOTSTRAP_USER_EMAIL,Env:BOOTSTRAP_USER_NAME,Env:BOOTSTRAP_USER_TIMEZONE -ErrorAction SilentlyContinue
```

Chaves de importação são únicas por usuário. Reexecutar preserva as rotinas e metas
existentes; `--replace` atualiza explicitamente apenas os itens dessas chaves.
Não há dados pessoais fixos no bootstrap, nos testes ou no seed versionado.
O perfil importado conclui o onboarding e materializa as ocorrências.

## Usar Hoje, planner e aprendizado

Hoje (`/` ou `/today`) mostra relógio no timezone da conta, Agora, próximo compromisso,
timeline, metas e períodos livres. O countdown `HH:mm:ss` é atualizado no frontend a
cada segundo; o backend não recebe uma chamada por segundo.

Trabalho, faculdade, sono e eventos ocupam janelas reais, inclusive ao cruzar meia-noite.
Academia e estudo entram pelo planner como **sugestões**, sem criar automaticamente uma
rotina fixa. Metas de mesma prioridade consideram academia antes de estudo e a ordem de
planejamento configurada. O estudo mínimo define a menor janela; o ideal define o orçamento
diário de estudo. O planner também considera o que já foi concluído ou reservado.
Uma janela curta demais não gera uma sessão conflitante. A opção de planejamento automático
continua desativável e exige autorização explícita do usuário.

Em **Meu aprendizado**, inicie estudo escolhendo tecnologia, meta e duração. A meta pode
ser identificada pelas tecnologias associadas ou selecionada explicitamente. Node.js,
NestJS, React e Next.js podem compartilhar uma meta; Java pode usar uma meta independente.
O vínculo fica persistido na sessão e nas sugestões aceitas, sem depender somente do título.
Ao finalizar, registre opcionalmente “O que você estudou?” e “Aprendizado / observação”.
O histórico é filtrável por Hoje, Esta semana e Este mês. O tempo real atualiza a meta.

**Registrar aprendizado de incidente** permite guardar título, tecnologia, erro, hipótese,
causa, solução e aprendizado. Todos os registros pertencem à conta autenticada e são
editáveis/excluíveis. O aplicativo não importa informações do trabalho e alerta para não
registrar clientes, tokens, senhas ou dados confidenciais.

O botão central `+` usa Quick Add: nome, categoria, data, início e fim aparecem primeiro;
prioridade, local, lembretes, mensagens personalizadas e observações ficam em opções avançadas.
Mensagens de lembrete aceitam `{userName}`, substituído pelo nome da conta no servidor.

## Diagnóstico e teste de push de 1 minuto

Perfil → Notificações mostra permissão, subscription, Service Worker, PWA, estado do backend,
último envio aceito pelo provedor e último recebimento no worker. **Enviar notificação de teste**
cria um Reminder no backend e envia “Ritmo funcionando”, com o nome da conta no corpo;
o clique abre `/today`.

**Criar lembrete para daqui a 1 minuto** cria um Reminder persistido para +60 segundos.
O endpoint `/api/push/reminder-test` exige autenticação em desenvolvimento e produção.
O lembrete pode ser criado sem subscription para testar a fila, mas a entrega exige um
dispositivo inscrito. Sem dispositivo, o worker registra a falha no diagnóstico.
Nenhum timer do frontend substitui o scheduler.

## Verificação local da conta e revisão antes de publicar

`npm run verify:user` executa um navegador contra a aplicação real, usando e-mail e senha
somente do ambiente. Testa login, refresh, reinício do servidor, rotinas, metas, CRUD de eventos,
estudo com um minuto real, notas, incidentes, planner, conclusão, responsividade e logout/login.
As verificações usam 390×844 e 1920×1080. O script não grava screenshots, traces, storageState
ou conteúdo dos campos de login. O relatório em `work/real-user-validation.json` contém somente
estados e etapas, sem identidade, senha ou tokens. Dados transitórios criados para verificar
estudo e planner são removidos pelos seus IDs após a checagem.
Opcionalmente `VERIFY_HEADED=1` abre a janela de teste; o padrão usa navegador automatizado.

Antes de commit/push:

```powershell
npm run security:audit
git status
git diff --cached --stat
git ls-files
```

Para verificar também as credenciais pessoais, forneça as mesmas variáveis temporárias ao
scanner e remova-as depois. O scanner compara os arquivos publicáveis com credenciais locais
e imprime apenas os nomes dos arquivos em caso de falha, nunca os valores.
`.env`, `.env.*` (exceto `.env.example`), `work/`, chaves, secrets, logs, banco,
node_modules, dist e coverage são ignorados. `.env.example` contém somente placeholders.

Repositório oficial: [ritmo-app](https://github.com/zKaminise/ritmo-app).
Use `main`, faça `git fetch origin` antes de enviar e integre conteúdo existente sem force push.
O banco e o perfil pessoal local não são enviados ao GitHub. Configure-os no servidor usando
o bootstrap e a importação, além de backup dos dados privados e do VAPID.
