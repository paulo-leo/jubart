# Publicação do Jubart no Docker Hub

Repositório de destino: **`paulo2021/jubart`**. Versão: **`1.2.0`**, plataforma **`linux/amd64`**. O workflow [Docker Hub](.github/workflows/docker-publish.yml) obtém o código do GitHub, executa os testes, constrói e valida a imagem antes de publicá-la. A primeira publicação depende do secret descrito abaixo.

## Imagens distribuídas

A imagem `paulo2021/jubart:1.2.0` contém o painel Jubart: servidor Node.js, frontend React compilado e Docker CLI/Compose usados na administração. O Dockerfile está em `docker/panel/Dockerfile` e já compila o frontend durante o build.

A imagem `paulo2021/jubart:cli-1.2.0` contém Python, Node.js, Compose, Buildx e os módulos da CLI e do assistente. O pequeno comando shell `jubart` do host inicia containers temporários dessa imagem com o usuário original, sem depender de o painel estar em execução. A instalação e a CLI não exigem Python/Node.js no host. `jubart compose ...` executa Compose pelo runtime.

A imagem do painel não substitui a instalação completa da infraestrutura. Traefik, PHP/FrankenPHP, bancos, filas e outros serviços continuam em containers separados. O usuário ainda precisa dos arquivos Compose, configurações, documentação e diretórios da infraestrutura. A documentação e a skill MCP são consultadas no workspace montado; devem acompanhar a versão instalada.

O `.env`, as chaves, os certificados, os dados das aplicações, os backups e os volumes persistentes devem permanecer fora da imagem.

## Configurar a publicação automática

