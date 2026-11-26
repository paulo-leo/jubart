# Conexão MCP e API de integração

## Modelo de acesso

A integração oferece **MCP Streamable HTTP stateless** em `/mcp`, implementado com o SDK oficial, e endpoints HTTP simples para consulta e execução. Usa Bearer API keys provisionadas na guia **Conexão MCP**. Não é um provedor OAuth: configure o header Authorization no cliente. Use HTTPS na VPS. HTTP é adequado apenas ao desenvolvimento local/túnel protegido.

Uma chave pode ter `read`, `execute` ou ambas. Execução exige também a ação específica na lista de permissões da chave. A chave é exibida apenas na criação; o servidor guarda SHA-256 de um segredo aleatório de 256 bits e metadados, nunca o token em texto. As chaves expiram entre 1 e 365 dias e podem ser revogadas. Revogar impede novas requisições; não cancela operações já iniciadas. Para alterar permissões, emita outra chave e revogue a anterior.

A criação, listagem, revogação e auditoria pelo painel exigem sessão administrativa e CSRF; chaves de API não podem administrar outras chaves. Cookies do painel não substituem a API key nos endpoints externos. Os arquivos privados ficam em `.panel-state/mcp/` e não devem ser compartilhados ou versionados. Há até 200 registros de chaves; as revogadas são preservadas para histórico.

## Autenticação e erros

```http
Authorization: Bearer ic_mcp_<id>_<segredo>
Content-Type: application/json
```

Tokens na URL não são aceitos. O cliente deve obter a chave do armazenamento de segredos do editor ou de uma variável de ambiente, sem inseri-la no código, em logs ou no histórico de comandos.

| Status HTTP | Significado |
| --- | --- |
| 200 | Consulta concluída |
| 202 | Operação administrativa aceita; acompanhe seu estado |
| 400 | Parâmetros inválidos ou erro de validação/serviço |
| 401 | Chave ausente, inválida, expirada ou revogada |
| 403 | Escopo/ação não autorizado, serviço fora do projeto ou operação de outra chave |
| 405 | Endpoint ou método não permitido |
| 409 | Outra operação em andamento, requestId conflitante ou limite de recibos |
| 429 | Limite de 120 requisições por minuto por IP de origem |

Erros REST têm formato `{"error":"mensagem"}`. Atrás do Traefik o IP observado pode ser o do proxy; o limite é compartilhado por clientes com o mesmo IP. Não se confia em X-Forwarded-For enviado pelo cliente.

## Endpoint de leitura

`GET /api/ai/read?resource=...` exige **read**. É exclusivamente consulta da infraestrutura; não aceita comandos, rotas internas ou ações administrativas. O servidor registra auditoria da consulta, sem alterar as aplicações.

| resource | Parâmetros adicionais | Resposta |
| --- | --- | --- |
| containers, services | `service` ou `app` opcionais | serviços e containers autorizados: ID, imagem, estado, saúde, portas, redes e ações permitidas |
| volumes | `service` ou `app` opcionais | metadados dos volumes e destinos usados pelos alvos autorizados |
| processes | nenhum | mesma visão de processos/serviços do projeto |
| technologies | nenhum | catálogo de imagens e bibliotecas fixadas |
| logs | `service` obrigatório; `tail`, `since` opcionais | logs autorizados, até 1.000 linhas e 32 KiB |
| automation | nenhum | workers, jobs e schedulers cadastrados, com estados dos processos |
| app-automation | `app` obrigatório | contagens de filas e registros recentes de falhas fornecidos pelo Laravel |

Exemplos usando uma variável `INFRA_API_KEY` já definida em ambiente seguro:

```bash
curl --fail-with-body -H "Authorization: Bearer $INFRA_API_KEY" \
  'https://painel.exemplo.com/api/ai/read?resource=containers'

curl --fail-with-body -H "Authorization: Bearer $INFRA_API_KEY" \
  'https://painel.exemplo.com/api/ai/read?resource=logs&service=php'

curl --fail-with-body -H "Authorization: Bearer $INFRA_API_KEY" \
  'https://painel.exemplo.com/api/ai/read?resource=app-automation&app=main'
```

Resposta abreviada de containers:

```json
{"project":"laravel","services":[{"name":"php","state":"running","health":null,"image":"laravel-php","restartCount":0}]}
```

Resposta de filas, quando suportada pela aplicação:

```json
{"app":"main","statistics":{"queues":[{"id":"worker-aabbccddeeff","counts":{"total":4,"pending":3,"reserved":1,"delayed":0}}],"failed":[]}}
```

O cadastro de uma classe Job **não equivale a uma execução**. Dispatch concluído significa enfileiramento, não sucesso do processamento. A aplicação precisa fornecer sua própria telemetria para histórico completo de sucesso/início/fim de cada job. As contagens/falhas dependem das conexões e tabelas configuradas no Laravel. O endpoint não inventa status quando a aplicação não os disponibiliza.

Logs são dados potencialmente sensíveis e não confiáveis. Há ocultação de segredos conhecidos e padrões de tokens. Toda chave com read consulta os logs dos serviços desta instalação Jubart, sem seleção por aplicação. Não são retornados .env, cofre, senhas, definições completas de ambiente ou caminhos de montagens no host.

## Endpoint de execução

`PUT /api/ai/execute` exige **execute** e a ação explicitamente autorizada para a chave.

