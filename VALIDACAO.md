# Validação da entrega — 7 de outubro de 2026

Projeto: `D:\Importante\Codex\App Rotina`.

| Verificação           | Resultado                                                                      |
| --------------------- | ------------------------------------------------------------------------------ |
| Instalação npm        | Executada; package-lock gerado                                                 |
| Migrations Prisma     | 4 migrations aplicadas em PostgreSQL real; nenhuma pendente                    |
| Seed                  | Executado; reexecução idempotente preservou os dados                           |
| Typecheck             | API, web e shared passaram com TypeScript strict                               |
| ESLint                | Passou, zero warnings                                                          |
| Testes unitários      | 24 passaram                                                                    |
| E2E do backend        | 21 passaram usando PostgreSQL isolado                                          |
| E2E no navegador      | 3 passaram usando aplicação compilada e API real                               |
| Builds                | Frontend, backend e shared compilados                                          |
| PWA                   | Manifest, dimensões de 3 ícones e 28 arquivos no precache verificados no build |
| Offline               | Abertura e consulta de agenda com navegador offline verificadas                |
| Scheduler             | Tick consultou lembretes vencidos; segundo tick não repetiu o envio            |
| Concorrência          | Duas reservas e dois processamentos concorrentes geraram uma entrega           |
| Retry                 | Retentou o dispositivo que retornou 503 sem repetir o que recebeu              |
| Subscription expirada | Resposta 410 desativou o dispositivo                                           |
| Timezone              | America/Sao_Paulo, meia-noite, UTC e transição DST testados                    |
| Segurança de acesso   | Autorização por usuário, validação e bloqueio de origem estrangeira testados   |
| Auditoria npm         | Zero vulnerabilidades                                                          |
| Compose               | Configurações de desenvolvimento e produção validadas                          |

O PostgreSQL local de validação usa a porta 5433 e dados em `work/pgdata`.
O cluster e o banco de testes são separados do PostgreSQL preexistente nesta máquina.

## Alcance dos testes de push

A implementação usa web-push/VAPID no backend e showNotification no Service Worker.
Os testes substituem o transporte externo e as APIs nativas por adaptadores para verificar
reservas, idempotência, retries, deduplicação em IndexedDB, snooze, diagnóstico e navegação.
O navegador automatizado deste ambiente não concedeu permissão de notificação ao worker.

A entrega efetiva pela Apple/Google/Mozilla, com o aplicativo fechado, **ainda precisa ser
validada em um dispositivo com permissão real**. O roteiro completo está no README.

## Verificações que dependem de outro ambiente

- Construção da imagem Docker: o Docker Desktop instalado não disponibilizou seu engine.
  Os builds Node/Vite/Nest e as migrations foram executados diretamente.
- Instalação e notificações em iPhone físico: requer domínio HTTPS acessível e teste no dispositivo.
- Deploy público: não foi publicado um domínio ou contratado um serviço de hospedagem.

## Consultar os resultados

`npm test`, `npm run test:e2e`, `npm run test:browser`, `npm run lint`, `npm run typecheck`
e `npm run build` reproduzem as verificações. O teste de navegador espera o app em execução.
Screenshots, traces e relatório HTML do Playwright ficam em `work/`.

## Etapa de uso real — 7 de outubro de 2026

Ambiente: Windows, Node.js **22.20.0**, npm **11.10.0**, PostgreSQL **16.9**.
O cluster privado foi reiniciado na porta 5433. A senha do banco foi substituída por
um valor aleatório guardado exclusivamente no `.env` ignorado pelo Git.

| Item                                    | Resultado                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Bootstrap administrativo                | Conta criada com Argon2id; reexecução não duplica; redefinição explícita testada                    |
| Conta pessoal                           | E-mail configurado; senha armazenada somente como hash; nenhuma credencial incluída neste relatório |
| Perfil                                  | pt-BR, 24 horas, segunda-feira e America/Sao_Paulo                                                  |
| Importação de rotina                    | 10 rotinas e 3 metas específicas da conta; arquivos de importação ignorados pelo Git                |
| Trabalho e faculdade                    | Visualizados pela interface com os horários configurados                                            |
| Sono                                    | Janela cruzando meia-noite, preparação, acordar e mensagens personalizadas persistidas              |
| Academia                                | Meta semanal e preferências persistidas; nenhuma rotina automática de treino criada                 |
| Metas de aprendizado                    | Metas distintas para tecnologias web e Java; vínculo por tecnologia ou seleção explícita            |
| Login pessoal no navegador              | Passou: login, refresh, cookie HttpOnly, reinício do servidor, logout e novo login                  |
| Evento pessoal no navegador             | Passou: adicionar, editar e excluir                                                                 |
| Estudo pessoal no navegador             | Passou: um minuto real, reinício com sessão ativa, notas, histórico e meta atualizada               |
| Incidentes no navegador                 | Passou: criar, editar e excluir; aviso de confidencialidade presente                                |
| Planner pessoal no navegador            | Passou: sugerir, aceitar, aparecer em Hoje, concluir e atualizar progresso                          |
| Responsividade pessoal                  | 390×844 e 1920×1080; Hoje, aprendizado, perfil e modal sem overflow                                 |
| Dados de teste pessoais                 | Sessões, incidentes e sugestões transitórias removidos por ID após a verificação                    |
| Lembrete +1 minuto                      | Criado pela interface, persistido no banco e processado pelo worker                                 |
| Service Worker                          | Registro, cache, offline, handler, deduplicação, snooze e clique verificados                        |
| Subscription real no navegador de teste | Não ativada: permissão nativa negada pelo navegador automatizado                                    |
| Push real com app fechado               | Não validável nesse navegador; implementação não substituída por simulação                          |
| Push simulado                           | Reserva concorrente, idempotência, 410, retry por dispositivo e estados verificados                 |
| Prisma                                  | Schema válido; 4 migrations aplicadas nos bancos local e de E2E                                     |
| Auditoria npm                           | Zero vulnerabilidades                                                                               |
| Revisão de publicação                   | .env, senha pessoal, VAPID privada, conexão privada, logs, banco e builds excluídos                 |

A criação do lembrete e seu processamento foram testados sem uma subscription real;
isso não confirma entrega nativa. A plataforma precisa conceder permissão para validar
a notificação fechando o aplicativo e tocando no aviso. iPhone físico continua exigindo
domínio HTTPS e instalação na Tela de Início.

Os testes de browser comuns usam contas fictícias. A verificação da conta pessoal usa
credenciais apenas no ambiente do processo e não grava screenshot de login, trace,
storageState, conteúdo de senha ou token. O relatório local contém somente estados/etapas.

## Git e publicação

- Branch: `main`.
- Remote: `origin`, `https://github.com/zKaminise/ritmo-app.git`.
- `git fetch origin` executado antes da integração; repositório remoto inicialmente vazio.
- Identidade do commit usa endereço noreply, sem publicar o e-mail pessoal da conta.
- Commit de implementação: `7a123080b9d6aa3216bfcb42b66d05dbbc739885` — `feat: prepare Ritmo for real-world usage`.
- Push: **SUCESSO**. `git push -u origin main` concluiu e `git ls-remote origin refs/heads/main` confirmou o mesmo SHA.
- Após o envio, `git status` confirmou `main...origin/main` sem alterações pendentes.
- Este relatório recebe um commit de documentação posterior; ambos os commits são enviados sem force push.
- Nenhum force push é utilizado.

O Docker Engine permanece indisponível nesta máquina. A configuração Compose é válida;
os builds frontend/backend são executados diretamente, sem marcar essa limitação como erro da aplicação.
