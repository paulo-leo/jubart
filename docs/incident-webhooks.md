# Notificações de incidentes por HTTP

Abra **Monitoramento → Monitoramento & incidentes → Notificações HTTP**. Além do SSE, o Jubart pode enviar requisições a endpoints de notificação ou automação quando um incidente é aberto, muda de gravidade/estado, é encerrado ou um container é iniciado/reiniciado. Paradas observadas no Docker abrem o incidente imediatamente, mesmo se o container voltar antes da próxima verificação.

## Cadastrar um destino

1. Clique em **Novo destino** e informe um nome e a URL fixa do endpoint.
2. Escolha **POST** ou **GET**. Para POST, escolha JSON completo do evento, JSON personalizado ou formulário URL encoded. GET não envia corpo.
3. Na aba **Headers e parâmetros**, adicione a autenticação e os parâmetros da URL. O Jubart preenche Content-Type conforme o formato e identifica o evento e a entrega nos headers.
4. Na aba **Eventos e serviços**, selecione abertura/alteração, encerramento, gravidades e serviços. O switch Mudanças de estado dos containers controla inícios e reinícios; vem ativo inclusive nos destinos anteriores. Essas mudanças respeitam o filtro de serviços, enquanto o filtro de gravidade vale para incidentes/encerramentos. Sem filtro de serviços, toda a instalação é considerada, incluindo aplicações e consumidores de fila monitorados como serviços.
5. Salve e use o ícone de teste. Esse envio exige confirmação, contém `test: true` e não cria um incidente real.
6. Ative **Receber notificações automaticamente** quando o destino estiver pronto. Destinos novos começam desativados para permitir a preparação e o teste.

Cadastrar ou reativar um destino não envia o histórico anterior. Alterar, desativar ou remover um destino cancela suas entregas pendentes antigas e interrompe requisições em andamento quando possível. Uma requisição já aceita pelo servidor remoto não pode ser desfeita.

As URLs precisam ser alcançáveis a partir do container do painel. Para um relay interno, ative **Permitir destino na rede privada**. Loopback, link-local, redes especiais e endpoints de metadados permanecem bloqueados. Não se seguem redirecionamentos, inclusive para preservar headers de autenticação; use a URL final.

## Variáveis

Use `{{nome}}` nos valores dos headers, parâmetros e campos de texto do JSON/formulário. Não há execução de JavaScript, expressões ou acesso ao ambiente.

| Variável | Conteúdo |
| --- | --- |
| `event.id` | Identidade persistente da fonte e sequência do evento |
| `event.type` | `incident`, `recovery`, `lifecycle` ou `test` |
| `event.transition` | `stopped`, `started`, `restarted`, `recovered`, `disabled`, `removed` ou vazio |
| `event.at` | Horário do evento em ISO 8601 |
| `incident.id` | Identificador do incidente |
| `incident.target` | Alvo do monitoramento |
| `incident.service` | Nome do serviço; vazio para coleta geral |
| `incident.message` | Descrição selecionada pelo monitor |
| `incident.state` | `open`, `resolved` ou `observed` (aviso de ciclo de vida, sem afirmar saúde) |
| `incident.status` | Saúde observada |
| `incident.severity` | `critical` ou `warning` |
| `incident.openedAt` | Abertura do incidente |
| `incident.resolvedAt` | Encerramento, quando disponível |
| `installation` | Nome do diretório da instalação |
| `test` | Indica um evento sintético de teste |

JSON personalizado:

```json
{
  "text": "Jubart · {{incident.service}}: {{incident.message}}",
  "event": "{{event.type}}",
  "incidentId": "{{incident.id}}"
}
```

Para GET, adicione parâmetros como `service = {{incident.service}}`, `event = {{event.type}}` e `message = {{incident.message}}`. O Jubart aplica URL encoding aos valores. Para formulário, informe um objeto JSON com campos de texto; o envio usa `application/x-www-form-urlencoded`.

No formato **JSON completo do evento**, o corpo tem `schemaVersion`, `id`, `type`, `at`, `installation`, `test` e `incident`. As evidências incluem somente tipos e resultados selecionados dos checks, sem logs ou variáveis do ambiente. O encerramento pode ter motivo `recovered`, `disabled` ou `removed`; nem todo encerramento comprova recuperação técnica.

## Entregas e tentativas

A aba **Entregas** mostra estado, HTTP, tentativas, próximo envio e detalhes. Um HTTP 2xx confirma que o endpoint aceitou a requisição; não comprova entrega ao telefone ou usuário final.

- Timeout configurável: 1 a 30 segundos; padrão de 10 segundos.
- Tentativas normais: 1 a 5; padrão de 3. Erros de conexão, timeout e HTTP 408/425/429/5xx podem ser repetidos. Outros 4xx e redirecionamentos encerram a entrega como falha.
- Espera exponencial a partir de 5 segundos, limitada a 5 minutos, respeitando `Retry-After` até 1 hora.
- Até 20 destinos, 200 entregas pendentes e três envios simultâneos. O histórico mantém as 300 entregas encerradas mais recentes.
- Eventos do mesmo serviço são enviados em ordem por destino: o aviso de reinício/recuperação aguarda uma entrega pendente da parada. Outros serviços/destinos podem ser processados em paralelo.
- O monitor não repete notificações a cada check enquanto o mesmo incidente continua sem alteração.