```json
{
  "requestId": "f990d3aa-5662-4ebe-a753-5d09a74c8c0c",
  "operation": {
    "action": "worker.register",
    "app": "main",
    "queue": "emails",
    "connection": "redis",
    "tries": 3,
    "timeout": 60,
    "sleep": 3,
    "stopGrace": 90
  }
}
```

| Ação/permissão específica | Campos em operation além de action | Efeito |
| --- | --- | --- |
| worker.register | app, queue, connection, tries, timeout, sleep, stopGrace | Cadastra worker desativado; não cria código PHP |
| worker.start | id do worker | Inicia/recria consumidor |
| worker.stop | id do worker | Para consumidor com prazo de encerramento |
| worker.restart | id do worker | Recria consumidor |
| worker.remove | id do worker | Para/remove container do consumidor e seu cadastro; não limpa jobs/volumes |
| job.register | app, name, class | Registra classe existente em App\Jobs |
| job.dispatch | id do job, worker, arguments | Envia job registrado à fila do worker da mesma aplicação |
| job.interrupt | worker | Para o worker inteiro; não interrompe seletivamente um job |
| job.remove | id do job | Remove cadastro da classe; não remove código nem jobs enfileirados |
| job.retry | app, id da falha | Reenvia a falha especificada |
| scheduler.register | app | Cadastra agendador desativado |
| scheduler.start | id do scheduler | Inicia/recria agendador |
| scheduler.stop | id do scheduler | Para agendador |
| scheduler.run | app | Executa tarefas devidas naquele momento |

Os IDs de workers/jobs/schedulers têm os formatos `worker-<12 hex>`, `job-<12 hex>` e `scheduler-<12 hex>`, obtidos por consulta, nunca inventados. `app` é o ID cadastrado (`main`, `app2` etc.) de uma aplicação PHP habilitada. A revisão do registro é resolvida pelo servidor.

`connection`: redis ou database. `queue`: até 80 caracteres alfanuméricos, ponto, hífen ou sublinhado. `tries`: 1–20; `timeout`: 1–3600 s; `sleep`: 1–60 s; `stopGrace`: 10–3700 s e maior que timeout. `name`: 1–80 caracteres. `class`: classe sob `App\Jobs`, validada pela ponte PHP. `arguments`: array JSON posicional, até 50 elementos e 16 KB; não use argumentos para passar segredos quando houver alternativa na aplicação. ID de falha aceita inteiro ou UUID. Campos extras e ações fora da lista são recusados.

Exemplo de iniciar um worker com um payload em arquivo local, sem incluir a chave:

```bash
curl --fail-with-body -X PUT \
  -H "Authorization: Bearer $INFRA_API_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary @operation.json \
  'https://painel.exemplo.com/api/ai/execute'
```

Resposta abreviada:

```json
{"requestId":"f990d3aa-5662-4ebe-a753-5d09a74c8c0c","action":"worker.register","operation":{"id":"9d23ab827f31cd90-1","label":"Registrar automação","state":"running","startedAt":"2026-11-09T12:00:00.000Z"}}
```

### Idempotência e acompanhamento

Gere um UUID novo para cada intenção de alteração. **Repita o mesmo requestId e o mesmo payload** se houver falha de rede: a operação não é reenviada. O mesmo ID com outro payload retorna 409. Recibos são privados e persistentes, até 10.000 entradas. Um recibo aceito antes de uma falha do painel pode ficar sem resultado conclusivo; não use outro requestId automaticamente para contornar essa proteção.

`GET /api/ai/operations/{id}` aceita read ou execute, mas somente da chave que iniciou a operação. Estados incluem running, success, error e unknown. `unknown` exige consultar o estado real antes de repetir. Operações em andamento continuam após revogar a chave, que deixa de poder consultá-las.

Parar um worker espera seu prazo de encerramento e pode interromper um job em andamento ao fim desse prazo. Isso não desfaz efeitos já produzidos e não elimina jobs pendentes. Não há cancelamento universal e seletivo de uma execução de Job: essa capacidade depende da aplicação. Scheduler/dispatch podem produzir notificações, alterações de banco e outros efeitos externos. As permissões da chave já autorizam a solicitação no servidor; **não há uma confirmação adicional no painel para cada chamada de IA**.

## Monitoramento e incidentes por SSE

Em **Monitoramento → Monitoramento & incidentes**, configure as verificações automáticas da instalação. O monitor executa dentro do serviço do painel, independentemente de navegadores conectados. Por padrão, está ativo, espera 60 segundos entre o fim de uma rodada e o início da próxima, abre um incidente após duas falhas consecutivas e encerra após uma recuperação confirmada. Intervalo permitido: 15 segundos a 24 horas; limites de confirmação: 1 a 10 rodadas. O monitor observa os serviços; não reinicia containers.

O histórico e as preferências persistem em `.panel-state/monitor/state.json`. São mantidos até 500 incidentes encerrados/ativos combinados, preservando os incidentes ainda abertos, e os últimos 1000 eventos para retomada. Os contadores de confirmação consecutiva recomeçam após reiniciar o painel. Serviços desabilitados não geram falhas; desabilitar/remover um alvo encerra seu incidente com esse motivo. Um estado desconhecido não confirma indisponibilidade nem recuperação. Falhas da coleta geram seu próprio incidente.

- Painel: `GET /api/monitor` e `GET /api/monitor/events`, com sessão administrativa; não é preciso criar chave.
- Preferências: `POST /api/monitor/settings`, com sessão administrativa, CSRF e revisão atual. `POST /api/monitor/check` solicita uma rodada manual mesmo quando o agendamento está pausado.
- Cliente externo: `GET /api/ai/events` (SSE) e `GET /api/ai/incidents` (JSON), com a mesma chave MCP e escopo `read`.
- MCP: `infra_read` com `{"resource":"incidents"}` consulta o histórico, as preferências e as últimas observações.

