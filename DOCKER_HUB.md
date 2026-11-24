# Publicação do Jubart no Docker Hub

Repositório de destino: **`paulo2021/jubart`**. Versão preparada: **`1.1.0`**, plataforma **`linux/amd64`**. A imagem foi construída e testada localmente; o envio ao Docker Hub depende da autenticação do proprietário.

## O que será publicado

A imagem contém o painel Jubart: servidor Node.js, frontend React compilado e Docker CLI/Compose usados na administração. O Dockerfile está em `docker/panel/Dockerfile` e já compila o frontend durante o build.

A imagem não substitui a instalação completa da infraestrutura. Traefik, PHP/FrankenPHP, bancos, filas e outros serviços continuam em containers separados. O usuário ainda precisa dos arquivos Compose, configurações, documentação e diretórios da infraestrutura. A documentação e a skill MCP são consultadas no workspace montado; devem acompanhar a versão instalada.

O `.env`, as chaves, os certificados, os dados das aplicações, os backups e os volumes persistentes devem permanecer fora da imagem.

## Pendências antes da primeira publicação

- [x] Repositório informado pelo proprietário: `paulo2021/jubart`. A visibilidade é definida no Docker Hub.
- [ ] Criar um token de acesso com permissão de escrita. Guardá-lo no gerenciador de credenciais ou nos secrets do CI, nunca no Git ou no Dockerfile.
- [ ] Revisar a licença do projeto e as licenças de componentes redistribuídos; incluir os avisos necessários. Consultar `THIRD_PARTY_NOTICES.md`.
- [x] Restringir a imagem final aos módulos do painel, metadados npm, dependências de produção e arquivos públicos compilados. Testes, fontes JSX, `.env` e estado local não entram na imagem final. O contexto continua restrito a `docker/panel`.
- [x] Versão do package/lockfile e frontend: `1.1.0`. Tag de destino: `paulo2021/jubart:1.1.0`. Não sobrescrever tags de versões já publicadas.
- [ ] Sincronizar a identidade visual com `node scripts/sync-brand.mjs` antes do build.
- [x] Construir a imagem final e validar em container isolado, sem rede ou socket Docker: inicialização, frontend `1.1.0`, autenticação, configuração, API de hosts de proxy e executáveis Docker Compose/Buildx. Testes de infraestrutura completa continuam necessários antes de anunciar instalação completa ou outra plataforma.
- [ ] Verificar a imagem final quanto a segredos, arquivos desnecessários e vulnerabilidades; revisar imagens-base fixadas por digest.
- [x] Plataforma desta imagem: `linux/amd64`. ARM64 e Windows/WSL ainda não foram validados.
- [x] Preparar `distribution/compose.production.yaml`, selecionando `paulo2021/jubart:1.1.0` e removendo o build local. A composição foi validada com dados fictícios, preservando ambiente, volumes, redes, healthcheck, portas e os demais serviços.
- [ ] Validar essa configuração também com operações iniciadas pelo painel: elas invocam Docker Compose e precisam continuar usando o mesmo projeto, arquivos e imagem. Um override manual usado só no terminal pode não ser suficiente.
- [ ] Documentar instalação, atualização e retorno à versão anterior; publicar os arquivos da infraestrutura junto da release no GitHub.
- [ ] Preencher a descrição do repositório no Docker Hub com instruções e link para a release correspondente.

O serviço `panel` monta o socket Docker e diretórios da infraestrutura para administrá-los. A distribuição deve explicar esses privilégios e preservar o bind privado padrão (`127.0.0.1`); publicar a imagem não exige publicar a porta administrativa na Internet.

## Preparação e build local

Execute na raiz do projeto. A imagem desta release usa o namespace `paulo2021`, a versão `1.1.0` e a plataforma `linux/amd64`.

