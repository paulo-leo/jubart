![Logo do Jubart](https://raw.githubusercontent.com/paulo-leo/jubart/main/distribution/dockerhub/logo.png)

# Jubart

**Seus ambientes, em um só lugar.**

Painel de infraestrutura para administrar aplicações web, containers, domínios, bancos de dados, filas e backups. Interface em português e CLI interativa para acompanhar a instalação pelo terminal.

[Código-fonte](https://github.com/paulo-leo/jubart) · [Documentação completa](https://github.com/paulo-leo/jubart/blob/main/README.md) · [Versão 1.1.0](https://github.com/paulo-leo/jubart/tree/v1.1.0) · [Suporte e problemas](https://github.com/paulo-leo/jubart/issues)

## O que você pode administrar

- **Aplicações:** PHP/FrankenPHP, Node.js e sites estáticos; cadastro, domínio, pasta do projeto e acesso ao terminal.
- **Proxy Traefik:** apontamentos por domínio, destinos por IP/porta, filtros de métodos HTTP e configuração de HTTPS.
- **Bancos de dados:** MariaDB e PostgreSQL, conexões, console SQL, usuários, permissões e redefinição de senhas.
- **Operação:** serviços, logs, recursos do host e dos containers, tráfego, filas/jobs, agendamentos e backups.
- **CLI Jubart:** console interativo, tabelas de serviços/aplicações e atalhos para o shell do container ou da pasta no host.

## O que esta imagem inclui

| Componente | Distribuição |
| --- | --- |
| Painel Jubart | Servidor Node.js, dependências de produção e interface React compilada incluídos na imagem |
| Ferramentas do painel | Docker CLI, Compose e Buildx incluídos na imagem |
| Traefik, bancos, PHP, cache e outros serviços | Containers separados, definidos pelos arquivos Compose da instalação |
| CLI e instalador | Arquivos do repositório GitHub, executados no host |
| Projetos, credenciais, configurações e dados | Diretórios e volumes persistentes da sua instalação |

Não é necessário instalar Node.js, npm, PHP ou os bancos diretamente no host. As dependências das suas aplicações são preparadas conforme cada projeto.

## Requisitos

- **Linux x86_64/amd64**, com acesso ao daemon Docker pelo usuário da instalação.
- **Docker Engine**, plugin **Docker Compose v2 com suporte a `!reset`** e plugin **Buildx**.
- **Python 3.9+ com SSL**, `ca-certificates`, `tzdata`, Git, shell POSIX e utilitários usuais do Linux (`ip`, `stat`, `readlink`, `sed`, `id`, `ln`).
- Espaço em disco e memória compatíveis com as aplicações e serviços que você habilitar.

A plataforma publicada e validada é **linux/amd64**. ARM64 e execução no Windows/WSL ainda não foram validadas.

## Instalar usando a imagem publicada

O comando `docker pull` baixa o painel pronto. A instalação completa também precisa dos arquivos Compose e do workspace do GitHub. **Um `docker run` isolado não prepara a infraestrutura.**

### 1. Preparar o host e baixar os arquivos

Para instalar Docker Engine e os plugins, siga o [guia oficial da sua distribuição](https://docs.docker.com/engine/install/). Para os utilitários do host no Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y python3 ca-certificates tzdata git iproute2
sudo update-ca-certificates
```

Com os requisitos instalados, baixe os arquivos da versão:

```bash
git clone --branch v1.1.0 --depth 1 https://github.com/paulo-leo/jubart.git
cd jubart
```

### 2. Preparar a instalação

Execute como dono da pasta, com Docker acessível pelo seu usuário:

```bash
./install.sh --no-start
cp distribution/compose.production.yaml compose.production.yaml
```

O assistente solicita as credenciais do painel, diretório dos projetos, modo de acesso e demais configurações iniciais. A opção `--no-start` prepara a instalação sem construir/iniciar o painel. O instalador pode pedir `sudo` para criar o atalho global `jubart`.

### 3. Selecionar a imagem pronta

Abra o `.env` criado e acrescente **`:compose.production.yaml` ao final do valor atual de `COMPOSE_FILE`**, preservando todos os arquivos existentes. Por exemplo:

```dotenv
COMPOSE_FILE=compose.yaml:config/automation.compose.json:config/apps.compose.yaml:config/proxy-network.compose.yaml:compose.production.yaml
```

O override seleciona `paulo2021/jubart:1.1.0` e desativa o build local do painel. A variável opcional `JUBART_IMAGE` permite escolher outra versão ou digest.

### 4. Baixar e iniciar somente o painel

```bash
docker compose --profile '*' config --quiet
docker compose pull panel
docker compose up -d --no-deps panel
jubart panel
```

Consulte a saída de `jubart panel` para o endereço e as instruções de túnel SSH. Com a configuração local padrão, abra **http://127.0.0.1:9090** na máquina da instalação. Para uma VPS, utilize o túnel SSH indicado. Entre com as credenciais que você definiu no assistente.

Os demais serviços podem ser configurados e iniciados conforme a necessidade da instalação. O Compose baixa suas imagens ou executa os builds correspondentes.

## Baixar apenas a imagem

```bash
docker pull paulo2021/jubart:1.1.0
```

Esse comando não inicia containers, não instala a CLI no host e não baixa automaticamente todos os bancos e runtimes da infraestrutura.

## Atualizar uma instalação existente

Revise a documentação da versão e faça backup da configuração e dos dados. Atualize os arquivos do workspace para a versão correspondente. Em uma instalação já preparada com o override de produção, ajuste `JUBART_IMAGE` no `.env` para a tag/digest desejado e execute:

```bash
docker compose --profile '*' config --quiet
docker compose pull panel
docker compose up -d --no-deps panel
```

Preserve o workspace e os volumes persistentes. Para voltar a uma versão anterior, selecione uma tag/digest previamente validado e repita a atualização.

## Tags e publicação

| Tag | Plataforma | Uso |
| --- | --- | --- |
| `1.1.0` | `linux/amd64` | Versão publicada e validada |

Prefira tags explícitas ou digests. A tag `latest` não é publicada automaticamente. As versões passam por testes da CLI e do painel, build e teste do container final no [GitHub Actions](https://github.com/paulo-leo/jubart/actions/workflows/docker-publish.yml).

## Acesso e persistência

O painel administra o Docker por meio do socket do host e acessa os diretórios montados da instalação. Esse acesso concede controle administrativo sobre os containers e recursos do host. Utilize o Compose documentado e mantenha o acesso administrativo por túnel SSH, bind local ou proxy HTTPS configurado.

Credenciais, chaves, certificados, backups e dados das aplicações ficam fora da imagem. Não remova volumes ao atualizar o painel.

## Projeto e documentação

Desenvolvido por **Paulo Leonardo da S. Cassimiro**.

- [Instalação e configuração completa](https://github.com/paulo-leo/jubart/blob/main/README.md#inicio-rapido)
- [Distribuição pelo Docker Hub](https://github.com/paulo-leo/jubart/blob/main/DOCKER_HUB.md)
- [Avisos e licenças de componentes de terceiros](https://github.com/paulo-leo/jubart/blob/main/THIRD_PARTY_NOTICES.md)
- [Relatar um problema](https://github.com/paulo-leo/jubart/issues)
