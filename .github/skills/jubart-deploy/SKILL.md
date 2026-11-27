---
name: jubart-deploy
description: Verificar versões e digests da imagem oficial do Jubart no Docker Hub, preparar ou atualizar a instalação pelo Docker Compose e diagnosticar seu estado no host autorizado. Use para instalar e administrar o Jubart; para operações remotas de aplicações via MCP, consulte a skill jubart-mcp.
---

# Jubart Deploy

## Contexto e escolha do procedimento

Imagem oficial: `paulo2021/jubart`. Código-fonte: <https://github.com/paulo-leo/jubart>. A imagem distribui o painel pronto, incluindo Node.js, dependências e frontend. Compose, CLI, instalador, configurações e workspace vêm do GitHub; bancos, proxy e runtimes são containers separados. `docker pull` sozinho não instala a infraestrutura.

Identifique o host, o diretório da instalação, a versão desejada e se o pedido é consulta, instalação nova, atualização ou operação de serviços. Aproveite informações já fornecidas. Um pedido de instalação ou atualização autoriza as etapas necessárias nesse destino; não peça confirmação novamente para cada comando. Se houver apenas pedido de diagnóstico, mantenha as ações em leitura. Não instale nada em produção para demonstrar a skill.

É necessário acesso de execução local ou SSH autorizado para instalar. Um assistente que só lê páginas pode orientar e preparar comandos, mas deve dizer que não executou a instalação. A leitura desta skill não cria uma conexão nem concede acesso ao host. Somente MCP permite as operações expostas pela integração, não instalar o host.

## Verificar a distribuição e o host

