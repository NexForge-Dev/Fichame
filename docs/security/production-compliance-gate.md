# Gate de produção — segurança e conformidade

> Estados: **PASS** · **WARNING** · **BLOCKER** · **LEGAL REVIEW REQUIRED**.
> «PASS» significa *TECHNICALLY ADDRESSED — SUBJECT TO LEGAL REVIEW WHERE APPLICABLE*. Não é declaração de conformidade.
> O lançamento comercial só deve ser considerado depois de resolver **todos** os BLOCKER e obter revisão jurídica humana dos itens LEGAL REVIEW REQUIRED.
> Avaliado em 2026-10-06 com: `npm run test:unit` (13/13), `npm run test:db` (68/68, base temporária), `npm run test:e2e` (231/231, Supabase real), `npm run check` (OK + autodiagnóstico de segurança), `npm audit` (0).

## Checklist

| Item | Estado | Evidência |
|---|---|---|
| CV público | PASS | Bucket privado (check no arranque e em `npm run check`); sem URLs públicas/assinadas; anon não descarrega (E2E) |
| Acesso cross-tenant | PASS | E2E «Isolamento: B tenta mexer em A», `test/db.js` (FKs compostas, RPCs) |
| Segredo exposto | PASS (código) / WARNING (operação) | Sem segredos no histórico git; E2E verifica que a service key não aparece em respostas. 2FA e rotação dependem do operador |
| Senha insegura | PASS | scrypt + salt; mínimo 10 (admin 12); recusa senhas comuns |
| Autorização server-side | PASS | `requireOwner`/`requireAdmin`, tenant da sessão, RPCs com `restaurant_id` |
| Download de CV sem posse | PASS | Filtro tenant + prefixo + CHECK; auditoria |
| Retenção indefinida | **WARNING** | Mecanismo implementado e testado; **prazos provisionais** e agendador desligado (`RETENTION_AUTO=0`) até validação → ligar antes do lançamento |
| Processo de incidentes | PASS (documento) / WARNING (papéis `TODO`) | [incident-response.md](incident-response.md) |
| Finalidade incompatível | PASS | Reserva só com consentimento, só no mesmo negócio; sem pool; sem marketing |
| Dados sensíveis desnecessários | PASS (formulário) / WARNING (CV, notas) | DNI removido; avisos; detetor nas notas |
| Informação legal mínima | **BLOCKER** | Textos existem e são completos em estrutura, mas a **identidade do operador** (`OPERATOR_*`), **subencargados/regiões** e cláusulas estão com marcadores |
| Transferência internacional sem base | **BLOCKER** | Regiões Supabase/Vercel e DPA/DPF/SCC por confirmar ([07](../legal/07-data-processing-vendors.md)) |
| IA a decidir recrutamento | PASS | Não existe |
| Possível agência de colocação sem análise | **BLOCKER / LEGAL REVIEW REQUIRED** | [01](../legal/01-analisis-agencia-colocacion.md) — análise feita, falta dictamen |
| HTTPS / HSTS / cookies Secure | **BLOCKER (config)** | Código pronto; exige `COOKIE_SECURE=1`, `TRUST_PROXY=1`, `APP_URL=https://` na Vercel (`npm run check` avisa) |
| SMTP | WARNING | Sem SMTP não há avisos por email; a recuperação de senha faz-se pelo admin (0011). Com SMTP, STARTTLS obrigatório |
| 2FA para contas de negócio | WARNING | Não implementado |
| RBAC multiutilizador | WARNING | Só owner/admin; sem utilizadores múltiplos por negócio. Quando existir, aplicar papéis owner/manager/staff com testes por combinação |
| Rate limiting | PASS / WARNING | Memória + BD partilhada; sem WAF/CAPTCHA |
| Enumeração de contas no registo | WARNING | Requer verificação de email |
| Backups | **LEGAL REVIEW / TODO** | Retenção do fornecedor a confirmar; restauro não testado |
| EIPD | **LEGAL REVIEW REQUIRED** | [09](../legal/09-dpia-assessment.md) recomenda fazer antes do lançamento |
| DPA com clientes | **LEGAL REVIEW REQUIRED** | `/encargo` borrador |
| Bloqueio art. 32 LOPDGDD | **LEGAL REVIEW REQUIRED** | [06](../legal/06-data-subject-rights.md) |

