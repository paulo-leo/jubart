# Publicação do Jubart no Docker Hub

Guia para publicação futura. **Nenhuma imagem foi publicada por esta preparação.** Os comandos abaixo devem ser executados somente quando a publicação for desejada.

## O que será publicado

A imagem contém o painel Jubart: servidor Node.js, frontend React compilado e Docker CLI/Compose usados na administração. O Dockerfile está em `docker/panel/Dockerfile` e já compila o frontend durante o build.

A imagem não substitui a instalação completa da infraestrutura. Traefik, PHP/FrankenPHP, bancos, filas e outros serviços continuam em containers separados. O usuário ainda precisa dos arquivos Compose, configurações, documentação e diretórios da infraestrutura. A documentação e a skill MCP são consultadas no workspace montado; devem acompanhar a versão instalada.

O `.env`, as chaves, os certificados, os dados das aplicações, os backups e os volumes persistentes devem permanecer fora da imagem.

## Pendências antes da primeira publicação

- [ ] Definir a conta/organização e criar o repositório `jubart` no Docker Hub; escolher visibilidade pública ou privada.
- [ ] Criar um token de acesso com permissão de escrita. Guardá-lo no gerenciador de credenciais ou nos secrets do CI, nunca no Git ou no Dockerfile.
- [ ] Revisar a licença do projeto e as licenças de componentes redistribuídos; incluir os avisos necessários. Consultar `THIRD_PARTY_NOTICES.md`.
- [ ] Revisar o contexto de `COPY . .` antes de construir a release. O `docker/panel/.dockerignore` já exclui `.env` e variantes, estado local, backups, chaves privadas e caches; nomes não previstos também precisam ser conferidos.
- [ ] Conferir versão em `docker/panel/package.json` e definir a tag da release. Não sobrescrever tags de versões já publicadas.
- [ ] Sincronizar a identidade visual com `node scripts/sync-brand.mjs` antes do build.
- [ ] Executar os testes, construir a imagem e testar uma instalação isolada usando **a imagem final**. Um build do frontend não substitui esse teste.
- [ ] Verificar a imagem final quanto a segredos, arquivos desnecessários e vulnerabilidades; revisar imagens-base fixadas por digest.
- [ ] Definir plataformas suportadas. O primeiro comando de build abaixo produz somente a plataforma do builder. Não anunciar ARM64 sem validar também suas imagens-base e dependências.
- [ ] Preparar uma configuração Compose de distribuição que use `image: SEU_USUARIO/jubart:VERSAO` no serviço `panel`, em lugar do build local, preservando ambiente, volumes, redes, healthcheck e portas.
- [ ] Validar essa configuração também com operações iniciadas pelo painel: elas invocam Docker Compose e precisam continuar usando o mesmo projeto, arquivos e imagem. Um override manual usado só no terminal pode não ser suficiente.
- [ ] Documentar instalação, atualização e retorno à versão anterior; publicar os arquivos da infraestrutura junto da release no GitHub.
- [ ] Preencher a descrição do repositório no Docker Hub com instruções e link para a release correspondente.

O serviço `panel` monta o socket Docker e diretórios da infraestrutura para administrá-los. A distribuição deve explicar esses privilégios e preservar o bind privado padrão (`127.0.0.1`); publicar a imagem não exige publicar a porta administrativa na Internet.

## Preparação e build local

Execute na raiz do projeto. Substitua `SEU_USUARIO` pelo namespace real e ajuste `1.0.0` para a versão escolhida.

```bash
node scripts/sync-brand.mjs
npm ci --prefix docker/panel --ignore-scripts
npm test --prefix docker/panel

docker build -t SEU_USUARIO/jubart:1.0.0 ./docker/panel
```

O contexto é **`./docker/panel`**, não a raiz da infraestrutura. O Dockerfile usa argumentos padrão fixados para as imagens-base. Se o Compose local usar outros valores de `NODE_VERSION`/`DOCKER_CLI_IMAGE`, confira quais devem compor a release.

Faça a validação da imagem em uma instalação de teste antes de avançar. Use credenciais e dados de teste, não a produção. Verifique login, arquivos estáticos/logo, saúde do painel, documentação/skill e as operações Docker autorizadas.

## Autenticar e publicar

Estas etapas enviam a imagem ao Docker Hub; não fazem deploy na VPS.

```bash
docker login -u SEU_USUARIO
```

Informe o token quando a senha for solicitada. Não passe o token como argumento de linha de comando nem o cole em arquivos versionados.

```bash
docker push SEU_USUARIO/jubart:1.0.0
```

Opcionalmente, após validar a release, publique também `latest`:

```bash
docker tag SEU_USUARIO/jubart:1.0.0 SEU_USUARIO/jubart:latest
docker push SEU_USUARIO/jubart:latest
```

Para instalações reproduzíveis, prefira uma versão explícita e registre o digest retornado pela publicação. `latest` pode mudar.

## Consumir a imagem publicada

Após preparar a configuração Compose de distribuição e os arquivos da instalação:

```bash
docker pull SEU_USUARIO/jubart:1.0.0
```

O serviço `panel` deverá referenciar:

```yaml
services:
  panel:
    image: SEU_USUARIO/jubart:1.0.0
```

Esse trecho é **apenas a referência da imagem**, não um Compose completo. Preserve as demais opções do serviço existente e retire o `build` na configuração destinada a consumir a release. Não execute um `docker run` genérico esperando que toda a infraestrutura seja instalada automaticamente.

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