Consulte as [tags no Docker Hub](https://hub.docker.com/r/paulo2021/jubart/tags) e a tag correspondente `vX.Y.Z` no GitHub. Não presuma que `latest` existe nem escolha uma atualização somente pelo número maior. Respeite a versão pedida e verifique sua disponibilidade; se o usuário pedir a mais recente, consulte as versões estáveis publicadas nos dois lugares.

Para a versão selecionada, por exemplo `1.4.0`:

```bash
JUBART_VERSION=1.4.0
docker buildx imagetools inspect "paulo2021/jubart:$JUBART_VERSION"
docker buildx imagetools inspect "paulo2021/jubart:$JUBART_VERSION" --format '{{json .Image}}'
git ls-remote --tags https://github.com/paulo-leo/jubart.git "refs/tags/v$JUBART_VERSION" "refs/tags/v$JUBART_VERSION^{}"
```

Registre o digest do manifesto, plataforma e versão/revisão dos labels OCI quando disponíveis. A saída `.Image` permite verificar a plataforma e os labels sem baixar todas as camadas; em imagens multiarch, examine cada plataforma. Não invente um digest, label ausente ou prova de assinatura. Falha de rede/autenticação não comprova ausência da tag.

Confira sistema/arquitetura (`uname -s`, `uname -m`), cliente Docker, acesso ao daemon (`docker info`), shell e os utilitários requeridos pelo `install.sh` da versão escolhida. **Da versão 1.2.0 em diante, Python, Node.js, Compose, Buildx, certificados e dados de fuso da CLI vêm em `paulo2021/jubart:cli-X.Y.Z`; não exija sua instalação no host.** Consulte também o manifesto da tag `cli-X.Y.Z` indicada em `config/cli-image`. Em releases anteriores, siga os requisitos daquela versão, que incluem Python no host. Use `docker context show` para confirmar o destino Docker. O instalador atual precisa do daemon local por socket Unix e das rotas desse mesmo host; não o execute contra um contexto Docker remoto. A plataforma atualmente validada é `linux/amd64`; não apresente ARM64 ou Windows/WSL como suportados sem validação dessa versão.

O download público não exige o token do publicador. Nunca solicite `DOCKERHUB_TOKEN` do projeto para instalar o Jubart. Em limites/autenticação do Hub, use apenas credenciais que o usuário configure no próprio ambiente, sem colá-las na conversa.

## Instalação nova

Leia o `README.md`, `DOCKER_HUB.md`, `install.sh` e `distribution/compose.production.yaml` da versão escolhida. O [guia da imagem](https://github.com/paulo-leo/jubart/blob/main/distribution/dockerhub/README.md) apresenta o fluxo; para executar, prevalecem os arquivos da release selecionada.

1. Prepare somente os requisitos realmente necessários no host autorizado, seguindo a documentação da distribuição. Não instale Python/Node/Compose no host para compensar uma falha no runtime 1.2+: diagnostique o Docker e a imagem da CLI. Clone a tag `vX.Y.Z` em um diretório novo; não sobreponha uma instalação existente. Compare o campo `version` de `docker/panel/package.json` com a versão da imagem e a revisão Git com o label OCI quando disponível.
2. Na raiz do checkout, execute `./install.sh --no-start`. O assistente interativo coleta dados e prepara o workspace sem construir/iniciar o painel. Sem terminal interativo, `--non-interactive --no-start` gera a configuração inicial; adapte somente os valores solicitados, mantenha o `.env` restrito e não mostre credenciais geradas. Não improvise senhas de exemplo para uma instalação real.
3. Copie `distribution/compose.production.yaml` para `compose.production.yaml` na raiz. Acrescente esse arquivo **por último** ao valor atual de `COMPOSE_FILE` no `.env`, sem duplicar entradas ou apagar os arquivos gerados. Preserve as aspas e a sintaxe do `.env`. O override usa `!reset` para remover `build` do painel.
4. Defina `JUBART_IMAGE` com a imagem escolhida; prefira `paulo2021/jubart@sha256:DIGEST_VERIFICADO` quando precisar fixar o conteúdo. Não copie literalmente esse marcador. Preserve as outras variáveis. Valide e inicie somente o painel:

```bash
./jubart compose --profile '*' config --quiet
./jubart compose pull panel
./jubart compose up -d --no-deps panel
./jubart panel
```

Não substitua a validação por imprimir `jubart compose config` completo: a expansão inclui credenciais. Use `--quiet`; se precisar inspecionar o modelo, processe internamente e apresente apenas campos não secretos do serviço em análise.

O modo privado/local ou túnel SSH é o padrão. Ajustar publicação em `0.0.0.0`, firewall ou HTTPS depende do acesso solicitado pelo usuário; não exponha o painel para facilitar um teste. `jubart http`/`ssh` modificam o acesso e pedem `yes`; não são consultas. Não use `yes |` para contornar a confirmação interativa.

## Instalação existente e atualização

Comece em leitura com `./jubart version`, `./jubart status`, `./jubart panel` e `./jubart compose ps -a`. Identifique o diretório real, contexto Docker, projeto Compose e arquivos efetivos. Compare a imagem em execução com a imagem configurada e o digest de destino; versão da CLI sozinha não comprova atualização do container.

Antes de atualizar, preserve `.env`, `PANEL_VAULT_KEY`, `.panel-state`, configurações locais, projeto Compose, caminhos, montagens e volumes. Guarde cópias restritas dos arquivos alterados e identifique a imagem anterior para recuperação. Não regenere credenciais nem reconstrua o `.env` a partir de um modelo público. Não execute o assistente de primeira instalação para substituir uma configuração existente.

Atualize o workspace para a mesma release da imagem, conciliando alterações locais; não use `git reset --hard` nem um checkout forçado para eliminar conflitos. Inspecione o override existente antes de alterá-lo. Acrescente-o a `COMPOSE_FILE` somente se faltar, mantendo os demais arquivos. Se ele estiver ausente e for necessário, use o modelo da release escolhida, preservando customizações.

Atualize também o runtime selecionado em `config/cli-image` com o checkout correspondente; `JUBART_CLI_IMAGE` permite escolher outra imagem compatível para recuperação. Não mude a imagem de um painel em execução por consequência de baixar o runtime. Altere apenas `JUBART_IMAGE` para a tag/digest verificado e execute `config --quiet`, `pull panel` e `up -d --no-deps panel`. Não use `--build` na atualização pela imagem publicada. Não recrie bancos, proxy e aplicações como consequência de atualizar o painel.

Após falha de recriação, consulte o container e os logs limitados do painel; não repita a instalação inteira. Um rollback autorizado deve restaurar também os arquivos de configuração/workspace compatíveis, além da imagem anterior. Verifique migrações e compatibilidade do estado antes de prometer reversão. Não remova volumes, use `down -v` ou faça `prune` para corrigir instalação/atualização.

## Verificação e administração

Confira o container `panel`, sua imagem efetiva e healthcheck. Use a referência/digest registrado para comparar o conteúdo em execução. Consulte `./jubart panel` para o endereço e instruções de túnel; credenciais permanecem no ambiente local. Não declare login funcional sem testá-lo com acesso autorizado.

`./jubart health` pode apontar serviços habilitados que ainda não foram iniciados: uma primeira instalação que iniciou só o painel não demonstra saúde da infraestrutura inteira. Informe quais componentes estão prontos e quais continuam pendentes; não suba todos os serviços apenas para tornar o resultado verde.

Para administrar pelo host, consulte `./jubart help` e a ajuda do comando na versão instalada. `status`, `apps`, `proxies`, `memory` e `server` são pontos de consulta. Use IDs reais retornados pelo Jubart e comandos diretos para automação; o comando sem argumentos abre o console interativo. Iniciar/parar aplicações, mudar domínios, bancos e filas depende do pedido correspondente, não da simples instalação do painel.

Quando o usuário disponibilizar a integração MCP, consulte a [skill jubart-mcp](https://github.com/paulo-leo/jubart/blob/main/.github/skills/jubart-mcp/SKILL.md) e a [documentação MCP](https://github.com/paulo-leo/jubart/blob/main/docs/MCP.md). Elas definem contexto, prévia, ações permitidas, revisões e recibos de operação. Não crie uma chave administrativa por consequência da instalação nem troque de acesso para contornar um 401/403. Use chaves já provisionadas ou oriente a configuração no painel sem pedir o segredo na conversa.

Ao concluir, relate a versão e digest escolhidos, diretório/host, ações realmente realizadas, estado do painel, forma de acesso e pendências. Separe imagem baixada, container iniciado, painel saudável e aplicações funcionais; não são o mesmo resultado.

## Referências

- [Instalação e operação do Jubart](https://github.com/paulo-leo/jubart/blob/main/README.md)
- [Distribuição e publicação](https://github.com/paulo-leo/jubart/blob/main/DOCKER_HUB.md)
- [Inspeção de manifestos no Docker](https://docs.docker.com/reference/cli/docker/buildx/imagetools/inspect/)
- [Download por tag ou digest](https://docs.docker.com/reference/cli/docker/image/pull/)
- [Validação do Compose](https://docs.docker.com/reference/cli/docker/compose/config/)