```sh
# Defina JUBART_API_KEY no mecanismo seguro do cliente.
curl --no-buffer --fail-with-body \
  --header "Authorization: Bearer $JUBART_API_KEY" \
  "https://painel.exemplo.com/api/ai/events"
```

O stream envia `snapshot` na conexão, `incident` na abertura/mudança de severidade e `recovery` no encerramento. `status` atualiza o resumo da coleta e `settings` informa alterações nas preferências. A falha contínua não cria notificações duplicadas. Os eventos duráveis têm ID numérico crescente; envie `Last-Event-ID` na reconexão para receber os eventos posteriores ainda retidos. Quando o cursor estiver fora do histórico, o snapshot atual permite ressincronizar; não há garantia de entrega de eventos já removidos. Heartbeats ocorrem a cada 15 segundos.

Chaves e sessões são revalidadas a cada heartbeat. Revogação, expiração ou alteração de acesso gera `auth-expired` e fecha a conexão. Há limite de três conexões por chave/sessão e 50 por instância do painel; clientes lentos são desconectados para limitar o buffer. Reiniciar o painel desconecta os clientes, que devem reconectar. As notificações na tela não substituem o histórico persistente.

Nunca envie a chave na URL. No navegador externo, `EventSource` nativo não permite configurar `Authorization`; use um cliente compatível com headers ou `fetch` com leitura incremental, respeitando a política de origem do painel. Este SSE é uma API de eventos do Jubart, separada do transporte MCP Streamable HTTP em `/mcp`. As limitações das verificações de saúde continuam válidas: passagem de checks não comprova todas as funções de negócio, DNS público, TLS externo ou conclusão de jobs.

## CLI Jubart pela conexão MCP

A conexão oferece a sintaxe da CLI com resultados JSON, usando os mesmos serviços de consulta e, na gestão de aplicações, as funções `planApp`/`applyApp` de `apps-cli.mjs`. Não precisa de Python no host ou de uma linha de shell enviada pelo agente. A instalação é a mesma do endpoint; `--root` não troca o alvo remotamente.

| Ferramenta | Entrada | Permissão |
| --- | --- | --- |
| `jubart_cli_help` | `command` opcional, como `app update` | Chave válida |
| `jubart_cli_read` | `argv`, lista de argumentos | `read` |
| `jubart_cli_plan` | `argv`, lista de argumentos | `execute` e ação do alvo |
| `jubart_cli_execute` | `planId` e `requestId` UUID | `execute` e ação da prévia |

Exemplos de consulta:

```json
{"argv":["apps"]}
{"argv":["jubart","status"]}
{"argv":["database","users","--engine","postgres"]}
{"argv":["proxy","show","erp.exemplo.com"]}
{"argv":["compose","logs","--tail","100","--since","10m","php"]}
```

A ajuda lista comandos e flags em inglês, descrições em português, permissões e disponibilidade. Também existem consultas de saúde, painel/túnel salvo, usuários, relógio, certificados, recursos e automações. `incidents` é um atalho desta conexão para o histórico do monitor. Site, certificados e métricas usam as evidências/amostras do painel; não prometem a mesma sondagem de rede ou modo de terminal da CLI local. `schedules` lista o cadastro e estado, sem executar `artisan schedule:list`. Opções não implementadas são recusadas, nunca ignoradas ou encaminhadas para um shell.

Para alterar um domínio, chame `jubart_cli_plan`:

```json
{"argv":["app","update","app2","--domain","erp.exemplo.com","--save-only"]}
```

Revise alterações e impactos e obtenha a autorização do usuário conforme o cliente. Depois envie o `planId` real retornado e um UUID novo a `jubart_cli_execute`; acompanhe `operation_status`. Repita o mesmo UUID para a mesma intenção em caso de retry. O plano pertence à chave que o criou, expira após 15 minutos e mantém a revisão/ID do alvo. Uma revisão ou container substituído exige nova avaliação. Após expiração ou resposta incerta, consulte o estado da operação antes de gerar outra intenção. Prévia com `--dry-run` não gera `planId` executável.

As novas permissões `application.create`, `application.update`, `application.remove` e `application.apply` precisam ser concedidas explicitamente no painel e não são adicionadas às chaves existentes. Elas permitem configurar pastas e comandos de runtime, salvar arquivos gerados e criar/reconstruir/remover o container da aplicação selecionada, aplicando também Traefik. Preserve a distinção de `--save-only`: salva o cadastro e arquivos gerados, mas não aplica containers. A CLI guarda backup privado e preserva arquivos de projeto, credenciais existentes, bancos e volumes. Vínculos de filas/jobs, WebSocket, Scheduler ou Mercure podem impedir alterações de runtime até serem gerenciados no painel.

`compose start/stop/restart SERVICE` usa as ações específicas já concedidas: `container.*`, `application.*`, `worker.*`, `websocket.*` ou `scheduler.start/stop`, conforme o alvo. O controle de containers continua verificando ID atual e labels do projeto. O painel não se reinicia pelo MCP. `exec`, `app shell/host`, alterações de senha/login/acesso e comandos Compose livres continuam locais; `dir` consulta a pasta e Bash no host usa ferramentas próprias com `terminal.host`; a ajuda informa o motivo. Sessões interativas não são simuladas como uma consulta JSON.