## Matriz final de conformidade

| Área | Estado | Evidência | Risco | Correção | Legal review |
|---|---|---|---|---|---|
| RGPD (geral) | WARNING | Medidas técnicas implementadas; RAT e análise de papéis em borrador | Médio | Completar documentação com dados reais | Sim |
| LOPDGDD | WARNING | Informação por camadas (art. 11) implementada; bloqueio (art. 32) não automatizado | Médio | Decidir bloqueio | Sim |
| LSSI | BLOCKER | Art. 10: dados do operador em falta; art. 22.2: só cookie técnica (PASS); art. 21: sem comunicações comerciais (PASS) | Médio | Preencher `OPERATOR_*` | Sim |
| Ley 3/2023 de Empleo | BLOCKER | Risco de enquadramento como agência analisado | Alto (regulatório) | Dictamen laboral | **Sim** |
| Responsável/encarregado | LEGAL REVIEW | [02](../legal/02-data-controller-processor-analysis.md) por tratamento | Médio | — | Sim |
| DPA | LEGAL REVIEW | `/encargo` + aceitação registada (versão/data) | Médio | Cláusulas pendentes | Sim |
| Consentimento | PASS | Seleção = 6.1.b (sem checkbox obrigatório); futuro = opcional, específico, versionado, datado, revogável, por negócio | Baixo | — | Rever textos |
| Minimização | PASS | DNI removido; campos mínimos; logs minimizados | Baixo | — | Rever telefone obrigatório |
| Retenção | WARNING | Por tenant, automática, testada; prazos provisionais | Médio | Validar prazos; ligar agendador | Sim |
| Direitos | PASS (técnico) | Canal público, painel com prazo, exportação, supressão, retirada, bloqueio | Baixo | Rectificação por edição (pendente) | Rever procedimento |
| Armazenamento de CV | PASS | Privado, aleatório, por tenant, CHECK, auditado | Baixo | Antivírus (opcional) | Não |
| Isolamento de tenants | PASS | App + BD (FKs compostas) + Storage; testes A↔B | Baixo | — | Não |
| Autenticação | PASS / WARNING | scrypt, sessões opacas, anti-enumeração, recuperação segura, invalidação | Médio (sem 2FA) | 2FA | Não |
| CSRF | PASS | Token por sessão em todos os POST (incl. multipart, login, logout, admin) | Baixo | — | Não |
| XSS | PASS | Escape EJS, CSP sem inline; testes | Baixo | — | Não |
| Segurança de uploads | PASS / WARNING | Testes: PDF falso, JS, ofuscado, embebido, truncado, executável, MIME falso, SVG, ZIP, tamanho, path traversal, HTML no nome | Médio | Antivírus | Não |
| Rate limiting | PASS / WARNING | Memória + BD | Médio | WAF | Não |
| Resposta a incidentes | WARNING | Procedimento escrito; papéis `TODO` | Médio | Nomear responsáveis | Sim |
| Cookies | PASS | Só cookie técnica; `/cookies` | Baixo | — | Rever texto |
| Transferências internacionais | BLOCKER | Por confirmar | Alto | Regiões UE + DPA | Sim |
| IA | PASS | Inexistente; regra de bloqueio | Baixo | — | Antes de qualquer IA |
| Discriminação | WARNING | Sem filtros protegidos; detetor; avisos | Médio-alto | Formação do negócio | Sim |
| EIPD | LEGAL REVIEW | Recomendada | Médio | Realizar | Sim |
| DPD | LEGAL REVIEW | Não designado; análise feita | Baixo-médio | — | Sim |
| RAT/ROPA | WARNING | [08](../legal/08-record-of-processing-activities.md) com `TODO` | Médio | Completar | Sim |
| Termos | LEGAL REVIEW | `/terminos` borrador | Médio | Cláusulas | Sim |
| Política de privacidade | LEGAL REVIEW | `/privacidad` + `/r/:slug/privacidad` | Médio | Dados reais | Sim |
| Política de cookies | PASS / LEGAL REVIEW | `/cookies` | Baixo | — | Sim |
