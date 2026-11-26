---
name: jubart-mcp-plugin
description: Criar ou adaptar um plugin ou cliente de IA para conectar ao MCP existente do Jubart, com autenticação por chave e descoberta de ferramentas. Use para desenvolver a integração, não para instalar o Jubart nem operar a infraestrutura diretamente.
---

# Desenvolver uma integração com o Jubart

Crie o plugin no projeto e na plataforma escolhidos pelo desenvolvedor. Reutilize o servidor MCP do Jubart; não implemente outro servidor nem exponha o socket Docker ao cliente.

## Conexão

- Painel de referência: `https://painel.exemplo.com`.
- Endpoint: `https://painel.exemplo.com/mcp`.
- Transporte: MCP Streamable HTTP, sem sessão persistente.
- Autenticação: `Authorization: Bearer <chave de API>` em cada requisição.
- Solicite a chave no armazenamento de segredos do cliente. Nunca a inclua em manifestos, código, logs, exemplos ou arquivos versionados.
- Uma chave com leitura consulta toda esta instalação Jubart. Execução exige escopo e ações específicas concedidas na chave.

Confirme a plataforma do plugin e consulte os formatos suportados pela versão instalada antes de gerar manifestos. Reutilize os helpers e SDKs disponíveis no projeto. Não invente campos de autenticação, suporte a OAuth ou schemas de ferramentas.

O agente precisa alcançar o endereço do painel. `localhost` refere-se à máquina do cliente; um agente remoto não alcança o computador do desenvolvedor por esse endereço. Preserve túneis existentes e use HTTPS no acesso público.

## Implementação

1. Examine o projeto e preserve os plugins, configurações e segredos existentes. Torne o endereço do painel configurável.
2. Use o cliente MCP suportado pela plataforma. Inicialize a conexão e descubra as ferramentas e seus schemas com `tools/list`.
3. Consulte `infra_read` com `{"resource":"guide"}` e `{"resource":"context"}`. O primeiro retorna a Skill operacional e a referência da API; siga a documentação retornada pela instalação.
4. Disponibilize consultas de saúde, containers, aplicações, volumes, proxies, redirecionamentos, bancos, usuários e métricas usando os recursos efetivamente anunciados. Para logs, informe o serviço e limites conforme o schema. Exiba dados indisponíveis como desconhecidos, sem concluir que o serviço está saudável.
5. Se o desenvolvedor solicitar operações, integre `infra_plan`, `infra_execute` e `operation_status` conforme os schemas descobertos. O plano não executa. Respeite a autorização já dada pelo usuário e as confirmações da plataforma antes de alterar serviços. Use um UUID novo por operação lógica e preserve o mesmo `requestId` nas tentativas de envio dessa operação.
6. Trate autenticação inválida/expirada, falta de permissão, serviço indisponível, timeout e cancelamento sem mostrar credenciais. Não repita automaticamente uma alteração com um novo identificador depois de uma resposta incerta.

Para clientes sem suporte a MCP, avalie a API HTTP documentada pela instalação. Não substitua silenciosamente o transporte nem prometa compatibilidade com uma plataforma cuja autenticação Bearer personalizada não foi verificada.

## CLI pela conexão

Se o plugin oferecer comandos Jubart, descubra `jubart_cli_help` e seus schemas. Encaminhe listas `argv` para `jubart_cli_read` ou `jubart_cli_plan`, nunca linhas de shell. Depois da autorização, use o `planId` real e UUID em `jubart_cli_execute` e acompanhe `operation_status`. Prévia e execução têm permissões próprias; não transforme uma consulta em execução. Mostre as limitações dos comandos locais e não simule TTY de container para `exec`.

## Notificações e incidentes

Se o plugin precisar acompanhar alertas, use `infra_read` com `resource="incidents"` ou assine `GET /api/ai/events` com a mesma chave Bearer de leitura. Esse SSE é separado do endpoint MCP. Trate `incident`, `recovery`, `snapshot`, `status` e `settings`; use `Last-Event-ID` na reconexão e ressincronize pelo snapshot se o cursor saiu do histórico. Em `auth-expired`, encerre a assinatura e solicite atualização do segredo pelo mecanismo do cliente. Não envie a chave na URL.

## Verificação e entrega

Teste a inicialização, descoberta das ferramentas e uma leitura de `health` com a chave fornecida pelo mecanismo seguro do cliente. Verifique que credenciais não aparecem nos artefatos ou logs. Use testes isolados para falhas de autenticação e operações; não pare nem reinicie containers reais apenas para testar o plugin.

Entregue os arquivos do plugin, as instruções de configuração de URL e segredo e os resultados verificados. Diferencie implementação, instalação no cliente e conexão autenticada. Publique ou instale em uma conta externa somente quando isso fizer parte do pedido.

Para consultar pastas, use `jubart_cli_read` com `argv=["dir","app2"]` ou `infra_read` com `resource="app-directory"` e `app`. Remover app pelo MCP exige pasta/volume verificado vazio (inclusive ocultos), na prévia e execução, sem apagar a pasta/volumes. Não contorne uma recusa por arquivos presentes ou montagem não verificada.

Bash real no host usa `jubart_host_shell_open/read/input/close`, com permissão explícita `execute` + `terminal.host` e agente local iniciado com `jubart host-agent`. Confirme o usuário e diretório retornados, mantenha o requestId UUID nos retries e use cursor para ler. Os comandos têm os privilégios do usuário do agente, sem sandbox. Execute apenas o que o usuário autorizou; não reproduza segredos da saída. Encerre a sessão quando terminar. Consulte docs/MCP.md no servidor/repositório para o protocolo e limites.

## Backups e conexões de banco

Consulte `infra_read` com `resource="backups"` (engine opcional) e `resource="database-connections"`. Use as revisões retornadas para planejar e executar `backup.configure`, `backup.run` e `database.connection.save/test/remove`, conforme as ações concedidas na chave. Configure pasta dedicada visível ao painel, cron, fuso, retenção, seleção de bancos e S3 compatível. A alteração recria apenas o backup selecionado; retenção e envio remoto podem excluir dumps antigos/transmitir dados e precisam fazer parte da autorização. Não mova backups anteriores como consequência de mudar o destino.

Os backups são dos MariaDB/PostgreSQL desta instalação e usam suas credenciais gerenciadas, separadas das conexões do console. Para conexões, use referências a senha no ambiente (apenas variáveis de banco reconhecidas), cofre ou conexão da mesma engine/conta; omitir a referência em uma edição preserva a senha. S3 mantém as chaves existentes ou reutiliza outro backup por `s3CredentialsFrom`. Credencial nova deve ser cadastrada nos campos protegidos do painel. Não envie nem peça segredos em texto, argumentos ou URLs; não há senha/chave retornada pelo MCP.

Planeje antes, use UUID por intenção, acompanhe `operation_status` e consulte o recurso novamente após a execução. Conexões novas exigem conta/banco existentes; não há host externo, SQL livre, restauração ou exclusão de dumps nessa capacidade. Estado indisponível não significa ausência de cópias e configurar S3 não comprova upload. Consulte a seção Backups e conexões dos bancos pelo MCP em `docs/MCP.md` para schemas e exemplos.
