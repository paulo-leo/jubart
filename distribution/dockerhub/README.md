![Logo do Jubart](https://raw.githubusercontent.com/paulo-leo/jubart/main/distribution/dockerhub/logo.png)

# Jubart

**Seus ambientes, em um só lugar.**

Painel de infraestrutura para administrar aplicações web, containers, domínios, bancos de dados, filas e backups. Interface em português e CLI interativa para acompanhar a instalação pelo terminal.

[Código-fonte](https://github.com/paulo-leo/jubart) · [Documentação completa](https://github.com/paulo-leo/jubart/blob/main/README.md) · [Versão 1.4.0](https://github.com/paulo-leo/jubart/tree/v1.4.0) · [Suporte e problemas](https://github.com/paulo-leo/jubart/issues)

## Instalação e administração com IA

O Jubart oferece uma **skill pública para assistentes de IA** verificarem a imagem oficial no Docker Hub e conduzirem uma instalação, atualização ou diagnóstico pelo terminal do host autorizado.

- [Abrir a skill Jubart Deploy](https://github.com/paulo-leo/jubart/blob/main/.github/skills/jubart-deploy/SKILL.md)
- [Ler as instruções diretamente em Markdown](https://raw.githubusercontent.com/paulo-leo/jubart/main/.github/skills/jubart-deploy/SKILL.md)

A skill orienta o assistente a consultar versões e digests reais, verificar os requisitos da máquina, baixar a imagem, preparar o Compose e conferir o painel. Nas atualizações, preserva configurações, credenciais e volumes existentes. Baixar a imagem pública não exige o token do publicador.

Você pode enviar este pedido ao seu assistente:

```text
Leia e use a skill:
https://raw.githubusercontent.com/paulo-leo/jubart/main/.github/skills/jubart-deploy/SKILL.md

Verifique a versão estável disponível do Jubart no Docker Hub e no GitHub.
Quero instalar usando a imagem publicada nesta máquina. Identifique os
requisitos e o diretório de destino antes de executar, preserve qualquer
instalação existente e mantenha o acesso administrativo por túnel SSH.
Ao finalizar, informe a versão, o digest, o estado e como acessar o painel.
```

O assistente precisa de ferramentas de execução local ou SSH autorizado para realizar a instalação. A skill é um guia; abrir esta página não executa comandos nem concede acesso à máquina. Em agentes com suporte a skills, importe a pasta `jubart-deploy` do repositório conforme as instruções do seu editor.

**Depois da instalação**, a [integração MCP do Jubart](https://github.com/paulo-leo/jubart/blob/main/docs/MCP.md) permite monitorar toda a instalação e operar containers, aplicações, WebSockets, filas/jobs, backups e conexões de banco conforme as ações concedidas. A [skill Jubart MCP](https://github.com/paulo-leo/jubart/blob/main/.github/skills/jubart-mcp/SKILL.md) orienta essas operações. Configure a chave no armazenamento de segredos do cliente; não é necessário enviá-la na conversa. O Bash no host é opcional, exige a permissão `terminal.host` e o agente local e executa com os privilégios do usuário que iniciou o agente.

## Novidades da versão 1.4.0

- **SQL somente leitura pelo MCP:** listar as conexões salvas no painel, validar e executar SELECT, SHOW, DESCRIBE e EXPLAIN de SELECT, com resultados em tabela e transações READ ONLY. Alterações são bloqueadas, mesmo com uma conta de banco gravável.
- **PHP, Composer e imagens pelo MCP:** consultar versões encontradas, extensões carregadas, configurações CLI permitidas e imagens reais com IDs e digests.
- **Notificações HTTP:** cadastrar destinos GET/POST, cabeçalhos e parâmetros para incidentes e mudanças de estado dos serviços; consultar entregas e gerenciar destinos também pelo MCP.
- **Bash dos apps pelo MCP:** sessões persistentes nos containers com permissão própria, acompanhamento de saída e encerramento explícito.
- **Atualização oficial no painel:** consultar versões do GitHub e imagens do Docker Hub, revisar alterações e atualizar somente o painel e as fontes permitidas, preservando aplicações, bancos, volumes e configurações locais.
- **Serviços e backups:** descoberta de permissões e atalhos MCP para iniciar containers, consultar agendas, configurar destinos/retenção e executar cópias imediatas sem confundir essas operações.

Continuam disponíveis a leitura de toda a infraestrutura, proxies, bancos e usuários, o histórico de incidentes e SSE, a gestão de aplicações pela CLI e as [Skills de integração](https://github.com/paulo-leo/jubart/blob/main/docs/MCP.md).

As chaves existentes mantêm suas permissões. Novas ações precisam ser concedidas explicitamente. Atualizar a imagem não configura nem executa backups automaticamente.

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
| CLI e instalador | Comando shell global no host; Python, Node.js, Compose e Buildx executados em `paulo2021/jubart:cli-1.4.0` |
| Projetos, credenciais, configurações e dados | Diretórios e volumes persistentes da sua instalação |

Não é necessário instalar Node.js, npm, PHP ou os bancos diretamente no host. As dependências das suas aplicações são preparadas conforme cada projeto.

## Requisitos

- **Linux x86_64/amd64**, com acesso ao daemon Docker pelo usuário da instalação.
- **Docker Engine** com cliente Docker e daemon local por socket Unix.
- Git para obter o código, shell POSIX e utilitários usuais (`stat`, `readlink`, `mktemp`, `mkfifo`, `id`, `ln`). Bash para abrir a pasta do projeto no host.
- A CLI usa Python, Node.js, Compose, Buildx, certificados e dados de fuso **dentro da imagem**, sem exigir esses runtimes no host. A primeira execução baixa a imagem da CLI; para um build local a partir do código, tenha também `tar` e um builder Docker disponível.
- Espaço em disco e memória compatíveis com as aplicações e serviços que você habilitar.

A plataforma publicada e validada é **linux/amd64**. ARM64 e execução no Windows/WSL ainda não foram validadas.

## Instalar usando a imagem publicada

O comando `docker pull` baixa o painel pronto. A instalação completa também precisa dos arquivos Compose e do workspace do GitHub. **Um `docker run` isolado não prepara a infraestrutura.**

### 1. Preparar o host e baixar os arquivos

Para instalar Docker Engine, siga o [guia oficial da sua distribuição](https://docs.docker.com/engine/install/). Para os utilitários do host no Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates git
sudo update-ca-certificates
```

Com os requisitos instalados, baixe os arquivos da versão:

```bash
git clone --branch v1.4.0 --depth 1 https://github.com/paulo-leo/jubart.git
cd jubart
```

### 2. Preparar a instalação

Execute como dono da pasta, com Docker acessível pelo seu usuário:

```bash
./install.sh --no-start
cp distribution/compose.production.yaml compose.production.yaml
```

O assistente solicita as credenciais do painel, diretório dos projetos, modo de acesso e demais configurações iniciais. A opção `--no-start` prepara a instalação sem construir/iniciar o painel. A preparação usa a imagem da CLI, que funciona mesmo com o painel parado. O instalador pode pedir `sudo` para criar o atalho global `jubart`.

### 3. Selecionar a imagem pronta

Abra o `.env` criado e acrescente **`:compose.production.yaml` ao final do valor atual de `COMPOSE_FILE`**, preservando todos os arquivos existentes. Por exemplo:

```dotenv
COMPOSE_FILE=compose.yaml:config/automation.compose.json:config/apps.compose.yaml:config/proxy-network.compose.yaml:compose.production.yaml
```

O override seleciona `paulo2021/jubart:1.4.0` e desativa o build local do painel. A variável opcional `JUBART_IMAGE` permite escolher outra versão ou digest.

### 4. Baixar e iniciar somente o painel

```bash
jubart compose --profile '*' config --quiet
jubart compose pull panel
jubart compose up -d --no-deps panel
jubart panel
```

Consulte a saída de `jubart panel` para o endereço e as instruções de túnel SSH. Com a configuração local padrão, abra **http://127.0.0.1:9090** na máquina da instalação. Para uma VPS, utilize o túnel SSH indicado. Entre com as credenciais que você definiu no assistente.

Os demais serviços podem ser configurados e iniciados conforme a necessidade da instalação. O Compose baixa suas imagens ou executa os builds correspondentes.

## Baixar apenas a imagem

```bash
docker pull paulo2021/jubart:1.4.0
```

Esse comando não inicia containers, não instala a CLI no host e não baixa automaticamente todos os bancos e runtimes da infraestrutura.

A imagem da CLI é selecionada pelo arquivo `config/cli-image` do checkout. A variável de ambiente `JUBART_CLI_IMAGE` permite selecionar um runtime compatível para testes ou recuperação; ela é independente de `JUBART_IMAGE`, que seleciona o painel.

## Atualizar uma instalação existente

Revise a documentação da versão e faça backup da configuração e dos dados. Atualize os arquivos do workspace para a versão correspondente. Em uma instalação já preparada com o override de produção, ajuste `JUBART_IMAGE` no `.env` para a tag/digest desejado e execute:

```bash
jubart compose --profile '*' config --quiet
jubart compose pull panel
jubart compose up -d --no-deps panel
```

Preserve o workspace e os volumes persistentes. Para voltar a uma versão anterior, selecione uma tag/digest previamente validado e repita a atualização.

## Tags e publicação

| Tag | Plataforma | Uso |
| --- | --- | --- |
| `1.4.0` | `linux/amd64` | Painel da versão 1.4.0 |
| `cli-1.4.0` | `linux/amd64` | Runtime independente da CLI e do instalador |
| `1.2.0` | `linux/amd64` | Painel anterior com runtime independente da CLI |
| `cli-1.2.0` | `linux/amd64` | Runtime da versão anterior |
| `1.1.0` | `linux/amd64` | Painel anterior; instalador dessa versão utiliza Python no host |

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