```bash
node scripts/sync-brand.mjs
npm ci --prefix docker/panel --ignore-scripts
COMPOSE_FILE=compose.yaml COMPOSE_ENV_FILES=.env.example PANEL_PASSWORD=Test-only-password-123456 PANEL_VAULT_KEY=Test-only-key npm test --prefix docker/panel

docker build --platform linux/amd64 -t paulo2021/jubart:1.1.0 ./docker/panel
```

O contexto é **`./docker/panel`**, não a raiz da infraestrutura. O Dockerfile usa argumentos padrão fixados para as imagens-base. Se o Compose local usar outros valores de `NODE_VERSION`/`DOCKER_CLI_IMAGE`, confira quais devem compor a release.

Faça a validação da imagem em uma instalação de teste antes de avançar. Use credenciais e dados de teste, não a produção. Verifique login, arquivos estáticos/logo, saúde do painel, documentação/skill e as operações Docker autorizadas.

## Autenticar e publicar

Estas etapas enviam a imagem ao Docker Hub; não fazem deploy na VPS.

```bash
docker login -u paulo2021
```

Informe o token quando a senha for solicitada. Não passe o token como argumento de linha de comando nem o cole em arquivos versionados.

```bash
docker push paulo2021/jubart:1.1.0
```

Opcionalmente, após validar a release, publique também `latest`:

```bash
docker tag paulo2021/jubart:1.1.0 paulo2021/jubart:latest
docker push paulo2021/jubart:latest
```

Para instalações reproduzíveis, prefira uma versão explícita e registre o digest retornado pela publicação. `latest` pode mudar.

## Consumir a imagem publicada

Após preparar a configuração Compose de distribuição e os arquivos da instalação:

```bash
docker pull paulo2021/jubart:1.1.0
```

O serviço `panel` deverá referenciar:

```yaml
services:
  panel:
    image: paulo2021/jubart:1.1.0
```

Esse trecho é **apenas a referência da imagem**, não um Compose completo. O modelo [distribution/compose.production.yaml](distribution/compose.production.yaml) preserva as opções do serviço original e remove `build` com `!reset null`. Requer Docker Compose com suporte a `!reset`.

Depois de a imagem estar publicada, em uma instalação preparada:

1. Copie `distribution/compose.production.yaml` para `compose.production.yaml` na raiz da instalação.
2. Acrescente `:compose.production.yaml` ao valor atual de `COMPOSE_FILE` no `.env`, preservando os arquivos existentes e deixando o de produção por último. Isso mantém o uso da imagem também nas operações iniciadas pelo painel.
3. Valide e atualize somente o painel:

```bash
docker compose --profile '*' config --quiet
docker compose pull panel
docker compose up -d --no-deps panel
```

O modelo fica em `distribution/` para não alterar a instalação de desenvolvimento automaticamente. `JUBART_IMAGE` permite escolher outra tag/digest no `.env`; o padrão desta release é `paulo2021/jubart:1.1.0`. Para retornar a uma versão anterior, selecione uma tag/digest previamente validado e repita a atualização do painel, preservando o workspace e os volumes. Não execute um `docker run` genérico esperando que toda a infraestrutura seja instalada automaticamente.

Para atualizar uma instalação preparada dessa forma, revise a release, faça backup das configurações e atualize somente o painel pelo procedimento documentado. Não use `docker compose down`, não remova volumes e não recrie todos os serviços para trocar apenas a imagem do painel.

## Evoluções opcionais

- Automatizar testes, build e push por tags de release no GitHub Actions.
- Construir e testar imagens multiarch com Docker Buildx.
- Gerar SBOM, proveniência e assinatura das imagens.
- Publicar descrição do Docker Hub e release do GitHub de forma coordenada.

Essas automações ainda devem ser implementadas e validadas; este guia não as instala.

## Referências

- [Publicar uma imagem no Docker Hub](https://docs.docker.com/learn/content/share-your-image-on-docker-hub/)
- [Tokens de acesso do Docker](https://docs.docker.com/security/access-tokens/personal-access-tokens/)
- [Autenticação com docker login](https://docs.docker.com/reference/cli/docker/login/)