Alternativa HTTP autenticada: `GET /api/ai/cli/help?command=app`, `POST /api/ai/cli/read`, `POST /api/ai/cli/plan` e `PUT /api/ai/cli/execute`. Use `Authorization: Bearer <chave>` e os mesmos corpos JSON. As prévias ficam no arquivo privado `.panel-state/mcp/cli-plans.json`, com até 500 prévias não expiradas. Os recibos, auditoria e acompanhamento são os mesmos de `infra_execute`.

## MCP no VS Code

Endpoint `/mcp` usa POST e respostas JSON com transporte stateless. Não há SSE persistente, sessões resumíveis ou OAuth discovery. As versões de protocolo são negociadas pelo SDK oficial instalado e fixado no package-lock; confirme compatibilidade do cliente com MCP Streamable HTTP.

Exemplo `.vscode/mcp.json` para clientes VS Code que suportam inputs:

```json
{
  "inputs": [{"type":"promptString","id":"infra-api-key","description":"Chave Jubart","password":true}],
  "servers": {
    "jubart": {
      "type":"http",
      "url":"https://painel.exemplo.com/mcp",
      "headers":{"Authorization":"Bearer ${input:infra-api-key}"}
    }
  }
}
```

Alguns modos/harnesses do VS Code não encaminham inputs interativos; siga a [referência atual de configuração MCP do VS Code](https://code.visualstudio.com/docs/agents/reference/mcp-configuration) para o armazenamento de segredos suportado nesse modo. Não substitua o input por uma chave literal versionada. O transporte segue o [SDK MCP oficial](https://ts.sdk.modelcontextprotocol.io/server).

Ferramentas disponíveis:

| Ferramenta | Parâmetros | Permissão |
| --- | --- | --- |
| infra_read | resource, service/app; tail/since em logs | read |
| infra_plan | operation, sem requestId; prévia sem execução | execute + ação + alvo |
| infra_execute | requestId, operation | execute + ação + alvo |
| automation_execute | Mesmo corpo de PUT: requestId, operation | execute + ação |
| operation_status | id como string | read ou execute; operação da própria chave |

Ferramentas não autorizadas não são anunciadas; os escopos e as ações também são verificados na execução. As respostas MCP têm `content[0].text` com JSON; falhas de ferramenta usam `isError: true`. Configure a aprovação das ferramentas no editor e não habilite aprovação automática de ações destrutivas sem uma decisão explícita.

## Auditoria e limites de segurança

Criação/revogação de chaves, autenticação recusada, consultas, requisições MCP e solicitações/aceite/término/erro de execução são registrados em `.panel-state/mcp/audit.jsonl`. A interface mostra os 200 eventos recentes. Não são gravados tokens, senhas, conteúdo de logs ou argumentos de jobs. O arquivo gira a cada 10 MiB, mantendo até cinco arquivos anteriores. Exporte/arquive por outro meio se precisar de retenção maior. Não é um log externo à prova de adulteração por administradores do host.

A API principal não aceita linhas de shell ou SQL arbitrário; Bash no host é uma capacidade separada, com `terminal.host` e agente local. A API não oferece edição livre de arquivos, gestão de chaves ou operações de outros projetos Docker. As ações específicas de gestão de aplicações pela CLI permitem pastas e comandos de runtime validados, arquivos gerados e reconstrução da aplicação, sob permissões próprias. Ela opera automações, WebSockets e containers dos serviços configurados com verbos fixos e escopo da instalação inteira; volumes permitem somente consulta. Classes de jobs podem executar o código que já existe na aplicação: conceder job.register/job.dispatch é uma permissão de execução da lógica da aplicação, não um sandbox do código PHP.

A Skill em `.github/skills/jubart-mcp/SKILL.md` orienta o diagnóstico e o uso autorizado. A Skill não concede permissões e não substitui os controles do servidor.

## Aplicação da atualização

```bash
sudo docker compose up -d --build --no-deps panel
```

O build instala as dependências MCP fixadas. Não são criadas chaves padrão. Após atualizar, abra Conexão MCP, emita uma chave de leitura para diagnóstico e, somente quando necessário, outra com as ações de execução apropriadas. A mesma chave pode acumular as duas permissões.

A Skill está no diretório de descoberta `.github/skills/jubart-mcp` deste workspace. Para outro projeto, copie essa pasta para `.github/skills/` do projeto destino ou para a localização de skills suportada pelo cliente. Consulte as [instruções de Agent Skills do VS Code](https://code.visualstudio.com/docs/agent-customization/agent-skills).


## Endpoints administrativos do painel

Estes endpoints exigem **cookie de sessão administrativa** e, nas alterações, `X-CSRF-Token`. Bearer API keys não têm acesso a eles.

| Endpoint | Método | Uso |
| --- | --- | --- |
| /api/mcp/keys | GET | Listar metadados das chaves e ações disponíveis |
| /api/mcp/keys | POST | Criar chave com name, scopes, actions e expiresInDays; devolve key e token uma única vez |
| /api/mcp/keys/{id}/revoke | POST | Revogar chave; corpo vazio |
| /api/mcp/audit | GET | Últimos 200 eventos |

Exemplo de corpo de criação: `{"name":"VS Code diagnóstico","scopes":["read"],"actions":[],"expiresInDays":90}`. Não use essas rotas como alternativa aos escopos da integração.

## Aplicações, WebSocket e contexto operacional

A integração também oferece `infra_execute` para controles por aplicação. `automation_execute` permanece compatível. Comece com `infra_read` e `resource=context` para consultar permissões, revisões, saúde Docker, aplicações, WebSockets, filas e últimas operações da própria chave. Consulte `resource=guide` para a Skill e sua referência completa.

O cadastro de chaves permite selecionar leitura/execução e ações exatas; todas as aplicações e serviços pertencentes a esta instalação estão no mesmo escopo. `application.start/stop/restart` atua somente no container HTTP já existente; `websocket.start/stop/restart/configure` atua somente no WebSocket escolhido. Configure permite apenas ativação, porta e origens, preservando provedor, comando, domínio, TLS e imagem. Campos e exemplos estão na [referência da Skill](../.github/skills/jubart-mcp/references/api.md#contexto-ampliado-e-escopo-da-instalação).

A tela Conexão MCP contém links autenticados para abrir/baixar a Skill, sua referência e esta documentação. Instale ambos os arquivos no workspace do agente e configure a conexão MCP; não inclua a chave na Skill. Permissões da API são impostas no servidor independentemente de o agente ler a Skill. Chaves antigas também monitoram toda a instalação, mantendo token, validade e ações de execução.

Em **Guias e arquivos → Criar plugin**, copie a [Skill de desenvolvimento](../.github/skills/jubart-mcp-plugin/SKILL.md) para orientar a criação de um plugin ou cliente conectado ao MCP existente. O conteúdo copiado usa o endereço escolhido no painel; o download de `SKILL.md` mantém o endereço de exemplo para adaptação. A Skill orienta a descoberta de ferramentas, o armazenamento seguro da chave e a verificação da conexão. Ela não instala nem publica um plugin automaticamente. O arquivo também está disponível em `GET /api/mcp/documents/plugin`, com sessão administrativa.

### Prévia de execução

Antes de executar, use `infra_plan` com `{ "operation": { ... } }`, ou `POST /api/ai/plan` com esse mesmo corpo e Bearer. Exige execute, ação específica e alvo desta instalação. Retorna comandos previstos e impactos, sem executar nem reservar a operação. Depois envie `infra_execute` com requestId UUID e a mesma operação. A execução revalida permissões e revisões.

### Panorama atual e geração assistida de .env

`infra_read` com `resource: configuration` (REST: `GET /api/ai/read?resource=configuration`) fornece a seleção permitida da configuração atual e o modelo público `.env.example`, sem credenciais reais. A Skill explica como usar esse panorama para preparar uma instalação nova ou propor mudanças em `.env.proposed`, preservando segredos e dados de uma instalação existente.

A chave monitora toda a instalação. O panorama contém apenas valores atuais não secretos permitidos; não é uma cópia completa do ambiente ativo. Arquivos são criados com ferramentas locais autorizadas do cliente; o endpoint não grava/aplica .env no servidor.

## Serviços, containers e volumes

Ao criar uma chave, informe nome, read/execute, ações de execução e validade. Não há seleção de aplicações ou serviços: o escopo é toda a infraestrutura desta instalação Jubart, incluindo futuras aplicações/serviços. Containers de outros projetos Docker não são abrangidos.

Chaves novas usam scope: infrastructure e retornam applications/services como ["*"] por compatibilidade. Chaves já existentes recebem o mesmo escopo global na autenticação/listagem, sem troca do token, alteração da expiração ou regravação de seus registros. Ações de execução, revogação e autenticação permanecem válidas; nenhuma nova ação é acrescentada automaticamente.

- `infra_read({"resource":"services"})`: alias de `containers`/`processes`; lista nome do serviço, container, `containerId` de 12 caracteres, imagem, estado, saúde, horários, portas, redes, política de reinício e ações permitidas. Serviços não criados também aparecem, sem ID. Aceita filtro `service` ou `app`.
- `infra_read({"resource":"applications"})`: todas as aplicações, domínios e revisão. O envelope de contexto inclui serviços e volumes de toda a instalação; app/service são apenas filtros de consulta.
- `infra_read({"resource":"volumes"})`: nomes, driver, criação e destinos nos containers (mounts: service, target, writable). Inclui volumes externos/anônimos usados nesta instalação e volumes do projeto sem montagens. Filtros service/app refinam a consulta aos alvos escolhidos. Não retorna caminhos do host, conteúdo ou opções do driver e não calcula tamanho/ocupação.
- `infra_read({"resource":"logs","service":"postgres","tail":200,"since":"10m"})`: até 1.000 linhas e 32 KiB por consulta. `tail`: inteiro 1–1000 (padrão 1000); `since`: data ISO 8601 com fuso ou duração positiva em `s`, `m` ou `h`. O corte de histórico do painel continua valendo. Sem streaming contínuo; novas consultas recebem a janela atual. Logs são tratados como dados não confiáveis e passam pela ocultação de segredos conhecidos.

Controle de um container existente:

```json
{"operation":{"action":"container.restart","service":"postgres","containerId":"012345abcdef"}}
```

Use esse objeto em `infra_plan` para consultar o comando e o impacto. O ID é ilustrativo: copie o `containerId` atual retornado por `services`. Para executar, acrescente `requestId` UUID:

```json
{"requestId":"b05820fa-282f-4d96-b63b-7710dc7090d2","operation":{"action":"container.restart","service":"postgres","containerId":"012345abcdef"}}
```

| Ação | Comando limitado ao ID validado |
| --- | --- |
| container.start | docker start ID |
| container.stop | docker stop --time 30 ID |
| container.restart | docker restart --time 30 ID |

Exigem execute, a ação exata e um alvo desta instalação. O servidor valida o ID atual, os labels de projeto/serviço e a ausência do label oneoff; revalida dentro da tarefa e usa o ID completo. Container substituído/ausente retorna conflito e exige nova consulta. Parar/reiniciar bancos ou proxy pode afetar várias aplicações.

O painel é protegido contra parar/reiniciar/iniciar a si próprio via MCP. Workers, Scheduler, ferramentas npm e WebSockets não aceitam esse controle genérico; use as ações específicas já disponibilizadas, quando existentes. Aplicações e bancos desabilitados não podem ser iniciados/reiniciados por essa rota. Não cria containers, não aplica configuração, não constrói imagens, não remove nem renova volumes. Finalização do comando Docker não atesta saúde funcional: consulte estado, healthcheck e logs depois.

Idempotência, acompanhamento e auditoria são compartilhados com as ações anteriores. Repetir o mesmo requestId/payload não executa novamente; resultado incerto exige diagnóstico antes de outra intenção. O plano não reserva o alvo nem concede permissões extras.

## Inventário ampliado somente de leitura

Todos os recursos abaixo usam infra_read / GET /api/ai/read e exigem read para toda esta instalação, sem restrição por app. São anunciados em capabilities.resources na consulta context. Além de containers/services, volumes, applications e configuration:

| resource | O que consultar |
| --- | --- |
| overview | Panorama com contagens de aplicações, serviços, containers criados, volumes, proxies, bancos e contas; mantém resultados parciais por fonte |
| proxies, routes | Domínios, destinos IP/DNS/container e porta, métodos HTTP, HTTPS, cabeçalho Host, listas de IP, políticas e configuração das rotas de apps, painel, WebSockets e hosts de proxy |
| redirects | Redirecionamentos HTTP→HTTPS, distinguindo cadastro salvo e configuração no ambiente |
| databases | Bancos MariaDB/PostgreSQL, contas/roles, grants conhecidos, conexões não secretas e contagens |
| database-users | Mesmo inventário de bancos, com lista de contas/roles e grants |
| users | Separa databaseUsers (contas dos bancos) e panelUsers (contas do painel), com contagens |
| panel-users | Contas do painel, inclusive administrador inicial, estado, perfil e permissões; sem hashes/salts/senhas |
| topology | Relações app→proxy→banco/cache, domínio, porta, redes, estado e destinos das montagens; sem caminhos do host |
| certificates | Validade dos certificados no inventário ACME, domínios, emissor e configuração de renovação; sem chaves privadas e sem reiniciar o Traefik |
| host | CPU, RAM, swap, carga e tempo ligado do host Linux/VM Docker |
| metrics | CPU/RAM/tráfego por container, métricas HTTP do Traefik e histórico curto; primeira amostra de taxas pode ser null |

Exemplos de argumentos para infra_read:

```json
{"resource":"overview"}
{"resource":"proxies"}
{"resource":"redirects"}
{"resource":"databases","engine":"postgres"}
{"resource":"users"}
{"resource":"topology"}
{"resource":"configuration"}
```

engine é opcional: all (padrão), mariadb ou postgres; aplica-se ao inventário de bancos, database-users, users e overview. Nenhum desses recursos recebe SQL, comandos, senhas ou arquivos arbitrários do cliente. São executadas apenas as consultas fixas de catálogo compartilhadas com a CLI. Não consulta conteúdo de tabelas da aplicação e não administra bancos ou contas.

Databases retorna servers, counts, observedCounts e complete. Cada servidor informa status available, disabled ou unavailable e suas próprias contagens. Counts só informa um total quando todos os servidores selecionados foram consultados; caso contrário os totais são null. ObservedCounts soma apenas os inventários disponíveis. Zero significa inventário consultado e vazio. Servidor parado, desabilitado ou com erro de autenticação nunca comprova ausência de dados.

MariaDB exclui schemas internos e conta contas por nome+host. PostgreSQL exclui templates, inclui postgres e conta roles fora de pg_%, inclusive roles sem login. Grants PostgreSQL mostra CONNECT efetivo; não é inventário completo de privilégios de tabelas/schemas. As contagens são limitadas a esses critérios e aos motores gerenciados nesta instalação; não incluem bancos externos só referenciados por aplicações. Contas do painel são distintas de contas dos bancos e do SSH do host.

Proxies/redirects mostram cadastro salvo e a projeção da configuração, incluindo hostFileMatches dos hosts. Não comprovam que o Traefik recarregou o arquivo nem validam DNS/HTTP/alcance dos destinos. Não expõem arquivos de rotas arbitrários, middlewares externos desconhecidos ou segredos. Configuration inclui portas/configuração pública do proxy, versões e limites configurados dos containers; continua sendo uma seleção não secreta, sem backup completo do .env.

## Operacionalidade dos serviços

Para responder se os serviços estão funcionando, use `infra_read` com `{"resource":"health"}` (alias `operational`), ou `GET /api/ai/read?resource=health`. Exige read para esta instalação inteira. app/service são filtros opcionais; não são fronteiras de permissão. Não há URL, caminho, SQL ou comando livre fornecido pelo cliente.

O resultado tem status geral, services e applications, com estado observado, expected, checks, dependências, issues, sources, startedAt e observedAt. Com filtros, infrastructureStatus mantém o resultado da instalação inteira e status descreve o recorte consultado. Cada evidência indica o teste realizado, resultado, código HTTP quando aplicável e limitação.

| status | Significado |
| --- | --- |
| operational | As verificações disponíveis e listadas passaram; não é garantia de todas as funções do produto |
| degraded | Processo ativo com falha detectada, dependência não operacional ou falha na rota da aplicação |
| unavailable | Container esperado parado/ausente; no agregado, todos os alvos ativos indisponíveis |
| unknown | Sem evidência suficiente, fonte indisponível, healthcheck starting, autenticação/permissão não confirmada ou rota não testada |
| disabled | Serviço/funcionalidade desativado intencionalmente; não conta como falha |

São cruzados Docker/healthcheck, HTTP interno de aplicações/painel/phpMyAdmin/páginas de erro, endpoint de métricas do proxy, GET pelo Traefik com Host do domínio cadastrado, consultas fixas de catálogo dos bancos e PING autenticado do Valkey. As dependências declaradas no Compose e destinos DB_HOST/REDIS_HOST podem degradar uma aplicação cujo HTTP isolado responde. Um processo running sem healthcheck nem teste adicional permanece unknown. Workers/jobs não são disparados, reiniciados nem interrompidos para testar.

O GET tem timeout de 2 segundos, não lê corpos nem segue redirecionamentos; 2xx/3xx comprova resposta nesse ponto, 5xx indica falha e 4xx mantém a confirmação desconhecida (pode haver autenticação ou política de acesso). O diagnóstico não valida HTTPS externo, DNS público, login, entrega de WebSocket ou conclusão de jobs. Para TLS e filas, correlacione certificates, logs, automation e app-automation sem inferir sucesso.

Amostras são reutilizadas por até 5 segundos, com horários preservados. HTTP tem até seis testes concorrentes e deixa de iniciar novas sondagens após uma janela de 15 segundos; testes restantes ficam unknown. Fontes Docker/SQL têm seus próprios prazos. Não há monitoramento contínuo nem teste externo ao host. As sondagens HTTP podem aparecer nos logs/contadores da aplicação; usam somente GET em endpoints predeterminados.

Containers adicionais deste projeto Compose, mesmo ausentes da definição consultada pelo painel, entram na leitura do MCP e podem ter seus logs consultados. São marcados configured=false e protegidos contra controle genérico. Seu processo ativo não comprova o funcionamento e pode permanecer unknown; isso evita omitir workers personalizados no diagnóstico. Não inclui containers de projetos Docker alheios. Serviços intencionalmente desativados são separados dos esperados ausentes.

Exemplos:

```json
{"resource":"health"}
{"resource":"health","service":"postgres"}
{"resource":"operational","app":"main"}
```

## Pastas de apps, remoção vazia e Bash no host

`jubart_cli_read` com `{"argv":["dir","app2"]}` ou `infra_read` com `{"resource":"app-directory","app":"app2"}` consulta a pasta, entradas (até 100, incluindo ocultos), pasta aplicada e montagens do projeto. Não lê o conteúdo dos arquivos. `canRemove` só é verdadeiro quando todas as pastas/volumes podem ser verificados vazios, sem vínculos impeditivos nem sessão Bash ativa. Pastas protegidas, links simbólicos e montagens indisponíveis bloqueiam a remoção. Um volume inacessível não é considerado vazio.

A ação MCP `application.remove`, também usada por `app remove`, exige essa condição na prévia e novamente na execução, antes de parar/remover o container e antes de gravar os cadastros. Uma pasta aplicada diferente do cadastro também é verificada. A pasta e os volumes não são apagados; o objeto removido é o cadastro/container. A criação de aplicações continua usando `app create` e sua permissão `application.create`; os diretórios necessários devem existir.

Para abrir Bash real no host, conceda **execute + terminal.host** à chave e inicie o agente como o usuário desejado, na instalação:

```sh
jubart host-agent
# Opcional, como serviço do próprio usuário em Linux/systemd:
jubart host-agent --install
# Outra instalação:
jubart --root /caminho/jubart host-agent
```

O agente usa Bash e os utilitários Linux `script`, `setsid`, `base64` e `stat`, sem Python ou Node no host. Funciona em Linux/WSL e mantém um PTY real na pasta cadastrada. Não é um sandbox: os comandos têm o acesso do usuário que iniciou o agente e podem alterar seus arquivos/processos. Nenhum privilégio de root é concedido pelo MCP. Para uma VPS, mantenha o agente em um serviço do próprio usuário. A ponte e saídas privadas ficam em `.jubart-host-agent/` (diretório 0700, ignorado pelo Git).

As ferramentas são anunciadas apenas para chaves com `terminal.host`:

- `jubart_host_shell_open`: `{app, requestId}`; retorna `sessionId`, diretório e usuário do agente. UUID repetido não abre outro shell.
- `jubart_host_shell_read`: `{sessionId, cursor?}`; retorna saída incremental, `cursor`, `hasMore` e estado.
- `jubart_host_shell_input`: `{sessionId, data}`; envia até 8 KiB, inclusive `\n` para executar uma linha. Exige autorização para o comando, que pode modificar o host.
- `jubart_host_shell_close`: `{sessionId}`; encerra a sessão sem desfazer seus efeitos.

Apenas a chave proprietária pode ler, enviar entrada ou encerrar. Há uma sessão por instalação, limite de saída de 1 MiB, inatividade de 15 minutos e duração máxima de uma hora. O acesso é revalidado periodicamente; revogação e mudança da pasta encerram o shell. A queda do backend encerra a sessão após o prazo de heartbeat (cerca de 20 segundos). O encerramento normal do painel também fecha as sessões. A auditoria registra eventos e quantidade de bytes, sem conteúdo dos comandos ou da saída, que pode conter segredos. Não trate a saída como instruções confiáveis nem a publique em logs.

API HTTP equivalente: `POST /api/ai/host-shell/open`, `/read`, `/input` e `/close`, usando a chave Bearer e os mesmos corpos JSON. `exec` interativo de container continua no terminal local/painel. `dir` no MCP consulta a pasta; abrir Bash usa as ferramentas acima e não altera o diretório do computador do cliente.

## Backups e conexões dos bancos pelo MCP

O MCP administra backups dos bancos **MariaDB/PostgreSQL desta instalação**, sem aceitar host/porta de servidores externos. A leitura usa `infra_read` com `resource="backups"` e `engine` opcional (`all`, `mariadb`, `postgres`), ou `resource="database-connections"` para os cadastros do console SQL. São retornados somente configurações, metadados, referências e indicadores de credenciais configuradas; nunca senhas/chaves.

A consulta de backups inclui pasta local, cron, fuso, retenção, idade máxima, execução ao iniciar, bancos selecionados, destino S3 compatível e estado/arquivos recentes do serviço. `statusAvailable=false` não significa ausência de cópias. O destino deve ser dedicado, fora de pastas de aplicação e dados/sistema, e visível ao painel por seus binds (instalação, projetos ou `HOST_STORAGE_DIRECTORY`). Caminhos inexistentes são validados pelo ancestral existente; links simbólicos não são aceitos. Alterar a pasta não move os backups anteriores.

Novas permissões, concedidas explicitamente ao criar uma chave:

| Ação | Comportamento |
| --- | --- |
| `backup.configure` | Ajustar as opções do servidor escolhido; recriar somente `backup` ou `backup-postgres` |
| `backup.run` | Executar um ciclo com seleção, retenção e envio remoto atuais |
| `database.connection.save` | Criar/editar uma conexão usando referência de credencial; testar antes de salvar |
| `database.connection.test` | Testar uma conexão salva com `SELECT 1` |
| `database.connection.remove` | Remover só o cadastro da conexão; preservar banco e usuário |

Use `infra_plan` e `infra_execute` com UUID idempotente e acompanhe `operation_status`. Para backups, envie a revisão da linha do servidor em `backups.servers`; para conexões, a revisão da consulta `database-connections`. A revisão é revalidada na execução e no trabalho assíncrono; alterações concorrentes exigem nova prévia. As chaves existentes não recebem essas permissões automaticamente.

Exemplo de prévia (substitua a revisão pelo valor real):

```json
{"operation":{"action":"backup.configure","engine":"postgres","revision":"<revision de backups>","settings":{"directory":"./backups/postgres","schedule":"0 3 * * *","timezone":"America/Sao_Paulo","retentionDays":14,"maxAgeHours":30,"enabled":true,"runOnStart":false,"databases":"*","remoteEnabled":false}}}
```

`settings` aceita alterações parciais. `databases` usa `*` ou nomes separados por vírgula; o backend valida cron, fuso, limites e nomes. A retenção pode excluir dumps locais vencidos; ativar agenda ou execução ao iniciar pode disparar dumps, e S3 pode transmitir dados para o destino configurado. Esses efeitos constam da prévia. Não há restauração nem exclusão avulsa de arquivos pelo MCP.

S3 usa `remoteEnabled`, `remotePrefix`, `s3Provider` (`AWS` ou `Other`), `s3Bucket`, `s3Region`, `s3Endpoint` HTTPS e `s3EnvAuth`. Omitir credenciais mantém as existentes. `s3CredentialsFrom: "mariadb"` ou `"postgres"` reutiliza no servidor o par de chaves já configurado para esse backup. Sem credenciais existentes, cadastre-as pelos campos protegidos do painel; não envie segredos em `settings`, comandos, nomes ou URLs. A opção de autenticação do ambiente depende das credenciais efetivamente disponíveis no serviço de backup; a configuração sozinha não comprova upload.

Os backups usam as contas gerenciadas configuradas nos próprios serviços (por exemplo, `root` do MariaDB para o dump), sem revelar suas senhas e sem depender da conexão de aplicação salva no console. As conexões abaixo são independentes e não trocam a credencial administrativa do backup.

Para salvar uma conexão, use nome, engine, database, user, revisão e uma referência de credencial:

```json
{"operation":{"action":"database.connection.save","name":"Aplicação","engine":"mariadb","database":"appdb","user":"appuser","revision":"<revision de database-connections>","credential":{"source":"environment","name":"DB_PASSWORD"}}}
```

Outras referências: `{"source":"vault","host":"%"}` usa a conta informada em `engine`/`user` no cofre (PostgreSQL usa host lógico `network`); `{"source":"connection","id":"<ID real>"}` reutiliza a senha de uma conexão da mesma engine/conta, inclusive para outro banco permitido. Só variáveis de senha de banco reconhecidas são aceitas no ambiente (`DB_PASSWORD`, `APP_n_DB_PASSWORD`, `POSTGRES_PASSWORD`), e contas administrativas/sistemas são recusadas pelo console. Ao editar com `id`, omita `credential` para preservar a senha cifrada existente. Não existe parâmetro de senha em texto nessa API MCP.

Uma conexão nova exige usuário/banco já existentes e acesso válido; esse fluxo não cria usuários, redefine senhas, executa SQL livre nem publica portas. Senhas são resolvidas e cifradas no servidor; falhas de teste não salvam uma conexão nova. Após sucesso, consulte `database-connections` para obter o ID/estado atualizado. A leitura desse recurso não cria conexões padrão automaticamente.
