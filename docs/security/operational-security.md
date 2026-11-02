# Segurança operacional (fora do código)

> O código protege a aplicação. Quem tem acesso às contas de infraestrutura tem acesso a **todos os dados**, incluindo CV, sem passar pelos controlos da aplicação.

## Acessos privilegiados

| Acesso | O que permite | Medidas obrigatórias |
|---|---|---|
| Painel Supabase (organização/projeto) | Ler/alterar todas as tabelas e o bucket `cvs`; ver chaves | 2FA obrigatório; mínimo de membros; papéis mínimos; rever trimestralmente |
| `SUPABASE_SERVICE_ROLE_KEY` / `DATABASE_URL` | Acesso total (ignora RLS) | Só nas variáveis de ambiente do servidor (Vercel) e no `.env` local fora do git; nunca em logs, frontend, README, screenshots, CI público; rodar ao sair alguém com acesso ou após qualquer suspeita |
| Vercel (team/projeto) | Ver env vars (inclui service key), logs, deploys | 2FA; mínimo de membros |
| GitHub | Código; se houver CI com segredos | 2FA; branch protection; secrets só em GitHub Secrets |
| Conta admin Fíchame | Ativar/desativar negócios, bloquear utilizadores, ver logs | Senha ≥ 12, única; **sem acesso a candidaturas por desenho** |
| Fornecedor SMTP | Ver emails enviados | 2FA |

**Acesso excecional a dados de candidatos** (suporte/incidente): só com instrução do negócio ou por incidente, registando num registo manual: data, pessoa, motivo, negócio, dados consultados, duração. Não existe hoje uma rota de «acesso excecional» na aplicação — o acesso seria pelo Supabase, que **não fica auditado** em `security_logs`. *Pendente*: ativar os logs de auditoria do Supabase disponíveis no plano contratado.

## Segredos

- `.gitignore` exclui `.env*` (exceto `.env.example`). Verificado: nenhum segredo no histórico git (pesquisa por padrões de chaves Supabase, JWT, `postgres://user:pass@`, `SMTP_PASS=`, `ADMIN_PASSWORD=` em 2026-10-06; repetido em 2026-11-02 em `git log --all -p` com `sb_secret_`, `service_role`, `GOCSPX`, `sk_live`, `sk_test`, `postgres://`, `DATABASE_URL=postgres`, JWT `eyJ…`: só nomes de variáveis, documentação e valores de teste fictícios). O repositório é **público**.
- Se algum segredo for alguma vez commitado: **SECRET ROTATION REQUIRED** — rodar a chave no fornecedor; apagar do histórico não basta.
- `LOG_HMAC_SECRET`: definir em produção (por omissão deriva da service key; rodar a service key altera os pseudónimos dos logs).

## Backups

- BD: backups/PITR do Supabase conforme o plano (`TODO`: confirmar frequência e retenção). Storage: **os backups da BD do Supabase não incluem os ficheiros do Storage** (*verificar na documentação do plano*); decidir se se faz cópia do bucket `cvs` — se sim, cifrada, com acesso restrito e retenção curta, e incluída no procedimento de supressão.
- Restauro: testar pelo menos 1× antes do lançamento; após restauro, reaplicar supressões.

## Dependências

- `npm run audit` (0 vulnerabilidades em 2026-10-06). Dependências diretas: `@supabase/supabase-js`, `express` 5, `ejs` 3.1.10 (existe uma major 7 — **não atualizada**: exige rever compatibilidade de templates; 3.1.10 inclui a correção do CVE-2024-33883), `multer` 2 (uploads), `qrcode`.
- 2026-11-02: `npm audit` mostra 4 *moderate* (GHSA-g3hv-75wg-m249, minimatch < 11.0.1) via `ejs → jake → filelist → minimatch`. Não há correção sem major: todas as versões de `filelist` dependem de minimatch vulnerável, e só o ejs ≥ 5 deixou de depender de `jake`. O caminho vulnerável **não é carregado em runtime** (o `jake` só é usado pelo CLI `ejs`, `node_modules/ejs/bin/cli.js`; `lib/ejs.js` só requer `fs`, `path` e `./utils`). O CI corre `npm audit --audit-level=high`. Atualizar para ejs 7 num PR próprio, com revisão de todos os templates.
- Rever mensalmente; atualizar com `npm test` completo.

## Supabase Auth (não usado)

O Fíchame tem sessões próprias (tabela `sessions`) e **não usa Supabase Auth**. Com os registos do Auth abertos, qualquer pessoa com a `SUPABASE_ANON_KEY` (pública por natureza) pode criar utilizadores em `auth.users` — não dão acesso a nada (RLS deny-all), mas são dados pessoais sem finalidade e enchem a quota de emails do Auth. Desligar no painel:

1. Supabase → **Authentication → Sign In / Providers** (ou *Settings*): desligar **Allow new users to sign up**.
2. Na mesma página, desligar os providers que não se usam (Email, Phone, Anonymous sign-ins, OAuth).
3. **Authentication → Users**: confirmar que a lista está vazia (apagar contas de teste, se houver).

## Produção (Vercel)

`COOKIE_SECURE=1`, `TRUST_PROXY=1`, `APP_URL=https://…`, região de funções na UE, `OPERATOR_*` preenchidos, SMTP configurado, `CRON_SECRET` + agendamento de retenção (depois da validação jurídica dos prazos), `npm run check` sem avisos. Monitorização: `GET /api/health` (só booleanos `config`, `db`, `migrations`, `ok`; 200/503). Passos do dia: [`docs/DEPLOY-TODAY.md`](../DEPLOY-TODAY.md).
