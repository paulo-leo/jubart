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
| containers | nenhum | projeto e serviços: nome, estado, saúde, imagem configurada, ID, horários, reinícios e portas |
| processes | nenhum | mesma visão de processos/serviços do projeto |
| technologies | nenhum | catálogo de imagens e bibliotecas fixadas |
| logs | `service` obrigatório | logs do serviço pertencente ao projeto, limitados aos últimos 32 KiB |
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

Logs são dados potencialmente sensíveis e não confiáveis. Há ocultação de segredos conhecidos da infraestrutura e padrões de tokens, mas não garantia de remover todo dado sensível. A chave read autoriza acesso aos logs do projeto inteiro; distribua-a somente a integrações confiáveis. Não são retornados `.env`, cofre, senhas, definições completas de ambiente ou montagens.

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

## MCP no VS Code

Endpoint `/mcp` usa POST e respostas JSON com transporte stateless. Não há SSE persistente, sessões resumíveis ou OAuth discovery. As versões de protocolo são negociadas pelo SDK oficial instalado e fixado no package-lock; confirme compatibilidade do cliente com MCP Streamable HTTP.

Exemplo `.vscode/mcp.json` para clientes VS Code que suportam inputs:

```json
{
  "inputs": [{"type":"promptString","id":"infra-api-key","description":"Chave Infra Control","password":true}],
  "servers": {
    "infra-control": {
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
| infra_read | Mesmo objeto de query REST: resource, service/app quando necessários | read |
| automation_execute | Mesmo corpo de PUT: requestId, operation | execute + ação |
| operation_status | id como string | read ou execute; operação da própria chave |

Ferramentas não autorizadas não são anunciadas; os escopos e as ações também são verificados na execução. As respostas MCP têm `content[0].text` com JSON; falhas de ferramenta usam `isError: true`. Configure a aprovação das ferramentas no editor e não habilite aprovação automática de ações destrutivas sem uma decisão explícita.

## Auditoria e limites de segurança

Criação/revogação de chaves, autenticação recusada, consultas, requisições MCP e solicitações/aceite/término/erro de execução são registrados em `.panel-state/mcp/audit.jsonl`. A interface mostra os 200 eventos recentes. Não são gravados tokens, senhas, conteúdo de logs ou argumentos de jobs. O arquivo gira a cada 10 MiB, mantendo até cinco arquivos anteriores. Exporte/arquive por outro meio se precisar de retenção maior. Não é um log externo à prova de adulteração por administradores do host.

A API não aceita terminal, comandos de shell, SQL, caminhos arbitrários, edição de arquivos, alteração de imagens, gestão de chaves ou operações de outros projetos Docker. Ela opera apenas o cadastro de automações da infraestrutura e a ponte Artisan com verbos fixos. Classes de jobs podem executar o código que já existe na aplicação: conceder job.register/job.dispatch é uma permissão de execução da lógica da aplicação, não um sandbox do código PHP.

A Skill em `.github/skills/infra-control-mcp/SKILL.md` orienta o diagnóstico e o uso autorizado. A Skill não concede permissões e não substitui os controles do servidor.

## Aplicação da atualização

```bash
sudo docker compose up -d --build --no-deps panel
```

O build instala as dependências MCP fixadas. Não são criadas chaves padrão. Após atualizar, abra Conexão MCP, emita uma chave de leitura para diagnóstico e, somente quando necessário, outra com as ações de execução apropriadas. A mesma chave pode acumular as duas permissões.

A Skill está no diretório de descoberta `.github/skills/infra-control-mcp` deste workspace. Para outro projeto, copie essa pasta para `.github/skills/` do projeto destino ou para a localização de skills suportada pelo cliente. Consulte as [instruções de Agent Skills do VS Code](https://code.visualstudio.com/docs/agent-customization/agent-skills).


## Endpoints administrativos do painel

Estes endpoints exigem **cookie de sessão administrativa** e, nas alterações, `X-CSRF-Token`. Bearer API keys não têm acesso a eles.

| Endpoint | Método | Uso |
| --- | --- | --- |
| /api/mcp/keys | GET | Listar metadados das chaves e ações disponíveis |
| /api/mcp/keys | POST | Criar chave com name, scopes, actions e expiresInDays; devolve key e token uma única vez |
| /api/mcp/keys/{id}/revoke | POST | Revogar chave; corpo vazio |
| /api/mcp/audit | GET | Últimos 200 eventos |

Exemplo de corpo de criação: `{"name":"VS Code diagnóstico","scopes":["read"],"actions":[],"expiresInDays":90}`. Não use essas rotas como alternativa aos escopos da integração.