1. Entre na conta **paulo2021** no [Docker Home](https://app.docker.com/). Abra o avatar → **Account settings → Personal access tokens → Generate new token**.
2. Use uma descrição como `jubart-github-actions` e selecione **Repo Read & Write** (ou **Read & Write**, conforme a interface). Guarde o token; ele só é exibido uma vez. Não é necessário conceder exclusão de repositórios.
3. No GitHub, abra [Settings → Secrets and variables → Actions](https://github.com/paulo-leo/jubart/settings/secrets/actions), clique em **New repository secret** e crie:

   | Nome | Valor |
   | --- | --- |
   | `DOCKERHUB_TOKEN` | Token criado na conta `paulo2021` |

O usuário `paulo2021` e o destino `paulo2021/jubart` já estão definidos no workflow. Não precisa cadastrar senha, chave SSH ou token do GitHub no workflow. O login Docker feito no computador local não autentica o runner do GitHub.

O token deve ser informado apenas no campo **Secret** do GitHub. Não coloque em `.env`, arquivos versionados ou mensagens. Consulte as [instruções oficiais de tokens Docker](https://docs.docker.com/security/access-tokens/personal-access-tokens/).

### Primeira publicação

Após cadastrar o secret, abra [Actions → Docker Hub](https://github.com/paulo-leo/jubart/actions/workflows/docker-publish.yml), clique em **Run workflow**, escolha **main**, habilite **publish** e execute. Serão publicadas **`paulo2021/jubart:cli-1.2.0`** e **`paulo2021/jubart:1.2.0`**, se essas tags ainda não existirem.

Sem habilitar **publish**, a execução manual faz apenas testes e build. Commits na `main` e pull requests também validam sem publicar. O workflow usa os arquivos de exemplo e credenciais fictícias nos testes; não precisa do `.env` da instalação.

### Próximas versões

1. Atualize a versão em `docker/panel/package.json` e os dois campos correspondentes em `docker/panel/package-lock.json`. Atualize também `config/cli-image`, a referência padrão em `distribution/compose.production.yaml` e a documentação da release.
2. Envie o commit para `main`.
3. Crie e envie uma tag com a mesma versão. Por exemplo, para uma futura `1.2.1`:

```bash
git tag -a v1.2.1 -m 'Jubart 1.2.1'
git push origin v1.2.1
```

O workflow exige que a tag `vX.Y.Z` corresponda exatamente à versão do painel e do lockfile. Depois dos testes da CLI e do painel, constrói a imagem, inicia um container isolado e verifica frontend, autenticação, APIs de configuração/proxies e Docker CLI/Compose/Buildx. O runtime da CLI passa por instalação/reinstalação em diretório temporário com Python/Node/Compose do host bloqueados, painel parado, console PTY, Bash do host e shell de uma aplicação isolada. As imagens testadas são as mesmas enviadas ao Docker Hub, sem um segundo build. O digest aparece no resumo da execução.

A publicação verifica se a tag já existe e interrompe o envio nesse caso. Para corrigir uma release publicada, incremente a versão. Apenas a tag explícita de versão é enviada; `latest` não é atualizado automaticamente. O fluxo não faz deploy nem altera a infraestrutura em execução.

### Apresentação do repositório no Docker Hub

O texto público do Docker Hub fica em [distribution/dockerhub/README.md](distribution/dockerhub/README.md), com logo, funcionalidades, requisitos, instalação pela imagem pronta e atualização. A logo PNG é uma renderização do `icon.svg` oficial, mantida em [distribution/dockerhub/logo.png](distribution/dockerhub/logo.png).

A apresentação inclui um prompt copiável e links para a [skill Jubart Deploy](.github/skills/jubart-deploy/SKILL.md), voltada à instalação, atualização e diagnóstico por IA com acesso autorizado ao host. A skill é distribuída pelo GitHub e pode ser consultada diretamente pela URL Markdown; não depende de reconstruir a imagem `1.2.0`. A [skill MCP existente](.github/skills/jubart-mcp/SKILL.md) cobre as operações remotas expostas pelo painel depois da instalação.

O workflow [Docker Hub - apresentação](.github/workflows/dockerhub-description.yml) sincroniza a descrição curta e o overview ao alterar esses arquivos na `main`. Também pode ser executado manualmente em Actions. Essa atualização usa `DOCKERHUB_TOKEN` e não publica outra imagem nem altera a tag `1.2.0`.

A API de edição de informações do repositório pode exigir permissão administrativa adicional à de push. Se a sincronização retornar acesso negado, edite as permissões do PAT no Docker Home para **Repo Read, Write, Delete**, conforme os [requisitos da ação de sincronização](https://github.com/peter-evans/dockerhub-description#action-inputs). O workflow só altera a descrição; não executa exclusões. Depois, execute novamente o workflow de apresentação.

A logo no corpo do overview é independente do ícone de cubo do cabeçalho. A [documentação do programa Docker-Sponsored Open Source](https://docs.docker.com/docker-hub/repos/manage/trusted-content/dsos-program/#repository-logo) descreve a personalização do ícone por repositório para organizações participantes; o envio da imagem ou do README não modifica esse ícone.

### Limites da validação

A imagem é validada para **linux/amd64**. ARM64 e Windows/WSL ainda não foram validados. O teste isolado do painel não monta o socket Docker; o teste da CLI usa um projeto Compose temporário e exclusivo, removido ao final; uma instalação de teste ainda é necessária para validar as operações da infraestrutura completa.

O serviço `panel` usa o socket Docker e o workspace na instalação real. Preserve os volumes e o bind privado padrão (`127.0.0.1`) do Compose. Os avisos de componentes redistribuídos estão em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Preparação e build local

Este bloco é destinado ao desenvolvimento e aos testes locais, com Node.js/npm e Python disponíveis na máquina de desenvolvimento. A instalação de uso final utiliza os runtimes em container. Execute na raiz do projeto. A imagem desta release usa o namespace `paulo2021`, a versão `1.2.0` e a plataforma `linux/amd64`.

```bash
node scripts/sync-brand.mjs
npm ci --prefix docker/panel --ignore-scripts
COMPOSE_FILE=compose.yaml COMPOSE_ENV_FILES=.env.example PANEL_PASSWORD=Test-only-password-123456 PANEL_VAULT_KEY=Test-only-key npm test --prefix docker/panel

docker build --platform linux/amd64 -t paulo2021/jubart:1.2.0 ./docker/panel
python3 scripts/test-release-image.py paulo2021/jubart:1.2.0
sh scripts/build-cli.sh paulo2021/jubart:cli-1.2.0
python3 scripts/test-cli-runtime.py paulo2021/jubart:cli-1.2.0
```

O contexto do painel é **`./docker/panel`**. O script de build da CLI prepara um arquivo tar com uma lista explícita de fontes públicas; não percorre nem envia `.env`, `.panel-state`, backups ou projetos. O Dockerfile usa argumentos padrão fixados para as imagens-base. Se o Compose local usar outros valores de `NODE_VERSION`/`DOCKER_CLI_IMAGE`, confira quais devem compor a release.

Faça a validação da imagem em uma instalação de teste antes de avançar. Use credenciais e dados de teste, não a produção. Verifique login, arquivos estáticos/logo, saúde do painel, documentação/skill e as operações Docker autorizadas.

## Consumir a imagem publicada

Após preparar a configuração Compose de distribuição e os arquivos da instalação:

```bash
docker pull paulo2021/jubart:1.2.0
```

O serviço `panel` deverá referenciar:

```yaml
services:
  panel:
    image: paulo2021/jubart:1.2.0
```

Esse trecho é **apenas a referência da imagem**, não um Compose completo. O modelo [distribution/compose.production.yaml](distribution/compose.production.yaml) preserva as opções do serviço original e remove `build` com `!reset null`. Requer Docker Compose com suporte a `!reset`.

Depois de a imagem estar publicada, em uma instalação preparada:

1. Copie `distribution/compose.production.yaml` para `compose.production.yaml` na raiz da instalação.
2. Acrescente `:compose.production.yaml` ao valor atual de `COMPOSE_FILE` no `.env`, preservando os arquivos existentes e deixando o de produção por último. Isso mantém o uso da imagem também nas operações iniciadas pelo painel.
3. Valide e atualize somente o painel:

```bash
jubart compose --profile '*' config --quiet
jubart compose pull panel
jubart compose up -d --no-deps panel
```

O modelo fica em `distribution/` para não alterar a instalação de desenvolvimento automaticamente. `JUBART_IMAGE` permite escolher outra tag/digest no `.env`; o padrão desta release é `paulo2021/jubart:1.2.0`. Para retornar a uma versão anterior, selecione uma tag/digest previamente validado e repita a atualização do painel, preservando o workspace e os volumes. Não execute um `docker run` genérico esperando que toda a infraestrutura seja instalada automaticamente.

Para atualizar uma instalação preparada dessa forma, revise a release, faça backup das configurações e atualize somente o painel pelo procedimento documentado. Não use `docker compose down`, não remova volumes e não recrie todos os serviços para trocar apenas a imagem do painel.

## Referências

- [Workflow do projeto](.github/workflows/docker-publish.yml)
- [Docker: testar antes de publicar no GitHub Actions](https://docs.docker.com/build/ci/github-actions/test-before-push/)
- [GitHub: cadastrar secrets de Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [Tokens de acesso do Docker](https://docs.docker.com/security/access-tokens/personal-access-tokens/)