Os headers `X-Jubart-Event-Id`, `X-Jubart-Delivery-Id`, `X-Jubart-Event` e `Idempotency-Key` identificam a requisição. Tentativas da mesma entrega preservam o identificador. O processamento é **pelo menos uma vez**: após uma interrupção, o destino pode ter aceitado o envio antes de o painel gravar o resultado. Deduplicate pelo ID no receptor.

Use **Reenviar com a configuração atual** para uma entrega com falha. Essa ação é explícita e usa URL, headers e parâmetros atuais, preservando a identidade da entrega. O destino precisa continuar cadastrado; para incidentes reais, também deve estar ativo.

A fila persiste e retoma após reiniciar o painel. Os eventos são obtidos do mesmo histórico que alimenta o SSE, sem bloquear a coleta de saúde. Se a fila ficar cheia, o cursor aguarda espaço. Se eventos mais antigos já tiverem saído da retenção do monitor, o destino mostra uma indicação de lacuna; não há promessa de entrega de eventos que não foram retidos.

## Firebase e outros provedores

O editor inclui um exemplo para FCM HTTP v1. Substitua projeto, tópico e access token OAuth no header Authorization. O cadastro não renova esse token; para uso contínuo, um relay/Cloud Function pode gerenciar a autenticação. Consulte a [documentação oficial do Firebase](https://firebase.google.com/docs/cloud-messaging/send/v1-api).

Relays HTTP, n8n e APIs de notificação podem receber formatos personalizados. Ajuste o contrato esperado pelo provedor e teste a integração. Os templates não instalam SDKs nem fornecem credenciais automaticamente.

## Privacidade, acesso e persistência

URL completa, headers, parâmetros e modelo do corpo ficam cifrados com `PANEL_VAULT_KEY` em `.panel-state/incident-webhooks/state.json`. A listagem mostra apenas a origem da URL. A configuração completa é aberta somente pela ação administrativa de edição, via POST com CSRF e resposta `no-store`; valores dos headers começam visualmente ocultos no editor.

O histórico e a auditoria não guardam corpo de resposta remoto nem reproduzem a requisição ou tokens. Não inclua segredos no nome do destino. Preserve a chave do cofre ao restaurar o estado. Configurações de webhook não entram no arquivo público `Jubart.json` e não são substituídas pela atualização oficial.

As APIs abaixo exigem sessão de administrador; POST também exige CSRF. Chaves MCP não autenticam essas rotas de sessão. O MCP possui recursos e ações próprios para o mesmo gerenciador, descritos em [Notificações HTTP pelo MCP](MCP.md#notificações-http-pelo-mcp); consultas não revelam a configuração protegida. Usuários somente de leitura não administram esses destinos.

| Método | Endpoint | Uso |
| --- | --- | --- |
| GET | `/api/monitor/webhooks` | Metadados, revisão e entregas |
| POST | `/api/monitor/webhooks/save` | Salvar cadastro e configuração protegida |
| POST | `/api/monitor/webhooks/configuration` | Abrir configuração para edição |
| POST | `/api/monitor/webhooks/toggle` | Ativar/desativar |
| POST | `/api/monitor/webhooks/remove` | Remover cadastro |
| POST | `/api/monitor/webhooks/test` | Enfileirar evento sintético |
| POST | `/api/monitor/webhooks/retry` | Reenviar entrega com falha |

A qualidade do alerta depende das verificações existentes no monitor. Um worker indisponível pode abrir um incidente; falha individual de job, backlog de fila ou uma função de negócio sem check correspondente não passam a ser detectados apenas por cadastrar um webhook. O SSE continua disponível e independente dessas entregas.


## Paradas e reinícios

O painel mantém uma conexão de leitura com `/events` do Docker Engine, limitada por label ao projeto Compose desta instalação. `stop`, `die` e pausa são observados como parada, inclusive quando a ação veio de outro terminal, do MCP ou da política do Docker. `die`/`stop` do mesmo encerramento não duplicam o aviso; `start` e `restart` contíguos são agrupados em um único reinício. Um start posterior a uma parada longa continua sendo comunicado como início. Serviços explicitamente desabilitados, quando conhecidos pelo monitor, recebem aviso de mudança sem criar uma falha operacional.

SSE publica `incident` para a parada e `lifecycle` para início/reinício. O payload contém `incident.transition`, serviço, container e horário; o mesmo evento alimenta a fila HTTP. Início/reinício não fecha um incidente nem comprova operacionalidade. `recovery` depende de novas verificações de saúde, sem reutilizar amostra de antes da mudança. **Monitoramento pausado não gera esses novos avisos.**

A consulta de incidentes, inclusive pelo MCP, retorna `serviceEvents` com até 200 mudanças recentes e `summary.eventSource` para a conexão Docker. A página contém a guia Paradas e reinícios. Clientes SSE externos devem também escutar lifecycle e deduplicar o ID crescente, preservando Last-Event-ID ao reconectar.

A escuta reconecta automaticamente e usa cursor persistido, com sobreposição e deduplicação. O Docker mantém histórico limitado de eventos: períodos longos com painel/daemon indisponível podem deixar lacunas. As verificações periódicas continuam como alternativa e detectam um container atualmente parado já na primeira amostra; não conseguem reconstruir todas as mudanças rápidas ocorridas fora do histórico. Se o próprio painel parar, só poderá enviar eventos novamente depois de voltar. O monitoramento e os webhooks nunca reiniciam containers como consequência desses avisos.
