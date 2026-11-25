<a id="inicio"></a>

<p align="center">
  <img src="icon.svg" alt="Logo do Jubart" width="112" height="112">
</p>

> **Primeira instalação na VPS?** Veja [como entrar no painel por túnel SSH, HTTP ou HTTPS](#primeiro-acesso-vps).

> **Política de dependências:** utilizar componentes de infraestrutura open source e imagens externas fixadas por tag + digest SHA-256. Consulte [Imagens fixadas](#imagens-fixadas-e-licencas) e [licenças de terceiros](THIRD_PARTY_NOTICES.md).

# Jubart — painel de infraestrutura para aplicações web

O GitHub Actions testa e constrói a imagem do painel para publicação em `paulo2021/jubart` por tags de versão. Veja como configurar o token, publicar e instalar no [guia do Docker Hub](DOCKER_HUB.md).

![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![PHP](https://img.shields.io/badge/Runtime-PHP-777BB4?logo=php&logoColor=white)
![Node.js](https://img.shields.io/badge/Runtime-Node.js-339933?logo=node.js&logoColor=white)
![Estáticas](https://img.shields.io/badge/Builds-React%20%2F%20Vite-646CFF?logo=vite&logoColor=white)
![Traefik](https://img.shields.io/badge/Proxy-Traefik-24A1C1)
![MariaDB](https://img.shields.io/badge/Banco-MariaDB-003545?logo=mariadb&logoColor=white)
![Valkey 8](https://img.shields.io/badge/Cache-Valkey_8-FF6B35)

**Uma infraestrutura compartilhada para publicar e administrar aplicações PHP, Node.js e estáticas, do ambiente local à VPS.**

O **Jubart** reúne Docker Compose, proxy por domínio/subdomínio, bancos, cache, backups e um painel administrativo em React. Cada aplicação escolhe seu runtime: PHP com FrankenPHP, um processo Node.js ou arquivos estáticos servidos pelo Caddy. Laravel, WordPress e builds React/Vite são exemplos de projetos atendidos.

O painel permite cadastrar aplicações, configurar acessos, gerenciar bancos e usuários, agendar backups, importar/exportar SQL e acompanhar o host e os containers. A **Conexão MCP** disponibiliza diagnóstico e operações autorizadas de aplicações, WebSockets e filas/jobs para ferramentas de IA. Diretórios, versões e credenciais ficam no `.env` da infraestrutura; os cadastros e apontamentos do painel ficam em arquivos JSON. As particularidades de cada aplicação continuam no próprio projeto.

**Autor:** Paulo Leonardo da S. Cassimiro · Engenheiro de Software e Analista de Sistemas, com atuação em desenvolvimento.

> [!TIP]
> 🚀 **Primeiro uso:** siga o [início rápido](#inicio-rapido), abra o painel e escolha o tipo da aplicação: **PHP, Node.js ou Estática**. Octane é opcional e exclusivo de projetos Laravel preparados para ele.

> [!WARNING]
> 🛑 **Proteja seus dados:** `docker compose down -v` apaga os volumes nomeados. Para manutenção, use os comandos de [recriação sem apagar volumes](#manutencao). Não versione senhas nem backups.

[🚀 Instalação e configuração rápida](#instalacao-rapida) · [🧭 .env local/VPS e HTTPS](#guia-env) · [📦 Tipos de aplicação](#tipos-aplicacao) · [➕ Cadastrar aplicações](#cadastrar-aplicacoes) · [🖥️ Painel](#painel-administrativo) · [🧮 Console SQL](#console-sql) · [🤖 Integração MCP](docs/MCP.md) · [👨‍💻 Visão de arquitetura](#visao-arquitetura)

<details>
<summary><strong>Índice completo por seção</strong></summary>

- [👨‍💻 Autoria e visão de arquitetura](#sec-autoria-e-visao-de-arquitetura)
- [🚀 Instalação e configuração rápida](#sec-instalacao-e-configuracao-rapida)
- [Terminal Jubart](#sec-terminal-jubart)
- [Topologia da sua instalação](#sec-topologia-da-sua-instalacao)
- [Arquitetura interativa](#sec-arquitetura-interativa)
- [🎛️ PHP: escolher o modo do servidor](#sec-php-escolher-o-modo-do-servidor)
- [🐙 Preparar aplicação e instalar Octane (somente modo octane)](#sec-preparar-aplicacao-e-instalar-octane-somente-modo-octane)
- [🌍 Configuração local e VPS](#sec-configuracao-local-e-vps)
- [⚡ Workers Octane e deploy](#sec-workers-octane-e-deploy)
- [🐘 Arquivos PHP e módulos](#sec-arquivos-php-e-modulos)
- [📦 npm](#sec-npm)
- [🚀 Comandos rápidos: subir, parar e reconstruir](#sec-comandos-rapidos-subir-parar-e-reconstruir)
- [📂 Trocar o diretório da aplicação (APP_DIRECTORY)](#sec-trocar-o-diretorio-da-aplicacao-app-directory)
- [🔧 Manutenção: aplicar configurações sem apagar volumes](#sec-manutencao-aplicar-configuracoes-sem-apagar-volumes)
- [💻 Terminal: entrar nos containers e executar comandos](#sec-terminal-entrar-nos-containers-e-executar-comandos)
- [🧭 Administração diária](#sec-administracao-diaria)
- [🔐 Certificados: validade e renovação](#sec-certificados-validade-e-renovacao)
- [🗄️ Backup do MariaDB](#sec-backup-do-mariadb)
- [🛡️ Backup dos certificados e arquivos da aplicação](#sec-backup-dos-certificados-e-arquivos-da-aplicacao)
- [🧩 Adicionar novos serviços](#sec-adicionar-novos-servicos)
- [⚡ Valkey 8](#sec-valkey-8)
- [⏱️ Filas, jobs e Laravel Scheduler](#sec-filas-jobs-e-laravel-scheduler)
- [🎨 Laravel puro, Inertia, Vite/HMR e SSR](#sec-laravel-puro-inertia-vite-hmr-e-ssr)
- [💾 Backup automático do MariaDB: configuração e operação](#sec-backup-automatico-do-mariadb-configuracao-e-operacao)
- [🎭 Páginas de erro do servidor](#sec-paginas-de-erro-do-servidor)
- [🔎 Erro 500 detalhado em desenvolvimento local](#sec-erro-500-detalhado-em-desenvolvimento-local)
- [🏘️ Várias aplicações com subdomínios](#sec-varias-aplicacoes-com-subdominios)
- [Jubart: painel administrativo](#sec-jubart-painel-administrativo)
- [⏱️ Painel: filas, jobs e Laravel Scheduler](#sec-painel-filas-jobs-e-laravel-scheduler)
- [📜 Logs, detalhes dos containers e console web](#sec-logs-detalhes-dos-containers-e-console-web)
- [📈 Métricas ao vivo: CPU, memória e requisições](#sec-metricas-ao-vivo-cpu-memoria-e-requisicoes)
- [🗄️ Bancos de dados: MariaDB e PostgreSQL compartilhados](#sec-bancos-de-dados-mariadb-e-postgresql-compartilhados)
- [🗄️ Escolher quais bancos iniciar](#sec-escolher-quais-bancos-iniciar)
- [Primeiro acesso ao painel na VPS: HTTP, HTTPS ou túnel SSH](#sec-primeiro-acesso-ao-painel-na-vps-http-https-ou-tunel-ssh)
- [WebSocket por aplicação](#sec-websocket-por-aplicacao)
- [Saúde interna para as aplicações](#sec-saude-interna-para-as-aplicacoes)
- [Segurança por aplicação](#sec-seguranca-por-aplicacao)
- [Limites de importação e exportação do phpMyAdmin](#sec-limites-de-importacao-e-exportacao-do-phpmyadmin)
- [Painéis Jubart vinculados e entrada automática](#sec-paineis-jubart-vinculados-e-entrada-automatica)
- [Data, hora e região do servidor](#sec-data-hora-e-regiao-do-servidor)
- [Publicação no GitHub e configurações locais](#sec-publicacao-no-github-e-configuracoes-locais)
- [Assistente Jubart.json para outra infraestrutura](#sec-assistente-jubart-json-para-outra-infraestrutura)
- [Plugins Docker por JSON](#sec-plugins-docker-por-json)
- [Mercure por aplicação PHP](#sec-mercure-por-aplicacao-php)
- [Recompilar o painel pela administração](#sec-recompilar-o-painel-pela-administracao)

</details>

### 🗺️ Navegação

| Começar e desenvolver | Operar e manter | Proteger e recuperar |
| --- | --- | --- |
| [📦 PHP, Node.js e Estáticas](#tipos-aplicacao) | [🚀 Comandos rápidos](#comandos-rapidos) | [🔐 Certificados HTTPS](#certificados) |
| [➕ Cadastrar aplicações](#cadastrar-aplicacoes) | [📂 Trocar pasta do projeto](#trocar-projeto) | [💾 Backup automático](#backup-automatico) |
| [🧭 .env local/VPS: passo a passo](#guia-env) | [🔧 Aplicar alterações do .env](#manutencao) | [🗄️ Backup e restauração SQL](#backup-manual) |
| [🐘 PHP e módulos](#php-modulos) | [🧭 Saúde, logs e administração](#administracao) | [🛡️ Certificados e arquivos](#backup-arquivos) |
| [📦 npm](#npm) | [⚡ Workers Octane e deploy](#octane-deploy) | [⚡ Valkey e persistência](#valkey) |
| [🎨 Inertia, Vite e SSR](#frontend) | [⏱️ Filas e Scheduler Laravel](#filas-scheduler) | [🧩 Adicionar serviços](#novos-servicos) |
| [🤖 MCP e Skill para IA](docs/MCP.md) | [📤 Importar / exportar SQL](#transferencias-sql) | [🖥️ Host e containers](#informacoes-host) |

### 🧱 Visão da infraestrutura

```text
Navegador / cliente HTTP
          │
          ▼
       Traefik ── domínio/subdomínio ──┬── PHP: FrankenPHP
                                     ├── Node.js: processo da aplicação
                                     ├── Estática: Caddy → dist/build
                                     └── Painel: React + servidor Node.js

Serviços internos compartilhados: MariaDB · PostgreSQL · Valkey
Proteção dos dados: backups separados por SGBD → disco / S3 opcional
Administração: painel · documentação · métricas do host/containers
Integração de IA: MCP/API → leitura e ações de automação autorizadas
Ferramentas de desenvolvimento: npm · Composer · Vite/HMR · SSR opcionais
```

| Camada | Recursos e responsabilidades |
| --- | --- |
| **Aplicações** | PHP (Laravel, WordPress e outros), Node.js e builds estáticos HTML/CSS/JavaScript |
| **Entrada HTTP/HTTPS** | Traefik, domínios/subdomínios e certificados na VPS |
| **Dados e cache** | MariaDB, PostgreSQL e Valkey compartilhados pela rede interna, com persistência própria |
| **Administração** | Painel React, configurações de proxy/PHP, contas de banco, backups e transferências SQL |
| **Observabilidade** | Serviços, logs, filas/jobs Laravel, métricas de containers e informações reais do host Linux |
| **Integração de IA** | MCP e API com chaves, escopos de leitura/execução, ações limitadas e auditoria |

> [!NOTE]
> O tipo da aplicação define seu runtime. Node.js não depende de FrankenPHP; um build estático não mantém um servidor Node.js ativo. Octane, Artisan, filas e Scheduler desta infraestrutura são recursos específicos de aplicações Laravel. Vite/HMR e SSR dependem da preparação do projeto. Os exemplos não significam que todos esses recursos já estejam ativos no seu ambiente.

Os nomes históricos de alguns serviços (`php`, `php-app2` etc.) foram mantidos por compatibilidade, mesmo quando o cadastro usa Node.js ou Estática. O nome identifica o serviço Compose; o tipo configurado determina como ele executa o projeto.

---

<a id="visao-arquitetura"></a>

<a id="sec-autoria-e-visao-de-arquitetura"></a>

## 👨‍💻 Autoria e visão de arquitetura

**Paulo Leonardo da S. Cassimiro**  
*Engenheiro de Software e Analista de Sistemas, com atuação em desenvolvimento.*

### 🎯 O que esta arquitetura busca resolver

A proposta desta infraestrutura é oferecer uma base reutilizável para hospedar e administrar múltiplas aplicações web, do desenvolvimento local à implantação em uma VPS. O objetivo é reduzir configurações manuais no servidor, concentrar as opções operacionais no `.env` e tornar tarefas como trocar o projeto, atualizar serviços e preservar dados mais claras e repetíveis.

A estrutura permite combinar aplicações PHP, processos Node.js e sites estáticos no mesmo ambiente, com domínios e diretórios próprios. Os serviços de dados e proxy são compartilhados, enquanto cada aplicação mantém seu runtime. Recursos específicos, como Octane, Inertia, Vite/HMR e SSR, são habilitados somente quando o projeto precisa deles. O painel e a integração MCP concentram a operação, com permissões e auditoria para as ações de IA.

### 🧩 Por que essas escolhas

| Escolha | Intenção na arquitetura |
| --- | --- |
| **Docker Compose** | Declarar os serviços, redes e volumes em um lugar e reproduzir a estrutura em ambientes diferentes. |
| **Configurações no `.env`** | Ajustar diretórios, acessos, versões e rotinas operacionais sem editar continuamente a definição dos serviços. |
| **Traefik Proxy open source** | Centralizar a entrada HTTP/HTTPS, o encaminhamento interno e o gerenciamento de certificados. |
| **Runtimes por tipo** | Usar FrankenPHP para PHP, Node.js para processos JavaScript e Caddy para builds estáticos. |
| **MariaDB e PostgreSQL com volumes persistentes** | Separar os dados do ciclo de vida dos containers e fornecer bancos/usuários próprios para cada projeto. |
| **Valkey 8** | Disponibilizar uma base para cache, sessões e filas, quando esses recursos forem configurados na aplicação. |
| **Node.js e npm** | Executar backends Node.js e preparar builds de frontend; Vite/HMR e SSR são recursos opcionais. |
| **Painel React e MCP** | Administrar serviços pela interface e permitir diagnóstico/automação por IA com acesso limitado. |
| **Imagens fixadas por digest** | Controlar as versões adotadas e tornar atualizações de imagens decisões explícitas. |
| **Backup local e envio S3 opcional** | Criar uma rotina de recuperação com agenda, retenção e possibilidade de cópia fora da VPS. |
| **Documentação operacional** | Registrar comandos de manutenção e explicitar quais mudanças exigem recriação, rebuild ou alteração dentro do banco. |

### 🛠️ Princípios que orientam a configuração

- **Separação de responsabilidades:** proxy, aplicação, banco, cache e backup têm funções próprias.
- **Persistência explícita:** código no diretório indicado e dados em volumes/pastas definidos; substituir um container não deve significar perder dados persistentes.
- **Exposição controlada:** publicar os acessos necessários, mantendo banco e Valkey na rede interna e phpMyAdmin local por padrão.
- **Evolução gradual:** preservar aplicações existentes e escolher runtimes e recursos conforme cada projeto e a capacidade da VPS.
- **Operação documentada:** explicar não apenas como subir os serviços, mas como aplicar alterações, investigar falhas e recuperar informações.

> [!NOTE]
> 📐 Esta visão descreve a proposta técnica construída neste repositório. A configuração é uma base para uma VPS, sem promessa de alta disponibilidade ou ganhos de desempenho não medidos. Monitoramento com alertas, testes reais de restauração e dimensionamento continuam fazendo parte da preparação de cada implantação.

---

<a id="inicio-rapido"></a>

<a id="instalacao-rapida"></a>

<a id="sec-instalacao-e-configuracao-rapida"></a>

## 🚀 Instalação e configuração rápida

### Dependências do host

Use Linux com Docker Engine, plugin Docker Compose v2 ou superior, plugin Buildx e acesso ao daemon pelo usuário que instala. São necessários **Python 3.9+ com SSL**, `ca-certificates`, `tzdata`, shell POSIX e ferramentas usuais (`readlink`, `sed`, `id`, `ln`). Python costuma vir no Ubuntu, mas não é garantido em toda VPS. Git é necessário para clonar/atualizar; Node.js/npm e PHP não precisam estar instalados no host.

Em Ubuntu/Debian, para os utilitários do host:

```bash
sudo apt-get update
sudo apt-get install -y python3 ca-certificates tzdata git
sudo update-ca-certificates
```

Instale o Docker Engine e os plugins seguindo o [guia oficial para Ubuntu](https://docs.docker.com/engine/install/ubuntu/) ou a documentação da sua distribuição. Não misture pacotes de origens diferentes. Verifique antes de instalar o Jubart:

```bash
python3 --version
docker version
docker compose version
docker buildx version
docker info
```

O instalador verifica as dependências e os certificados de confiança do host; não instala pacotes do sistema nem altera as permissões do socket Docker automaticamente. O acesso ao Docker concede controle administrativo sobre o host.

### Instalação automática recomendada

Clone ou baixe este repositório e abra um terminal na pasta que contém `compose.yaml` e `install.sh`. No Linux, com **Docker Engine/Compose v2 e Python 3** disponíveis e Docker acessível pelo seu usuário, execute na raiz do projeto:

```bash
./install.sh
```

Na primeira instalação, o assistente pergunta **usuário e senha do painel**, **pasta dos projetos**, **porta HTTP**, **acesso local/túnel ou HTTP público**, **fuso horário** e se deseja **MariaDB e PostgreSQL**. A senha é digitada sem eco, confirmada e salva no `.env` com permissão `600`, sem aparecer na saída. Use 16 a 128 caracteres e pelo menos três grupos entre maiúsculas, minúsculas, números e símbolos; nesta versão, não use aspas simples. Você revisa os dados antes de salvar.

A pasta dos projetos pode ficar fora do Jubart: para `/var/www/sspa-server`, informe `/var/www` como pasta dos projetos. O painel compartilhará essa pasta para acessar as aplicações; não é preciso mover o código para o repositório.

O instalador prepara `.env`, caminhos e credenciais iniciais, constrói/inicia **somente o painel** e instala automaticamente o comando `jubart` em `/usr/local/bin`. Não exige Node.js no host: a preparação usa a imagem Node fixada no exemplo. Pode solicitar `sudo` apenas para instalar o atalho global. Execute como dono do repositório; não é necessário rodar todo o instalador com `sudo`.

Credenciais personalizadas e configurações existentes são preservadas; ao detectar uma instalação já configurada, o assistente não sobrescreve esses dados. Para automações sem perguntas, use `./install.sh --non-interactive`: valores personalizados são mantidos e senhas de exemplo são substituídas por valores aleatórios. `--no-start` prepara a configuração e o comando sem iniciar o painel; combine com `--non-interactive` quando necessário. O instalador não abre firewall, instala Docker/Python, transfere código nem inicia todas as aplicações/bancos. Conclua esses apontamentos pelo assistente. Na primeira entrada, consulte `PANEL_USERNAME` e `PANEL_PASSWORD` no `.env`; o instalador não imprime os segredos.

<a id="erros-instalacao"></a>

### Erros de instalação e tratamentos

| Mensagem/sintoma | O que verificar e como tratar |
| --- | --- |
| `python3: not found` | Instale Python 3.9+ no host; ele é usado pelo instalador e CLI Jubart. |
| Docker indisponível ou `permission denied` no socket | Confira `docker info`, o serviço Docker e o acesso do usuário. Não use `chmod 666` no socket. |
| Compose ou Buildx ausente | Instale os plugins correspondentes à instalação do Docker Engine. |
| `x509: certificate signed by unknown authority` ao buscar token no Docker Hub | Diferencie certificados do host, do painel e de builders externos; siga o diagnóstico abaixo. |
| Diretório da aplicação não existe, mas existe na VPS | A pasta precisa estar visível no contêiner do painel: configure `PANEL_PROJECTS_DIRECTORY` com a pasta-pai, como `/var/www`, e recrie o painel. |
| Painel não abre pelo IP | O padrão local usa `127.0.0.1`; use túnel SSH ou configure HTTP público e libere a porta no firewall do host/provedor. |

**Certificados no build:** o Dockerfile do painel copia o conjunto de CAs da imagem Docker CLI fixada no repositório. Isso fornece confiança para o Buildx acessar `auth.docker.io`; o instalador verifica se o arquivo está presente após iniciar o painel. A correção foi validada em VPS com um build de FrankenPHP iniciado de dentro do painel. Não é necessário configurar HTTPS do Traefik para baixar imagens.

Em uma instalação antiga, atualize o código e recompile **pelo terminal da VPS**, na pasta do Jubart:

```bash
docker compose up -d --build --no-deps panel
docker compose exec -T panel sh -c 'test -s /etc/ssl/certs/ca-certificates.crt && echo Certificados-presentes'
```

Se continuar falhando, confira a data/hora (`timedatectl status`), atualize `ca-certificates` no host e teste o mesmo build pelo terminal. Se o terminal funciona e o painel falha, investigue o ambiente do painel/Buildx. Se ambos falham, investigue a confiança TLS do host/daemon, a rede e o builder. Um builder separado também pode precisar de CAs próprias.

Proxies corporativos com inspeção HTTPS exigem a CA legítima do proxy no host e nos ambientes que fazem as conexões. Não desative TLS nem use registros inseguros como solução. Veja [CAs no Docker](https://docs.docker.com/engine/network/ca-certs/) e [certificados do BuildKit](https://docs.docker.com/build/buildkit/configure/). Uma atualização do código não resolve certificados privados de rede automaticamente.

**Pasta externa:** se o código está em `/var/www/sspa-server`, ajuste no `.env` do Jubart `PANEL_PROJECTS_DIRECTORY=/var/www`, mantenha no cadastro o diretório `/var/www/sspa-server` e execute:

```bash
docker compose up -d --no-deps --force-recreate panel
```

A raiz pública `/var/www/html/public` é o caminho dentro do contêiner PHP, diferente do caminho do host. `localhost` como domínio só atende esse hostname; para a VPS, configure o domínio/IP apropriado.

### Primeiro acesso e configuração em poucos passos

1. Abra **http://localhost:9090** no computador em que o Jubart foi instalado (ou a porta escolhida no instalador; em modo público, use o IP da VPS). Entre com `PANEL_USERNAME` e `PANEL_PASSWORD` do `.env` gerado. O padrão é **HTTP por porta**, com acesso local; não exige domínio ou certificado.
2. Entre em **Administração → Assistente de configuração → Preparar meu ambiente**. Revise acesso/portas, tipo da aplicação, domínio e pasta do projeto no host. Para Laravel, a raiz pública normalmente é `/var/www/html/public`; outros projetos podem usar outra pasta pública.
3. Se usar os bancos locais, inicie os serviços desejados antes de testar a conexão:

   ```bash
   docker compose up -d mariadb postgres
   ```

   Esse comando considera o exemplo com ambos habilitados. Se desativou um deles, informe somente o serviço habilitado. Em **Dados → Conexões**, confira ou cadastre/teste a conta que será usada no console e nas transferências SQL.
4. Conclua a revisão do assistente e salve/aplique a configuração. Prepare as dependências e o build do seu projeto conforme o [tipo de aplicação](#tipos-aplicacao). Para iniciar os serviços configurados, abra **Administração → Manutenção do painel → Iniciar serviços** e confirme. A tela acompanha a execução, que continua mesmo se o próprio painel for recriado. Como alternativa pelo terminal, use:

   ```bash
   docker compose config --quiet
   docker compose up -d --build
   jubart status
   jubart site
   ```

O instalador inicia somente o painel; a aplicação e os bancos passam a funcionar depois da preparação e aplicação dos apontamentos. As pastas `app/` e `projects/` começam vazias. Coloque seu projeto nelas ou informe outro diretório existente no host. Ao mudar `NODE_UID`/`NODE_GID`, use os identificadores do dono dos arquivos do projeto.

| Padrão do exemplo | Valor inicial |
| --- | --- |
| Painel | `http://localhost:9090`, publicação em `127.0.0.1` |
| Aplicação principal | `http://localhost`, entrada HTTP na porta `80` |
| HTTPS | Desativado; configurar posteriormente com domínio |
| MariaDB e PostgreSQL | Habilitados no modelo, iniciados quando solicitados |
| Backups automáticos | Desativados |
| Mercure e WebSockets | Desativados; ativação por aplicação no painel |
| Senha do painel | Escolhida no assistente; gerada no modo não interativo |
| Outras senhas e chave do cofre | Geradas localmente pelo inicializador |

**Vai instalar diretamente na VPS?** Use o [primeiro acesso por SSH ou IP](#primeiro-acesso-vps). `localhost` no navegador aponta para o seu computador, não para a VPS. Para HTTP por IP, publique a porta do painel em `0.0.0.0` e libere essa porta TCP no firewall da VPS e do provedor. O Jubart não abre o firewall automaticamente.

### Preparação manual alternativa

Use este caminho se não quiser executar o instalador. O primeiro bloco exige **Node.js 24 no host**; a alternativa seguinte usa Docker e dispensa Node no host. Copiar apenas `.env.example` não basta: o inicializador prepara caminhos, credenciais e arquivos locais do Compose.

1. Copie o exemplo **somente se ainda não existir um `.env`** e prepare os arquivos locais:

   ```bash
   test -f .env || cp .env.example .env
   node scripts/initialize-local.mjs
   docker compose up -d --build --no-deps panel
   ```

   O inicializador preenche os caminhos absolutos, cria `app/` e `projects/`, gera senhas únicas no lugar das senhas de exemplo e prepara os arquivos locais do Compose. Valores personalizados e configurações existentes são preservados. Não altere `COMPOSE_PROJECT_NAME` de uma instalação existente: ele identifica seus volumes.

   **Sem Node instalado no host?** Execute o inicializador com Docker antes de subir o painel:

   ```bash
   test -f .env || cp .env.example .env
   JUBART_NODE_IMAGE="$(sed -n 's/^NODE_VERSION=//p' .env.example)"
   docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace" -w /workspace -e JUBART_HOST_DIRECTORY="$PWD" "node:$JUBART_NODE_IMAGE" node scripts/initialize-local.mjs
   docker compose up -d --build --no-deps panel
   ```

2. Abra **http://localhost:9090**. O painel usa **HTTP e porta direta por padrão**, sem domínio, proxy público ou certificado. Consulte `PANEL_USERNAME` e `PANEL_PASSWORD` no `.env` local para entrar; a senha gerada não é impressa no terminal.
3. Acesse **Administração → Assistente de configuração**. As etapas guiam acesso/portas, aplicação, banco/conexão e revisão. Salve e aplique após conferir os impactos. O assistente também fica disponível para revisões posteriores.
4. Coloque seu projeto em `app/` ou `projects/` e informe a pasta no assistente. Prepare dependências e build conforme o [tipo de aplicação](#tipos-aplicacao). O Jubart não cria o código, instala dependências nem executa migrações automaticamente.
5. Para preparar os bancos antes da etapa de conexão, execute `docker compose up -d mariadb postgres`. Cadastre/teste uma conexão com uma conta de aplicação. Crie usuários e permissões em **Dados → Usuários dos bancos**, se necessário. Depois de revisar seus apontamentos, inicie os demais serviços:

   ```bash
   docker compose config --quiet
   docker compose up -d --build
   docker compose ps -a
   ```

### Acesso por IP na VPS

`localhost` é a própria máquina do navegador. O exemplo publica o painel em `127.0.0.1:9090`, acessível localmente ou por túnel SSH. Para acessá-lo por **http://IP_DA_VPS:9090**, escolha publicação `0.0.0.0` no assistente (ou ajuste `PANEL_BIND_ADDRESS=0.0.0.0` no `.env`) e mantenha `PANEL_PROXY_ENABLED=false`, `PANEL_TLS_ENABLED=false`, `PANEL_COOKIE_SECURE=false` para HTTP direto. Salve/aplique e recrie o painel no terminal:

```bash
docker compose up -d --no-deps --force-recreate panel
```

Libere a porta TCP configurada em `PANEL_PORT` **no firewall da VPS e nas regras do provedor**, preferencialmente apenas para seu IP. Essa liberação é feita pelo administrador; o painel não altera o firewall. HTTP não cifra as credenciais: para acesso pela internet, configure HTTPS em **Proxy & acessos** ou utilize túnel SSH. Aplicações têm publicação independente (`HTTP_BIND_ADDRESS`/`HTTP_PORT`) e precisam do domínio/IP correspondente ao roteamento.

No Linux, acrescente `sudo` se sua instalação Docker exigir. Alterações de porta/cookie do próprio painel só entram em vigor após recriá-lo; use o novo endereço para reconectar.

<a id="cli-jubart"></a>

<a id="sec-terminal-jubart"></a>

## Terminal Jubart

Depois da instalação, de qualquer pasta:

```bash
jubart
jubart help
jubart panel
jubart panel --host 203.0.113.10 --ssh-user ubuntu --ssh-port 22
jubart status
jubart health
jubart users
jubart certificates
jubart time
```

| Comando | Resultado |
| --- | --- |
| `jubart` | Console interativo com baleia da marca, versão, crédito do desenvolvedor e comandos rápidos |
| `jubart help` | Lista de comandos; use também `jubart COMANDO --help` |
| `jubart version` / `jubart --version` | Versão do código instalado |
| `jubart panel` | Modo HTTP/HTTPS, portas e exemplo de túnel SSH para publicação local; consulta também o container |
| `jubart http` | Atalho para publicar o painel via HTTP por porta, com confirmação; aceita `--port` |
| `jubart ssh` | Atalho para restringir o painel a `127.0.0.1` e usar túnel SSH, com confirmação |
| `jubart access` | Consulta como alternar o acesso do painel |
| `jubart access tunnel` / `jubart access ssh` | Publica o painel somente em `127.0.0.1` e mostra o comando SSH |
| `jubart access http` | Publica o painel em `0.0.0.0` via HTTP por porta |
| `jubart site` | Testa a rota `/` da aplicação `main` na porta HTTP/HTTPS publicada, usando o domínio correto |
| `jubart site app2` / `jubart site --all` | Testa uma aplicação pelo identificador ou todas as habilitadas |
| `jubart status` | Tabela com serviço, estado, healthcheck, porta no container e porta/endereço publicados no host |
| `jubart health` | Verifica todos os serviços habilitados no Compose; retorna código 1 se ausentes, parados, iniciando ou unhealthy |
| `jubart server` | Verifica CPU, RAM, swap, disco da instalação, carga e uptime do host; retorna código 1 se houver atenção ou coleta incompleta |
| `jubart memory` | Memória usada, limite, percentual e PIDs dos containers desta instalação, além da RAM e swap do host |
| `jubart monitor` | Monitor ao vivo com gráficos de CPU/RAM do host, rede, consumo dos containers e requisições HTTP do Traefik |
| `jubart traffic` | Tráfego ao vivo: RX/TX do host e dos containers, requisições HTTP por segundo, latência e respostas acumuladas |
| `jubart queues` | Tabela com total de jobs, pendentes, reservados, atrasados e estado do worker por fila cadastrada |
| `jubart workers` | Workers cadastrados, aplicação, fila, conexão, habilitação, estado e nome real do container |
| `jubart jobs` | Catálogo de jobs cadastrados, com aplicação, nome e classe PHP |
| `jubart jobs --failed` | Até 30 falhas recentes por aplicação, com ID, conexão, fila e data, sem payloads ou exceções |
| `jubart schedules` | Agendadores cadastrados, estado dos containers e agenda Laravel (`schedule:list`) |
| `jubart databases [--engine postgres]` | Lista bancos reais do MariaDB/PostgreSQL, tamanho, proprietário e conexões; não exibe senhas |
| `jubart database list --engine postgres --database infra` | Filtra o inventário pelo servidor e nome exato do banco |
| `jubart database users [--engine postgres] [--database infra]` | Lista contas, host, bloqueio do login, perfil administrativo e permissões por banco |
| `jubart database access --engine postgres [--database infra]` | Mostra endereços internos/configurados e instruções para acesso local, túnel SSH e configuração no painel |
| `jubart database help` | Exibe todos os comandos e flags de bancos, com descrições em português |
| `jubart apps` | Tabela com ID, aplicação, tipo, nome real do container consultado no Docker, domínio, estado habilitada/desabilitada, pasta no host (caminho absoluto a partir da raiz da instalação) e comandos `dir`/`exec` de cada aplicação; indica containers não criados ou consulta indisponível. Dentro do console, os atalhos aparecem sem o prefixo `jubart` |
| `jubart app help` | Todas as ações e flags para gerenciar aplicações; aceita também `jubart app COMANDO --help` |
| `jubart proxies` ou `jubart proxy list` | Lista hosts de proxy, aplicações, painel e WebSockets, incluindo cadastros desabilitados, com ID, nome, domínios, destino, métodos HTTP e HTTPS |
| `jubart proxy show` | Consulta todas as configurações de roteamento, redirecionamento, cabeçalho Host, IPs, políticas de segurança e acessos globais; compara os acessos salvos com o `.env` |
| `jubart proxy show PROXY` | Filtra os detalhes pelo ID, nome completo entre aspas ou domínio, por exemplo `jubart proxy show app2` |
| `jubart proxy help` | Mostra todos os comandos e opções de consulta dos proxies |
| `jubart app create [ID] --domain HOST --directory CAMINHO` | Cadastra e aplica uma aplicação; sem ID, escolhe o próximo disponível |
| `jubart app update ID [FLAGS]` | Altera os campos informados e aplica a aplicação; mostra a revisão antes de pedir `yes` |
| `jubart app remove ID` | Remove o cadastro e o container, preservando pastas, bancos e volumes; `main` é protegido |
| `jubart app apply ID` | Aplica um cadastro salvo ou repete a aplicação após uma falha de Docker |
| `jubart exec APP` | Abre o shell no container pelo ID ou nome completo da aplicação; nomes com espaços precisam de aspas |
| `jubart dir APP` | Abre Bash na pasta do projeto no host pelo ID ou nome completo da aplicação |
| `jubart app shell ID` | Abre Bash no container da aplicação, na raiz do projeto (ou pasta de trabalho configurada para Node.js); usa `sh` se a imagem não tiver Bash. Exige um único container em execução |
| `jubart app host ID` | Abre Bash na pasta cadastrada do projeto no host, sem depender do Docker ou de a aplicação estar habilitada |
| `jubart users` | Tabela de contas do painel: login, perfil, acesso habilitado/desabilitado e nome; inclui o administrador do `.env`, sem exibir senhas ou hashes |
| `jubart certificates` | Verifica os certificados servidos pelo proxy HTTPS local para aplicações habilitadas e painel por domínio, conforme o `.env` |
| `jubart certificates exemplo.com` | Consulta TLS pela rede no domínio informado; aceita `--port` (padrão 443) |
| `jubart time` | Hora do servidor e UTC, fuso do host, estado NTP e horários nos fusos configurados para serviços e backups |
| `jubart user` | Login do administrador principal do `.env` |
| `jubart user NOVO_LOGIN` | Altera esse login e recria somente o painel após confirmação |
| `jubart password` | Solicita senha atual/nova sem exibi-las, salva e recria o painel após confirmação |
| `jubart start` | Inicia somente o painel já construído |
| `jubart restart` | Recria somente o painel, com confirmação, efetivando mudanças de `.env` |

As consultas `proxies` e `proxy show` mostram os encaminhamentos gerenciados pelo Jubart sem alterar arquivos ou containers. `proxy show` inclui portas HTTP/HTTPS, acesso direto do painel/phpMyAdmin/bancos, email ACME, regras de métodos, IPs, horários e limites HTTP quando cadastrados. O cadastro salvo e os valores do `.env` são identificados separadamente; não constituem comprovação de recarga do Traefik ou do estado atual dos containers. Divergências no arquivo gerado dos hosts são indicadas. As consultas não imprimem senhas, chaves ou o `.env` completo. Exigem Node.js no host ou o painel em execução; arquivos privados são consultados pelo container quando necessário, e leituras incompletas são indicadas. No console, use `proxies`, `proxy show`, `proxy show app2` ou `proxy show "Relatórios"`, sem o prefixo `jubart`.

O comando `jubart site` faz uma requisição GET local, com limite de 10 segundos por aplicação, sem imprimir o conteúdo da resposta. Respostas 2xx indicam resposta bem-sucedida; 3xx são informadas como redirecionamento sem seguir o destino; 4xx/5xx, falhas TLS e indisponibilidade retornam código 1. HTTPS preserva a validação do certificado e o domínio TLS. O teste não comprova acesso externo/firewall nem o funcionamento de todas as rotas.

Ao executar apenas `jubart` em um terminal compatível, a tela de boas-vindas abre um console de tela inteira, com cabeçalho, conteúdo e prompt `jubart>` fixo no rodapé. A abertura mostra comandos rápidos sem consultar o Docker. Digite os comandos sem repetir o prefixo `jubart`; a sessão permanece aberta após cada execução:

```text
jubart> apps
jubart> status
jubart> panel
jubart> app update app2 --domain novo.exemplo.com
jubart> exec app2
jubart> dir app2
jubart> exec "WP ERP - Novo"
jubart> help
jubart> exit
```

Use `app help` para consultar ações e flags, `clear` para limpar a tela e voltar às boas-vindas, e `exit`, `quit`, **Ctrl+D** (na linha vazia) ou **Ctrl+C** para sair. As setas para cima/baixo percorrem o histórico da sessão; use aspas nos nomes e caminhos com espaços. As operações que alteram configurações continuam exigindo a confirmação `yes`. Comandos diretos como `jubart apps` e `jubart status` também continuam disponíveis fora do console.

Os atalhos `exec APP` e `dir APP` aceitam o ID mostrado em `apps`, como `main` ou `app2`, ou o nome completo da aplicação, como `dir "WP ERP - Novo"`. A busca ignora diferenças entre maiúsculas e minúsculas e prioriza o ID; nomes repetidos exigem um ID único. Eles entregam o terminal ao shell interativo; `exit` ou **Ctrl+D** encerra o shell e devolve o prompt do Jubart. Fora do console, use `jubart exec app2` ou `jubart dir app2`: ao sair, você retorna ao terminal original. O shell do host abre na pasta cadastrada, inclusive para aplicações desabilitadas, com o usuário atual. O shell do container mantém o usuário definido no Compose e não cria nem inicia containers automaticamente. A pasta atual do processo Jubart e do terminal original é preservada. As formas anteriores `app shell ID` e `app host ID` continuam disponíveis.

A interface usa a largura e a altura reais do terminal, inclusive ao redimensionar o terminal integrado da IDE. Separadores e tabelas ocupam a largura disponível; textos e células longas quebram em várias linhas. Em janelas muito estreitas, as tabelas viram registros com rótulos para manter todos os campos acessíveis. Use **PgUp/PgDn** para rolar os resultados e **Ctrl+L** para redesenhar a tela, preservando o comando que está digitando. A rolagem também está disponível nas confirmações. Redimensionar redesenha os dados já consultados, sem executar novamente comandos ou operações. As boas-vindas colocam a baleia e os atalhos lado a lado quando há espaço. Sair restaura a tela anterior do terminal. Após atualizar o código, encerre o console aberto com `exit` e execute `jubart` novamente para carregar a nova interface.

Em `status` e `health`, as colunas **Porta no container** e **Porta no host** separam a porta/protocolo internos e o endereço de publicação no servidor. Por exemplo: `3000/tcp` no container e `127.0.0.1:9090` no host. As informações vêm do container criado no Docker, incluindo portas declaradas sem publicação (`não publicada` no host). As portas declaradas não comprovam que um processo esteja escutando. Múltiplos mapeamentos mantêm a mesma ordem nas duas colunas; IPv6 aparece entre colchetes. Se a inspeção falhar, os dados disponíveis no Compose são preservados e a coleta incompleta é indicada. A tabela de serviços não exibe pastas ou volumes; `jubart apps` continua mostrando a pasta de cada aplicação no host.

Para consultar o servidor ou acompanhar recursos e tráfego no console:

```text
jubart> server
jubart> memory
jubart> memory --service php
jubart> memory --watch
jubart> monitor
jubart> traffic --interface eth0 --interval 3
jubart> traffic --service php
jubart> monitor --host-only
jubart> monitor --once
jubart> monitor --help
```

`server` e `memory` fazem uma consulta; `--watch` acompanha continuamente. `monitor` e `traffic` acompanham ao vivo por padrão; **q** ou **Ctrl+C** encerra a visualização e devolve o prompt do Jubart. **PgUp/PgDn** percorre os dados que não cabem na janela; redimensionar reorganiza imediatamente a amostra atual, sem antecipar outra coleta. `--once` faz uma consulta com duas amostras para calcular as taxas. Fora do console, use o prefixo, por exemplo `jubart monitor`. Saídas redirecionadas e terminais `TERM=dumb` fazem apenas uma consulta e terminam. O intervalo mínimo é de dois segundos por padrão, ajustável com `--interval` entre 1 e 60; a duração da coleta também conta no intervalo. O histórico conserva até 60 amostras enquanto o comando está aberto.

`server` consulta o host Linux onde o comando executa, sem depender de Docker ou do `.env`. Indica atenção a partir de 90% de CPU/RAM/disco, 80% de swap, carga de um minuto acima do número de CPUs ou leitura indisponível. O disco corresponde ao sistema de arquivos da pasta da instalação. RAM usada é a memória total menos `MemAvailable`, considerando o cache recuperável como disponível. Esses limiares indicam pressão de recursos; `health` continua verificando a execução e os healthchecks dos serviços.

`memory`, `monitor` e `traffic` aceitam `--service NOME`, como `php`, `php-app2` ou `mariadb`, para filtrar os containers pelo serviço Compose. `--host-only` permite consultar o host sem Docker ou painel. Os containers são restritos à instalação atual, e a RAM segue `docker stats`, com CPU individual podendo ultrapassar 100% ao usar vários núcleos. O limite informado é o limite reportado pelo Docker; sem limite explícito, pode corresponder à memória disponível ao daemon. O host local e o host do daemon podem ser máquinas diferentes se você usar um contexto Docker remoto.

Para a rede do host, `monitor` e `traffic` usam as interfaces da rota padrão IPv4; sem elas, procuram interfaces sem loopback/bridges Docker. `--interface` escolhe uma interface específica (substitua `eth0` pelo nome real). RX indica entrada e TX indica saída; os contadores incluem tráfego interno e não comprovam a banda exclusiva da internet. Nos containers, as taxas usam as diferenças dos contadores entre amostras. Reinícios ou quedas na coleta descartam a base anterior; dados ausentes aparecem como `—`.

As métricas HTTP reutilizam o parser do painel e o endpoint interno do Traefik, consultado pelo container `panel`, sem publicar portas adicionais. Mostram tráfego global dos entrypoints `web` e `websecure`, mesmo com `--service`, e precisam do painel/Traefik em execução com métricas habilitadas. Sem novas requisições, a latência fica indisponível. Falhas de coleta aparecem na tela sem substituir dados ausentes por zero; host e containers continuam sendo exibidos quando disponíveis. Todos esses comandos são somente leitura.

Para verificar filas, jobs e Scheduler dentro do console:

```text
jubart> queues
jubart> queues --app main --watch
jubart> queues --app app2 --queue emails --connection redis
jubart> workers --app app2
jubart> jobs
jubart> jobs --failed --app main
jubart> schedules --app main
jubart> queues --help
```

Todos aceitam `--app ID` para filtrar por aplicação, `--watch` para acompanhar e `--interval` de 3 a 60 segundos (padrão 5) para ajustar o intervalo mínimo entre consultas. **q** ou **Ctrl+C** devolve o prompt; entrada/saída redirecionada e `TERM=dumb` fazem uma única consulta. Fora do console, mantenha o prefixo, por exemplo `jubart queues`. Os comandos somente consultam: não registram, iniciam, interrompem, executam ou reenfileiram jobs, nem criam arquivos de configuração quando o cadastro estiver ausente.

`queues` consulta as filas cadastradas no painel pela ponte Laravel existente na imagem PHP. Para uma fila sem cadastro, informe `--app` e `--queue`; `--connection` aceita `redis` ou `database`, com padrão `redis` nessa consulta explícita. Isso não cria um worker nem descobre automaticamente todas as filas do Redis/Valkey. O total é fornecido pelo driver; contagens detalhadas dependem dos métodos disponíveis na versão Laravel. Campos indisponíveis aparecem como `—`, sem confundir falha de conexão com fila vazia.

`workers` mostra apenas os workers cadastrados no Jubart, inclusive desabilitados ou sem container criado. O estado real do container e a habilitação salva são exibidos separadamente. `jobs` mostra o catálogo cadastrado, sem indicar que esses jobs foram executados. `jobs --failed` consulta as falhas recentes nas aplicações PHP habilitadas, mesmo que não tenham jobs cadastrados; a listagem depende do provedor Laravel `database`/`database-uuids` e não constitui histórico de todos os jobs executados. `schedules` lista os agendadores cadastrados e consulta a agenda das aplicações PHP habilitadas, mesmo sem um agendador registrado no Jubart. Uma agenda cadastrada ou um container em execução não comprova que uma tarefa terminou com sucesso.

Cadastros podem ser consultados sem Laravel/Docker, mas contagens, falhas e agenda exigem a aplicação habilitada, preparada e em execução. O estado dos workers/agendadores depende de Docker. As consultas usam os containers da aplicação e dispensam login no painel; elas mantêm as permissões Docker do usuário do host. A agenda oculta os segredos conhecidos dos ambientes da infraestrutura e da aplicação acessível no host. Erros de coleta aparecem na tela e retornam código 1 na consulta única, preservando os dados que puderem ser lidos. Cada `--help` lista as flags com descrições em português.

Para gerenciar aplicações pelo terminal, consulte os IDs em `jubart apps` e use:

```bash
# Mostrar todas as ações e flags
jubart app help
jubart app update --help

# Criar um cadastro para um projeto existente; o ID é escolhido automaticamente
jubart app create --name "Minha API" --type php --domain api.exemplo.com --directory /srv/projetos/api

# Alterar somente o domínio, somente a pasta ou vários campos
jubart app update app2 --domain novo.exemplo.com
jubart app update app2 --directory /srv/projetos/erp
jubart app update app2 --name "ERP" --domain erp.exemplo.com --port 8000

# Criar Node.js ou site estático
jubart app create --type node --domain node.exemplo.com --directory /srv/projetos/node --start-command "npm run start" --port 3000
jubart app create --type static --domain site.exemplo.com --directory /srv/projetos/site --build-directory dist --spa

# Revisar sem gravar; salvar sem aplicar; aplicar depois
jubart app update app2 --domain novo.exemplo.com --dry-run
jubart app update app2 --domain novo.exemplo.com --save-only
jubart app apply app2

# Habilitar, desabilitar ou remover um cadastro
jubart app update app2 --enable
jubart app update app2 --disable
jubart app remove app3
```

Os nomes dos comandos e das flags são em inglês; as descrições, a ajuda e as mensagens são em português. Use `--domain` para domínio, `--directory` para pasta no host, `--name` para nome, `--type` para tipo, `--port` para porta interna, `--document-root` para raiz pública PHP, `--mode` para modo PHP, `--start-command` para comando Node.js, `--working-directory` para pasta de trabalho e `--build-directory` para pasta do build. `--enable` e `--disable` alteram a habilitação; sites estáticos aceitam `--spa` e `--no-spa`. `jubart app help` lista todas as flags com suas descrições e padrões. A porta é interna ao container; os domínios compartilham a entrada do Traefik.

Antes de gravar, a CLI apresenta os campos alterados e exige digitar **`yes`** em um terminal interativo. `--dry-run` apenas valida e mostra a revisão. Criar e atualizar aceitam `--save-only`: salvam o cadastro e os arquivos gerados sem executar Docker; `jubart app apply ID` aplica os campos salvos posteriormente. Por padrão, as alterações de runtime validam o Compose e aplicam a aplicação selecionada e o Traefik; dependências da aplicação podem ser iniciadas. Alterar somente o nome atualiza o cadastro sem recriar containers. Flags omitidas preservam os campos existentes; rascunhos de outros campos/aplicações permanecem no JSON e não são aplicados por uma edição parcial.

O cadastro usa uma pasta já existente: a CLI não cria código, instala dependências nem provisiona bancos. Ao aplicar um cadastro habilitado, ela verifica a pasta pública/de trabalho correspondente ao tipo. A criação aceita um ID explícito (`app2` até `app100`) ou escolhe o próximo livre. `main` não pode ser removido ou desabilitado. Na remoção, o cadastro e o container são removidos; arquivos do projeto, bancos, credenciais e volumes permanecem. Os valores dos slots base `app2` e `app3` no `.env` são mantidos desabilitados para que o Compose continue válido.

As alterações sincronizam `config/apps.json`, os apontamentos do `.env`, `config/apps.compose.yaml` e as rotas geradas. A configuração anterior fica em `.panel-state/app-cli/<data-id>/before.json`, com permissões restritas. A CLI recusa aplicar uma revisão alterada por outra sessão. Se Docker falhar após salvar, o cadastro novo permanece e a mensagem informa como retomar. Aplicações com filas, jobs, Scheduler, WebSocket ou Mercure vinculados exigem gerenciar esses vínculos no painel antes de alterar o runtime ou remover o cadastro. Recarregue abas abertas do painel após alterações pela CLI.

A gestão de aplicações reutiliza o código Node.js do painel. Usa Node.js no host quando disponível; caso contrário, executa o utilitário no container `panel` em execução. Nesse caso, a pasta do projeto precisa estar montada e acessível no painel, conforme `PANEL_PROJECTS_DIRECTORY`. As consultas de ajuda não dependem de Node.js ou Docker.

Para alternar o acesso, execute `jubart http` ou `jubart ssh` e digite `yes` na confirmação do terminal. Somente após essa confirmação, o CLI salva a troca, recompila a imagem e recria o painel. Enter, outra resposta ou interrupção cancelam sem modificar a configuração. Os atalhos preservam a porta atual; use, por exemplo, `jubart http --port 9090` para mudá-la. A alteração sincroniza `.env` e o cadastro do painel em `config/apps.json` e desativa o acesso do painel por domínio/HTTPS. No modo HTTP, libere a porta no firewall e nas regras do provedor; no modo SSH, execute o túnel no seu computador. O atalho `jubart ssh` configura o acesso do painel e não altera o serviço SSH do servidor.

`jubart users` consulta as contas salvas do painel, incluindo contas desabilitadas identificadas na tabela. As permissões detalhadas e o gerenciamento das contas ficam no painel; usuários SSH do sistema não fazem parte dessa listagem.

`jubart certificates` valida o domínio, a cadeia de confiança do sistema e o período de validade do certificado apresentado na conexão TLS, exibindo início da validade, vencimento em UTC e dias restantes. Avisa quando faltam até 30 dias e retorna código 1 se houver certificado inválido ou falha de conexão. Sem domínio informado, usa `127.0.0.1:HTTPS_PORT` com o domínio configurado no TLS; um domínio informado é consultado pela rede. `--port` substitui a porta da consulta. Sem HTTPS habilitado e sem domínio informado, apenas informa que não há certificados para consultar. A consulta não emite nem renova certificados.

`jubart time` é somente leitura e funciona sem Docker ou `.env`. Quando `timedatectl` não estiver disponível, ainda mostra o horário local e UTC, mas informa que não foi possível consultar NTP. Os fusos dos serviços e backups vêm de `TZ`, `BACKUP_TIMEZONE` e `PG_BACKUP_TIMEZONE` no `.env`; isso não comprova a configuração dos containers em execução.

O CLI usa cores e ícones em terminais compatíveis; containers indicados como `não criado` aparecem em vermelho na tabela de aplicações. A baleia aparece sem fundo e sua animação se repete nas boas-vindas, permitindo digitar normalmente. Após executar um comando, o resultado ocupa a área de conteúdo; `clear` volta às boas-vindas e reinicia a animação. Redimensionar reorganiza a apresentação e mantém o texto digitado. Use `JUBART_NO_ANIMATION=1 jubart` para manter o console de tela inteira com a baleia estática. A animação também é desativada em CI e com cores desativadas. Para desativar cores, use `NO_COLOR=1 jubart`; terminais `TERM=dumb` usam o console em texto simples. Com entrada ou saída redirecionada, `jubart` exibe apenas as boas-vindas estáticas e termina, sem abrir o console.

O CLI lê a instalação à qual o atalho está vinculado; não depende da pasta atual. Para outra instalação, use `jubart --root /caminho/da/instalacao status`. A versão informada vem do código local; o container pode exigir atualização de imagem. Os endereços refletem a configuração salva, enquanto as portas mostradas no estado vêm do Docker. O CLI não detecta túneis SSH abertos nem adivinha IP público e usuário SSH: informe `--host` e `--ssh-user`, ou substitua os marcadores do comando sugerido. Execute o comando SSH **no seu computador**, depois abra o endereço local e mantenha a conexão aberta.

Para alternar o acesso pelo terminal:

```bash
jubart access http --port 9090
jubart access tunnel --host 203.0.113.10 --ssh-user ubuntu --ssh-port 22
```

As duas opções exigem digitar `yes` na confirmação, salvam no `.env` e sincronizam `config/apps.json` quando existente, para uma aplicação posterior não restaurar o modo antigo. Recompilam e recriam **somente o painel**, encerrando a sessão. Ambas desativam o proxy por domínio, HTTPS e cookie seguro do painel; as configurações HTTPS das aplicações permanecem. `--port` é opcional e preserva a porta atual quando omitida. Se a recompilação ou recriação falhar, o modo fica salvo e o CLI orienta repetir `jubart http` ou `jubart ssh`, conforme o modo escolhido.

No modo `http`, libere a porta no firewall apenas para origens autorizadas: HTTP não cifra as credenciais. O CLI não abre portas no firewall. No modo `tunnel`, o acesso direto neste host continua disponível; para acesso remoto, copie o comando SSH mostrado e execute **no seu computador**. O CLI não inicia automaticamente o túnel. Depois de uma alteração pelo CLI, atualize abas abertas do painel antes de editar configurações novamente.

Alterar login/senha principal encerra sessões e pode invalidar compartilhamentos. As demais contas continuam sendo administradas em **Usuários e permissões**. Acesso ao CLI exige permissão sobre os arquivos locais e, nas operações Docker, sobre o daemon. Serviços sem healthcheck não têm sua saúde comprovada somente por estarem em execução.

Para instalar em outro diretório de comandos, use `./install.sh --bin-dir /caminho/absoluto/bin` (esse diretório precisa estar no `PATH`). `--no-start` prepara os arquivos e instala o comando sem construir/iniciar o painel. Um comando de outra instalação no mesmo destino não é sobrescrito. O atalho aponta para este checkout: se mover a pasta, execute novamente o instalador no novo local, escolhendo um destino livre. Para remover o comando global, remova apenas o atalho `/usr/local/bin/jubart`; os arquivos e volumes do projeto permanecem.

<a id="topologia"></a>

<a id="sec-topologia-da-sua-instalacao"></a>

## Topologia da sua instalação

Em **Workspace → Topologia da infraestrutura**, administradores podem consultar aplicações cadastradas, domínios, portas de entrada e internas, pastas no host e seus vínculos declarados. Filtre aplicações, inclua desabilitadas ou use o inventário; clique nos elementos do mapa para abrir detalhes.

A página combina três fontes: cadastros salvos, definição Compose e estado/montagens observados no Docker. O mapa não desenha tráfego real nem executa alterações. Se o Docker estiver indisponível, os cadastros continuam visíveis e a execução fica como não consultada. Uma diferença na montagem da pasta é sinalizada para revisão.

Banco e cache são identificados por destinos explícitos na definição Compose (`DB_HOST`/`DB_DATABASE`, `DATABASE_URL`, `REDIS_HOST`). Senhas, usuários de URLs e parâmetros secretos não são enviados à página. A relação declarada não comprova conexão bem-sucedida: o código/cache interno da aplicação pode escolher outro destino. Conexões do console SQL não são usadas para presumir vínculos entre aplicações e bancos. A topologia é uma área administrativa autenticada.

<a id="arquitetura-interativa"></a>

<a id="sec-arquitetura-interativa"></a>

## Arquitetura interativa

Em **Workspace → Como o Jubart funciona**, explore uma simulação visual da arquitetura, também acessível na aba **Arquitetura** de **Referências**. A baleia acompanha o fluxo entre cliente, proxy, runtime e serviços de apoio. Clique nos componentes para ler suas funções, pause a reprodução ou escolha etapas individuais.

A apresentação fica disponível dentro do painel autenticado. O botão **Tela inteira** amplia a página; use **Sair da tela inteira** ou Escape para voltar. Os componentes têm cores por função e o caminho atual é destacado.

Há cinco cenários: instalação do projeto ao ambiente pronto, requisição HTTP (PHP, Node.js ou site estático), tarefa em segundo plano, administração com Docker/Compose e resposta de erro da infraestrutura. A instalação mostra preparação do `.env`, build da interface/imagem do painel, imagem pronta, criação do container, cadastro da aplicação, preparação dos runtimes, rede/rotas, montagem de pastas e volumes e início dos serviços. O fluxograma mostra um único cartão por componente, setas animadas e a baleia acompanhando o trajeto. Quando há retorno, a conexão existente inverte o sentido: a resposta volta da aplicação ao Traefik e ao mesmo cliente. Build, painel e páginas de erro também reutilizam seus cartões nas etapas posteriores, com ramais para as relações que precisam sair do caminho principal. Uma nuvem ao lado da baleia, abaixo do mapa, explica cada etapa. Os controles por ícones têm identificação ao passar o mouse e nomes acessíveis. Montagens são feitas durante a criação dos containers; a sequência é didática, não uma execução real ou um cronograma estrito. O cenário de banco/fila é um exemplo de integração que depende do código e da configuração da aplicação. O painel administra os serviços; o tráfego da aplicação segue pelo proxy até seu runtime. O mapa é didático, não representa as sete camadas OSI e não consulta a saúde real dos serviços. Em dispositivos com movimento reduzido, avance manualmente pelas etapas.

### 🧭 Onde administrar cada recurso

| Guia do painel | Uso |
| --- | --- |
| Aplicações | Cadastrar projetos e definir tipo, domínio e diretórios |
| Proxy & acessos | Publicar aplicações, bancos e o próprio painel |
| PHP & FrankenPHP | Configuração exclusiva do runtime PHP, INIs, extensões e drivers |
| Bancos de dados / Usuários dos bancos | Bancos, contas, senhas e permissões |
| Backups dos bancos / Importar e exportar SQL | Agendas, cópias, downloads e importações |
| Filas, jobs & Scheduler | Automações das aplicações Laravel |
| Informações do host / Containers & tráfego | Recursos do servidor e consumo dos containers, separadamente |
| Conexão MCP | Chaves, ações permitidas e auditoria da integração com IA |
| Tecnologias & conceitos | Componentes, versões fixadas e leitura deste README |

As seções seguintes detalham tanto a operação geral quanto procedimentos específicos. Comandos de PHP/Artisan/Octane aplicam-se somente aos projetos que usam essas tecnologias.

---

<a id="modo-servidor"></a>

<a id="sec-php-escolher-o-modo-do-servidor"></a>

## 🎛️ PHP: escolher o modo do servidor

Defina no `.env` da infraestrutura:

```dotenv
PHP_SERVER_MODE=traditional
```

- `traditional` (padrão): Laravel convencional, sem instalar Octane. Usa `docker/php/Caddyfile`, escuta internamente em 8000 e deixa HTTPS com o Traefik.
- `octane`: mantém Laravel em memória e exige instalar/configurar `laravel/octane` na aplicação. Usa o servidor e configuração fornecidos pelo Octane; o Caddyfile tradicional não é utilizado.

Para começar no modo tradicional, depois de preparar o diretório Laravel e seu `.env`:

```bash
docker compose build --pull php
docker compose run --rm --no-deps php composer install
docker compose up -d --build --remove-orphans
```

Para alternar o modo depois de preparar os requisitos:

```bash
docker compose up -d --force-recreate php
docker compose logs --tail=100 php
```

Não é necessário reconstruir a imagem só para trocar o modo após a primeira construção desta versão. Valores inválidos são rejeitados na inicialização. Os dois modos usam as mesmas rotas Traefik e porta interna.

---

<a id="instalar-octane"></a>

<a id="sec-preparar-aplicacao-e-instalar-octane-somente-modo-octane"></a>

## 🐙 Preparar aplicação e instalar Octane (somente modo octane)

Configure `APP_DIRECTORY` no `.env` com um diretório Laravel existente, contendo `artisan` e `composer.json`. Este repositório contém infraestrutura, não cria a aplicação. Verifique a compatibilidade do Laravel e dependências com PHP e Octane pelo Composer. Crie o `.env` da aplicação a partir do exemplo dela se necessário; preserve uma `APP_KEY` já existente.

```bash
docker compose config --quiet
docker compose build --pull php
docker compose run --rm --no-deps php composer install
docker compose run --rm --no-deps php composer require laravel/octane
docker compose run --rm --no-deps php php artisan octane:install --server=frankenphp
```

A imagem já fornece o binário `/usr/local/bin/frankenphp`. Use esse binário da imagem, mantendo PHP e extensões juntos; não use uma cópia estática antiga na raiz da aplicação. Confira a saída do instalador e as versões efetivas:

```bash
docker compose run --rm --no-deps php php -v
docker compose run --rm --no-deps php frankenphp version
docker compose run --rm --no-deps php php -m
```

Defina `APP_KEY` na aplicação (execute `key:generate` somente se ainda não tiver chave). Suba os serviços e prepare o banco conforme as migrations do projeto:

```bash
docker compose up -d --build --remove-orphans
docker compose exec php php artisan config:clear
docker compose exec php php artisan migrate
docker compose logs --tail=100 php traefik
```

`--remove-orphans` remove o antigo container Nginx deste projeto. Revise as migrations antes de aplicá-las a dados existentes. O usuário do processo precisa escrever em `storage` e `bootstrap/cache`; comandos podem criar arquivos como root, então ajuste o usuário/permissões conforme o host.

---

<a id="local-vps"></a>

<a id="sec-configuracao-local-e-vps"></a>

## 🌍 Configuração local e VPS

O `.env` da infraestrutura concentra variáveis operacionais e credenciais; `.env.example` contém o modelo sem senhas reais. Os cadastros do painel ficam em JSON e as configurações avançadas do PHP em INIs. Cada aplicação mantém suas próprias opções e dependências. Nos serviços PHP, as variáveis de banco e `APP_URL` injetadas pelo Compose prevalecem sobre o arquivo do projeto.

| Variável | Local | VPS |
| --- | --- | --- |
| `HTTP_BIND_ADDRESS` | `127.0.0.1` | `0.0.0.0` |
| `HTTP_PORT` | `80` | `80` |
| `HTTPS_PORT` | `8443` | `443` |
| `APP_DOMAIN` | `localhost` | `app.exemplo.com` |
| `APP_URL` | `http://localhost` | `https://app.exemplo.com` |
| `TRAEFIK_TLS_ENABLED` | `false` | `true` |
| `ACME_EMAIL` | vazio | seu email válido |

Na VPS aponte DNS A/AAAA corretamente e permita entrada nas portas 80 e 443. Traefik termina TLS; Octane recebe HTTP interno. O Compose fornece `OCTANE_HTTPS` conforme TLS; configure proxies confiáveis no Laravel conforme sua versão. Na aplicação use `APP_ENV=production`, `APP_DEBUG=false` e cookies seguros ao habilitar HTTPS.

MariaDB publica por padrão `127.0.0.1:3306` no host; ajuste `MARIADB_BIND_ADDRESS` e `MARIADB_PORT` no `.env`. phpMyAdmin atende http://localhost:8081 com `DB_USERNAME` e `DB_PASSWORD`; endereço, porta, versão e upload são configuráveis com `PHPMYADMIN_*`. Na VPS mantenha-o em loopback e acesse com `ssh -N -L 8081:127.0.0.1:8081 usuario@IP_DA_VPS`.

<a id="guia-env"></a>

### 🧭 Guia simples: `.env` local ou VPS com domínio

[💻 Local](#env-local) · [☁️ VPS com domínio](#env-vps-dominio) · [🔐 Emitir certificado](#emitir-certificado-dominio) · [🔄 Aplicar mudanças](#aplicar-env-guia) · [🖥️ Acessar painel](#acesso-painel) · [⬆️ Início](#inicio)

**São dois arquivos diferentes:** o `.env` da infraestrutura configura containers, portas e proxy; o `.env` de cada aplicação configura o projeto. Mantenha credenciais diferentes entre desenvolvimento e produção. Os exemplos abaixo mostram as variáveis que mudam entre ambientes, não substituem o arquivo completo.

Na primeira instalação, se ainda não houver `.env`:

```bash
cp .env.example .env
nano .env
node scripts/initialize-local.mjs
```

Não copie esse modelo por cima de um `.env` já configurado. Preencha as senhas e a chave do cofre indicadas no modelo. Preserve versões fixadas, perfis e outras opções que já utiliza.

<a id="env-local"></a>

#### 💻 1. `.env` para rodar no seu computador

Use caminhos absolutos existentes no seu computador:

```dotenv
APP_DIRECTORY=/home/seu-usuario/projetos/minha-aplicacao
PANEL_WORKSPACE_DIRECTORY=/home/seu-usuario/projetos/infra-comserv
PANEL_PROJECTS_DIRECTORY=/home/seu-usuario/projetos

APP_DOMAIN=localhost
APP_URL=http://localhost
HTTP_BIND_ADDRESS=127.0.0.1
HTTP_PORT=80
HTTPS_PORT=8443
TRAEFIK_TLS_ENABLED=false
ACME_EMAIL=

PANEL_BIND_ADDRESS=127.0.0.1
PANEL_PORT=9090
PANEL_PROXY_ENABLED=false
PANEL_DOMAIN=
PANEL_TLS_ENABLED=false
PANEL_COOKIE_SECURE=false
PHP_SESSION_COOKIE_SECURE=0

MARIADB_ENABLED=true
POSTGRES_ENABLED=true
COMPOSE_PROFILES=db-mariadb-true,db-postgres-true
MARIADB_BIND_ADDRESS=127.0.0.1
POSTGRES_BIND_ADDRESS=127.0.0.1
PHPMYADMIN_BIND_ADDRESS=127.0.0.1
```

Defina `false` no banco que não precisar e mantenha os dois perfis fixos. Se tiver aplicações adicionais, preserve também seus perfis. Para PHP, ajuste `PHP_DOCUMENT_ROOT` à raiz pública do projeto; Laravel normalmente usa `/var/www/html/public`.

Depois de [sincronizar os apontamentos](#aplicar-env-guia), suba:

```bash
sudo docker compose config --quiet
sudo docker compose up -d --build
```

Abra a aplicação em **http://localhost** e o painel em **http://localhost:9090**. Esse cenário usa HTTP, não emite certificado e não exige liberar portas públicas no roteador.

[➡️ VPS com domínio](#env-vps-dominio) · [⬆️ Guia](#guia-env)

<a id="env-vps-dominio"></a>

#### ☁️ 2. `.env` para VPS com domínio

Exemplo: aplicação em `app.seudominio.com` e painel em `painel.seudominio.com`. Substitua esses nomes e os caminhos abaixo pelos seus:

```dotenv
APP_DIRECTORY=/var/www/minha-aplicacao
PANEL_WORKSPACE_DIRECTORY=/var/www/infra-comserv
PANEL_PROJECTS_DIRECTORY=/var/www

APP_DOMAIN=app.seudominio.com
APP_URL=https://app.seudominio.com
HTTP_BIND_ADDRESS=0.0.0.0
HTTP_PORT=80
HTTPS_PORT=443
TRAEFIK_TLS_ENABLED=true
ACME_EMAIL=seu-email@seudominio.com

PANEL_BIND_ADDRESS=127.0.0.1
PANEL_PORT=9090
PANEL_PROXY_ENABLED=true
PANEL_DOMAIN=painel.seudominio.com
PANEL_TLS_ENABLED=true
PANEL_COOKIE_SECURE=true
PHP_SESSION_COOKIE_SECURE=1

MARIADB_ENABLED=true
POSTGRES_ENABLED=true
COMPOSE_PROFILES=db-mariadb-true,db-postgres-true
MARIADB_BIND_ADDRESS=127.0.0.1
POSTGRES_BIND_ADDRESS=127.0.0.1
PHPMYADMIN_BIND_ADDRESS=127.0.0.1
```

`APP_DOMAIN` e `PANEL_DOMAIN` recebem **somente o nome**, sem `https://`, porta ou caminho. `APP_URL` recebe a URL completa. Cada domínio deve apontar para a VPS. As portas 80/443 atendem todas as aplicações por domínio; a porta 9090 continua interna. Não é necessário abrir 9443 no cenário com subdomínio.

Para Laravel, configure também no **`.env` da aplicação**:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://app.seudominio.com
SESSION_SECURE_COOKIE=true
```

Configure os proxies confiáveis conforme a versão da aplicação, para reconhecer o HTTPS terminado no Traefik. As variáveis `APP_URL` e de banco injetadas pelo Compose têm precedência sobre o `.env` do projeto PHP. Node.js e aplicações estáticas precisam das URLs de produção pertinentes ao projeto; em builds estáticos, alterar variáveis pode exigir gerar o build novamente.

Se preferir painel somente por SSH, substitua as opções do painel pelo [exemplo de túnel](#acesso-painel). Não misture cookie seguro para HTTPS com login via túnel HTTP.

[➡️ Emitir certificado](#emitir-certificado-dominio) · [⬆️ Guia](#guia-env)

<a id="emitir-certificado-dominio"></a>

#### 🔐 3. Passo a passo para emitir o certificado do domínio

1. **Configure o DNS no provedor do domínio.** Crie os registros A `app` e `painel`, ambos com o IP público da VPS. Só crie AAAA se o IPv6 da VPS funcionar. Aguarde a resolução apontar para o endereço correto.
2. **Libere TCP 80 e 443**, no firewall do provedor e no servidor. Preserve a porta SSH de manutenção (normalmente 22). Não libere bancos, 9090 ou 3000 para esse acesso. Confira se nenhum outro servidor ocupa 80/443.
3. **Preencha o `.env` da infraestrutura** conforme o [exemplo da VPS](#env-vps-dominio), com domínio, TLS e e-mail válidos. Confira os caminhos dos projetos e prepare as dependências das aplicações.
4. **Sincronize os apontamentos e suba os serviços**, a partir da pasta da infraestrutura na VPS, usando os comandos abaixo.

```bash
# Com Node.js disponível no host; confira antes os apontamentos no .env.
node docker/panel/runtime-cli.mjs --from-env
sudo docker compose config --quiet
sudo docker compose up -d --build
sudo docker compose logs --tail=100 -f traefik
```

O primeiro comando atualiza `config/apps.json` e as configurações geradas a partir do `.env`. Veja os cuidados em [aplicar mudanças](#aplicar-env-guia). Se a infraestrutura já estiver rodando e você apenas alterou domínio/TLS, use o comando de recriação dessa seção.

**O Traefik solicita o certificado automaticamente** ao carregar as rotas HTTPS; não precisa executar Certbot nem gerar arquivos manualmente. A validação HTTP chega pela porta 80. Aguarde a emissão e pressione `Ctrl+C` para sair dos logs sem parar os serviços.

5. **Teste o HTTPS** da aplicação e do painel:

```bash
curl -I --max-time 20 https://app.seudominio.com/
curl -I --max-time 20 https://painel.seudominio.com/
# Deve redirecionar para HTTPS:
curl -I --max-time 20 http://app.seudominio.com/
# Exibir emissor e validade:
openssl s_client -connect app.seudominio.com:443 -servername app.seudominio.com </dev/null 2>/dev/null | openssl x509 -noout -issuer -dates
```

Não use `curl -k`: queremos validar a confiança do certificado. Uma resposta 500 com TLS válido aponta para problema da aplicação, não necessariamente do certificado. Se a emissão falhar, confira DNS A/AAAA, acessibilidade pública de 80, e-mail e logs do Traefik. Não apague o estado ACME nem recrie a conta repetidamente para tentar corrigir a emissão.

6. **Mantenha a renovação funcionando.** O Traefik renova automaticamente; mantenha os desafios acessíveis e preserve o volume `traefik_acme`. Não use `docker compose down -v`. Consulte [monitoramento e manutenção dos certificados](#certificados) e a [documentação oficial de ACME do Traefik](https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/).

Este passo a passo é para **domínios**. HTTPS por IP usa outra configuração; veja [a diferença da implantação da VPS](#acesso-painel).

[➡️ Aplicar futuras mudanças](#aplicar-env-guia) · [⬆️ Guia](#guia-env)

<a id="aplicar-env-guia"></a>

#### 🔄 4. Depois de alterar o `.env`

O painel também mantém apontamentos em `config/apps.json`. Para usar o `.env` como fonte, sincronize antes de salvar novamente pelo painel:

```bash
node docker/panel/runtime-cli.mjs --from-env
```

**Confira antes:** esse comando reconstrói os cadastros a partir das variáveis do `.env`. Preserve nele todas as aplicações, tipos, diretórios e perfis que deseja manter; nomes personalizados do JSON podem ser substituídos. Alternativamente, configure e aplique os apontamentos pelo próprio painel. Não edite os dois lugares com valores diferentes.

Sem Node.js instalado no host, use a imagem do painel (a primeira execução pode exigir build):

```bash
sudo docker compose build panel
sudo docker compose run --rm --no-deps panel node docker/panel/runtime-cli.mjs --from-env
```

Para mudanças de portas, domínio, TLS e cookies, **não precisa rebuild**:

```bash
sudo docker compose config --quiet
sudo docker compose up -d --no-deps --force-recreate traefik panel php
```

O exemplo contempla a aplicação principal e o painel. Recrie também serviços adicionais afetados pelas variáveis que alterou. Em Laravel com cache de configuração:

```bash
sudo docker compose exec php php artisan config:cache
```

`restart` sozinho não atualiza as variáveis dos containers. Versões de runtime e extensões instaladas durante a construção exigem `--build`; veja [manutenção completa do `.env`](#manutencao). Mudar uma senha no `.env` não altera a senha de um banco já inicializado. Os comandos de recriação preservam volumes, mas interrompem brevemente os serviços envolvidos.

[🖥️ Modos de acesso ao painel](#acesso-painel) · [🔐 Certificados](#certificados) · [⬆️ Guia](#guia-env) · [⬆️ Início](#inicio)


---

<a id="octane-deploy"></a>

<a id="sec-workers-octane-e-deploy"></a>

## ⚡ Workers Octane e deploy

`OCTANE_WORKERS` define os workers e `OCTANE_MAX_REQUESTS` a reciclagem periódica. Dimensione pelo consumo real de RAM/CPU. Mudanças no `.env` exigem `docker compose up -d --force-recreate php`.

Octane mantém a aplicação em memória. Revise singletons que guardam Request/container e estado estático, evitando dados de uma requisição sobrevivendo para a próxima. A reciclagem não substitui a correção de vazamentos. Somente no modo `octane`, após deploy de código ou mudanças de configuração da aplicação:

```bash
docker compose exec php php artisan config:clear
docker compose exec php php artisan octane:reload
```

Recrie o container quando mudar imagem, extensões ou INI. Não exponha a porta administrativa 2019. O modo de desenvolvimento com observação de arquivos exige configuração adicional e dependências conforme a versão do Octane; não está habilitado automaticamente.

---

<a id="php-modulos"></a>

<a id="sec-arquivos-php-e-modulos"></a>

## 🐘 Arquivos PHP e módulos

### 🗃️ Drivers opcionais de bancos de dados

As opções no `.env` controlam a instalação **durante o build**. Todas começam em `false`:

| Variável | Instalação adicional quando `true` |
| --- | --- |
| `PHP_INSTALL_SQLSERVER` | Bloqueado; deve permanecer `false` pela política open source |
| `PHP_INSTALL_POSTGRESQL` | `pgsql`, `pdo_pgsql` |
| `PHP_INSTALL_SQLITE` | `sqlite3`, `pdo_sqlite` |
| `PHP_INSTALL_MYSQLI` | `mysqli` |

O driver básico `pdo_mysql` continua instalado para MariaDB, assim como `redis` para Valkey. `false` significa não solicitar instalação adicional; não remove módulos fornecidos pela imagem base (SQLite, por exemplo) ou adicionados manualmente em `extensions.list`. Evite duplicar na lista os drivers controlados pelas opções.

Para habilitar PostgreSQL, por exemplo, altere `PHP_INSTALL_POSTGRESQL=true` e execute:

```bash
docker compose config --quiet
docker compose build --pull php
docker compose run --rm --no-deps php php -m
docker compose run --rm --no-deps php php -r 'print_r(PDO::getAvailableDrivers());'
docker compose up -d --no-deps --force-recreate php
```

O instalador de extensões da imagem resolve as dependências de sistema. A instalação de `sqlsrv`/`pdo_sqlsrv` via ODBC Microsoft está bloqueada no painel e no build pela política de dependências open source. Essa restrição substitui a opção anterior de habilitar esse driver; a variável fica em `false` por compatibilidade. O build precisa de acesso aos repositórios. Confira a [documentação do instalador](https://github.com/mlocati/docker-php-extension-installer) e os [requisitos Microsoft](https://learn.microsoft.com/en-us/sql/connect/php/system-requirements-for-the-php-sql-driver).

Para desabilitar uma instalação opcional, volte a opção para `false` e repita o build e a recriação. `restart` ou recriação sem build não instala/remove drivers. Recrie também eventuais workers que utilizem a imagem antiga.

Essas opções instalam **clientes PHP** e não alteram a conexão principal da aplicação. O Compose fornece MariaDB como conexão principal e PostgreSQL como servidor compartilhado adicional, com backup próprio. SQL Server não é fornecido pelo Compose. Configure conexões adicionais em `config/database.php` e no `.env` de cada aplicação; veja [Bancos de dados](#bancos-painel).


### 🏷️ Escolher e atualizar a versão do PHP

A versão baixada é controlada pelo `.env` da infraestrutura, com patch explícito:

```dotenv
PHP_VERSION=8.4.27
FRANKENPHP_VERSION=1
```

O Compose passa esses valores ao Dockerfile, que utiliza `dunglas/frankenphp:${FRANKENPHP_VERSION}-php${PHP_VERSION}-bookworm`. Portanto, `PHP_VERSION` controla tanto o PHP CLI quanto o PHP do servidor FrankenPHP; não é preciso editar o Dockerfile para atualizar pelo Compose. A versão do phpMyAdmin é independente.

Quando houver uma atualização, escolha uma versão suportada e compatível com o projeto e confirme que a combinação de tags existe. Altere `PHP_VERSION` no `.env` e aplique:

```bash
docker compose config --quiet
docker compose build --pull php
# Verificar a nova imagem antes de substituir o container ativo:
docker compose run --rm --no-deps php php -v
docker compose run --rm --no-deps php composer check-platform-reqs
# Se as verificações passarem:
docker compose up -d --no-deps --force-recreate php
docker compose exec php php -v
docker compose logs --tail=100 php
```

O teste Composer exige dependências já instaladas na aplicação. Teste também os fluxos do projeto, especialmente ao mudar de série (por exemplo, 8.4 para 8.5). Se a tag não existir ou o build falhar, o container atual não é substituído pelos comandos de build acima. Recrie também eventuais workers/Scheduler avulsos para usar a nova imagem; containers antigos continuam com a versão anterior.

Os volumes são preservados. Não basta `restart`: para atualizar o PHP é necessário construir a nova imagem e recriar o container. O build normal utiliza cache; para reconstrução completa use `docker compose build --no-cache --pull php`.


`docker/php/php.ini`, `sessions.ini`, `opcache.ini` e `extensions.ini` são montados em somente leitura. Valores `${VARIAVEL}` usam o ambiente fornecido pelo Compose. `extensions.list` controla os módulos instalados por `install-php-extensions` durante o build; inclua um nome por linha. Não duplique `extension=` para módulos já habilitados. Não há mais pool FPM ou `www.conf`.

Após mudar INI, recrie `php`. Após mudar módulos ou versão, execute `docker compose build --pull php` e recrie o serviço. Confira com `php --ini`, `php -m` e logs do Octane. A imagem base é configurada por `FRANKENPHP_VERSION` e `PHP_VERSION`; confirme sempre o patch efetivo de PHP dentro da imagem após atualizar.

As sessões nativas em `sessions.ini` são diferentes das sessões do Laravel: na aplicação configure `SESSION_DRIVER`, `SESSION_LIFETIME` e cookies. Para sessões em banco, prepare a tabela com migrations; para arquivos, preserve `storage/framework/sessions`. Em HTTPS configure `PHP_SESSION_COOKIE_SECURE=1` e `SESSION_SECURE_COOKIE=true`. Preserve a recomendação de segurança `session.upload_progress.enabled=0`.

---

<a id="npm"></a>

<a id="sec-npm"></a>

## 📦 npm

```bash
docker compose run --rm node install
docker compose run --rm node run build
```

Com lockfile, prefira `ci` a `install`. `APP_NODE_VERSION`, `NODE_UID` e `NODE_GID` ficam no `.env`; ajuste IDs conforme `id -u`/`id -g`. O serviço é executado sob demanda pelo perfil `tools`, usando o mesmo diretório da aplicação.

Referências: [FrankenPHP com Laravel](https://frankenphp.dev/docs/laravel/), [Laravel Octane](https://laravel.com/docs/13.x/octane), [imagens FrankenPHP](https://frankenphp.dev/docs/docker/). Consulte a documentação correspondente à versão efetiva do seu Laravel.

---

<a id="comandos-rapidos"></a>

<a id="sec-comandos-rapidos-subir-parar-e-reconstruir"></a>

## 🚀 Comandos rápidos: subir, parar e reconstruir

### 🟢 Comando principal: construir e subir tudo

```bash
docker compose up -d --build
```

Use no primeiro início ou quando quiser construir as imagens locais e deixar a infraestrutura em execução. `up` cria/inicia os serviços e recria containers quando necessário; `-d` deixa os processos em segundo plano; `--build` constrói as imagens antes de iniciar, aproveitando o cache disponível.

Esse comando preserva os volumes existentes e inicia os serviços dos perfis habilitados em `COMPOSE_PROFILES`. Ele **não instala automaticamente as dependências Composer/npm da aplicação**, não executa migrations e não força um build sem cache. Antes de executar, configure `APP_DIRECTORY` para um projeto existente e prepare suas dependências conforme as seções anteriores.

### 🔎 Qual comando usar em cada situação?

| Comando | Finalidade | Quando usar |
| --- | --- | --- |
| `docker compose config --quiet` | Validar o Compose e a interpolação do `.env`, sem mostrar os valores | Antes de aplicar alterações; não verifica o funcionamento da aplicação |
| `docker compose up -d --build` | Construir imagens locais e subir os serviços ativos | Primeiro início ou aplicação de mudanças que incluem Dockerfile/build |
| `docker compose up -d` | Criar/iniciar e atualizar containers conforme a configuração | Rotina, depois de editar `.env` ou executar build/pull separadamente |
| `docker compose build` | Construir as imagens declaradas com `build`, sem iniciar nada | Preparar/verificar a construção antes de aplicar |
| `docker compose build --pull php` | Buscar a imagem base e construir PHP usando cache | Atualizar a base ou reconstruir PHP antes de um deploy |
| `docker compose build --no-cache --pull php` | Buscar a base e reconstruir PHP sem reaproveitar as camadas de build | Investigar problemas de cache ou exigir uma reconstrução completa |
| `docker compose up -d --force-recreate` | Substituir todos os containers ativos mesmo sem detectar mudanças | Garantir que recebam o ambiente/configuração atual; pode causar interrupção |
| `docker compose up -d --no-deps --force-recreate php` | Recriar somente PHP, sem iniciar/recriar dependências | Aplicar INI, caminho do projeto, modo do servidor ou ambiente do PHP, com dependências já disponíveis |
| `docker compose pull` | Baixar as imagens prontas dos serviços | Atualizar Traefik, MariaDB, Valkey, Node e phpMyAdmin; depois execute `up -d` |
| `docker compose stop` | Parar containers sem removê-los | Pausar a infraestrutura preservando containers e volumes |
| `docker compose start` | Iniciar os containers já criados | Retomar após `stop`, sem aplicar novas configurações |
| `docker compose restart php` | Parar e iniciar o mesmo container PHP | Reiniciar o processo; não aplica alterações de ambiente, imagem ou montagem |
| `docker compose stop php phpmyadmin` | Parar apenas os serviços indicados | Manutenção pontual, mantendo os demais em execução |
| `docker compose down` | Remover containers e redes do projeto, preservando volumes nomeados | Desmontar a infraestrutura para depois recriá-la com `up` |
| `docker compose ps -a` | Mostrar containers e seus estados | Conferir serviços ativos, parados ou com falha |
| `docker compose logs -f --tail=100 php` | Acompanhar os últimos logs e novas mensagens de PHP | Investigar inicialização ou erros; Ctrl+C encerra apenas a visualização |

> [!IMPORTANT]
> 🔄 **Build não aplica a imagem sozinho:** após `build`, execute `up -d`. **Pull também não atualiza containers sozinho.** Já `--force-recreate` recria containers, mas não obriga reconstrução das imagens. Para reconstruir e recriar em uma única operação, use `docker compose up -d --build --force-recreate`.

> [!WARNING]
> 🗄️ Recriar containers preserva volumes, mas não altera automaticamente senhas de um MariaDB já inicializado. Siga o [procedimento de troca de senha](#manutencao). Nunca acrescente `-v` a `down` durante manutenção se pretende preservar banco, certificados e Valkey.

### 🏷️ Entendendo as flags dos comandos Docker

Flags são opções que modificam um comando. Elas dependem do subcomando: uma opção de `build` não necessariamente funciona com `up`. O nome do serviço ao final, como `php`, não é uma flag: ele seleciona o serviço declarado no Compose.

#### 🔍 Lendo o comando completo

```bash
docker compose up -d --no-deps --force-recreate php
```

| Parte | O que faz neste comando |
| --- | --- |
| `docker compose` | Usa a definição de serviços desta infraestrutura |
| `up` | Cria/inicia e, quando necessário, recria containers |
| `-d` / `--detach` | Executa em segundo plano e libera o terminal |
| `--no-deps` | Não inicia as dependências do serviço selecionado |
| `--force-recreate` | Obriga a substituir o container, mesmo sem detectar mudanças |
| `php` | Seleciona apenas o serviço PHP |

Use essa combinação para aplicar configurações ao PHP quando MariaDB e Valkey já estiverem disponíveis. `--no-deps` não corrige nem garante a saúde das dependências; se elas estiverem paradas, a aplicação pode falhar. Volumes montados são preservados, mas arquivos gravados só na camada interna do container são perdidos na recriação.

Se quiser menos opções, use `docker compose up -d php`: o Compose inicia as dependências necessárias e recria o PHP se detectar mudança de configuração/imagem. Para construir e subir toda a infraestrutura, use `docker compose up -d --build`.

#### 🚀 Flags de up

| Flag | Finalidade | Quando usar |
| --- | --- | --- |
| `-d` / `--detach` | Deixar containers em segundo plano | Uso normal da infraestrutura |
| `--build` | Construir imagens antes de iniciar, aproveitando cache | Mudanças no Dockerfile ou primeiro início |
| `--force-recreate` | Forçar substituição dos containers selecionados | Garantir aplicação de configurações e montagens |
| `--no-deps` | Não iniciar dependências | Manutenção isolada com dependências já disponíveis |
| `--pull always` | Buscar imagens antes da subida | Atualizar imagens disponíveis no registro; não substitui rebuild do Dockerfile |
| `--remove-orphans` | Remover containers de serviços que saíram da definição | Após remover/renomear um serviço; confira quais containers serão afetados |
| `--wait` | Aguardar serviços em execução/saudáveis; implica modo detached | Conferir inicialização; sem healthcheck, processo rodando não garante aplicação funcional |

Documentação: [docker compose up — opções oficiais](https://docs.docker.com/reference/cli/docker/compose/up/).

#### 🏗️ Flags de build

| Flag | Finalidade | Exemplo |
| --- | --- | --- |
| `--pull` | Tentar baixar uma versão atual da imagem base | `docker compose build --pull php` |
| `--no-cache` | Não reaproveitar camadas de cache do build | `docker compose build --no-cache --pull php` |

`--no-cache` sozinho não garante uma imagem base atualizada; combine com `--pull` para isso. A construção não substitui containers em execução: aplique depois com `docker compose up -d php`.

Documentação: [docker compose build](https://docs.docker.com/reference/cli/docker/compose/build/).

#### 💻 Flags de exec e run

| Flag | Finalidade | Exemplo |
| --- | --- | --- |
| `-T` / `--no-tty` | Desabilitar o terminal virtual, útil em scripts e pipes | `docker compose exec -T php php artisan list` |
| `-u` / `--user` | Escolher usuário/UID do comando | `docker compose exec --user 1000:1000 php bash` |
| `-w` / `--workdir` | Escolher diretório de trabalho | `docker compose exec -w /var/www/html php bash` |
| `-e` / `--env` | Definir uma variável para aquela execução | `docker compose exec -e APP_ENV=local php php artisan list` |
| `--rm` em `run` | Remover o container temporário após terminar | `docker compose run --rm node --version` |
| `--entrypoint` em `run` | Substituir o programa de entrada da imagem | `docker compose run --rm --entrypoint sh node` |
| `--no-deps` em `run` | Não iniciar serviços dependentes | `docker compose run --rm --no-deps php php -v` |

`exec` executa dentro de um container já ativo; `run` cria um container novo para uma tarefa. No `docker compose exec`, interação e terminal já são habilitados por padrão: basta `docker compose exec php bash`. No comando sem Compose, o equivalente usual é `docker exec -it NOME_DO_CONTAINER bash`: `-i` mantém a entrada aberta e `-t` cria o terminal virtual.

Uma variável definida com `exec -e` vale para o processo executado, não altera permanentemente o ambiente do servidor. Para configuração permanente, edite o `.env` e recrie o serviço.

Documentação: [docker compose exec](https://docs.docker.com/reference/cli/docker/compose/exec/), [docker compose run](https://docs.docker.com/reference/cli/docker/compose/run/) e [docker container exec](https://docs.docker.com/reference/cli/docker/container/exec/).

> [!WARNING]
> ⚠️ **Maiúsculas e contexto importam:** `-T` desabilita TTY em `exec`; `-t` em `docker exec` habilita TTY. Já `docker compose down -v` remove volumes e pode apagar seus dados. Não reutilize flags de outro comando sem conferir a documentação.

### 🧰 Exemplos prontos para a rotina

Execute na pasta da infraestrutura, depois de configurar `APP_DIRECTORY` e preparar a aplicação.

```bash
# Validar sem exibir segredos
docker compose --profile tools config --quiet

# Subir toda a infraestrutura, construindo a imagem PHP
docker compose up -d --build

# Somente construir as imagens locais, sem iniciar containers
docker compose build

# Forçar reconstrução completa, sem cache, buscando a imagem base atual
docker compose build --no-cache --pull php

# Aplicar a imagem reconstruída ao serviço PHP, preservando volumes
docker compose up -d --no-deps --force-recreate php

# Recriar todos os containers com as imagens disponíveis, preservando volumes
docker compose up -d --force-recreate

# Parar toda a infraestrutura, mantendo containers e volumes
docker compose stop

# Iniciar novamente os containers já existentes
docker compose start

# Parar somente PHP
docker compose stop php

# Parar vários serviços específicos
docker compose stop php phpmyadmin

# Iniciar novamente um serviço já criado
docker compose start php

# Criar/iniciar um serviço e suas dependências, se necessário
docker compose up -d php

# Reiniciar somente um serviço, sem atualizar seu ambiente
docker compose restart php

# Remover containers e redes, preservando os volumes nomeados
docker compose down

# Conferir estado e logs
docker compose ps -a
docker compose logs -f --tail=100 php
```

**Build, rebuild e recriação são operações diferentes:** `build --no-cache` reconstrói a imagem PHP; `up --force-recreate` substitui containers usando as imagens disponíveis, sem obrigar um rebuild. Depois de reconstruir uma imagem, execute `up` para aplicá-la. Os demais serviços usam imagens prontas: atualize-as com `docker compose pull traefik mariadb phpmyadmin` e depois `docker compose up -d`.

Serviços disponíveis: `traefik`, `php`, `mariadb`, `phpmyadmin` e `node`. Node/npm é uma ferramenta sob demanda: use `docker compose run --rm node install` ou `docker compose run --rm node run build`; ele não fica ativo com o `up` padrão.

Parar/reiniciar MariaDB interrompe o acesso ao banco; parar Traefik interrompe o acesso HTTP/HTTPS. Nenhum comando acima usa `-v`: os dados persistentes são preservados. Não altere os nomes dos volumes nem `COMPOSE_PROJECT_NAME` durante esses procedimentos.

---

<a id="trocar-projeto"></a>

<a id="sec-trocar-o-diretorio-da-aplicacao-app-directory"></a>

## 📂 Trocar o diretório da aplicação (APP_DIRECTORY)

Esta infraestrutura usa FrankenPHP, sem Nginx. A variável `APP_DIRECTORY` do `.env` da infraestrutura define a pasta do projeto no host, montada em `/var/www/html` nos containers PHP e Node. O servidor tradicional lê `/var/www/html/public`; Octane inicia a aplicação a partir do mesmo projeto.

Por exemplo, para trocar da pasta X para a pasta Y:

```dotenv
# Antes
APP_DIRECTORY=/home/paulo/projetos/projeto-x
```

```dotenv
# Depois
APP_DIRECTORY=/home/paulo/projetos/projeto-y
```

Prefira caminho absoluto. Caminhos relativos são resolvidos a partir do diretório do Compose. A pasta de destino deve existir, conter `artisan`, `composer.json` e `public/index.php`, além do `.env` próprio da aplicação. Garanta permissões de leitura e escrita em `storage` e `bootstrap/cache` para o usuário do PHP. O Compose não copia nem move arquivos entre as pastas.

### 📋 Procedimento para aplicar a troca

1. Antes de editar o caminho, pare o PHP e quaisquer workers/Scheduler avulsos que ainda estejam usando o projeto antigo. Interrompa também comandos npm em execução. Se esses containers avulsos foram criados conforme os exemplos deste README, pare e remova os que existirem:

```bash
docker compose stop php
# Somente se esses containers tiverem sido criados:
docker stop --time 90 laravel-queue laravel-scheduler
docker rm laravel-queue laravel-scheduler
```

Se apenas um existir, execute os comandos somente para esse nome. Parar e remover workers permite recriá-los depois com o novo volume; `docker start` no container antigo mantém o caminho anterior.

2. Edite `APP_DIRECTORY` no `.env` da infraestrutura. Se necessário, ajuste `APP_DOMAIN`, `APP_URL` e o modo `PHP_SERVER_MODE`. O modo `octane` exige que o novo projeto já tenha o pacote instalado/configurado; use `traditional` para Laravel sem Octane.

3. Valide e prepare as dependências da nova aplicação, usando containers temporários:

```bash
docker compose config --quiet
docker compose run --rm --no-deps php composer install
# Se o projeto tiver frontend:
docker compose run --rm node ci
docker compose run --rm node run build
```

Use `npm install` no lugar de `ci` se o projeto não tiver `package-lock.json`. A imagem PHP precisa estar construída; se necessário execute `docker compose build --pull php` antes. Dependências específicas do novo projeto podem exigir ajustes de extensões e uma nova construção.

4. Limpe o cache de configuração do novo projeto e recrie o PHP para aplicar o caminho:

```bash
docker compose run --rm --no-deps php php artisan config:clear
docker compose up -d --force-recreate php
# Se mudou domínio, porta ou TLS, recrie também o proxy:
docker compose up -d --no-deps --force-recreate traefik
```

Se mudou somente `APP_DIRECTORY`, não é necessário recriar o Traefik nem reconstruir a imagem. O Node executado por `compose run --rm` já usa o novo caminho a cada execução. Recrie os workers/Scheduler avulsos somente depois de revisar a conexão com filas e o banco do novo projeto.

5. Confira o projeto montado, o estado e os logs:

```bash
docker compose exec php sh -c 'pwd; ls -ld artisan public/index.php'
docker compose ps -a
docker compose logs --tail=100 php traefik
```

Abra a URL configurada em `APP_URL` e valide o comportamento. Esses comandos não executam migrations; revise o banco de destino e as migrations antes de aplicá-las.

### 📋 O que permanece ao trocar a pasta

> [!WARNING]
> 📂 **Trocar `APP_DIRECTORY` não troca o banco nem esvazia as filas.**

 As credenciais e o banco definidos na infraestrutura continuam sendo injetados no novo projeto; o volume MariaDB e os dados do Valkey são preservados. Para aplicações diferentes, prepare banco/contas separados e isole as filas, cache e sessões (prefixos/conexões adequados ou outra instância/projeto Compose). Não processe jobs antigos com código de outra aplicação.

A pasta antiga permanece intacta no host. Para voltar, restaure o valor anterior de `APP_DIRECTORY` e repita a recriação do PHP e dos workers envolvidos. Se houve migrations ou alterações de dados, voltar apenas o caminho não desfaz essas mudanças.

`docker compose restart php` não altera o volume montado: use `up -d --force-recreate php`. Não use `down -v` para trocar o projeto.

---

<a id="manutencao"></a>

<a id="sec-manutencao-aplicar-configuracoes-sem-apagar-volumes"></a>

## 🔧 Manutenção: aplicar configurações sem apagar volumes

Execute os comandos na pasta do `compose.yaml`. `up -d --force-recreate` substitui containers e **preserva os volumes nomeados existentes**, incluindo `mariadb_data` e `traefik_acme`, além do diretório da aplicação montado do host. Arquivos gravados somente na camada interna do container são perdidos na recriação.

Não execute `docker compose down -v`, `docker volume rm` ou limpeza de volumes para aplicar configurações. Mantenha `COMPOSE_PROJECT_NAME` e os nomes dos volumes: mudá-los faz o projeto usar outros volumes, aparentando um banco vazio.

### 🔧 Alterei valores comuns no .env da infraestrutura

Para limites PHP, cookies, workers e `PHP_SERVER_MODE`:

```bash
docker compose config --quiet
docker compose up -d --no-deps --force-recreate php
docker compose logs --tail=100 php
```

Para domínio, portas, TLS, email ACME ou URL pública:

```bash
docker compose config --quiet
docker compose up -d --no-deps --force-recreate traefik php
docker compose exec php php artisan config:clear
# Somente se PHP_SERVER_MODE=octane:
docker compose exec php php artisan octane:reload
docker compose ps -a
docker compose logs --tail=100 traefik php
```

Para porta/endereço/limite de upload do phpMyAdmin:

```bash
docker compose config --quiet
docker compose up -d --no-deps --force-recreate phpmyadmin
```

Para aplicar todas as alterações de ambiente de uma vez, com os requisitos da aplicação já preparados:

```bash
docker compose config --quiet
docker compose up -d --force-recreate
docker compose ps -a
```

Esse comando pode interromper brevemente todos os serviços e não altera as senhas já armazenadas no MariaDB. `docker compose restart` apenas reinicia com o ambiente antigo; não propaga mudanças do `.env` da infraestrutura. Não é preciso executar `down` antes de `up`.

### 🔧 Alterei php.ini, sessões, OPcache ou extensões

Se mudou apenas `docker/php/*.ini`, recrie o PHP:

```bash
docker compose up -d --no-deps --force-recreate php
docker compose exec php php --ini
docker compose logs --tail=100 php
```

Se mudou o Dockerfile, `extensions.list`, `PHP_VERSION` ou `FRANKENPHP_VERSION`, reconstrua antes:

```bash
docker compose build --pull php
docker compose up -d --no-deps --force-recreate php
docker compose exec php php -v
docker compose exec php php -m
```

### 🔧 Alterei o .env da aplicação Laravel

Depois de editar o arquivo dentro de `APP_DIRECTORY`:

```bash
docker compose exec php php artisan config:clear
# Somente no modo octane:
docker compose exec php php artisan octane:reload
```

Se usa cache de configuração em produção, substitua `config:clear` por `config:cache` e recarregue Octane depois. As variáveis fornecidas pelo Compose, como `DB_PASSWORD` e `APP_URL`, têm precedência sobre o `.env` do Laravel: altere-as no `.env` da infraestrutura e recrie o serviço.

### 🔑 Trocar DB_PASSWORD de um banco já existente

> [!IMPORTANT]
> 🔑 **Mudar `DB_PASSWORD` no `.env` e recriar containers não muda a senha do usuário no banco.**

 `MARIADB_PASSWORD`, `MARIADB_ROOT_PASSWORD`, `MARIADB_USER` e `MARIADB_DATABASE` inicializam um volume vazio; não reconfiguram contas e bancos existentes.

Faça o backup descrito na seção de backup **antes** da troca. Separe a senha root atual e uma nova senha forte. Execute a alteração em janela de manutenção:

1. Pare o PHP para interromper as requisições ao banco. Pare também eventuais workers e outros processos que escrevam nesse banco.

```bash
docker compose stop php
```

2. Entre no MariaDB com a senha root **atual**. O comando abaixo pede a senha interativamente e desativa o histórico do cliente SQL:

```bash
docker compose exec -e MYSQL_HISTFILE=/dev/null mariadb mariadb --user=root --password
```

3. No prompt SQL, consulte as contas:

```sql
SELECT User, Host FROM mysql.user;
```

Identifique a conta correspondente a `DB_USERNAME`. Para o padrão desta infraestrutura (`DB_USERNAME=laravel` e conta com host `%`), execute, substituindo a senha de exemplo pela nova:

```sql
ALTER USER 'laravel'@'%' IDENTIFIED BY 'NOVA_SENHA_FORTE';
EXIT;
```

Se usuário ou host forem diferentes, ajuste ambos no SQL. Uma opção prática é gerar uma senha hexadecimal longa com `openssl rand -hex 32`; assim ela não contém aspas ou caracteres de interpolação. Não use literalmente a senha de exemplo. `ALTER USER` aplica a mudança imediatamente e não precisa de `FLUSH PRIVILEGES`.

4. Agora altere `DB_PASSWORD` no `.env` da infraestrutura para **a mesma senha**. Não altere `DB_ROOT_PASSWORD` nessa operação. Recrie os containers que recebem a credencial:

```bash
docker compose config --quiet
docker compose up -d --no-deps --force-recreate mariadb php
docker compose exec php php artisan config:clear
# Somente no modo octane:
docker compose exec php php artisan octane:reload
```

A recriação do MariaDB aqui sincroniza o ambiente do container com o `.env`; quem realmente mudou a senha foi o `ALTER USER`. O volume continua intacto. Se houver cache de configuração em produção, gere-o novamente com `config:cache` antes de recarregar os workers.

5. Confirme autenticação pela aplicação:

```bash
docker compose exec php php artisan migrate:status
docker compose ps -a
docker compose logs --tail=100 php mariadb
```

`migrate:status` consulta a conexão e o estado das migrations, sem executar migrations. Se o banco ainda não tiver a tabela de migrations, ele pode informar essa ausência; diferencie isso de erro de autenticação. No phpMyAdmin, saia e entre com a nova senha; não é necessário recriá-lo pois ele solicita a senha no login.

Se a troca falhar, mantenha a aplicação parada e alinhe a senha do `.env` com a conta do banco. Para voltar à senha anterior, entre como root e faça outro `ALTER USER`, depois restaure o valor no `.env` e recrie os serviços. Não apague o volume para resolver divergência de senha.

### 🔑 Trocar DB_ROOT_PASSWORD

Faça backup antes. Entre com o mesmo comando interativo da seção anterior usando a senha root atual, execute `SELECT CURRENT_USER();` e consulte `SELECT User, Host FROM mysql.user WHERE User = 'root';`.

Altere a conta identificada, por exemplo:

```sql
ALTER USER 'root'@'localhost' IDENTIFIED BY 'NOVA_SENHA_ROOT_FORTE';
EXIT;
```

Se houver outras contas root com hosts diferentes e que devam compartilhar a senha, altere-as explicitamente também. Atualize `DB_ROOT_PASSWORD` no `.env` para o valor aplicado e execute:

```bash
docker compose config --quiet
docker compose up -d --no-deps --force-recreate mariadb
docker compose exec -e MYSQL_HISTFILE=/dev/null mariadb mariadb --user=root --password
```

Teste o login com a nova senha e saia com `EXIT;`. Isso também mantém os comandos de backup, que leem a senha do ambiente do container, alinhados. Trocar apenas a senha root não exige trocar `DB_PASSWORD` nem recriar o PHP.

Mudar `DB_USERNAME` ou `DB_DATABASE` de um banco existente exige criar/ajustar contas, permissões ou migrar dados no MariaDB; editar esses nomes no `.env` não renomeia o banco nem os usuários.

---

<a id="terminal-containers"></a>

<a id="sec-terminal-entrar-nos-containers-e-executar-comandos"></a>

## 💻 Terminal: entrar nos containers e executar comandos

Execute os comandos Docker no terminal do host, na pasta do `compose.yaml`. O serviço precisa estar em execução para usar `exec`; confira com `docker compose ps -a`.

### 🐘 Entrar no PHP via Bash

O container do serviço PHP tem o nome fixo `php`. Assim, você pode entrar de qualquer diretório do host com:

```bash
sudo docker exec -it php bash
```

O Bash abre em `/var/www/html`, correspondente ao `APP_DIRECTORY` montado do host. Execute ali os comandos da aplicação:

```bash
php -v
php artisan list
php artisan migrate:status
composer --version
exit
```

Também pode executar sem entrar no Bash:

```bash
sudo docker exec -it php php artisan list
```

Após aplicar esta mudança pela primeira vez, recrie o container na pasta da infraestrutura:

```bash
sudo docker compose up -d --no-deps --force-recreate php
```

O diretório da aplicação e os volumes persistentes são preservados. O nome `php` precisa estar livre no Docker do host; com nome fixo, não é possível executar duas cópias desta infraestrutura simultaneamente nem escalar o serviço PHP sem ajustar/remover `container_name`. Os comandos abaixo com Compose continuam válidos.


```bash
docker compose exec php bash
```

Você estará dentro do container, no diretório `/var/www/html`, que corresponde a `APP_DIRECTORY` no host. Ali, execute os comandos normalmente, sem repetir `docker compose exec`:

```bash
pwd
php -v
php -m
composer --version
php artisan list
php artisan migrate:status
```

Para sair, digite `exit` ou pressione Ctrl+D. Sair desse shell não para o servidor da aplicação.

Se Bash não estiver disponível em outra imagem, use `sh`:

```bash
docker compose exec php sh
```

### ▶️ Executar sem abrir um shell

```bash
docker compose exec php php artisan config:clear
docker compose exec php composer check-platform-reqs
docker compose exec php php --ini
```

Para combinar comandos com recursos do shell, execute-o explicitamente:

```bash
docker compose exec php bash -lc 'pwd && php -v'
```

Não coloque senhas diretamente em comandos que possam ficar no histórico. Em scripts ou entrada por arquivo/pipe, use `-T` para desabilitar o terminal interativo, como nos exemplos de restauração deste README.

### 👤 Executar com usuário e diretório específicos

Por padrão, `exec` usa o usuário configurado no container; no PHP atual ele é root. Para evitar arquivos pertencentes a root no diretório da aplicação, você pode executar Composer/Artisan com o UID/GID do host, desde que esse usuário tenha as permissões necessárias:

```bash
docker compose exec --user "$(id -u):$(id -g)" php bash
docker compose exec --workdir /var/www/html php php artisan list
```

Usuários sem entrada no `/etc/passwd` ou sem diretório pessoal gravável podem precisar de ajustes adicionais para ferramentas que usam cache. Ajustar o usuário de um comando não altera o usuário do servidor em execução.

### 🧰 Outros containers

| Serviço | Shell interativo |
| --- | --- |
| MariaDB | `docker compose exec mariadb bash` |
| Valkey | `docker compose exec valkey sh` |
| Traefik | `docker compose exec traefik sh` |
| phpMyAdmin | `docker compose exec phpmyadmin bash` |
| Backup | `docker compose exec backup bash` |
| Vite, quando ativo | `docker compose exec vite sh` |
| SSR, quando ativo | `docker compose exec ssr sh` |

Se uma imagem não oferecer Bash, tente `sh`. Entrar no shell do MariaDB não é o mesmo que abrir o cliente SQL; para acessar o banco diretamente:

```bash
docker compose exec -e MYSQL_HISTFILE=/dev/null mariadb mariadb --user=root --password
```

Informe a senha root atual quando solicitada; use `EXIT;` para sair do cliente SQL.

### 📦 Node/npm e containers temporários

O serviço `node` é executado sob demanda e tem `npm` como entrypoint. Para abrir um shell temporário, substitua esse entrypoint:

```bash
docker compose run --rm --no-deps --entrypoint sh node
```

Dentro dele, execute `node --version`, `npm --version` ou os comandos npm do projeto. Ao sair, o container temporário é removido; arquivos gravados no diretório montado da aplicação permanecem no host.

Se PHP ainda não estiver rodando, também é possível abrir um shell temporário com a imagem já construída:

```bash
docker compose run --rm --no-deps php bash
```

`--no-deps` não inicia MariaDB/Valkey; comandos que dependem desses serviços exigem que já estejam ativos. `exec` entra em um container existente; `run --rm` cria outro container temporário com a configuração atual.

---

<a id="administracao"></a>

<a id="sec-administracao-diaria"></a>

## 🧭 Administração diária

Execute os comandos na pasta desta infraestrutura. Não publique a saída de `docker compose config` sem revisão: ela pode conter senhas. Para validar sem mostrar valores, use `--quiet`.

| Objetivo | Comando |
| --- | --- |
| Validar configuração | `docker compose --profile tools config --quiet` |
| Listar serviços declarados | `docker compose --profile tools config --services` |
| Iniciar/recriar infraestrutura | `docker compose up -d --build` |
| Ver containers, inclusive parados | `docker compose ps -a` |
| Parar tudo preservando containers e volumes | `docker compose stop` |
| Iniciar containers já criados | `docker compose start` |
| Parar um serviço | `docker compose stop php` |
| Reiniciar um serviço | `docker compose restart php` |
| Aplicar mudança de imagem ou `.env` | `docker compose up -d --force-recreate php` |
| Remover containers e rede, preservando volumes | `docker compose down` |
| Logs recentes | `docker compose logs --tail=100 --timestamps` |
| Acompanhar proxy e aplicação | `docker compose logs -f --tail=100 traefik php` |
| Consumo de CPU/memória | `docker stats --no-stream` |
| Espaço utilizado pelo Docker | `docker system df` |
| Abrir shell do PHP | `docker compose exec php sh` |

`restart` não aplica novas variáveis do `.env`; use `up -d`. Não use `down -v` ou limpeza de volumes na rotina: isso apaga banco e certificados. Alterar `COMPOSE_PROJECT_NAME` muda os nomes dos volumes usados pelo projeto.

### 🩺 Saúde dos serviços

```bash
docker compose ps -a
docker compose exec mariadb healthcheck.sh --connect --innodb_initialized
docker compose exec php php -v
docker compose exec php php -v
curl --fail --show-error --max-time 15 http://localhost/
```

Ajuste a URL do `curl` conforme `APP_URL`; na VPS use a URL HTTPS. O MariaDB tem healthcheck no Compose e deve aparecer como `healthy`. Nos demais serviços, `Up` indica que o processo está rodando, não que a aplicação esteja funcionando. Os testes de configuração não substituem uma requisição real ao Laravel. Respostas 500 exigem verificar também `storage/logs` da aplicação; 502 pede verificar FrankenPHP/Octane e suas conexões.

### 📋 Atualizar imagens

Faça backup antes de atualizar, revise as versões no `.env` e consulte as notas das imagens. Atualizações podem causar uma breve interrupção.

```bash
docker compose pull traefik php mariadb phpmyadmin node
docker compose build --pull php
docker compose up -d
docker compose ps -a
```

Atualizações de versão principal do MariaDB exigem um plano de migração próprio. Não faça downgrade de imagem sobre um volume já atualizado; restaure um backup compatível. Para voltar outras imagens, restaure a versão anterior no `.env` e recrie o serviço.

---

<a id="certificados"></a>

<a id="sec-certificados-validade-e-renovacao"></a>

## 🔐 Certificados: validade e renovação

O Traefik renova certificados ACME automaticamente enquanto está em execução. Com a duração padrão de 90 dias, ele começa a tentar renovar 30 dias antes do vencimento; consulte a [documentação oficial de renovação](https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/#automatic-certificate-renewal). Não é necessário instalar Certbot nem executar um comando periódico de renovação.

> [!WARNING]
> 🔔 Esta infraestrutura ainda não envia emails ou notificações sobre expiração.

 Monitore o certificado servido pelo domínio; não dependa apenas do email informado em `ACME_EMAIL`.

Na sua máquina ou na VPS, com OpenSSL instalado, verifique o certificado público (substitua o domínio):

```bash
CERT_DOMAIN=app.exemplo.com
openssl s_client -connect "${CERT_DOMAIN}:443" -servername "$CERT_DOMAIN" </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

`notAfter` é a data de vencimento. Para testar se expira nos próximos 15 dias, execute este bloco em Bash. O código 0 significa prazo suficiente; 1 indica vencimento próximo ou falha na consulta, ambos exigindo investigação:

```bash
(
  set -euo pipefail
  CERT_DOMAIN=app.exemplo.com
  openssl s_client -connect "${CERT_DOMAIN}:443" -servername "$CERT_DOMAIN" </dev/null 2>/dev/null \
    | openssl x509 -noout -checkend 1296000
)
```

Use esse teste diariamente em um monitor externo ou agendador conectado ao seu canal de alertas. Um monitor externo também detecta indisponibilidade da VPS. O teste acima consulta validade; para validar também confiança e nome do certificado, use `curl --fail --show-error --max-time 15 https://app.exemplo.com/` sem `-k`.

### 🚨 Se a renovação falhar

1. Consulte `docker compose logs --since=48h traefik` e procure erros de ACME, desafio, DNS e armazenamento.
2. Confirme `TRAEFIK_TLS_ENABLED=true`, domínio correto, email válido e DNS A/AAAA apontando para a VPS. Um registro IPv6 incorreto também pode impedir a validação.
3. Verifique se a porta pública 80 chega ao Traefik, se a 443 atende HTTPS e se a VPS consegue sair para a internet. Verifique se outro processo está ocupando essas portas.
4. Confira espaço em disco e a persistência do volume `traefik_acme`.
5. Após corrigir a causa, execute `docker compose up -d --force-recreate traefik` e acompanhe os logs e o certificado servido.

Recriar o container não força uma emissão imediata nem remove os limites da autoridade certificadora. Não apague `acme.json` para tentar renovar: ele contém a conta ACME e chaves privadas, e emissões repetidas podem atingir limites. Preserve esse arquivo e aguarde as novas tentativas do Traefik.

---

<a id="backup-manual"></a>

<a id="sec-backup-do-mariadb"></a>

## 🗄️ Backup do MariaDB

O bloco abaixo cria um dump lógico do banco da aplicação, incluindo triggers, rotinas e eventos. Execute em Bash; a senha é lida dentro do container, sem precisar carregar o `.env` no shell. O arquivo só recebe o nome final após concluir com sucesso.

```bash
(
  set -euo pipefail
  umask 077
  mkdir -p backups
  backup_file="backups/mariadb-$(date +%Y%m%d-%H%M%S).sql.gz"
  trap 'rm -f -- "${backup_file}.tmp"' EXIT
  docker compose exec -T mariadb sh -c \
    'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb-dump --user=root --single-transaction --quick --routines --events --triggers --hex-blob --databases "$MARIADB_DATABASE"' \
    | gzip > "${backup_file}.tmp"
  gzip -t "${backup_file}.tmp"
  mv -- "${backup_file}.tmp" "$backup_file"
  printf 'Backup criado: %s\n' "$backup_file"
)
```

`--single-transaction` mantém consistência de tabelas transacionais como InnoDB. Não execute mudanças de estrutura/migrations durante o dump. Tabelas não transacionais exigem outra estratégia, como pausa de escrita. O dump cobre o banco da aplicação, não todos os usuários e permissões do servidor.

Copie os backups para fora da VPS, com acesso restrito e criptografia. Automatize a execução e o alerta em caso de falha na sua ferramenta de backup. Defina retenção conforme sua necessidade; não mantenha a única cópia no mesmo disco do banco.

### ♻️ Restaurar um dump

Restauração modifica dados. Teste primeiro em um ambiente isolado com a mesma versão do MariaDB e um volume novo. O dump inclui o nome original do banco: não o importe no banco em uso apenas para testar.

Na recuperação planejada, mantenha o dump original, faça backup do estado atual se possível e interrompa outras escritas, incluindo workers externos. Depois:

```bash
docker compose stop php
```

Escolha o arquivo e importe (Bash):

```bash
(
  set -euo pipefail
  backup_file=backups/mariadb-AAAAMMDD-HHMMSS.sql.gz
  gzip -t "$backup_file"
  gzip -dc "$backup_file" \
    | docker compose exec -T mariadb sh -c \
      'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb --user=root'
)
```

Confirme o sucesso antes de reiniciar o acesso:

```bash
docker compose up -d php
docker compose exec php php artisan config:clear
docker compose ps -a
```

Valide os dados e os fluxos da aplicação. Uma importação sobre banco existente não remove automaticamente tabelas extras ausentes do dump. Para recuperação exata, prepare um banco limpo em procedimento separado, após confirmar o backup. `gzip -t` verifica a integridade do arquivo comprimido; somente uma restauração de teste valida a recuperação dos dados.

---

<a id="backup-arquivos"></a>

<a id="sec-backup-dos-certificados-e-arquivos-da-aplicacao"></a>

## 🛡️ Backup dos certificados e arquivos da aplicação

O dump SQL não inclui uploads, código, `.env`, `APP_KEY` ou certificados. Preserve o diretório da aplicação (principalmente uploads em `storage/app`), a configuração desta infraestrutura e o `.env` da aplicação. Preserve a `APP_KEY` original para conseguir ler os dados criptografados. Mantenha backups consistentes entre arquivos e banco.

Para copiar o estado ACME com o Traefik parado (há interrupção HTTP/HTTPS durante essa operação):

```bash
(
  set -euo pipefail
  umask 077
  mkdir -p backups
  docker compose stop traefik
  trap 'docker compose start traefik' EXIT
  acme_backup="backups/acme-$(date +%Y%m%d-%H%M%S).json"
  docker compose cp traefik:/letsencrypt/acme.json "$acme_backup"
  chmod 600 "$acme_backup"
)
```

O arquivo existe somente após inicializar o ACME. Ele contém chaves privadas: não o publique nem o versione. Para restaurar, com o container Traefik criado e parado, copie um backup válido para o volume e recupere a permissão:

```bash
docker compose stop traefik
docker compose cp backups/acme-AAAAMMDD-HHMMSS.json traefik:/letsencrypt/acme.json
docker compose run --rm --no-deps --entrypoint sh traefik -c 'chmod 600 /letsencrypt/acme.json'
docker compose start traefik
```

Após restaurar, verifique logs e validade do certificado público.

---

<a id="novos-servicos"></a>

<a id="sec-adicionar-novos-servicos"></a>

## 🧩 Adicionar novos serviços

1. Adicione o serviço em `services` no `compose.yaml`, com imagem/versionamento, volumes persistentes quando necessário e `healthcheck` adequado à imagem.
2. Coloque configurações ajustáveis no `.env` e as mesmas chaves sem segredos no `.env.example`.
3. Use a rede `app` para dependências internas. Serviços HTTP publicados pelo Traefik precisam da rede `proxy`; normalmente não precisam de `ports` no host.
4. Para um novo site, adicione uma rota e um backend em um novo arquivo YAML dentro de `docker/traefik/`. Esta infraestrutura usa **file provider**: labels Docker não são descobertas automaticamente.
5. Valide e inicie apenas o novo serviço: `docker compose config --quiet` e `docker compose up -d nome-do-servico`. Verifique seus logs e acesso real.

Por exemplo, para um serviço HTTP chamado `painel` que escuta na porta interna 3000 e já participa de `proxy`, adicione `PAINEL_DOMAIN` no `.env`/`.env.example`, forneça `PAINEL_DOMAIN: ${PAINEL_DOMAIN}` no `environment` do Traefik e crie `docker/traefik/painel.yml`:

```yaml
http:
  routers:
    painel-http:
      rule: 'Host(`{{ env "PAINEL_DOMAIN" }}`)'
      entryPoints: [web]
      service: painel
{{ if eq (env "APP_TLS_ENABLED") "true" }}
      middlewares: [force-https]
    painel-https:
      rule: 'Host(`{{ env "PAINEL_DOMAIN" }}`)'
      entryPoints: [websecure]
      service: painel
      tls:
        certResolver: letsencrypt
{{ end }}
  services:
    painel:
      loadBalancer:
        servers:
          - url: http://painel:3000
```

O middleware `force-https` já é definido por `routes.yml` quando TLS está habilitado. Adicione o DNS do novo domínio na VPS. Recrie o Traefik para receber a nova variável: `docker compose up -d --force-recreate traefik`. Acompanhe os logs para validar a rota e a emissão do certificado; a validação do Compose não valida os arquivos dinâmicos do Traefik.


---

<a id="valkey"></a>

<a id="sec-valkey-8"></a>

## ⚡ Valkey 8

O serviço `valkey` usa `valkey/valkey:8-alpine`, autenticação por senha e volume persistente `valkey_data`. Todas as opções ajustáveis estão no `.env`: versão, porta interna, senha, memória máxima, política de memória, AOF e frequência de sincronização. Não há porta publicada no host nem rota Traefik.

O PHP inclui a extensão `redis` (PhpRedis) e recebe `REDIS_CLIENT=phpredis`, `REDIS_HOST=valkey`, `REDIS_PORT` e `REDIS_PASSWORD` automaticamente. Para instalar a nova extensão e iniciar:

```bash
docker compose config --quiet
docker compose build --pull php
docker compose up -d
docker compose ps -a
```

A conexão está preparada, mas os drivers da aplicação não foram alterados automaticamente. Para usar Valkey no Laravel, configure no `.env` da aplicação as opções suportadas pela sua versão, por exemplo:

```dotenv
CACHE_STORE=redis
SESSION_DRIVER=redis
QUEUE_CONNECTION=redis
```

Versões antigas podem usar `CACHE_DRIVER` em vez de `CACHE_STORE`. Limpe/refaça o cache de configuração e recarregue workers Octane, se habilitados. Usar fila Redis exige um worker Laravel separado para processar os jobs.

### 🩺 Saúde e comandos

```bash
docker compose logs --tail=100 valkey
docker compose exec valkey sh -c 'REDISCLI_AUTH="$VALKEY_PASSWORD" valkey-cli -p "$VALKEY_PORT" ping'
docker compose exec valkey sh -c 'REDISCLI_AUTH="$VALKEY_PASSWORD" valkey-cli -p "$VALKEY_PORT" info memory'
docker compose stop valkey
docker compose start valkey
```

Ao alterar `VALKEY_*` no `.env`, aplique:

```bash
docker compose config --quiet
docker compose up -d --force-recreate valkey php
docker compose exec php php artisan config:clear
# Somente no modo octane:
docker compose exec php php artisan octane:reload
```

Diferentemente do MariaDB, a senha Valkey desta configuração é aplicada a cada inicialização. Recrie também outros clientes/workers que usem a senha antiga. Haverá breve interrupção durante a troca. Os dados persistem no volume.

AOF com `everysec` pode perder aproximadamente o último segundo de escrita em uma falha. `noeviction` recusa novas escritas ao atingir o limite, preservando chaves existentes; monitore memória e erros. Para cache descartável isolado, uma política como `allkeys-lru` pode ser escolhida, mas ela pode remover sessões e jobs se compartilharem a mesma instância. Bancos lógicos não isolam a política de expulsão. A memória do processo pode ultrapassar `VALKEY_MAXMEMORY` devido a buffers e operações de persistência.

### 💾 Backup persistente do Valkey

Para copiar todo o diretório de dados de forma consistente, pare o serviço durante a cópia (os clientes ficarão indisponíveis):

```bash
(
  set -eu
  umask 077
  mkdir -p backups
  docker compose stop valkey
  trap 'docker compose start valkey' EXIT
  valkey_backup="backups/valkey-$(date +%Y%m%d-%H%M%S)"
  mkdir "$valkey_backup"
  docker compose cp valkey:/data/. "$valkey_backup/"
)
```

Copie o backup para fora da VPS e teste a restauração em instância isolada com versão compatível. Preserve o diretório AOF completo, incluindo manifestos. Não misture arquivos antigos com um backup ao restaurar. `docker compose down -v` apaga também o volume Valkey.

---

<a id="filas-scheduler"></a>

<a id="sec-filas-jobs-e-laravel-scheduler"></a>

## ⏱️ Filas, jobs e Laravel Scheduler

Jobs são classes da aplicação; filas guardam os jobs pendentes no Valkey; um worker Artisan os processa. O Scheduler dispara tarefas nos horários definidos no Laravel e pode enviar jobs para a fila. Esses processos independem de usar FrankenPHP tradicional ou Octane.

**Alternativa manual:** serviços permanentes são gerados pelo painel com IDs próprios; não existem serviços fixos chamados `queue` ou `scheduler`. Os comandos abaixo permitem execução manual ou containers avulsos. Não execute `docker compose stop queue` nesta configuração: esse serviço ainda não existe. Nenhum Supervisor é necessário para executar Artisan; reinício automático requer serviços próprios no Compose com política de restart.

### 📋 Preparar a aplicação

Configure `QUEUE_CONNECTION=redis` no `.env` da aplicação. O serviço PHP já recebe host, porta e senha do Valkey. Prepare a aplicação e as tabelas de registro de jobs falhos conforme as migrations da sua versão; revise antes de executar `php artisan migrate`.

```bash
docker compose up -d mariadb valkey php
docker compose exec php php artisan config:clear
docker compose exec php php artisan list
# Criar a classe de um job na aplicação
docker compose exec php php artisan make:job ProcessarRelatorio
```

Implemente `handle()` e mantenha `ShouldQueue` na classe para processamento assíncrono. A aplicação envia o job com `ProcessarRelatorio::dispatch(...)`; criar a classe não agenda nem executa o job automaticamente. Argumentos e efeitos dependem do código da aplicação. Jobs devem tolerar novas tentativas sem duplicar efeitos.

### ▶️ Executar a fila no terminal

```bash
# Processar continuamente a fila default
docker compose exec php php artisan queue:work redis --queue=default --sleep=3 --tries=3 --timeout=60

# Priorizar uma fila antes de outra
docker compose exec php php artisan queue:work redis --queue=alta,default --sleep=3 --tries=3 --timeout=60

# Processar até esvaziar a fila e sair
docker compose exec php php artisan queue:work redis --queue=default --stop-when-empty --tries=3 --timeout=60
```

Os dois primeiros comandos ocupam o terminal. Use Ctrl+C para interromper a execução interativa; um job em andamento precisa de tempo para terminar. Não use `exec -d` para um worker permanente: ele não ganha supervisão própria nem logs separados pelo Docker.

Configure `retry_after` da conexão Redis em `config/queue.php` para um tempo maior que `--timeout`; por exemplo, timeout 60 e retry_after 90. Ajuste ambos a jobs longos e permita tempo de parada maior que a duração esperada do job. Caso contrário, jobs podem ser reentregues enquanto ainda estão executando.

### ▶️ Executar em container separado e administrar

Para um teste em segundo plano, use um container avulso com nome explícito. Ele reutiliza imagem, ambiente e volumes do serviço PHP, mas executa apenas o worker:

```bash
docker compose run -d --no-deps --name laravel-queue php php artisan queue:work redis --queue=default --sleep=3 --tries=3 --timeout=60

# Ver estado e logs
docker ps -a --filter name=laravel-queue
docker logs -f --tail=100 laravel-queue

# Parar permitindo até 90 segundos para encerrar
docker stop --time 90 laravel-queue

# Retomar o mesmo container, com a configuração original
docker start laravel-queue

# Reiniciar o mesmo container
docker restart --time 90 laravel-queue
```

O nome deve ser único no host. Não há reinício automático garantido para esse container avulso. `docker start`/`restart` não aplicam mudanças no ambiente ou imagem. Para atualizá-lo após trocar senha, imagem ou `.env`, pare, remova e execute novamente o comando de criação:

```bash
docker stop --time 90 laravel-queue
docker rm laravel-queue
# Reexecute docker compose run -d ... acima com a configuração atual.
```

Remover esse container não apaga os jobs no Valkey. Para produção, prefira declarar o worker como serviço no Compose com `restart: unless-stopped` e `stop_grace_period: 90s`, ajustando ao seu timeout. Os exemplos avulsos não substituem essa configuração.

### 📋 Recarregar workers após deploy

```bash
docker compose exec php php artisan queue:restart
```

O comando solicita que workers terminem após o job atual; **não inicia novos workers**. Um serviço Compose com política de restart pode iniciá-los novamente após a saída. Nos exemplos manuais/avulsos, inicie novamente o processo/container quando ele sair. Todos os workers devem usar o mesmo cache e prefixo para receber o sinal. Isso é independente de `octane:reload`, que recarrega somente o servidor HTTP Octane.

### 📋 Listar filas, jobs pendentes e falhas

Artisan não oferece em todas as versões uma listagem universal de cada job pendente. Você pode consultar o tamanho da fila pelo Laravel Tinker, se ele estiver instalado:

```bash
docker compose exec php php artisan tinker
```

No prompt Tinker:

```php
Illuminate\Support\Facades\Queue::connection('redis')->size('default');
exit;
```

Isso mostra o tamanho reportado pelo driver, não uma lista dos conteúdos ou histórico dos jobs. Evite inspecionar/modificar payloads diretamente no Valkey. Para erros registrados e novas tentativas:

```bash
# Listar jobs falhos (requer armazenamento de falhas configurado)
docker compose exec php php artisan queue:failed

# Reenviar um job falho: substitua ID_DO_JOB pelo identificador listado
docker compose exec php php artisan queue:retry ID_DO_JOB

# Reenviar todos os jobs falhos; use após corrigir a causa
docker compose exec php php artisan queue:retry all
```

Os retries voltam para a fila e exigem um worker ativo. Para monitorar tamanho, `queue:monitor redis:default --max=100` pode ser usado conforme sua versão; o evento de fila ocupada precisa de tratamento na aplicação para enviar alertas. Laravel Horizon pode oferecer painel de filas compatíveis, mas não está instalado nesta infraestrutura.

### ▶️ Scheduler: listar e executar tarefas

Defina as tarefas em `routes/console.php` nos Laravel recentes ou no Kernel de console conforme a versão do projeto.

```bash
# Listar tarefas registradas e próximas execuções
docker compose exec php php artisan schedule:list

# Executar as tarefas que estão devidas agora (não todas indiscriminadamente)
docker compose exec php php artisan schedule:run

# Manter o agendador rodando no terminal
docker compose exec php php artisan schedule:work
```

Para execução avulsa em segundo plano:

```bash
docker compose run -d --no-deps --name laravel-scheduler php php artisan schedule:work
docker logs -f --tail=100 laravel-scheduler
docker stop --time 90 laravel-scheduler
docker start laravel-scheduler
docker restart --time 90 laravel-scheduler
```

As mesmas limitações dos containers avulsos se aplicam: para atualizar ambiente/imagem, pare, remova com `docker rm laravel-scheduler` e crie novamente. Para produção, declare um serviço dedicado com política de restart. Se usar cron do host em vez de um processo contínuo, execute `schedule:run` a cada minuto; não mantenha cron e `schedule:work` simultaneamente para a mesma agenda.

Mantenha apenas um agendador para evitar duplicidade, salvo quando usar os mecanismos de bloqueio do Laravel com cache compartilhado. Parar o Scheduler impede novos disparos, mas não cancela automaticamente jobs já enfileirados nem outros workers. Para manutenção completa, pare também os produtores de jobs e os workers e aguarde as tarefas em andamento.

Referências: [filas Laravel](https://laravel.com/docs/13.x/queues) e [Scheduler Laravel](https://laravel.com/docs/13.x/scheduling). Verifique `php artisan help NOME_DO_COMANDO` e a documentação da versão da sua aplicação antes de usar opções específicas.

---

<a id="frontend"></a>

<a id="sec-laravel-puro-inertia-vite-hmr-e-ssr"></a>

## 🎨 Laravel puro, Inertia, Vite/HMR e SSR

A infraestrutura suporta esses cenários por configuração no `.env`. Os pacotes, scripts npm, páginas e configuração SSR precisam existir no projeto apontado por `APP_DIRECTORY`; ligar um perfil não instala nem transforma automaticamente a aplicação.

| Cenário | `COMPOSE_PROFILES` | `INERTIA_SSR_ENABLED` |
| --- | --- | --- |
| Laravel puro ou Inertia com assets compilados | vazio | `false` |
| Desenvolvimento com Vite/HMR | `vite` | `false` |
| Produção com Inertia SSR | `ssr` | `true` |

As opções são independentes de `PHP_SERVER_MODE=traditional`/`octane`. `COMPOSE_PROFILES=vite,ssr` permite executar os dois serviços, mas só use quando a aplicação realmente exigir essa combinação. Inertia recente pode integrar SSR ao próprio Vite em desenvolvimento.

### 📋 Preparação e assets compilados

```bash
docker compose run --rm node ci
# Ou install, caso não haja package-lock.json
docker compose run --rm node run build
docker compose up -d --build
```

Não é necessário manter Node rodando para servir os assets compilados: FrankenPHP os serve de `public`.

### ⚡ Vite em desenvolvimento

No `.env` da infraestrutura, use `COMPOSE_PROFILES=vite`. O serviço executa o script indicado por `VITE_NPM_SCRIPT` (padrão `dev`), escutando em `VITE_PORT` com porta fixa e publicando em `VITE_BIND_ADDRESS`. O host HMR é o endereço que **o navegador** acessa, normalmente `localhost`, não o nome Docker `vite`.

O projeto precisa consumir as opções HMR na propriedade `server` do seu `vite.config.js`/`vite.config.ts`. O modelo `docker/node/vite-server.example.js` mostra o objeto necessário: copie/adapte mantendo os plugins Laravel/Vue/React existentes. As variáveis são fornecidas ao container Vite pelo Compose; não é necessário copiar o `.env` inteiro da infraestrutura para a aplicação. O CLI já configura bind, porta e strictPort; as opções adicionais precisam dessa integração no projeto.

```bash
docker compose up -d vite php
docker compose logs -f --tail=100 vite
docker compose stop vite
```

Acesse a aplicação pela URL normal, por exemplo http://localhost. Os assets e WebSocket HMR usam http://localhost:5173 e ws, por padrão. Se os arquivos não atualizarem no ambiente Docker, habilite `VITE_USE_POLLING=true` e recrie Vite.

Para desativar, pare e remova o serviço **antes** de limpar o perfil:

```bash
docker compose stop vite
docker compose rm -f vite
docker compose run --rm node exec -- node -e "require('fs').rmSync('public/hot', {force:true})"
docker compose run --rm node run build
```

Depois deixe `COMPOSE_PROFILES=` no `.env`. Remover `public/hot` evita que Laravel tente carregar assets do servidor de desenvolvimento parado. Esse caminho é o padrão Laravel; ajuste se seu projeto usa outro hot file. Não exponha Vite como servidor de produção. Desenvolvimento sobre HTTPS exige também TLS/proxy para Vite e WebSocket: mudar apenas `VITE_HMR_PROTOCOL=wss` não instala certificado nem cria proxy. O cenário padrão HMR aqui usa HTTP local.

### 🖥️ Inertia SSR em produção

No `.env` use `COMPOSE_PROFILES=ssr`, `INERTIA_SSR_ENABLED=true`, `SSR_PORT=13714` e `SSR_BUNDLE=bootstrap/ssr/ssr.js` (ajuste para o bundle real). O serviço SSR executa diretamente Node; não requer PHP no container Node nem publica porta no host.

Prepare a aplicação conforme a sua versão do Inertia:

1. Instale as dependências SSR e configure o entrypoint servidor no Vite.
2. Garanta que o script de build gere tanto assets cliente quanto bundle SSR. Starter kits podem usar `build:ssr`; outros projetos usam `build` para ambos.
3. Em `config/inertia.php`, garanta que `ssr.enabled` leia `env('INERTIA_SSR_ENABLED', false)` e `ssr.url` leia `env('INERTIA_SSR_URL', 'http://127.0.0.1:13714')`. O Compose fornece `http://ssr:SSR_PORT` ao PHP.
4. O servidor do bundle deve escutar em uma interface acessível aos containers (não apenas loopback). Garanta que o entrypoint SSR use `Number(process.env.SSR_PORT || 13714)` na configuração da porta de `createServer`, conforme a API da versão instalada. A variável sozinha não muda um bundle com porta fixa.

```bash
docker compose run --rm node ci
# Use o script que seu package.json fornece:
docker compose run --rm node run build:ssr
docker compose up -d --force-recreate php ssr
docker compose exec php php artisan config:clear
# Apenas no modo octane:
docker compose exec php php artisan octane:reload
docker compose logs --tail=100 ssr php
```

Depois de atualizar o bundle, reinicie SSR: `docker compose restart ssr`. Mudanças em caminho, porta, versão Node ou ambiente exigem `docker compose up -d --force-recreate ssr php`. Para verificar a integração, quando disponível na sua versão use `docker compose exec php php artisan inertia:check-ssr` e teste uma página Inertia verificando o HTML retornado. O processo Node em execução por si só não comprova renderização correta.

Para desativar SSR, pare/remova `ssr`, retire o perfil e defina `INERTIA_SSR_ENABLED=false`; recrie PHP e limpe/refaça o cache Laravel. Antes de trocar `APP_DIRECTORY`, pare/remova também Vite e SSR; recrie-os para montar o novo caminho.

Referências: [Vite no Laravel](https://laravel.com/docs/13.x/vite) e [SSR no Inertia](https://inertiajs.com/server-side-rendering). A infraestrutura fornece os processos; a compatibilidade depende das versões e configurações efetivas do projeto.

---

<a id="backup-automatico"></a>

<a id="sec-backup-automatico-do-mariadb-configuracao-e-operacao"></a>

## 💾 Backup automático do MariaDB: configuração e operação

O serviço `backup` agora executa dumps automaticamente, sem cron no host. Ele usa cliente da mesma série do MariaDB, gera `.sql.gz` e `.sha256`, valida a leitura gzip e só aplica retenção após sucesso. Usa root para incluir rotinas/eventos. `BACKUP_DATABASES=*` cobre todos os bancos de aplicação, um dump por banco; uma lista separada por vírgulas limita a seleção. Contas e permissões globais do servidor não são incluídas. O dump transacional exige InnoDB e ausência de alterações de estrutura durante a execução.

### 📋 Configurar no .env

| Variável | Função/padrão |
| --- | --- |
| `BACKUP_ENABLED` | `true` habilita a agenda; `false` mantém serviço ocioso |
| `BACKUP_DIRECTORY` | Pasta do host, padrão `./backups/mariadb`; pode ser absoluta |
| `BACKUP_DATABASES` | `*` para todos os bancos de aplicação ou lista como `erp,financeiro` |
| `BACKUP_SCHEDULE` | Cron com cinco campos, padrão `"0 3 * * *"` |
| `BACKUP_TIMEZONE` | Fuso da agenda, padrão `America/Sao_Paulo` |
| `BACKUP_RUN_ON_START` | Executar também ao iniciar/recriar o serviço |
| `BACKUP_RETENTION_DAYS` | Remover arquivos locais mais antigos que N dias; `0` preserva todos |
| `BACKUP_MAX_AGE_HOURS` | Idade máxima do último ciclo bem-sucedido para healthcheck |
| `BACKUP_REMOTE_ENABLED` | Habilitar upload S3; padrão `false` |
| `BACKUP_REMOTE_PREFIX` | Pasta/prefixo dentro do bucket, exclusivo desta aplicação |
| `BACKUP_S3_PROVIDER` | `AWS` ou `Other` para serviço S3 compatível |
| `BACKUP_S3_BUCKET` | Nome do bucket existente |
| `BACKUP_S3_REGION` | Região do serviço |
| `BACKUP_S3_ENDPOINT` | Vazio para AWS; URL HTTPS para S3 compatível |
| `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | Credenciais de upload |
| `BACKUP_S3_ENV_AUTH` | `true` para cadeia de credenciais AWS/IAM role, `false` para chaves explícitas |

Exemplos de agenda: `"0 */6 * * *"` a cada seis horas; `"30 2 * * 0"` aos domingos às 02h30. Para semanal, aumente `BACKUP_MAX_AGE_HOURS`, por exemplo para 192. A agenda não recupera automaticamente horários perdidos com a VPS desligada; `BACKUP_RUN_ON_START=true` cria uma cópia ao reiniciar.

Use uma pasta exclusiva para os dumps desta aplicação, fora de `APP_DIRECTORY`. Ela será criada como diretório bind pelo Docker se não existir; arquivos são gravados com permissão restrita e podem pertencer a root. Não reutilize uma pasta de outra aplicação: a retenção considera arquivos `mariadb-*.sql.gz` desse diretório. `BACKUP_RETENTION_DAYS=14` significa idade, não quantidade mínima de 14 cópias; o backup recém-criado é sempre preservado.

### ▶️ Iniciar, executar agora, parar e consultar

```bash
docker compose config --quiet
docker compose build --pull backup
docker compose up -d backup
docker compose logs -f --tail=100 backup
docker compose ps -a backup
```

Para executar um ciclo imediato, independentemente de `BACKUP_ENABLED`:

```bash
docker compose run --rm --no-deps backup once
```

MariaDB precisa estar ativo e saudável. Um lock na pasta impede duas execuções simultâneas; se houver um backup em andamento, o comando manual falha sem criar outro. Para pausar o serviço use `docker compose stop --timeout 300 backup`; para retomar `docker compose start backup`. Espere um ciclo ativo terminar antes de parar quando possível. A interrupção forçada pode deixar `.tmp`, que não é tratado como backup válido.

### ☁️ Envio para fora da VPS

Crie um bucket privado e forneça as credenciais no `.env`, então habilite `BACKUP_REMOTE_ENABLED=true`. Para S3 compatível, preencha também endpoint/região e `BACKUP_S3_PROVIDER=Other`. A implementação usa [rclone copyto](https://rclone.org/commands/rclone_copyto/); não faz sincronização destrutiva nem apaga objetos remotos. SFTP não está implementado nesta rotina.

Use credenciais restritas ao bucket/prefixo, com permissões de consulta e envio necessárias ao provedor. Ative criptografia e política de retenção/versionamento no armazenamento remoto. O script comprime, mas não faz criptografia local dos arquivos. Não envie credenciais reais ao Git.

O upload tem novas tentativas; se falhar, o dump local permanece, o ciclo é marcado como falha e a retenção não roda. No ciclo seguinte, arquivos sem marcador `.uploaded` também são enviados novamente. O marcador indica envio confirmado pelo rclone; não substitui restauração de teste. O sucesso remoto recebe também o checksum `.sha256`.

A retenção configurada é **somente local**. Configure expiração/lifecycle no bucket para retenção remota. Se trocar bucket, prefixo ou credenciais, arquivos já marcados não são reenviados automaticamente: os próximos backups usam o novo destino. Para migrar o histórico, copie explicitamente os arquivos e checksums com uma ferramenta de armazenamento.

### 🔧 Quando mudar o .env: comandos para aplicar

**Agenda, fuso, habilitação, retenção, pasta, idade máxima ou opções S3:**

```bash
docker compose config --quiet
# Aguarde backup ativo terminar; então:
docker compose stop --timeout 300 backup
docker compose up -d --no-deps --force-recreate backup
docker compose logs --tail=100 backup
```

Não precisa reconstruir a imagem para mudar esses valores. `restart` não atualiza as variáveis. Trocar `BACKUP_DIRECTORY` não move as cópias antigas; preserve/migre a pasta anterior explicitamente. `BACKUP_RUN_ON_START=true` faz um novo backup após a recriação.

**Senha root do banco:** siga primeiro o procedimento `ALTER USER` da seção de senhas. Depois de atualizar `DB_ROOT_PASSWORD`, recrie também o backup, pois ele recebe essa credencial:

```bash
docker compose up -d --no-deps --force-recreate mariadb backup
docker compose run --rm --no-deps backup once
```

**Banco de origem (`DB_DATABASE`):** o backup usa `BACKUP_DATABASES`; com `*`, novos bancos entram no próximo ciclo. Para seleção explícita, altere também essa lista e recrie `backup`. Prepare o banco e as permissões no MariaDB antes; editar o `.env` não cria banco em volume existente. Recrie `php` e `backup` e execute um backup manual para verificar o destino correto. Trocar somente `DB_PASSWORD` não muda a credencial deste backup, que usa root.

**Imagem do MariaDB ou código/Dockerfile do backup:** faça backup antes de atualizações de banco e revise compatibilidade; depois reconstrua o cliente:

```bash
docker compose build --pull backup
docker compose up -d --no-deps --force-recreate backup
```

**Outras configurações da infraestrutura:** os procedimentos de manutenção anteriores continuam válidos. Para aplicar o ambiente a todos os serviços ativos sem apagar os volumes:

```bash
docker compose config --quiet
docker compose up -d --force-recreate
```

Use `--build` se também mudou arquivos de construção. Serviços opcionais desabilitados por perfil precisam ser parados/removidos explicitamente antes de retirar o perfil. Nenhum desses procedimentos exige `down -v`.

### ♻️ Saúde, falhas e restauração

```bash
docker compose ps -a backup
docker compose logs --since=24h backup
docker compose exec backup python3 /opt/backup/backup.py health
```

O healthcheck falha se o último ciclo falhou ou se não há sucesso recente dentro de `BACKUP_MAX_AGE_HOURS`; desabilitar a agenda faz a verificação retornar sucesso sem indicar proteção ativa. Um estado `unhealthy` **não envia alerta nem reinicia automaticamente o serviço**. Configure seu monitoramento para notificar falhas e teste isso. Os logs exibem sucesso local, upload, erro e próximo horário.

Para verificar um arquivo, entre na pasta configurada por `BACKUP_DIRECTORY` no host:

```bash
sha256sum -c mariadb-ARQUIVO.sql.gz.sha256
gzip -t mariadb-ARQUIVO.sql.gz
```

Para restaurar, use o procedimento de restauração já descrito, indicando o caminho real em `BACKUP_DIRECTORY` ou uma cópia baixada do bucket. Antes, confira checksum e gzip. Teste regularmente em um banco isolado: validação de arquivo não comprova que a aplicação será recuperada.

Este serviço não inclui uploads, `.env`, APP_KEY, certificados ou dados Valkey; as respectivas orientações de backup anteriores continuam necessárias. Backup remoto não foi ativado nem testado com um provedor, pois nenhum destino/credencial foi fornecido.

---

[⬆️ Voltar ao início](#inicio) · [🚀 Comandos rápidos](#comandos-rapidos) · [🔧 Manutenção](#manutencao) · [💾 Backups](#backup-automatico)

### 🩺 Valkey 8 com healthcheck sem autenticação

Valkey 8 usa `REDISCLI_AUTH` no cliente de linha de comando. `VALKEYCLI_AUTH` é uma opção de versões posteriores e não deve ser usada aqui. O healthcheck desta infraestrutura envia a senha por `REDISCLI_AUTH` e exige resposta `PONG`.

Se uma instalação anterior ficou `unhealthy` por esse motivo, aplique a correção sem remover volumes:

```bash
docker compose config --quiet
docker compose up -d --no-deps --force-recreate valkey
docker compose up -d
docker compose ps -a
```

Não precisa reconstruir imagens: a correção é no Compose. Se continuar falhando, consulte `docker compose logs --tail=80 valkey`; não ignore a dependência de saúde nem apague os dados.

<a id="sec-paginas-de-erro-do-servidor"></a>

## 🎭 Páginas de erro do servidor

No modo `traditional`, `docker/php/errors` contém páginas independentes do Laravel para 404, 500, 502, 503 e 504. A configuração do Caddy captura esses status em navegações HTML, preservando o código HTTP. Respostas da aplicação para API e requisições com `X-Inertia` não são substituídas. Os handlers de falhas internas do servidor também usam as páginas estáticas.

As páginas não corrigem o erro: um Laravel sem dependências continuará retornando 500. Consulte os logs para diagnóstico. Não são exibidos caminhos, senhas ou detalhes de exceções. Em produção, mantenha `APP_DEBUG=false` na aplicação.

```bash
docker compose config --quiet
docker compose run --rm --no-deps php frankenphp validate --config /etc/frankenphp/Caddyfile --adapter caddyfile
docker compose up -d --no-deps --force-recreate php
curl -i -H 'Accept: text/html' http://localhost/rota-inexistente
```

Edite o HTML diretamente para personalizar; não precisa reconstruir a imagem. No modo Octane, o servidor usa a configuração do pacote Octane e este Caddyfile não se aplica: personalize as páginas no Laravel ou integre um Caddyfile específico compatível com a versão do Octane. Erros gerados pelo próprio Traefik (como backend PHP desligado) também não passam pelo handler do FrankenPHP e não usam essas páginas.

<a id="sec-erro-500-detalhado-em-desenvolvimento-local"></a>

## 🔎 Erro 500 detalhado em desenvolvimento local

Para ver erros nativos PHP, incluindo arquivo/linha quando o PHP os fornece, configure no `.env` da infraestrutura:

```dotenv
PHP_DISPLAY_ERRORS=On
```

Com `On`, o Caddyfile tradicional deixa passar a resposta original em vez de substituí-la pelas páginas estáticas. Isso também preserva a página detalhada do Laravel. O erro continua sendo registrado nos logs; nenhuma causa ou stack trace é inventada pela página de fallback.

Para exceções que o Laravel trata, configure também **no `.env` da aplicação**:

```dotenv
APP_ENV=local
APP_DEBUG=true
```

Aplique:

```bash
docker compose config --quiet
docker compose up -d --no-deps --force-recreate php
docker compose exec php php artisan config:clear
# Apenas se estiver no modo Octane:
docker compose exec php php artisan octane:reload
```

Se `vendor` não existir, instale dependências antes de executar Artisan: `docker compose run --rm --no-deps php composer install`. Se o Laravel não chegar a inicializar, seus próprios erros não podem ser renderizados; consulte `docker compose logs --tail=100 php`.

Em produção, use `PHP_DISPLAY_ERRORS=Off`, `APP_DEBUG=false` e `APP_ENV=production`. Detalhes de erro podem revelar caminhos, código e dados internos. `PHP_DISPLAY_ERRORS` não altera automaticamente `APP_DEBUG`. O modo Octane usa seu próprio servidor/configuração, portanto a preservação via Caddyfile se aplica somente ao modo tradicional.

A página estática 500 apresenta uma mensagem genérica ao visitante, sem identificar tecnologias, dependências ou procedimentos internos. O diagnóstico fica nos logs e nesta documentação.

---

<a id="multiplas-aplicacoes"></a>

<a id="sec-varias-aplicacoes-com-subdominios"></a>

## 🏘️ Várias aplicações com subdomínios

A aplicação principal continua usando `APP_DIRECTORY`, `APP_DOMAIN`, `APP_URL` e o container `php`. Agora existem **dois slots adicionais opcionais**, `app2` e `app3`. Cada aplicação tem um processo FrankenPHP próprio; todas compartilham Traefik, MariaDB e Valkey. Não é necessário publicar outra porta HTTP.

### 🎛️ Configurar no .env

Exemplo com a porta 80 e dois projetos adicionais:

```dotenv
HTTP_PORT=80
APP_DOMAIN=localhost
APP_URL=http://localhost
APP_DIRECTORY=/home/paulo/projetos/principal
COMPOSE_PROFILES=app2,app3

APP_2_DIRECTORY=/home/paulo/projetos/financeiro
APP_2_DOMAIN=financeiro.localhost
APP_2_URL=http://financeiro.localhost
APP_2_SERVER_MODE=traditional
APP_2_DOCUMENT_ROOT=/var/www/html/public

APP_3_DIRECTORY=/home/paulo/projetos/site
APP_3_DOMAIN=site.localhost
APP_3_URL=http://site.localhost
APP_3_SERVER_MODE=traditional
APP_3_DOCUMENT_ROOT=/var/www/html
```

Use `/var/www/html/public` para Laravel e `/var/www/html` para PHP convencional com `index.php` na raiz. O document root deve conter apenas arquivos públicos; nunca exponha a raiz de um projeto Laravel. Diretórios precisam existir. Para aplicações PHP convencionais, o fallback de rotas segue o comportamento do servidor FrankenPHP; ajuste o Caddyfile se o projeto exigir regras específicas.

Com `HTTP_PORT=80`, mantenha a mesma porta para todos, incluindo nas URLs: `http://financeiro.localhost`. Os domínios não incluem porta. Navegadores modernos normalmente resolvem subdomínios `.localhost` para loopback; se seu ambiente não resolver, adicione no `/etc/hosts`:

```text
127.0.0.1 localhost financeiro.localhost site.localhost
```

Na VPS, use domínios/subdomínios reais com DNS apontado para o mesmo IP. O TLS global se aplica também aos slots ativos. `localhost` continua sendo a aplicação principal, sem encaminhar domínios desconhecidos para ela.

### 🚀 Preparar bancos e subir

Configure `APP_2_DB_*` e `APP_3_DB_*` no `.env`. Há senhas geradas no `.env` real; substitua os exemplos se usar `.env.example`. Cada slot deve usar banco e usuário exclusivos. Para criar bancos/usuários novos sem apagar o volume:

```bash
sudo docker compose up -d mariadb valkey
sudo python3 scripts/apps.py app2 db-init
sudo python3 scripts/apps.py app3 db-init
sudo docker compose up -d --build --force-recreate
```

`db-init` só cria o banco se não existir, cria o usuário se não existir e concede permissões sobre o banco escolhido. Não troca a senha de contas existentes, não executa migrations e não copia dados. Para trocar senha existente, siga a seção de `ALTER USER`. Revise banco/usuário antes de executar para evitar compartilhar contas entre projetos.

As aplicações extras reutilizam Dockerfile, versão PHP, extensões e INIs da principal. Cada uma pode escolher modo tradicional/Octane e document root; Octane requer instalação no respectivo projeto. Versões PHP diferentes por aplicação não estão configuradas nesta versão.

### 🧰 Gerenciador de aplicações

Execute da pasta da infraestrutura (use `sudo` apenas se necessário):

```bash
# Aplicação principal: main; demais slots: app2 e app3
sudo python3 scripts/apps.py app2 status
sudo python3 scripts/apps.py app2 composer install
sudo python3 scripts/apps.py app2 npm ci
sudo python3 scripts/apps.py app2 npm run build
sudo python3 scripts/apps.py app2 up
sudo python3 scripts/apps.py app2 shell
sudo python3 scripts/apps.py app2 artisan list
sudo python3 scripts/apps.py app2 logs
sudo python3 scripts/apps.py app2 stop
```

O comando `up` recria a aplicação e o Traefik; registre o perfil em `COMPOSE_PROFILES` para que o domínio seja publicado e a aplicação também suba com o comando geral. O helper não edita seu `.env`. `composer` e `npm` usam containers temporários, portanto podem preparar dependências antes de subir a aplicação. Comandos Artisan via `artisan` exigem o serviço ativo.

Também pode usar comandos Docker diretamente:

```bash
sudo docker exec -it php bash
sudo docker exec -it php-app2 bash
sudo docker exec -it php-app3 bash
sudo docker compose --profile app2 up -d --force-recreate php-app2 traefik
```

Para mudar pasta, domínio, senha ou modo de um slot, edite o `.env` e execute seu comando `up`; trocar senha MariaDB exige antes `ALTER USER`. Para desativar, pare/remova o container antes de retirar `app2`/`app3` de `COMPOSE_PROFILES`, e recrie Traefik:

```bash
sudo docker compose --profile app2 stop php-app2
sudo docker compose --profile app2 rm -f php-app2
# Edite COMPOSE_PROFILES no .env, removendo app2.
sudo docker compose up -d --no-deps --force-recreate traefik
```

Os dados do banco e os arquivos do projeto permanecem. Retirar o perfil sozinho não remove containers antigos.

### 🗄️ Isolamento e limites do compartilhamento

Os slots recebem `REDIS_PREFIX`, `REDIS_DB` e `REDIS_CACHE_DB` próprios, configuráveis no `.env`. Confirme que cada projeto usa essas variáveis em `config/database.php`; também mantenha nomes de cookies/sessões exclusivos e não configure cookies com domínio amplo `.localhost`. Bancos lógicos e prefixos organizam os dados, mas não criam uma barreira de segurança entre containers com acesso ao mesmo Valkey.

A política de memória do Valkey e seus recursos continuam compartilhados. Os bancos MariaDB extras são atendidos pelo mesmo servidor; phpMyAdmin permite login com os usuários de cada projeto. O backup automático atual cobre apenas `DB_DATABASE` da aplicação principal: prepare dumps dos bancos extras e seus uploads antes de depender deles em produção.

Os serviços Vite/SSR existentes continuam ligados à aplicação principal. Os cadastros adicionais suportam PHP, Node.js e aplicações estáticas, com ferramentas npm sob demanda; Vite/SSR por slot exigem serviços adicionais. Não ative SSR nos slots apenas mudando o perfil global `ssr`. As aplicações PHP compartilham a configuração de erro/diagnóstico desse runtime; mantenha detalhes desativados ao publicar na VPS.

---

<a id="painel-administrativo"></a>

<a id="sec-jubart-painel-administrativo"></a>

## Jubart: painel administrativo

O painel Node.js gerencia os serviços deste projeto Docker Compose, com uma interface local inspirada no fluxo de ferramentas de gerenciamento de proxy. Ele oferece:

- **Visão geral:** estado dos containers, healthchecks e logs recentes.
- **Serviços:** iniciar, parar e reiniciar os serviços declarados no Compose, com confirmação.
- **Aplicações:** configurar os slots `main`, `app2` e `app3`, seus domínios, diretórios, raízes públicas, modos e portas HTTP internas.
- **Proxy:** editar portas públicas, endereço de publicação, TLS e email ACME.
- **Volumes:** consultar volumes e montagens, sem apagar dados.

### 🔑 Acesso e credenciais

Veja [como acessar localmente, por túnel SSH ou URL pública, com as portas necessárias](#acesso-painel).

O `.env` da infraestrutura contém:

```dotenv
PANEL_USERNAME=paulo
PANEL_PASSWORD=defina-uma-senha-forte-com-pelo-menos-16-caracteres
PANEL_BIND_ADDRESS=127.0.0.1
PANEL_PORT=9090
PANEL_WORKSPACE_DIRECTORY=/caminho/absoluto/infra-comserv
PANEL_PROJECTS_DIRECTORY=/caminho/absoluto/projetos
PANEL_COOKIE_SECURE=false
```

O `.env` real recebeu uma senha aleatória. Consulte-a no seu editor; ela não é exibida nos logs ou no painel. Use sua própria senha forte se preferir. O exemplo acima não é uma senha recomendada. A sessão dura oito horas e é encerrada quando o painel reinicia. Cookies são HttpOnly/SameSite Strict; há proteção de operações por token CSRF e limite de tentativas de login.

`PANEL_WORKSPACE_DIRECTORY` precisa ser o caminho absoluto **real no host** desta pasta. `PANEL_PROJECTS_DIRECTORY` deve conter os projetos que deseja vincular; é montado com escrita no painel para gerenciar arquivos dos projetos, nos mesmos endereços do host. Os containers PHP recebem suas montagens individuais com escrita conforme o Compose. Projetos fora dessa árvore precisam de montagem adicional no serviço `panel` para a validação dos caminhos.

Para construir e subir tudo, incluindo o painel:

```bash
sudo docker compose config --quiet
sudo docker compose up -d --build
```

Acesse **http://localhost:9090**. O acesso não depende do funcionamento do Laravel, Traefik ou MariaDB. Para subir apenas o painel:

```bash
sudo docker compose up -d --build panel
sudo docker compose logs --tail=100 panel
```

> [!WARNING]
> 🔐 O painel monta o socket Docker para administrar containers e a pasta da infraestrutura para atualizar configurações. Esse acesso equivale a privilégio administrativo no host. Mantenha a porta HTTP do painel em `127.0.0.1` e use senha forte. Para acesso remoto, siga [os modos de acesso e portas](#acesso-painel): túnel SSH ou proxy HTTPS. Exemplo de túnel SSH: `ssh -N -L 9090:127.0.0.1:9090 usuario@IP_DA_VPS`. O painel só oferece operações sobre serviços do projeto e não permite shell arbitrário ou exclusão de volumes, mas isso não reduz o privilégio do socket em caso de comprometimento do painel.

### 📝 Arquivo JSON de apontamentos

Os apontamentos ficam em **`config/apps.json`**, separado das senhas. O arquivo é inicializado com a configuração atual do `.env`. Exemplo de uma entrada dentro de `applications`:

```json
{
  "id": "app2",
  "name": "Financeiro",
  "enabled": true,
  "directory": "/home/paulo/projetos/financeiro",
  "domain": "financeiro.localhost",
  "documentRoot": "/var/www/html/public",
  "mode": "traditional",
  "port": 8000
}
```

`port` é a porta **interna** do servidor PHP, não uma nova porta publicada no host. Cada container pode usar 8000 independentemente; Traefik lê os destinos correspondentes. Os domínios compartilham as portas públicas configuradas em `proxy.httpPort` e `proxy.httpsPort`. A principal mantém `id=main`, container `php` e pode continuar em `localhost`.

O JSON suporta novos cadastros pelo botão Nova aplicação, até 100 aplicações, sem gerenciar projetos de outros arquivos Compose. As aplicações do tipo PHP compartilham a base de construção e os INIs; Node.js e Estática usam seus próprios runtimes. O painel não instala pacotes Composer/npm, não executa migrations, não cria usuários/bancos e não migra arquivos. A área Filas & Scheduler gerencia serviços Artisan registrados separadamente. Prepare esses requisitos conforme as seções anteriores.

### ✅ Salvar e aplicar

1. Entre em **Aplicações** e ajuste o diretório, domínio e modo. Para Laravel use `/var/www/html/public`; para PHP convencional, a pasta pública apropriada ao projeto.
2. Em **Proxy & acessos**, configure a entrada compartilhada. Para desenvolvimento HTTP, mantenha TLS desativado.
3. Clique em **Salvar configurações**. Isso guarda um rascunho; não interrompe containers.
4. Clique em **Aplicar configuração** e confirme. O painel valida o JSON, verifica os diretórios, valida o Compose, atualiza somente as variáveis de apontamento/proxy no `.env` e reconstrói/recria aplicações ativas e Traefik.
5. Acompanhe o resultado no aviso e os estados dos serviços. Aplicações extras desabilitadas são paradas e seus containers removidos; diretórios e volumes permanecem.

As senhas existentes no `.env` são preservadas. O painel guarda uma cópia do `.env` anterior em `.panel-state/env-before-apply`, com acesso restrito e fora do Git. Se uma etapa de Docker falhar **após** atualizar o `.env`, ele permanece com os valores novos para facilitar a investigação; não há rollback automático de containers. Consulte o erro, corrija e reaplique. Para recuperar manualmente a configuração anterior:

```bash
# Revise o conteúdo do backup local antes de substituir o .env atual.
sudo cp .panel-state/env-before-apply .env
sudo chmod 600 .env
sudo docker compose config --quiet
sudo docker compose up -d --build --force-recreate
```

Esse backup inclui segredos: não publique nem versione `.panel-state`. Cada aplicação de configuração substitui essa cópia de recuperação; ela não é um histórico de versões nem substitui backups externos.

**Se editar os apontamentos no `.env` manualmente**, use `node docker/panel/runtime-cli.mjs --from-env` no terminal e recarregue o painel. O painel não apresenta mais a opção de importar `.env`. Não mantenha alterações concorrentes nos dois arquivos: o painel usa o JSON salvo ao aplicar, enquanto comandos CLI usam o `.env`. Se editar o JSON diretamente, atualize/reabra o painel antes de continuar; alterações concorrentes de rascunho são rejeitadas por revisão.

### 🔧 Alterações do painel e comandos de manutenção

| Alteração | Aplicação |
| --- | --- |
| Usuário, senha ou cookie no `.env` | `sudo docker compose up -d --no-deps --force-recreate panel` |
| Porta/endereço do painel | Mesmo comando acima; acesse a nova porta depois |
| Caminhos `PANEL_WORKSPACE_DIRECTORY` / `PANEL_PROJECTS_DIRECTORY` | Confira que existem e recrie `panel` |
| Código HTML/CSS/JS ou backend do painel | `sudo docker compose up -d --build --no-deps panel` |
| JSON editado no painel | Salvar configurações → Aplicar configuração |
| Extensões PHP, credenciais de bancos e demais serviços | Procedimentos específicos já descritos neste README |

O painel não pode parar/reiniciar a si próprio pela interface. Use o terminal:

```bash
sudo docker compose stop panel
sudo docker compose start panel
sudo docker compose logs -f --tail=100 panel
```

Os controles de serviços nunca executam `down -v`, nem removem volumes. Parar MariaDB/Valkey afeta todas as aplicações; parar Traefik interrompe a entrada HTTP/HTTPS. O healthcheck é mostrado como indisponível para serviços sem verificação própria; processo em execução não garante que uma aplicação esteja respondendo corretamente.

Vite e SSR por slot, bancos extras e backup de todos os projetos continuam sujeitos às limitações descritas na seção de múltiplas aplicações. O painel não fornece métricas históricas, terminal remoto ou monitoramento com alertas.

### 🧪 Testes do painel

O painel usa APIs nativas do Node.js, sem dependências npm de runtime. Os testes cobrem validação, atualização do `.env`, autenticação, CSRF, escopo do projeto e aplicação com Docker simulado:

```bash
node --test docker/panel/test/*.test.mjs
```

Esses testes não iniciam nem alteram seus containers reais. Para validação operacional após subir, confira login, estado dos serviços, logs e uma alteração de apontamento em uma aplicação de teste.

---

<a id="sec-painel-filas-jobs-e-laravel-scheduler"></a>

## ⏱️ Painel: filas, jobs e Laravel Scheduler

Essas informações também podem ser consultadas no terminal com `jubart queues`, `jubart workers`, `jubart jobs --failed` e `jubart schedules`. Use `--app main` ou outro ID para filtrar e `--watch` para acompanhar; **q** ou **Ctrl+C** encerra a visualização. `jubart jobs` mostra o catálogo de jobs cadastrados.

A área **Filas & Scheduler** do Jubart gerencia o trabalho em segundo plano de cada aplicação Laravel. Funciona nos modos tradicional e Octane; não exige Supervisor. Os processos usam a imagem, o diretório e as credenciais do respectivo projeto.

### 🚀 Aplicar esta atualização

```bash
sudo docker compose config --quiet
# Recria o PHP para montar a ponte administrativa; reconstrói o painel atualizado.
sudo docker compose up -d --build --force-recreate
```

Acesse http://localhost:9090, abra **Filas & Scheduler** e selecione a aplicação. Para projetos extras já ativos, a recriação monta a ponte neles também. Nenhum worker/agendador é criado automaticamente pela atualização: você os registra e inicia pela interface quando o projeto estiver preparado.

A infraestrutura agora usa `COMPOSE_FILE=compose.yaml:config/automation.compose.json` no `.env`. Esse segundo arquivo contém os serviços gerados para workers e agendadores, sem gravar senhas. Comandos normais como `docker compose up`, `stop`, `ps` e `down` passam a incluí-los. Caso você use `-f compose.yaml` explicitamente, inclua também `-f config/automation.compose.json` para operar esses serviços.

### 📋 Cadastrar e operar uma fila

1. Na aplicação, configure `QUEUE_CONNECTION=redis` (Valkey) ou `database`, de acordo com seu projeto. Confirme as conexões em `config/queue.php`, a autenticação e as tabelas necessárias, inclusive para registros de falhas.
2. No painel, registre o nome da fila, conexão, tentativas, timeout, intervalo de espera e prazo de parada. O cadastro começa **parado**; não altera código nem dispara jobs.
3. Clique em **Iniciar**. O painel valida a conexão e exige `retry_after` maior que o timeout antes de criar o worker. Cada fila cadastrada possui um serviço próprio, com `restart: unless-stopped` e prazo de parada configurado.
4. Consulte contagens, estado e logs. Use **Parar** para interromper aquele consumidor ou **Recriar** para receber imagem/ambiente atuais. Remover o cadastro para e remove o container gerado, sem limpar jobs pendentes ou volumes.

As contagens são consultadas pelo driver Laravel. A interface mostra o total e, quando a versão oferece os métodos, pendentes, reservados e atrasados. Ela só monitora filas cadastradas; não descobre todas as filas existentes no Valkey automaticamente, não lista payloads e não apresenta histórico completo de execução. Em caso de erro de conexão, a consulta é indicada como indisponível, não como fila vazia.

**Parar um worker não apaga a fila nem bloqueia produtores.** Jobs novos podem continuar chegando. Outros consumidores externos da mesma fila também podem continuar trabalhando. O processo recebe um sinal de parada e tem o prazo configurado para concluir o job atual; após esse prazo, o Docker pode encerrá-lo à força. Dimensione timeout, `retry_after` e `stop_grace_period` e implemente jobs idempotentes para tolerar novas tentativas.

Para mudar tentativas/timeout/nome, pare e remova o cadastro e registre novamente. Recriar usa os valores já cadastrados, além da imagem e `.env` atuais. Não execute simultaneamente os workers manuais dos exemplos anteriores e o painel para a mesma fila sem planejar a concorrência.

### 📦 Registrar e enviar jobs

O job precisa existir na aplicação. Pelo terminal do container correspondente, por exemplo:

```bash
sudo docker compose exec php php artisan make:job GerarRelatorio
```

Implemente o método `handle()`, mantenha `ShouldQueue` e o trait `Queueable`. Depois registre no painel o nome de exibição e a classe, por exemplo `App\Jobs\GerarRelatorio`.

O botão **Enfileirar** permite escolher uma fila cadastrada da mesma aplicação e informar argumentos posicionais do construtor em um array JSON:

```json
[123, "mensal"]
```

Para um construtor sem argumentos, use `[]`. Argumentos que dependem de objetos/modelos PHP não são reconstruídos automaticamente a partir de JSON; prefira IDs/valores simples e carregue os dados dentro do job. O painel não aceita PHP arbitrário nem objetos serializados.

O cadastro é apenas um catálogo; ele não cria a classe e não a agenda automaticamente. O envio é uma ação explícita, pode causar efeitos reais ao ser consumido e não deve ser repetido apenas porque a página demorou a responder. Os argumentos são enviados à ponte por entrada padrão e não ficam salvos no cadastro JSON; o Laravel pode armazená-los no payload da fila e em seus logs conforme o projeto.

### 🚨 Falhas e novas tentativas

O painel consulta até 30 falhas recentes quando o Laravel usa `database`/`database-uuids` para registros de jobs falhos. Mostra ID, conexão, fila e data, sem expor payload ou exceção completa. Outros provedores, tabela ausente ou falha de conexão são informados como consulta indisponível.

Use **Reenviar** somente após corrigir a causa. O comando adiciona novamente o job à fila, não o executa sem worker. Um job que terminou com sucesso não aparece na lista de falhas; isto não é um histórico/auditoria de todos os jobs.

### 🗓️ Scheduler

Registre **um agendador por aplicação** e clique em **Iniciar** para executar `php artisan schedule:work` em serviço separado. A tela apresenta a saída de `schedule:list`, incluindo próximas execuções quando o Laravel as fornece. É possível parar, recriar e consultar os logs.

As tarefas e seus horários continuam definidos no projeto (`routes/console.php` ou Kernel de console, conforme a versão). Para agendar um job na aplicação, por exemplo:

```php
use App\Jobs\GerarRelatorio;
use Illuminate\Support\Facades\Schedule;

Schedule::job(new GerarRelatorio(), 'relatorios', 'redis')->dailyAt('03:00');
```

Adapte os argumentos do job e configure o fuso da aplicação. Cadastre a fila `relatorios` e inicie seu worker para processar o job enviado. O Scheduler e o worker cumprem papéis diferentes: um dispara no horário; o outro consome a fila.

**Executar tarefas devidas** chama `schedule:run` agora, com confirmação. Não antecipa todas as tarefas nem altera os horários. Evite usar enquanto outro Scheduler/cron dispara a mesma agenda, para não duplicar execuções. Parar o agendador impede novos disparos por esse processo, mas não cancela jobs já enfileirados.

O painel não edita código nem registra expressões cron de tarefas na aplicação. Para mudanças da agenda, altere o projeto e recrie o processo Scheduler pelo painel, ou siga o procedimento de deploy apropriado. Não mantenha um cron do host e esse agendador para a mesma agenda sem os mecanismos de bloqueio do Laravel.

### 🗂️ Cadastro e ciclo de vida

- `config/automation.json`: catálogo de filas/workers, agendadores e classes de jobs.
- `config/automation.compose.json`: serviços gerados; não edite manualmente. Habilitados usam o perfil `automation`; parados usam `automation-disabled`.
- `COMPOSE_PROFILES`: o painel adiciona/remove `automation` conforme houver processos habilitados, preservando os perfis de aplicações, Vite e SSR.

Os cadastros sobrevivem ao reinício do painel. Para **parar e manter parado em próximas subidas**, use o botão Parar da área de automações, que também atualiza o cadastro. `docker compose stop` pausa containers, mas não muda a configuração habilitada; uma nova subida pode iniciá-los novamente.

Ao aplicar apontamentos pelo painel, os processos de automação são parados antes da recriação das aplicações e depois recriados se habilitados; automações de aplicações desabilitadas também são desabilitadas. Isso evita manter workers no diretório antigo. Se mudar diretórios/imagens/credenciais manualmente, recrie também os serviços gerados, ou use a aplicação completa:

```bash
sudo docker compose up -d --build --force-recreate
```

No painel, serviços gerados aparecem também na visão geral, com atalho para sua área de gerenciamento. Os testes automatizados usam Docker e Laravel simulados; valide a conexão, um job de teste sem efeitos externos e a agenda no seu projeto antes de operar tarefas reais.

Referências: [filas Laravel](https://laravel.com/docs/13.x/queues) e [Scheduler Laravel](https://laravel.com/docs/13.x/scheduling).

### 🎨 Confirmações visuais do painel

Ações como parar serviços, recriar containers, aplicar configurações, reenviar jobs e disparar tarefas usam modais no estilo do painel. O modal explica o efeito da ação e apresenta botões com nomes específicos. Paradas e remoções têm destaque de atenção.

O foco começa em **Cancelar**; Escape, o botão de fechar ou um clique fora cancelam sem executar a ação. Confirmações repetidas não abrem operações duplicadas. Para aplicar uma atualização apenas do painel:

```bash
sudo docker compose up -d --build --no-deps panel
```

Atualize a página no navegador depois da reconstrução. O aviso de saída com alterações não salvas continua sob controle do navegador, pois é uma proteção de navegação.

<a id="sec-logs-detalhes-dos-containers-e-console-web"></a>

## 📜 Logs, detalhes dos containers e console web

Na visão geral, cada serviço agora oferece **Detalhes**, com ID curto, imagem, data de criação, última inicialização, último encerramento, código de saída, reinícios, diretório de trabalho e portas publicadas. As principais informações também aparecem na tabela, como no `docker ps -a`. Datas são exibidas no fuso do navegador. São dados do container atual, não um histórico de todas as execuções: recriar um container reinicia seu histórico e a contagem de reinícios.

### 📥 Exportar e limpar logs

Abra **Logs** no serviço ou na área de automações:

- **Atualizar:** consulta até 1.000 linhas recentes do serviço, com timestamps.
- **Exportar .log:** baixa o texto exibido na janela, já com a ocultação de segredos conhecidos pelo painel.
- **Limpar visualização:** esvazia somente a janela. Atualizar pode trazer as mensagens anteriores novamente.
- **Limpar histórico do painel:** após confirmar, registra um marco de tempo e passa a consultar apenas mensagens posteriores daquele serviço, para todos os acessos ao painel.

O marco de tempo fica em `.panel-state/log-cutoffs.json`. A limpeza **não trunca arquivos do Docker, não reduz o espaço ocupado pelo driver e não apaga `storage/logs` da aplicação**. Não altere manualmente arquivos internos de log do Docker; para limitar uso de disco, configure rotação de logs no daemon/serviços conforme seu driver. Exportações são recortes da consulta, não backups completos de todos os logs.

Os controles funcionam também para logs de workers e Scheduler. O serviço do painel permite consultar logs, mas não pode parar/reiniciar a si mesmo pela interface.

### 💻 Executar comandos no container

Na guia **Aplicações**, use o botão **Terminal** da aplicação desejada. Ele reutiliza o terminal interativo dos serviços e abre no container correspondente, em `/var/www/html` para PHP/Estática ou no diretório de trabalho configurado para Node.js. A aplicação precisa estar salva, habilitada, aplicada e com exatamente um container em execução. O backend utiliza o cadastro salvo, não os valores do rascunho.

Não existe bloqueio de `cd ..`: a navegação segue as permissões e os arquivos disponíveis no container. Aplicações estáticas mantêm o volume do projeto somente leitura. Use um shell instalado na imagem. A funcionalidade exige administrador ou permissão explícita para o recurso, além de `PANEL_TERMINAL_ENABLED=true`, como o terminal dos serviços.

O `.env` controla a disponibilidade:

```dotenv
PANEL_TERMINAL_ENABLED=true
```

Depois de alterar, recrie o painel. Para aplicar também o código novo:

```bash
sudo docker compose up -d --build --no-deps panel
```

O botão **Terminal** aparece nos serviços gerenciáveis em execução. Clique nele, escolha `sh` ou `bash` e clique em **Conectar ao container**. A confirmação mostra o serviço, o shell e os impactos; depois de confirmar, **os comandos digitados executam diretamente, sem confirmação individual**, como em um terminal Linux.

O terminal usa [xterm.js](https://xtermjs.org/) (licença MIT) e uma sessão **TTY do Docker**. A saída aparece continuamente, sem esperar o comando terminar. Antes de conectar, a tela mostra uma orientação em vez de um terminal vazio. Após conectar, digite diretamente na área escura ou use o campo **Comando ou resposta ao programa** e pressione Enter/Enviar. Para menus com setas e programas interativos, clique na área escura ou em **Focar terminal**. É possível responder a perguntas, selecionar opções com as setas, completar comandos com Tab e usar programas interativos disponíveis na imagem. Não é necessário instalar Node.js ou um agente no container de destino.

- **Enter:** envia o comando ou a resposta ao prompt.
- **Setas / Tab:** navegação e autocompletar, conforme o shell/programa.
- **Ctrl+C:** interrompe o processo em primeiro plano; há também um botão equivalente.
- **Ctrl+D ou `exit`:** encerra o shell.
- **Maximizar:** aumenta a área e informa o novo tamanho ao TTY.
- **Limpar visualização:** limpa a área visível, sem desfazer comandos.
- **Exportar visualização:** baixa o texto disponível na tela e no histórico limitado do terminal; não é um registro completo de auditoria.

A sessão abre **dentro do container selecionado**, com o usuário e diretório definidos pelo container. No PHP, `/var/www/html` corresponde ao volume da aplicação. `cd`, `export` e o histórico do shell persistem durante a sessão. Por exemplo:

```bash
pwd
cd /var/www/html
php -v
php artisan list
php artisan migrate:status
```

A imagem precisa fornecer o shell escolhido. Se `bash` não estiver instalado, use `sh`; recursos como autocompletar, histórico e editores dependem das ferramentas disponíveis. Para tarefas permanentes, cadastre workers/serviços em vez de manter um terminal aberto.

Há uma sessão interativa ativa por instância do painel. O limite anterior de 25 segundos não se aplica ao TTY: a sessão encerra após **15 minutos sem entrada** ou **uma hora de duração**. Fechar a janela, desconectar, perder a conexão ou sair do painel encerra a sessão e envia HUP ao shell conhecido no container. Processos em segundo plano podem continuar; fechar o terminal não desfaz alterações. Reiniciar o container interrompe a sessão.

O terminal exige administrador completo ou concessão explícita por aplicação/serviço, `PANEL_TERMINAL_ENABLED=true`, sessão autenticada e CSRF nas operações de entrada/controle. O backend verifica se o container está em execução e pertence ao serviço/projeto Compose; outra sessão de login não pode assumir o terminal aberto. Contas restritas só recebem os terminais selecionados pelo administrador; chaves MCP não recebem esse acesso. Enquanto o terminal estiver ativo, operações administrativas protegidas podem pedir que você o encerre antes.

A comunicação usa a mesma origem HTTP/HTTPS do painel, com streaming e mensagens autenticadas; **não há porta pública adicional**. Proxies intermediários precisam permitir streaming sem buffering e conexões duradouras. Use os [modos de acesso seguros do painel](#acesso-painel).

A auditoria registra quem abriu/encerrou a sessão e qual serviço foi usado, sem armazenar teclas ou saída. O shell e as ferramentas podem gravar seu próprio histórico dentro do container. Comandos e exportações podem conter informações sensíveis; eles executam com os privilégios do container e podem alterar arquivos do volume e dados da aplicação.

Para usar o terminal pelo host, a alternativa continua sendo:

```bash
sudo docker exec -it php bash
```

Se não quiser permitir essa funcionalidade, defina `PANEL_TERMINAL_ENABLED=false` e recrie `panel`. Use túnel SSH ou proxy HTTPS, conforme as [instruções de acesso](#acesso-painel).

### 📋 Listagem e edição de aplicações no painel

A tela Aplicações apresenta uma lista compacta com nome, indicação de principal (`main`) ou adicional, domínio, modo, porta interna e estado de habilitação/execução. Clique na linha, no nome ou em **Ver detalhes** para abrir a edição. Os botões também podem ser acessados pelo teclado.

A janela separa identificação, arquivos e execução. **Cancelar** ou Escape descartam as alterações daquela janela. **Guardar no rascunho** atualiza apenas os dados na interface; depois use **Salvar configurações** e **Aplicar configuração** para persistir e atualizar os containers. A aplicação principal permanece habilitada.

Para atualizar o painel após esta mudança:

```bash
sudo docker compose up -d --build --no-deps panel
```

<a id="sec-metricas-ao-vivo-cpu-memoria-e-requisicoes"></a>

## 📈 Métricas ao vivo: CPU, memória e requisições

A guia **Métricas ao vivo** do painel apresenta:

- CPU e RAM agregadas do projeto, com gráficos e consumo por container.
- CPU individual, memória usada/limite, PIDs, entrada/saída de rede e I/O de disco, a partir de `docker stats`.
- Requisições HTTP/HTTPS acumuladas, requisições por segundo, respostas 5xx e latência média por intervalo, a partir do exporter Prometheus embutido no Traefik.
- Contadores por rota de aplicação, coletados apenas após existir tráfego.

No terminal, use `jubart monitor` para acompanhar recursos e gráficos, `jubart traffic` para acompanhar tráfego ou `jubart memory` para consultar RAM do host e dos containers. Dentro do console `jubart>`, omita o prefixo. Use `--help` em cada comando para consultar filtros e opções; **q** ou **Ctrl+C** encerra o acompanhamento.

Não é necessário instalar um servidor Prometheus para essa visualização. O painel consulta diretamente o endpoint interno do Traefik. A porta de métricas não é publicada no host; o painel participa da rede proxy para acessá-la.

### 🚀 Ativar a atualização

É necessário atualizar **painel e Traefik**, pois a contagem de requisições depende do exporter habilitado:

```bash
sudo docker compose config --quiet
sudo docker compose up -d --build --no-deps --force-recreate panel traefik
```

Abra http://localhost:9090 e selecione **Métricas ao vivo**. Gere acessos às aplicações pela URL normal do Traefik e aguarde ao menos duas amostras para taxas de tráfego e latência. Há botões para pausar/retomar a atualização e coletar manualmente.

No `.env`:

```dotenv
PANEL_METRICS_INTERVAL_MS=5000
TRAEFIK_METRICS_PORT=8082
```

O intervalo é limitado entre 3 e 60 segundos para evitar consultas excessivas. Após alterá-lo, recrie `panel`. Se mudar a porta interna de métricas, recrie `panel` e `traefik`. Ela precisa estar livre dentro do container Traefik; não use suas portas HTTP/HTTPS. Não é a porta de acesso ao painel.

### 📏 Como interpretar

**CPU do projeto:** soma dos percentuais Docker dividida pelo número de CPUs do host Docker. A tabela individual usa percentual de um núcleo: um container pode ultrapassar 100% quando usa vários núcleos. A memória agregada também considera somente os containers deste projeto; as porcentagens não representam toda a máquina. No Docker Desktop, a capacidade pode ser a da VM Docker, não a memória/CPU total do computador.

**Rede e I/O:** bytes acumulados são os contadores atuais dos containers; taxas de rede são calculadas entre amostras. Tráfego interno entre containers também entra na soma, portanto isso não equivale apenas à banda da internet. I/O de disco indica bytes lidos/escritos, não espaço ocupado pelos volumes. PIDs refletem os processos/threads reportados pelo Docker.

**Requisições:** incluem tráfego recebido pelos entrypoints `web` e `websecure`, e não incluem o endpoint de métricas. São requisições, não visitantes únicos, sessões ou usuários. Chamadas diretas ao container que não passam pelo Traefik não entram na contagem. Serviços de banco/cache não têm contadores HTTP próprios nesta guia.

**Latência:** média calculada pela diferença de soma/duração entre duas amostras, em milissegundos. Não é p95/p99 nem tempo de carregamento completo do navegador. Sem requisições novas, a latência aparece como indisponível, não como zero.

### 🕘 Histórico e limites

O painel guarda até 120 amostras em memória, compartilhadas entre usuários autenticados, coletadas enquanto a guia solicita dados. Com intervalo de cinco segundos, são aproximadamente dez minutos de amostras contínuas. Fechar/ocultar a guia ou pausar a atualização suspende as consultas daquele navegador. Reiniciar o painel perde o histórico dos gráficos; reiniciar Traefik reinicia seus contadores, e a taxa aguarda uma nova base antes de voltar.

Quando Docker ou Traefik não puderem ser consultados, a interface indica falha/coleta parcial. Não substitui dados ausentes por zero. A coleta requer acesso ao mesmo Docker já configurado para o painel; não agrega outros projetos.

Esta guia não é armazenamento histórico durável, monitoramento com alertas ou cobrança de uso. Para histórico de dias/meses, alertas e percentis, pode-se adicionar Prometheus/Grafana posteriormente. Referências: [Docker stats](https://docs.docker.com/reference/cli/docker/container/stats/) e [métricas do Traefik](https://doc.traefik.io/traefik/reference/install-configuration/observability/metrics/).

<a id="bancos-painel"></a>

<a id="sec-bancos-de-dados-mariadb-e-postgresql-compartilhados"></a>

## 🗄️ Bancos de dados: MariaDB e PostgreSQL compartilhados

A guia **Bancos de dados** permite selecionar MariaDB ou PostgreSQL e administrar os bancos sem excluir dados. Cada servidor tem seu volume persistente, contas e serviço de backup independentes. As aplicações podem compartilhar esses servidores usando bancos e usuários distintos.

### 🚀 Aplicar esta atualização

Na pasta da infraestrutura, execute:

```bash
sudo docker compose up -d --build
```

Esse comando constrói o painel e os dois serviços de backup e cria o PostgreSQL, preservando os volumes existentes. Aguarde os bancos ficarem saudáveis e atualize a página do painel. Não precisa executar `down`.

```bash
sudo docker compose ps -a
sudo docker compose logs --tail=100 postgres backup-postgres panel
```

O `.env` atual já contém as novas configurações. Ao instalar a partir do `.env.example`, substitua `POSTGRES_PASSWORD` por uma senha forte e configure `PANEL_VAULT_KEY` com o resultado de `openssl rand -hex 32`. Não use o texto de exemplo como chave.

### 🎛️ O que a guia permite

| Área | Operações |
| --- | --- |
| Bancos | Listar, consultar tamanho e criar banco vazio |
| Contas | Criar usuário, gerar/alterar senha e bloquear/desbloquear novos logins |
| Credenciais | Revelar e copiar senhas definidas pelo painel, após confirmação |
| Permissões | Conceder leitura ou leitura/escrita e revogar concessões diretas por banco |
| Backups | Configurar agenda, bancos selecionados, pasta, retenção e envio S3; executar agora e listar arquivos |

**Não existem ações de exclusão de bancos, contas ou volumes nessa guia.** Revogar acesso mantém o banco e seus dados. Contas administrativas/de sistema são protegidas; no MariaDB, contas com privilégios globais também ficam reservadas à manutenção pelo terminal. A retenção remove somente arquivos antigos de backup reconhecidos pela rotina, após um ciclo bem-sucedido.

Os nomes criados pelo painel usam letras minúsculas, números e `_`, começam com letra e têm até 48 caracteres. Primeiro crie o banco, depois o usuário e use **Gerenciar acesso** para vinculá-los. As listas são consultadas no servidor, com atualização a cada 10 segundos enquanto a guia estiver visível; formulários abertos não são substituídos.

O tamanho do MariaDB é uma estimativa de dados e índices em `information_schema`; não corresponde ao tamanho do volume completo. O PostgreSQL informa `pg_database_size`, proprietário e conexões. A listagem de permissões do PostgreSQL mostra **CONNECT efetivo**; não é um inventário completo das permissões de cada objeto.

### 🔐 Senhas e limites de acesso

Os servidores guardam hashes; senhas anteriores não podem ser recuperadas. **Ver senha** aparece somente para credenciais que o próprio painel definiu. Senha vazia na criação/redefinição gera uma senha aleatória. O painel grava essas credenciais com AES-256-GCM em `.panel-state/db-credentials.json`, com acesso restrito ao arquivo, usando `PANEL_VAULT_KEY` do `.env`.

Preserve **o cofre e a chave** em backup protegido fora da VPS. Não publique esses arquivos. Trocar ou perder a chave impede a leitura das credenciais já salvas; não há migração automática de chave. Um dump SQL não substitui esse backup. Em uma instalação nova, o cofre é criado quando a primeira senha é definida.

Ao redefinir a senha em **Dados → Usuários**, o painel atualiza a conta no SGBD, o cofre e as conexões salvas dessa conta. No MariaDB, a sincronização automática considera a conta de rede com host `%`; contas com host específico não são confundidas com ela. Em **Dados → Conexões**, editar a senha muda apenas a credencial do cliente, não a senha real no banco.

Para contas MariaDB vinculadas a `DB_USERNAME` ou `APP_n_DB_USERNAME`, a redefinição também atualiza `DB_PASSWORD` / `APP_n_DB_PASSWORD` no **`.env` da infraestrutura**, preservando as demais configurações. Antes de alterar o banco, o painel valida o Compose com a nova configuração. Após alterar, recria somente os serviços PHP, workers e Scheduler já em execução que usam a conta e a senha anterior; bancos, volumes e serviços parados não são recriados/iniciados. Em serviços PHP com `artisan`, executa `php artisan config:clear`. A confirmação informa a breve interrupção. Para sincronização no `.env`, use senha sem aspas simples; cifrão é preservado literalmente.

O `.env` anterior fica em `.panel-state/database-password-sync/env-before` (privado, não versionado). Uma falha depois de alterar a conta é informada como sincronização incompleta: banco, arquivos e recriação não formam uma transação única. Revise as credenciais e conclua a recriação antes de repetir a troca.

**Limites:** arquivos `.env` dos projetos, aplicações Node, clientes externos, contas MariaDB com host específico e overrides personalizados não são reescritos automaticamente. No PostgreSQL, conexões salvas da conta são atualizadas; a configuração dos clientes permanece sob responsabilidade da aplicação. Senhas administrativas não são alteradas nessa guia: editar apenas `POSTGRES_PASSWORD` ou `DB_ROOT_PASSWORD` no `.env` não muda a senha existente no banco. Após validar as configurações Laravel, pode-se reconstruir o cache com `docker compose exec php php artisan config:cache`.

**Bloquear login** impede novas conexões, mas não encerra sessões abertas. Revogar concessões diretas não elimina privilégios herdados de roles, `PUBLIC`, privilégios globais ou de proprietário. No PostgreSQL, as concessões do painel cobrem o schema `public`, tabelas/sequências existentes e privilégios padrão para objetos futuros criados pelo administrador usado pelo painel; objetos criados por outras roles exigem configuração própria. Leitura/escrita não transfere propriedade e não garante execução de toda migração Laravel. Conceder somente leitura não reduz permissões de escrita já existentes: revogue-as antes e confira os acessos herdados. Os comandos são enviados por entrada padrão ao cliente SQL, sem colocar senhas nas linhas de comando.

### 🐘 Configuração do PostgreSQL e uso pelas aplicações

| Variável no `.env` | Uso |
| --- | --- |
| `POSTGRES_VERSION=18-bookworm` | Tag do servidor e dos clientes de backup |
| `POSTGRES_USER=infra_admin` | Administrador definido na primeira inicialização |
| `POSTGRES_PASSWORD` | Senha administrativa de inicialização e usada pelo backup |
| `POSTGRES_DB=infra` | Banco inicial, criado na primeira inicialização |
| `PANEL_VAULT_KEY` | Chave hexadecimal de 64 caracteres para o cofre |

O serviço é acessível em **`postgres:5432` dentro da rede Docker**; MariaDB continua em **`mariadb:3306`**. O PostgreSQL publica por padrão `127.0.0.1:5432` no host, configurável por `POSTGRES_BIND_ADDRESS` e `POSTGRES_PORT`. Os dados ficam no volume `postgres_data`, montado em `/var/lib/postgresql`, conforme o layout da [imagem oficial PostgreSQL 18](https://hub.docker.com/_/postgres). Alterações das variáveis de inicialização não recriam bancos/usuários em um volume existente. Não altere a versão principal sobre o mesmo volume sem migração planejada.

Para uma aplicação Laravel usar PostgreSQL, habilite `PHP_INSTALL_POSTGRESQL=true` no `.env` da infraestrutura e reconstrua/recrie seu serviço PHP:

```bash
sudo docker compose up -d --build --no-deps php
```

Configure a conexão da aplicação com `DB_CONNECTION=pgsql`, `DB_HOST=postgres`, `DB_PORT=5432`, nome do banco e usuário/senha criados na guia. Os serviços PHP atuais recebem a conexão MariaDB principal do Compose; variáveis de ambiente do container prevalecem sobre o `.env` do Laravel. Para trocar uma aplicação para PostgreSQL, ajuste as variáveis `DB_*` do serviço correspondente no Compose/override, incluindo a porta e a conexão, e recrie esse serviço. A seleção do servidor na guia administra o banco; ela não troca automaticamente a conexão das aplicações.

### 💾 Agenda, destino local e remoto por servidor

| Configuração | MariaDB | PostgreSQL |
| --- | --- | --- |
| Serviço de backup | `backup` | `backup-postgres` |
| Pasta local padrão | `BACKUP_DIRECTORY=./backups/mariadb` | `PG_BACKUP_DIRECTORY=./backups/postgres` |
| Bancos | `BACKUP_DATABASES=*` | `PG_BACKUP_DATABASES=*` |
| Agenda padrão | `BACKUP_SCHEDULE="0 3 * * *"` | `PG_BACKUP_SCHEDULE="30 3 * * *"` |
| Fuso | `BACKUP_TIMEZONE` | `PG_BACKUP_TIMEZONE` |
| Habilitar agenda | `BACKUP_ENABLED` | `PG_BACKUP_ENABLED` |
| Executar ao iniciar | `BACKUP_RUN_ON_START` | `PG_BACKUP_RUN_ON_START` |
| Retenção / saúde | `BACKUP_RETENTION_DAYS` / `BACKUP_MAX_AGE_HOURS` | `PG_BACKUP_RETENTION_DAYS` / `PG_BACKUP_MAX_AGE_HOURS` |
| Envio S3 | `BACKUP_REMOTE_ENABLED` e `BACKUP_S3_*` | `PG_BACKUP_REMOTE_ENABLED` e `PG_BACKUP_S3_*` |
| Prefixo S3 | `BACKUP_REMOTE_PREFIX` | `PG_BACKUP_REMOTE_PREFIX` |

`*` seleciona os bancos atuais a cada execução: no MariaDB exclui schemas de sistema; no PostgreSQL exclui templates e inclui `postgres` e o banco inicial. Para limitar, use `erp,financeiro`. Cada banco gera `mariadb-NOME-DATA.sql.gz` ou `postgres-NOME-DATA.sql.gz` e um checksum `.sha256`. Dumps de vários bancos são feitos sequencialmente, sem snapshot transacional único entre eles. Evite alterações de estrutura durante o ciclo.

Em **Configurar backup**, informe pasta dedicada, agenda cron numérica com cinco campos e os dados S3. Campos de chaves S3 vazios preservam credenciais existentes; elas não são devolvidas ao navegador. O painel salva as opções no `.env`, valida o Compose e recria **somente o serviço de backup selecionado**. A cópia anterior do `.env` fica em `.panel-state/env-before-backup-settings` para recuperação administrativa; contém segredos e exige a mesma proteção do `.env`. Aguarde um backup ativo terminar antes de aplicar alterações.

Se editar o `.env` manualmente, aplique com:

```bash
# MariaDB: agenda, pasta, seleção, retenção ou S3
sudo docker compose up -d --no-deps --force-recreate backup

# PostgreSQL: as mesmas opções no prefixo PG_BACKUP_
sudo docker compose up -d --no-deps --force-recreate backup-postgres

# Se modificar scripts/Dockerfiles de backup, reconstrua também:
sudo docker compose up -d --build --no-deps backup backup-postgres
```

Mudar a pasta não move backups antigos. Use pastas e prefixos remotos exclusivos. Retenção `0` preserva todos os dumps locais; a retenção remota depende da política do bucket. O upload S3 envia dump e checksum, sem apagar objetos remotos. A interface lista até os 30 dumps mais recentes e informa último sucesso/falha, espaço e confirmação de envio; não oferece restauração destrutiva.

Comandos de operação:

```bash
# Executar um ciclo imediato (banco precisa estar saudável):
sudo docker compose run --rm --no-deps backup once
sudo docker compose run --rm --no-deps backup-postgres once

# Consultar arquivos e último resultado:
sudo docker compose exec backup python3 /opt/backup/backup.py status
sudo docker compose exec backup-postgres python3 /opt/backup/backup.py status

# Logs, saúde e pausa da agenda PostgreSQL:
sudo docker compose logs -f --tail=100 backup-postgres
sudo docker compose ps -a postgres backup-postgres
sudo docker compose stop --timeout 300 backup-postgres
sudo docker compose start backup-postgres

# Cliente administrativo interativo; não publica a senha no histórico:
sudo docker compose exec postgres sh -c 'exec psql --username="$POSTGRES_USER" --dbname=postgres'
```

O dump PostgreSQL usa `pg_dump --create`: inclui criação do banco e conteúdo, mas não cria roles globais do servidor. Preserve as definições de contas/permissões por procedimento administrativo separado e recrie as roles necessárias antes de restaurar em outro servidor. Teste a restauração em instância isolada compatível, com [as instruções oficiais de dump/restauração do PostgreSQL](https://www.postgresql.org/docs/current/backup-dump.html). Validar gzip/checksum não comprova que uma restauração está completa. O backup MariaDB também não inclui as contas globais.

### ✅ Verificação da implementação

```bash
node --test docker/panel/test/*.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s docker/backup -p 'test_*.py'
docker compose config --quiet
```

Os testes automatizados de administração usam um executor Docker simulado, verificando consultas por entrada padrão, credenciais criptografadas, proteção de administradores e ausência de operações de exclusão. Os testes de backup simulam os clientes SQL, verificam compressão/checksum, falha sem publicar arquivo parcial e retenção restrita aos dumps. Complete a validação operacional com os serviços reais após subir as imagens na sua máquina/VPS.

### 📝 Editar ou criar o `.env` de uma aplicação pelo painel

Em **Aplicações → Ver detalhes**, a área **Variáveis da aplicação · .env** verifica o diretório cadastrado no JSON. Se houver arquivo, aparece **Editar .env**; se não houver, aparece **Criar .env**. O editor preserva o texto, comentários e linhas em branco. Um arquivo novo começa vazio: preencha as variáveis necessárias ao seu projeto antes de salvar.

O botão **Salvar/Criar arquivo** grava diretamente no diretório da aplicação; não depende de **Aplicar configuração**. Os apontamentos de diretório precisam estar salvos em **Salvar configurações** antes de editar o arquivo do novo projeto. O `.env` da infraestrutura não é editado por essa opção. Se o arquivo mudar enquanto estiver aberto, o salvamento será recusado: copie suas alterações, feche e abra o editor novamente para conferir a versão atual.

O acesso exige sessão administrativa e proteção CSRF. Conteúdos não são incluídos na listagem de aplicações; são carregados ao abrir o editor e removidos da interface ao fechar. O limite é 64 KiB. Links simbólicos e arquivos com múltiplos hard links são recusados. Arquivos são gravados com permissão `600`; arquivos existentes preservam proprietário, e novos arquivos usam o proprietário do diretório quando o painel roda como root. Não há execução automática do conteúdo nem reinício dos serviços ao salvar.

Para permitir a gravação, o volume `PANEL_PROJECTS_DIRECTORY` do painel agora tem acesso de leitura e escrita. Ao aplicar esta atualização, reconstrua e recrie o painel:

```bash
sudo docker compose up -d --build --no-deps panel
```

O diretório cadastrado precisa estar acessível dentro dos volumes montados no painel. Pastas inexistentes ou fora desses mounts aparecem como indisponíveis; o editor não cria diretórios de projeto.

Para Laravel, após ajustar o `.env`, limpe o cache de configuração do projeto correspondente:

```bash
# Aplicação principal:
sudo docker compose exec php php artisan config:clear

# Aplicação adicional, quando habilitada:
sudo docker compose exec php-app2 php artisan config:clear

# Em produção, após validar a configuração:
sudo docker compose exec php php artisan config:cache
```

Variáveis `environment:` do Compose prevalecem sobre o `.env` da aplicação. Para esses valores, altere a configuração da infraestrutura e recrie os serviços correspondentes. Workers, Scheduler e processos persistentes/Octane podem precisar de reinício para carregar os novos valores; use os controles do painel ou os comandos das seções de manutenção e filas.

### 🌐 Escolha do SGBD, portas dos bancos e acesso ao painel na VPS

No formulário **Criar banco**, selecione **Servidor / SGBD: MariaDB ou PostgreSQL**. O novo banco é criado no servidor selecionado, independentemente da aba aberta anteriormente. Depois de concluir, o painel passa para a listagem desse servidor.

**SGBD e engine de tabelas são escolhas diferentes.** No MariaDB, `ENGINE=InnoDB`/MyISAM é uma opção de `CREATE TABLE`, não de `CREATE DATABASE`. A infraestrutura define `MARIADB_DEFAULT_STORAGE_ENGINE=InnoDB` para tabelas novas que não indiquem outro engine. Essa configuração não converte tabelas existentes e não se aplica ao PostgreSQL. Veja a [documentação de engines do MariaDB](https://mariadb.com/docs/server/server-usage/storage-engines/storage-engines-storage-engines-overview).

#### 💻 Acessar pelo próprio host

O `.env` traz os seguintes padrões:

```dotenv
MARIADB_BIND_ADDRESS=127.0.0.1
MARIADB_PORT=3306
POSTGRES_BIND_ADDRESS=127.0.0.1
POSTGRES_PORT=5432
MARIADB_DEFAULT_STORAGE_ENGINE=InnoDB
PANEL_BIND_ADDRESS=127.0.0.1
PANEL_PORT=9090
```

Após aplicar a atualização, um cliente no computador/VPS acessa MariaDB em `127.0.0.1:3306` e PostgreSQL em `127.0.0.1:5432`. Use banco, usuário e senha criados no painel. Se já houver outro servidor ocupando essas portas, altere **as portas do host**, por exemplo `MARIADB_PORT=13306` e `POSTGRES_PORT=15432`, antes de subir.

As aplicações nos containers continuam usando **`mariadb:3306` e `postgres:5432`**. Alterar a porta publicada no host não exige alterar as conexões internas. O painel informa o endereço configurado no host; ele só entra em vigor após recriar o serviço correspondente.

#### ☁️ Acessar de outra máquina pelo IP da VPS

Para permitir conexões nas interfaces da VPS, configure conforme os serviços que deseja acessar:

```dotenv
# Alternativamente, use o IP privado específico da interface de rede da VPS.
MARIADB_BIND_ADDRESS=0.0.0.0
MARIADB_PORT=3306
POSTGRES_BIND_ADDRESS=0.0.0.0
POSTGRES_PORT=5432
PANEL_BIND_ADDRESS=0.0.0.0
PANEL_PORT=9090
```

O painel passa a responder em `http://IP_DA_VPS:9090`; os clientes de banco usam `IP_DA_VPS` e a porta publicada de cada servidor. Não digite `0.0.0.0` como endereço do navegador/cliente: esse valor significa escutar em todas as interfaces. O login do painel continua usando `PANEL_USERNAME` e `PANEL_PASSWORD`.

Restrinja essas portas aos IPs autorizados no firewall do provedor/VPS. O painel controla o Docker e exibe credenciais: para acesso pela Internet, prefira túnel SSH ou proxy HTTPS. Publicar uma porta não configura TLS para o banco. O Docker pode encaminhar portas publicadas independentemente de regras simples do UFW; confira as regras efetivas. Veja [publicação de portas no Docker](https://docs.docker.com/engine/network/port-publishing/).

Com HTTP, mantenha `PANEL_COOKIE_SECURE=false`. Ao colocar o painel atrás de um proxy HTTPS, use `PANEL_COOKIE_SECURE=true`; ativar essa opção não cria certificados nem configura o proxy. O Traefik das aplicações não passa a encaminhar o painel automaticamente.

#### 🔒 Alternativa para administrar sem abrir portas públicas

Mantenha todos os binds em `127.0.0.1` e, na sua máquina local, execute:

```bash
ssh -N \
  -L 19090:127.0.0.1:9090 \
  -L 13306:127.0.0.1:3306 \
  -L 15432:127.0.0.1:5432 \
  usuario@IP_DA_VPS
```

Enquanto o SSH estiver conectado, abra `http://localhost:19090` para o painel. No cliente de banco local, use `127.0.0.1:13306` para MariaDB e `127.0.0.1:15432` para PostgreSQL. Os números à direita precisam corresponder às portas configuradas no host da VPS.

#### 🔧 Aplicar as mudanças sem apagar volumes

```bash
# Atualizar esta implementação e subir os serviços:
sudo docker compose up -d --build

# Depois, se mudar somente IP/porta/engine MariaDB:
sudo docker compose up -d --no-deps --force-recreate mariadb

# Se mudar somente IP/porta PostgreSQL:
sudo docker compose up -d --no-deps --force-recreate postgres

# Se mudar IP/porta, usuário/senha de acesso ou cookie do painel:
sudo docker compose up -d --no-deps --force-recreate panel

# Conferir portas publicadas:
sudo docker compose port mariadb 3306
sudo docker compose port postgres 5432
sudo docker compose port panel 3000
sudo docker compose ps -a
```

Recriar bancos interrompe conexões temporariamente e mantém os volumes. Alterar as portas não altera senhas nem permissões dos usuários. No MariaDB, a conta precisa permitir o host de origem (`%` permite origens diversas, conforme rede/firewall). No PostgreSQL, autenticação e regras `pg_hba.conf` também precisam aceitar a origem; volumes antigos podem ter regras diferentes das imagens novas. Use contas de aplicação com permissões próprias, não o administrador para conexões rotineiras.

### 🎛️ Configurar portas pelo painel: Proxy & acessos

A guia **Proxy & acessos** reúne a publicação das aplicações e dos bancos:

| Área | Configurações |
| --- | --- |
| Aplicações · HTTP e HTTPS | IP de publicação, portas HTTP/HTTPS, TLS e email ACME |
| Bancos · portas TCP no host | Porta e acesso local (`127.0.0.1`) ou pela rede (`0.0.0.0`) para MariaDB e PostgreSQL |

Use **Usar portas 80 / 443** para preencher as portas convencionais. Todas as aplicações usam essas mesmas portas; o Traefik escolhe o serviço pelo domínio/subdomínio configurado em **Aplicações**. Por exemplo, `http://localhost` e `http://financeiro.localhost` podem usar a porta 80 simultaneamente. Os domínios precisam resolver para o host/VPS; publicar a porta não cria registros DNS.

Bancos não são encaminhados por esse roteamento HTTP: clientes usam o IP do host e a porta TCP de cada servidor. Mudar `MARIADB_PORT`/`POSTGRES_PORT` não muda as portas internas das aplicações. A interface valida portas de 1 a 65535 e impede repetição entre HTTP, HTTPS e os dois bancos, mesmo em modo local.

**Como aplicar:**

1. Abra **Proxy & acessos** e ajuste as portas e os modos de acesso.
2. Clique em **Salvar configurações**. Isso grava o rascunho em `config/apps.json`, incluindo `proxy.databases`.
3. Clique em **Aplicar configuração** e confirme a operação.
4. Aguarde a conclusão e teste os novos endereços. Se houver falha, confira a mensagem e o estado dos serviços.

A aplicação grava os valores correspondentes no `.env` e valida o Compose antes de recriar os serviços. Aplicações ativas e Traefik são recriados como no fluxo existente; MariaDB/PostgreSQL entram na recriação quando seu IP/porta mudar. Isso interrompe conexões temporariamente, preservando volumes. Os arquivos antigos de configuração são compatíveis: os novos campos de bancos são preenchidos a partir do `.env` até salvar o JSON.

Nenhuma regra de firewall ou registro DNS é criado automaticamente. Uma porta ocupada por outro processo pode impedir a subida do container; escolha uma porta disponível. Para acesso público ao banco, restrinja as origens no firewall do provedor. A porta do próprio painel continua configurada por `PANEL_BIND_ADDRESS`/`PANEL_PORT` no `.env`, conforme a seção de acesso à VPS.

Para instalar a atualização desta interface:

```bash
sudo docker compose up -d --build --no-deps panel
```

### 🎨 Interface compacta, temas e filtros

O painel usa uma interface compacta inspirada em ferramentas de desenvolvimento: tabelas densas, bordas discretas, ações consistentes e ícones SVG locais. Usa Bootstrap 6 com arquivos distribuídos localmente e ícones SVG locais; não precisa acessar CDN para renderizar a interface.

**Aparência:** clique no seu nome, no canto superior direito, e selecione **Claro**, **Escuro** ou **Sistema**. O padrão é claro. A preferência fica salva no navegador e é aplicada antes da renderização; a opção Sistema acompanha as mudanças do sistema operacional. A preferência é local ao navegador, não uma configuração do `.env`. Se o armazenamento local estiver bloqueado, a troca continua funcionando durante a sessão.

**Busca e filtros:** serviços, aplicações, bancos, usuários, permissões, backups, filas, jobs, falhas, agendadores, métricas e montagens têm busca textual, contagem de resultados e botão **Limpar**. Listagens com badges oferecem filtro de estado; backups permitem filtrar a confirmação de envio remoto. Os filtros permanecem durante as atualizações automáticas da listagem, mas são reiniciados ao recarregar a página. Eles se aplicam aos dados carregados no painel, respeitando limites existentes, como os 30 backups/falhas mais recentes.

**Feedback das operações:** consultas exibem uma barra de progresso e carregamento no botão acionado. Ações em andamento impedem cliques duplicados; operações demoradas mantêm uma indicação de processamento até sua conclusão. Mensagens de sucesso e erro também são anunciadas para leitores de tela. Indicadores de estado continuam usando texto, além da cor.

**Ajuda e acessibilidade:** campos técnicos têm botões de ajuda acessíveis por mouse, toque e teclado. Use Tab para focar o ícone, Enter para abrir a ajuda e Escape para dispensá-la. Ações importantes também têm tooltips. A interface mantém foco visível, respeita a preferência de movimento reduzido e permite rolagem horizontal das tabelas e da navegação em telas pequenas.

Para aplicar a atualização, na pasta da infraestrutura:

```bash
sudo docker compose up -d --build --no-deps panel
```

Depois atualize a página. Esse comando atualiza o painel sem recriar bancos ou volumes. Nenhum tema altera dados, configurações de serviços ou credenciais.

Validação automatizada:

```bash
node --test docker/panel/test/*.test.mjs

# Verificação visual opcional: requer Chromium em /usr/bin/chromium
# Ou informe CHROMIUM_BINARY=/caminho/para/chromium
# e a porta local 9227 disponível para o protocolo de depuração.
node docker/panel/test/browser-qa.mjs
```

A verificação visual usa um painel temporário com operações Docker simuladas e projetos de teste em `/tmp`; não executa comandos nos containers reais. Verifica os fluxos principais, criação do `.env`, modais, temas claro/escuro/sistema, persistência da preferência, busca após atualização, proteção contra cliques repetidos, loading, tooltip por teclado e as guias do painel em tela mobile. Capturas ficam em `/tmp/infra-control-*.png`. Os testes de tema também verificam inicialização sem espera pelo DOM e funcionamento com armazenamento local indisponível.

### ✅ Confirmação de alterações e execução de ações

As alterações feitas pela interface exigem uma modal de confirmação com **resumo**, **o que será executado** e **possíveis impactos**. Isso inclui registrar filas/jobs/Scheduler, iniciar/parar/recriar serviços e automações, enfileirar/reenviar jobs, executar tarefas agendadas, criar bancos/contas, alterar senhas/acessos, configurar/executar backups, salvar/importar/aplicar configurações e criar/editar o `.env` dos projetos.

O terminal também exige confirmação antes de enviar o comando ao container. Credenciais, conteúdo do `.env`, comandos e argumentos livres não são repetidos no resumo, pois podem conter segredos. Revise o campo original antes de confirmar. A execução pode alterar/excluir dados conforme o comando: não há desfazer automático.

A modal distingue **guardar no rascunho**, **salvar JSON** e **aplicar aos serviços**. O cadastro de uma automação apenas grava/valida sua configuração: não inicia automaticamente um worker/Scheduler nem enfileira um job. Ações locais como alterar tema, preencher portas padrão, limpar saída visual, exportar logs/console e copiar uma senha também pedem confirmação. Navegar, consultar dados, digitar no rascunho e usar filtros não executa alterações na infraestrutura e continua sem uma modal a cada interação.

**Cancelar**, fechar a janela ou pressionar **Escape** não envia a alteração. Formulários permanecem disponíveis para revisão. A confirmação das mutações HTTP é centralizada na interface para também proteger ações futuras, com resumo específico para as operações existentes. As confirmações não substituem autenticação, validação do servidor ou backup.

Para aplicar esta atualização:

```bash
sudo docker compose up -d --build --no-deps panel
```

A suíte visual inclui cadastro de worker cancelado/confirmado, verificação de que nada é gravado antes de confirmar e comando de terminal cancelado sem execução. Os testes de planos de confirmação verificam as famílias de ações e a ausência de segredos nos resumos.

### 🅱️ Bootstrap 6: versão e manutenção do painel

O painel foi adaptado para **Bootstrap 6.0.0-alpha.1**, a versão 6 publicada no canal `next` do npm na implementação. É uma versão **alpha**, conforme a [documentação oficial](https://getbootstrap.com/docs/6.0/getting-started/install/); não é uma versão estável. A versão está fixada, sem atualização automática. Valide futuras atualizações antes de aplicá-las à VPS.

A migração segue os recursos oficiais fornecidos: [índice para LLMs](https://getbootstrap.com/llms.txt), [documentação completa](https://getbootstrap.com/llms-full.txt) e [skill bootstrap-v6-install](https://github.com/twbs/bootstrap/blob/main/skills/bootstrap-v6-install/SKILL.md). A documentação do Bootstrap 6 contém mudanças importantes em relação à versão 5: por exemplo, botões usam `btn-solid theme-primary`/`btn-outline theme-secondary`, selects usam `form-control` e as modais usam o componente `Dialog` sobre `<dialog>` nativo.

| Arquivo | Responsabilidade |
| --- | --- |
| `docker/panel/public/vendor/bootstrap/` | CSS, bundle ESM oficial, licenças e manifesto da versão |
| `docker/panel/public/vendor/bootstrap/manifest.json` | Origem npm, integridade do pacote e SHA-256 dos arquivos distribuídos |
| `docker/panel/frontend/ui.jsx` | Componentes React compartilhados, carregamento, confirmações e integração com Dialog do Bootstrap |
| `docker/panel/public/style.css` | Layout do painel, densidade, responsividade e ajustes no layer `custom` |
| `docker/panel/public/theme.js` | Preferência do usuário e sincronização com `data-bs-theme` |

O Bootstrap é servido pelo próprio painel: **não usa CDN em tempo de execução** e instala e compila as dependências automaticamente no build Docker, sem exigir npm no hospedeiro. O bundle oficial inclui suas dependências opcionais. A integridade SHA-512 do tarball foi verificada contra o registro npm antes da extração; os testes verificam os hashes dos arquivos locais. O antigo `design.css` foi removido para não sobrepor os componentes do framework com os estilos legados.

Botões, controles de formulário, tabelas, cards, alertas, badges e navegação usam as classes da versão 6. Os componentes React já renderizam as classes do framework, inclusive nas consultas e atualizações automáticas. Os diálogos são gerenciados pelo JavaScript oficial do Bootstrap, mantendo os resumos de impacto, cancelamento e confirmações do painel. Claro/escuro/sistema continuam sendo uma escolha do usuário no perfil; os tokens de cores vêm do Bootstrap.

Para aplicar a adaptação:

```bash
sudo docker compose up -d --build --no-deps panel
```

Recarregue a página após a atualização. Isso reconstrói somente o painel, sem recriar bancos ou apagar volumes. Os testes continuam sendo executados com:

```bash
node --test docker/panel/test/*.test.mjs
node docker/panel/test/browser-qa.mjs
```

O teste visual usa serviços simulados; verifica os fluxos existentes, a versão JavaScript carregada, componentes Bootstrap, os dois temas, resoluções desktop/tablet/mobile e confirmações antes de alterações. Bootstrap 6 exige navegador moderno com suporte a `oklch()`, `color-mix()` e aos elementos nativos utilizados pelo framework.


### ⚛️ Painel React: guias e atualização

As guias do painel usam componentes React, incluindo aplicações, proxy, PHP, bancos/usuários/backups, transferências SQL, filas/jobs, host, containers, MCP e documentação. O código está em `docker/panel/frontend/pages/`; `App.jsx` controla a navegação e `ui.jsx` compartilha formulários, tabelas, diálogos, consultas e feedback. A interface carrega `public/react-app.js`, gerado pelo esbuild. Os antigos controladores JavaScript não são carregados pelo HTML.

As guias preservam busca, filtros e rascunhos ao navegar. Consultas de guias inativas são interrompidas; atualizações periódicas não sobrescrevem formulários. As alterações continuam exigindo confirmação com resumo, execução e impactos. Botões impedem envio duplicado. O progresso e as notificações usam camadas fixas, e o cabeçalho reserva espaço para o carregamento, evitando deslocar o painel.

**Aplicar a atualização** na raiz da infraestrutura:

```bash
sudo docker compose up -d --build --no-deps panel
```

Depois, recarregue o navegador. Esse comando compila React dentro da imagem e recria somente o painel. Mantém os arquivos de configuração e os volumes dos bancos.

**Desenvolvimento local do painel** (Node 24 ou superior):

```bash
cd docker/panel
npm ci --ignore-scripts
npm run build
npm test
node test/browser-qa.mjs
```

Após editar JSX, execute novamente `npm run build`. O teste de navegador requer Chromium open source em `/usr/bin/chromium` (ou o caminho em `CHROMIUM_BINARY`), utiliza servidor temporário e simula operações Docker: não altera os serviços reais. Ele verifica as guias, confirmações aceitas/canceladas, filtros preservados, terminal, edição de `.env` temporário, registro de worker, seleção de banco, backups, métricas, temas claro/escuro e larguras de 768/390 pixels. As capturas ficam em `/tmp/infra-react-*.png`. Para iniciar o servidor fora do Docker, mantenha as configurações de autenticação e acesso ao projeto exigidas pelo backend.

React e React DOM estão fixados no `package-lock.json`; a construção usa `npm ci`. O runtime do servidor continua Node com os mesmos endpoints, autenticação e proteções existentes. Consulte também a [documentação oficial do React](https://react.dev/learn/creating-a-react-app).

<a id="tipos-aplicacao"></a>

### 🌐 Aplicações PHP, Node.js e Estáticas

A guia **Aplicações → Ver detalhes → Tipo de aplicação** permite escolher o runtime por slot. Configurações antigas continuam como PHP. A aplicação principal permanece no domínio padrão; as demais usam seus próprios domínios/subdomínios, compartilhando Traefik, bancos e Valkey. As aplicações existentes são preservadas e novos cadastros podem ser criados no painel, até 100 aplicações.

| Tipo | Campos específicos | Execução |
| --- | --- | --- |
| PHP | Raiz pública e modo tradicional/Octane | FrankenPHP, como antes |
| Node.js | Comando, diretório de trabalho e porta interna | Imagem `node:${APP_NODE_VERSION}` (fallback em `NODE_VERSION`), processo persistente |
| Estática | Diretório do build e modo SPA | Caddy, arquivos em volume somente leitura, sem processo Node.js |

Para disponibilizar uma aplicação: prepare sua pasta dentro do diretório acessível ao painel (`PANEL_PROJECTS_DIRECTORY`), abra um slot, selecione o tipo e os apontamentos, **Guarde no rascunho → Salvar configurações → Aplicar configuração**. Revise os resumos antes de confirmar. Não é necessário abrir uma porta pública por aplicação: todas passam pela porta HTTP/HTTPS do Traefik. Em uma VPS, configure também os registros DNS, TLS e o firewall.

A aplicação gera `config/apps.compose.yaml`, que substitui o serviço daquele slot; **não edite esse arquivo manualmente**. Os nomes `php`, `php-app2` e `php-app3` foram mantidos por compatibilidade com o proxy e os comandos existentes, mesmo quando o tipo é Node.js/Estática. A configuração usa `!override`, exigindo **Docker Compose 2.24.4 ou superior**, conforme a [documentação de composição do Docker](https://docs.docker.com/reference/compose-file/merge/). Esse arquivo está incluído em `COMPOSE_FILE`; se usar `-f` manualmente, inclua-o após `compose.yaml` e `config/automation.compose.json`.

#### Exemplos de cadastro

| Projeto | Tipo | Pasta no host (exemplo) | Configuração |
| --- | --- | --- | --- |
| Laravel | PHP | `/srv/projetos/erp` | raiz `/var/www/html/public`, modo tradicional; Octane apenas quando instalado no projeto |
| WordPress | PHP | `/srv/projetos/blog` | raiz `/var/www/html`, modo tradicional |
| API Node.js | Node.js | `/srv/projetos/api` | trabalho `/var/www/html`, comando `npm start`, porta `3000` |
| React/Vite | Estática | `/srv/projetos/site` | build `dist`, SPA ativado para roteamento no navegador |
| HTML sem roteador | Estática | `/srv/projetos/documentacao` | build `.` ou `build`, SPA desativado |

**Laravel:** instale as dependências e configure o `.env` da aplicação como antes. Migrações continuam sendo uma ação explícita. Filas/jobs/Scheduler do painel são exclusivos das aplicações PHP com Laravel.

**WordPress:** habilite `PHP_INSTALL_MYSQLI=true` no `.env` da infraestrutura e reconstrua a imagem PHP. Crie o banco e seu usuário na guia Bancos e configure `wp-config.php` com host `mariadb:3306`, banco e credenciais próprios. Não utilize Octane. WordPress compartilha o serviço MariaDB, mas deve ter seu próprio banco e usuário.

**Node.js:** o servidor precisa ouvir em **`0.0.0.0`**, na mesma porta cadastrada no painel. O container recebe `HOST`, `PORT` e `NODE_ENV=production`; o código precisa respeitar esses valores. O `.env` do projeto, se existir, é carregado ao recriar o container. Variáveis definidas explicitamente pelo runtime prevalecem. Os bancos ficam acessíveis internamente por `mariadb:3306` e `postgres:5432`; configure credenciais próprias no projeto. Nenhuma senha dos serviços PHP é herdada automaticamente.

Prepare as dependências antes da publicação, usando o serviço de ferramentas correspondente ao slot:

```bash
# Slot app2; para o principal use node, para app3 use node-app3.
sudo docker compose --profile app2 run --rm --no-deps node-app2 ci
# Quando o projeto tiver um passo de build:
sudo docker compose --profile app2 run --rm --no-deps node-app2 run build
```

O comando de inicialização é executado em shell dentro do container e deve manter o processo em primeiro plano. Exemplo: `node server.js` ou `npm start`. Não inclua segredos no comando. O campo não aceita interpolação `$`, aspas simples ou caracteres de controle; use o `.env` do projeto para variáveis. Dependências nativas devem ser preparadas para a versão/imagem Node Linux usada pela infraestrutura. Projetos que exigem pacotes de sistema ou uma imagem personalizada ainda precisam de uma adaptação própria.

**React/Vite estático:** execute `npm ci` e `npm run build` com o serviço de ferramentas, ou envie o build já gerado para a pasta indicada. A pasta `dist`/`build` precisa existir e conter `index.html`. Não é necessário executar `vite`, `vite preview` ou um servidor Node.js. O modo SPA preserva arquivos existentes e retorna `index.html` para rotas sem arquivo, seguindo o [padrão SPA do Caddy](https://caddyserver.com/docs/caddyfile/patterns#single-page-apps). Sem SPA, arquivos ausentes retornam 404. O build é servido por volume somente leitura; `.env` e `.git` são bloqueados no servidor estático. Variáveis de frontend precisam ser incorporadas durante o build; editar `.env` depois não modifica o JavaScript já gerado.

#### Configuração em JSON e `.env`

Além dos campos comuns (`id`, nome, habilitada, domínio, diretório e porta), cada aplicação em `config/apps.json` aceita:

```json
{
  "type": "static",
  "buildDirectory": "dist",
  "spa": true,
  "startCommand": "npm start",
  "workingDirectory": "/var/www/html"
}
```

Os campos de outros tipos são preservados para facilitar trocas, mas não são executados. No `.env` da infraestrutura, os equivalentes usam os prefixos `APP`, `APP_2` e `APP_3`:

```dotenv
APP_2_TYPE=static
APP_2_BUILD_DIRECTORY=dist
APP_2_SPA=true
# Para Node.js:
# APP_2_TYPE=node
# APP_2_START_COMMAND="npm start"
# APP_2_WORKING_DIRECTORY=/var/www/html
# APP_2_HTTP_PORT=3000
```

Após mudar esses valores no `.env`, execute `node docker/panel/runtime-cli.mjs --from-env` no terminal, recarregue o painel e aplique. Após editar o JSON diretamente, recarregue o painel e aplique. A imagem do servidor estático é configurável por `STATIC_CADDY_VERSION` e a do Node das aplicações por `APP_NODE_VERSION` (fallback em `NODE_VERSION`).

Sem painel, com Node 24+ instalado no host:

```bash
# Preparar a partir do JSON:
node docker/panel/runtime-cli.mjs
# OU importar as opções do .env:
node docker/panel/runtime-cli.mjs --from-env
# Validar antes de subir:
sudo docker compose config --quiet
sudo docker compose up -d --build
```

A preparação por CLI grava JSON, `.env` e o override, sem executar Docker; não substitui a gestão das automações feita pelo painel. Para trocar o tipo de uma aplicação que já tem workers/Scheduler, use o painel, que para e desativa essas automações antes de recriar o runtime.

#### Atualização e administração

- **Atualizar arquivos estáticos:** gere/envie o novo build para o diretório configurado. Os arquivos são lidos diretamente; não é necessário reconstruir uma imagem. Para mudar a pasta ou SPA, salve/aplique no painel.
- **Atualizar Node.js:** instale dependências e execute o build, quando necessário; depois use Reiniciar no serviço. Se alterar o `.env` do projeto, use Aplicar configuração para recriar o container e reler as variáveis.
- **Atualizar PHP:** mantenha o procedimento específico da aplicação; alterações de runtime/extensões exigem reconstrução. Para WordPress, preserve também uploads e `wp-config.php` no projeto.
- **Logs/status/shell:** continue pela guia Visão geral ou pelos comandos abaixo. Os tipos Node.js e Estática usam `sh`; o shell Bash não está garantido.

```bash
sudo docker compose ps -a
sudo docker compose logs --tail=100 -f php-app2
sudo docker compose exec php-app2 sh
sudo docker compose restart php-app2
sudo docker compose stop php-app2
```

Trocar o tipo recria o container e pode interromper acessos; não move o projeto, não instala dependências e não executa migrações. Os volumes dos bancos e arquivos dos projetos são preservados. Faça a troca pelo painel para desativar automações Laravel incompatíveis. A validação e o resultado da operação devem ser verificados antes de repetir uma aplicação parcialmente concluída.

### 🎨 Identidade visual sobre o Bootstrap

O painel mantém os componentes Bootstrap 6. A estrutura está em `docker/panel/public/style.css` e a identidade visual compartilhada em `docker/panel/public/modern-ui.css`, carregado por último: tipografia de sistema, paletas próprias para claro/escuro, navegação com destaque discreto, botões com cantos moderados, campos com foco visível e tabelas compactas. A seção **Identidade do painel** concentra os tokens e os ajustes, sem modificar os arquivos do framework. A escolha de tema continua no perfil.

Após modificar os estilos, aplique com `sudo docker compose up -d --build --no-deps panel` e recarregue o navegador. Os fluxos, confirmações e configurações permanecem os mesmos.

O menu de perfil no topo concentra a identificação da conta e a opção de sair. A aparência é selecionada por um switch **claro/escuro**, acessível por teclado, com estado anunciado a leitores de tela e preferência persistida. A opção Sistema não aparece mais no menu; preferências antigas seguem válidas até o usuário escolher explicitamente claro ou escuro.

<a id="acesso-painel"></a>

### 🌍 Como acessar o painel: local, túnel SSH ou URL pública

**O padrão é acesso local.** Na VPS, `localhost` significa a própria VPS; no seu navegador, significa seu computador. Para acessar remotamente, escolha túnel SSH ou publique uma rota HTTPS.

| Forma de acesso | Endereço no navegador | Portas de entrada na VPS |
| --- | --- | --- |
| Infra rodando no seu computador | `http://localhost:9090` | Nenhuma porta pública adicional |
| VPS com túnel SSH | `http://localhost:9090` após abrir o túnel | SSH, normalmente TCP 22; não abrir 9090 |
| VPS com subdomínio HTTPS | `https://painel.seudominio.com` | TCP 80 e 443; SSH para manutenção |
| IP e porta direta HTTP | `http://IP_DA_VPS:9090` | TCP 9090, restrita aos IPs autorizados; SSH para manutenção |
| IP e porta HTTPS dedicada | `https://IP_DA_VPS:9443` | TCP 9443 para o painel, 80/443 para a configuração de certificados descrita abaixo |

Entre com `PANEL_USERNAME` e `PANEL_PASSWORD` do **`.env` da infraestrutura na VPS**. São credenciais do painel, diferentes das credenciais do SSH, do banco e da aplicação hospedada. Nunca use os valores de exemplo como senha real.

#### 1. Acesso local ou por túnel SSH

No `.env` da infraestrutura:

```dotenv
PANEL_BIND_ADDRESS=127.0.0.1
PANEL_PORT=9090
PANEL_PROXY_ENABLED=false
PANEL_TLS_ENABLED=false
PANEL_COOKIE_SECURE=false
```

Na pasta da infraestrutura **na VPS**, aplique:

```bash
sudo docker compose config --quiet
sudo docker compose up -d --no-deps --force-recreate panel traefik
```

Depois, **no terminal do seu computador**, abra o túnel:

```bash
ssh -N -L 9090:127.0.0.1:9090 -p 22 usuario@IP_DA_VPS
```

Use o usuário, a porta e a autenticação reais do SSH. Mantenha esse terminal aberto e acesse **http://localhost:9090** no navegador do seu computador. `Ctrl+C` encerra o túnel. O tráfego entre o computador e a VPS é criptografado pelo SSH, embora a URL local seja HTTP.

Se a porta 9090 do seu computador estiver ocupada, use outra porta local:

```bash
ssh -N -L 19090:127.0.0.1:9090 -p 22 usuario@IP_DA_VPS
```

Nesse caso, abra **http://localhost:19090**. A porta do painel na VPS continua sendo 9090. Para a infraestrutura rodando no próprio computador, acesse diretamente http://localhost:9090, sem túnel.

#### 2. Acesso por URL com subdomínio e HTTPS, sem túnel

No `.env` da infraestrutura:

```dotenv
PANEL_BIND_ADDRESS=127.0.0.1
PANEL_PORT=9090
PANEL_PROXY_ENABLED=true
PANEL_DOMAIN=painel.seudominio.com
PANEL_TLS_ENABLED=true
PANEL_COOKIE_SECURE=true
HTTP_BIND_ADDRESS=0.0.0.0
HTTP_PORT=80
HTTPS_PORT=443
TRAEFIK_TLS_ENABLED=true
ACME_EMAIL=seu-email@seudominio.com
```

Aponte o DNS A do subdomínio para o IP da VPS. Crie AAAA apenas se o IPv6 estiver configurado. Escolha um subdomínio diferente dos usados pelas aplicações. Libere TCP **80 e 443** no firewall do provedor e do servidor. A porta 80 também é usada na emissão e renovação pelo desafio HTTP do Let's Encrypt.

O Traefik recebe HTTPS em 443 e encaminha pela rede Docker para `panel:3000`. **Não libere 9090 nem 3000 publicamente.** A opção `PANEL_COOKIE_SECURE=true` protege o cookie; ela não emite certificado por si só.

Depois de sincronizar e aplicar as configurações conforme a seção abaixo, acesse **https://painel.seudominio.com**. Não precisa abrir túnel SSH. As aplicações continuam compartilhando 80/443, com distribuição por domínio/subdomínio.

#### 3. Acesso direto pelo IP em HTTP

Para uma rede confiável ou acesso temporário restrito:

```dotenv
PANEL_BIND_ADDRESS=0.0.0.0
PANEL_PORT=9090
PANEL_PROXY_ENABLED=false
PANEL_TLS_ENABLED=false
PANEL_COOKIE_SECURE=false
```

Após aplicar, acesse **http://IP_DA_VPS:9090**. Libere TCP 9090 somente para os IPs autorizados. Esse modo transmite o login sem TLS; para acesso pela internet, use HTTPS ou túnel SSH. Não digite `0.0.0.0` no navegador: esse valor significa escutar nas interfaces do servidor.

#### 4. Acesso pelo IP em HTTPS numa porta dedicada

**Atenção à diferença entre o repositório local e a implantação:** a URL `https://IP_DA_VPS:9443` foi configurada especificamente na VPS. O Compose local ainda não declara essa entrada HTTPS dedicada; copiar apenas as variáveis abaixo para uma instalação nova não cria esse acesso.

Na VPS adaptada, a configuração é:

```dotenv
PANEL_HTTPS_ENABLED=true
PANEL_HTTPS_BIND_ADDRESS=0.0.0.0
PANEL_HTTPS_PORT=9443
PANEL_BIND_ADDRESS=127.0.0.1
PANEL_PORT=9090
PANEL_PROXY_ENABLED=false
PANEL_COOKIE_SECURE=true
```

Esse modo depende também da publicação `9443:9443` no serviço Traefik, da entrada `panelwebsecure`, da rota `docker/traefik/panel-port.yml` para `panel:3000` e de um certificado válido para o IP. A VPS usa o certificado padrão definido em `docker/traefik/ip-certificate.yml`, com perfil ACME `shortlived`, `disableCommonName` e renovação ajustada para 160 horas. Os certificados para IP têm validade curta; preserve o volume ACME e o acesso de validação nas portas 80/443. Consulte o README da implantação para esses arquivos e opções específicos.

Libere **TCP 9443** no provedor e no servidor. Acesse **https://IP_DA_VPS:9443**, sem túnel. O certificado usado pela aplicação na porta 443 pode atender ao mesmo IP na 9443, mas **ativar HTTPS na aplicação não publica o painel automaticamente**. A porta HTTP 9090 continua restrita ao host.

#### Aplicar mudanças e evitar sobrescrever os apontamentos

A área **Proxy & acessos → Painel administrativo · acesso** configura a publicação direta e por subdomínio. Salve e aplique as configurações. As opções da porta HTTPS dedicada da VPS são uma personalização separada, não campos disponíveis nessa tela local.

Se editar diretamente o `.env`, o painel pode ainda ter valores anteriores em `config/apps.json`. Para tornar o `.env` a fonte dos apontamentos, execute na pasta da infraestrutura (com Node.js disponível):

```bash
node docker/panel/runtime-cli.mjs --from-env
```

Esse comando recria os apontamentos das aplicações a partir das variáveis do `.env`; confira antes se todas as aplicações cadastradas estão representadas nele. Ele não migra dados. Recarregue o painel antes de salvar novamente.

Para aplicar portas, rotas e cookie do painel:

```bash
sudo docker compose config --quiet
sudo docker compose up -d --no-deps --force-recreate traefik panel
sudo docker compose ps -a
sudo docker compose logs --tail=100 traefik panel
```

As mudanças de configuração não exigem rebuild das imagens. A recriação encerra sessões do painel e interrompe brevemente o proxy; faça login novamente no endereço correto. Os volumes são preservados. Não use `down -v`.

Ao acessar via HTTPS, use `PANEL_COOKIE_SECURE=true`. Ao usar HTTP local ou túnel para HTTP, use `false`. Cookie seguro não funciona por HTTP. Se alterar a porta interna do host em `PANEL_PORT`, atualize também o destino do túnel.

Se uma versão anterior mostrar **“Não foi possível exibir o painel”** após logout ou outra ação ao acessar um IP por HTTP, confira no console do navegador o erro `crypto.randomUUID is not a function`. A geração dos identificadores das notificações agora tem uma alternativa para HTTP; esses identificadores servem somente à interface e não são tokens de segurança. Após atualizar o código, reconstrua somente o painel com `docker compose up -d --build --no-deps panel` e recarregue a página. O teste local `JUBART_HTTP_REGRESSION=1 CHROMIUM_BINARY=/caminho/do/chromium node docker/panel/test/browser-qa.mjs` reproduz uma origem HTTP real, com Docker simulado, e verifica cancelamento, logout, novo login e notificações de ações confirmadas.


#### Portas e regras de acesso

- **SSH (TCP 22 por padrão):** necessário para manutenção e túnel. Se usar outra porta, ajuste o comando e o firewall; preserve uma sessão SSH aberta ao alterar regras.
- **TCP 80 e 443:** entrada pública das aplicações e do painel por subdomínio, além da validação dos certificados conforme o desafio configurado.
- **TCP 9443:** somente se a entrada HTTPS dedicada do painel estiver configurada; não é necessária para subdomínio ou túnel.
- **TCP 9090:** não precisa ser pública com túnel ou proxy HTTPS. Só abra no modo direto, com restrição de origem.
- **TCP 3000 e portas internas das aplicações:** não precisam ser publicadas; o Traefik utiliza a rede Docker.
- **MariaDB 3306, PostgreSQL 5432, Valkey 6379 e phpMyAdmin 8081:** não precisam ficar públicos para o painel funcionar. Mantenha-os na rede interna ou em loopback conforme a configuração de cada serviço.

Nenhuma configuração deste projeto abre o firewall do provedor nem cria DNS automaticamente. Confira o firewall do provedor e as regras efetivas do host: a publicação de portas pelo Docker pode contornar regras simples do UFW. Consulte [a documentação oficial do Docker](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

#### Se o painel não abrir

| Sintoma | O que conferir |
| --- | --- |
| `localhost:9090` não abre no computador | Túnel ativo, porta local livre e container `panel` em execução na VPS |
| IP e porta não respondem | Porta publicada no Compose, endereço de bind, firewall do host e do provedor |
| HTTPS falha ou aparece alerta de certificado | Certificado válido para o domínio/IP, porta HTTPS correta e logs do Traefik; não ignore o alerta |
| HTTP funciona, mas login não mantém a sessão | Confira `PANEL_COOKIE_SECURE`; use HTTPS se estiver `true` |
| URL abre a aplicação em vez do painel | Confira subdomínio/porta e a rota do painel; a aplicação e o painel têm destinos diferentes |
| Alterações voltam ao valor antigo | Confira a sincronização entre `.env` e `config/apps.json` antes de salvar pelo painel |

<a id="cadastrar-aplicacoes"></a>

### ➕ Cadastrar novas aplicações

Na guia **Aplicações**, clique em **Nova aplicação**, informe nome, tipo (PHP, Node.js ou Estática), domínio e uma pasta existente no host. Preencha os campos específicos do tipo, confirme **Cadastrar no rascunho**, clique em **Salvar configurações** e depois **Aplicar configuração**. Cada etapa apresenta seu resumo antes da execução. Cancelar a confirmação não adiciona o cadastro.

O cadastro vincula um projeto existente; não cria código, diretórios, dependências ou bancos automaticamente. O diretório precisa estar acessível pelo volume `PANEL_PROJECTS_DIRECTORY`. Novas aplicações recebem identificadores como `app4`, com serviços `php-app4`, `php-app5` etc., mesmo nos tipos Node.js/Estática. O domínio/subdomínio escolhe o destino; portas internas podem se repetir em containers diferentes. O limite de proteção é de 100 aplicações.

A infraestrutura gera serviços em `config/apps.compose.yaml` e rotas das novas aplicações em `docker/traefik/extra-apps.yml`. As três configurações antigas e seus volumes são preservados. **Não edite os arquivos gerados.** Para PHP adicional, configure acesso próprio ao banco: por exemplo, `APP_4_DB_DATABASE`, `APP_4_DB_USERNAME` e `APP_4_DB_PASSWORD` no `.env` da infraestrutura antes de aplicar. As credenciais de banco da aplicação principal não são herdadas por esses novos cadastros. Crie o banco/usuário na guia Bancos. Os serviços compartilhados permanecem disponíveis pelas redes internas.

O botão **Importar .env** foi removido: o painel usa os formulários e o JSON de configuração e propaga seus apontamentos para o `.env` da infraestrutura ao aplicar. A opção **Editar/Criar .env do projeto** nos detalhes continua existindo, pois edita o arquivo da aplicação, não importa configurações para o painel. Para uma aplicação nova, salve primeiro o cadastro para habilitar esse editor.

Depois de cadastrar, os comandos usam o novo nome do serviço:

```bash
sudo docker compose logs --tail=100 -f php-app4
sudo docker compose exec php-app4 sh
# Somente para uma aplicação PHP/Laravel:
sudo docker compose exec php-app4 php artisan about
sudo docker compose exec php-app4 composer install
```

Para executar npm em um cadastro novo, use o serviço de ferramentas gerado, por exemplo `sudo docker compose run --rm --no-deps node-app4 ci` ou `sudo docker compose run --rm --no-deps node-app4 run build`. Ele só executa quando solicitado e não mantém um servidor Node.js ativo para aplicações estáticas. O utilitário `scripts/apps.py` também aceita os novos identificadores cadastrados.

### 🐘 Administração de PHP e FrankenPHP pela interface

A guia **PHP & FrankenPHP** centraliza:

- Versões configuradas do PHP/FrankenPHP, memória, upload, POST e tempo de execução.
- Exibição de erros, cookie e duração de sessões nativas, memória do OPcache e limites de workers Octane.
- Instalação opcional dos drivers SQL Server, PostgreSQL, SQLite e MySQLi.
- Edição de `php.ini`, `sessions.ini`, `opcache.ini` e `extensions.ini`.
- Seleção de extensões a instalar em `extensions.list`.
- Visualização do modelo `docker/php/Caddyfile` e consulta de versão PHP, módulos carregados e diretivas selecionadas do container de cada aplicação PHP habilitada.

**Configurar execução e drivers** altera as variáveis correspondentes do `.env` da infraestrutura. Os arquivos INI que referenciam `${VARIAVEL}` utilizam esses valores ao iniciar o PHP. Se substituir uma referência por um valor literal no editor avançado, esse literal passa a prevalecer naquele arquivo. Sessões nativas do PHP não substituem a configuração de sessões própria do Laravel. Porta, raiz pública e modo tradicional/Octane continuam nos detalhes de cada aplicação.

**Configurar extensões** controla quais extensões adicionais serão instaladas ao construir a imagem. Desmarcar remove a instalação solicitada; não garante remover módulos que já fazem parte da imagem base do PHP. Drivers dos bancos têm controles específicos. Não repita `extension=`/`zend_extension=` para módulos carregados automaticamente. A extensão `redis` atende também o Valkey. Xdebug e outras extensões de diagnóstico devem ser habilitados apenas quando necessários.

**Fluxo de aplicação:**

1. Abra o formulário ou arquivo, faça os ajustes e confirme **Salvar**. O servidor valida nomes/valores e a revisão para evitar sobrescrever outra edição.
2. O salvamento grava os arquivos e variáveis e guarda a cópia anterior em `.panel-state/php-before-save.json`. Esse arquivo é privado e pode conter conteúdo sensível dos INIs.
3. Clique em **Reconstruir e aplicar PHP** e confira as aplicações afetadas. A operação valida o Compose, para automações das aplicações PHP, reconstrói/recria as aplicações PHP habilitadas e recria workers/agendadores ativos.
4. Consulte o resultado da operação e a seção **Estado efetivo no container**. Aplicações Node.js/Estática e volumes de bancos não são recriados por essa ação.

A reconstrução pode interromper requisições e jobs. Escolha um momento adequado para manutenção. A combinação de versões e as extensões precisam ser compatíveis com a imagem FrankenPHP; o painel valida os campos, mas a existência de tags e a compilação são verificadas no build. Erros na imagem, numa extensão ou nos arquivos INI podem impedir a inicialização. Uma falha não desfaz automaticamente todas as etapas já executadas: consulte o resultado antes de repetir.

A consulta ao container usa **PHP CLI** e não publica `phpinfo()` na aplicação. Os valores do servidor HTTP/Octane podem diferir por SAPI, configuração e alterações feitas pela própria aplicação. A distinção segue o funcionamento dos [arquivos de configuração do PHP](https://www.php.net/manual/en/configuration.file.php) e da [configuração do FrankenPHP](https://frankenphp.dev/docs/config/). O modelo Caddyfile é exibido para consulta; o painel não oferece um editor genérico da configuração HTTP do servidor.

Os editores fazem validação básica das diretivas INI; não substituem a interpretação completa do PHP. Para recuperar manualmente, restaure os arquivos/variáveis da cópia anterior e execute:

```bash
# Exemplo para o serviço principal PHP:
sudo docker compose up -d --build --force-recreate php
sudo docker compose logs --tail=100 php
sudo docker compose exec php php --ini
sudo docker compose exec php php -m
```

Para disponibilizar a guia após atualizar os fontes:

```bash
sudo docker compose up -d --build --no-deps panel
```

Depois, recarregue o navegador. A mudança da interface não reconstrói PHP automaticamente; use o botão de aplicação após revisar os ajustes.

### 📌 Imagens fixadas e guia Tecnologias & conceitos

Todas as **10 imagens externas** usadas pela infraestrutura e pelos estágios de build estão fixadas por **digest SHA-256**: FrankenPHP, MariaDB, PostgreSQL, Valkey, Traefik, phpMyAdmin, Node.js, Caddy, Composer e Docker CLI. As referências estão no `.env`/`.env.example`, nos defaults dos Dockerfiles e em `config/images.lock.json`. A tag continua legível, mas o digest determina o conteúdo baixado, conforme a [orientação oficial do Docker sobre fixação de imagens](https://docs.docker.com/build/building/best-practices/#pin-base-image-versions).

A guia **Tecnologias & conceitos** explica a função de cada componente, exibe referências configuradas e o lock, sinaliza diferenças e lista as versões das bibliotecas da interface. A aba **Documentação · README** lê este arquivo diretamente da infraestrutura. Alterações no README aparecem ao atualizar a documentação, sem recompilar a interface. O conteúdo Markdown é renderizado com tabelas e blocos de código; HTML arbitrário não é executado. O acesso continua restrito à sessão administrativa.

**Atualização consciente de uma imagem:**

1. Escolha a versão desejada e consulte seu digest no registro, por exemplo:

   ```bash
   docker buildx imagetools inspect node:24-bookworm-slim
   ```

2. Atualize a referência no `.env`, incluindo `@sha256:...`. Para FrankenPHP, atualize **PHP_VERSION**, **FRANKENPHP_VERSION** e **FRANKENPHP_DIGEST** em conjunto. O digest pode ser editado na guia PHP. Composer e Docker CLI têm **COMPOSER_IMAGE** e **DOCKER_CLI_IMAGE** completos.
3. Atualize também `.env.example`, os defaults correspondentes dos Dockerfiles e `config/images.lock.json` para registrar a nova decisão. Se apenas o `.env` mudar, o catálogo sinaliza a diferença.
4. Valide com `docker compose config --quiet`, faça os backups apropriados e reconstrua/recrie os serviços afetados. Atualizações de bancos exigem verificar as instruções de migração da versão escolhida.

O digest fixa a imagem base, **não torna toda construção reproduzível bit a bit**: instalações APT e extensões compiladas ainda consultam seus repositórios. As dependências JavaScript estão fixadas no `package-lock.json` e são instaladas com `npm ci`; Bootstrap possui arquivos locais e manifesto de integridade. Os digests consultados agora também não identificam retroativamente uma imagem antiga que já estivesse rodando no host.

### 🔎 Comandos nas confirmações

Antes de executar alterações pelo painel, a confirmação mostra **Comandos e operações previstos**:

- Docker Compose para iniciar, parar, recriar, reconstruir e executar backups/Artisan.
- SQL das operações de banco, com senhas substituídas por marcador.
- Gravações internas de arquivos, cofre e sessão identificadas como operações internas, sem inventar comandos de shell.
- Operações locais da interface identificadas como locais, quando não há execução no servidor.

A prévia é calculada no backend antes de confirmar e **não executa comandos**. Identificadores gerados, validações e condições podem ser resolvidos na execução; essas etapas são descritas no resumo. Comandos usam o diretório da infraestrutura, seu `.env` e os arquivos Compose configurados. Senhas, argumentos de jobs e o conteúdo do comando de terminal são ocultados para evitar reproduzir credenciais nos resumos. O console legado preserva essa ocultação; no terminal interativo, a aprovação acontece ao abrir a sessão e os comandos posteriores executam diretamente.

Para aplicar a atualização do painel:

```bash
sudo docker compose up -d --build --no-deps panel
```

Isso atualiza somente o painel. A adoção das imagens fixadas pelos demais serviços requer a atualização desses serviços, em uma janela de manutenção. Os volumes não devem ser removidos.

### 🗂️ Bancos, usuários e backups em guias separadas

As áreas administrativas agora estão divididas:

| Guia | Função |
| --- | --- |
| Bancos de dados | Criar e listar bancos, tamanho e conexão |
| Usuários dos bancos | Criar contas, alterar senhas, bloquear login e conceder/revogar acesso |
| Backups dos bancos | Agendas, destinos, retenção, envio remoto e cópias existentes |
| Importar / exportar SQL | Criar dumps, baixar resultados e importar SQL por fila |
| Informações do host | Recursos e identificação do servidor Linux hospedeiro |
| Containers & tráfego | Consumo dos containers e tráfego HTTP |

MariaDB e PostgreSQL continuam com serviços e volumes próprios. O seletor de SGBD existe nas guias de administração e transferências.

<a id="transferencias-sql"></a>

### 📤 Exportação e download SQL

Em **Importar / exportar SQL**, selecione a conexão cadastrada e escolha **Estrutura e dados**, **Somente estrutura** ou **Somente dados**, selecione SQL ou SQL gzip e clique em **Preparar exportação**. Confira o comando e confirme. Todas as exportações, inclusive pequenas, passam pela fila; isso permite processar arquivos grandes sem carregar o dump inteiro na memória do navegador ou do painel.

A fila processa **uma tarefa por vez**, com até 20 tarefas pendentes/em execução. Mostra estado, bytes e horário de criação. O cartão de acompanhamento apresenta o percentual real do envio e da leitura do arquivo importado (limitado a 99% até o cliente confirmar a conclusão). Leitura não representa confirmação de cada instrução no banco. A exportação mostra indicador de atividade e bytes gerados, pois o tamanho final é desconhecido. Após iniciar o download, acompanhe seu progresso na área de downloads do navegador. Quando a exportação concluir, o botão **Baixar .sql** disponibiliza o arquivo por streaming, com autenticação. O botão adapta a extensão para `.sql.gz` quando houver compressão gzip. O arquivo fica em `.panel-state/sql-transfers/`, com acesso privado. Exports não são enviados automaticamente para S3 nem seguem a retenção dos backups agendados; são transferências administrativas independentes. Preserve espaço e remova exports antigos manualmente quando não forem mais necessários.

MariaDB usa [`mariadb-dump`](https://mariadb.com/docs/server/clients-and-utilities/backup-restore-and-import-clients/mariadb-dump) com `--single-transaction`, rotinas, eventos e triggers. Não altere schemas durante o dump; a consistência transacional se aplica às tabelas transacionais, não a todos os engines. PostgreSQL usa [`pg_dump`](https://www.postgresql.org/docs/current/app-pgdump.html) em SQL de texto, sem proprietários/ACLs. Os comandos são mostrados antes de confirmar. Esses arquivos são destinados ao mesmo SGBD, sem conversão entre MariaDB e PostgreSQL.

### 📥 Importar SQL existente

1. Se necessário, crie o banco na guia Bancos e uma conta com permissões nesse banco na guia Usuários.
2. Na guia de transferências, escolha SGBD e banco, selecione uma conexão cadastrada em **Dados → Conexões** e um arquivo `.sql` ou `.sql.gz`. Defina a codificação UTF-8 ou Latin-1. No MariaDB, também é possível desativar a verificação de chaves estrangeiras ao abrir a sessão; o próprio dump pode alterar essa configuração.
3. Confirme o envio. Depois, revise a segunda confirmação para **executar** a importação.
4. Acompanhe a tarefa na fila e confira o resultado na aplicação/banco.

Use uma conta limitada ao banco e somente SQL confiável. As contas administrativas principais são recusadas pela interface de transferência. O cliente de importação executa com UID sem privilégios e ambiente limpo, recebendo apenas a senha informada por entrada padrão. A senha não é gravada no histórico da fila; fica em memória enquanto a tarefa aguarda execução. O alcance efetivo do SQL depende das permissões dessa conta: selecionar um banco não reescreve nem filtra o conteúdo do script. Dumps que exigem superusuário, proprietários ou extensões especiais devem ser adaptados ou tratados manualmente.

Importações **podem alterar/remover dados e falhar parcialmente**; não existe rollback geral ou validação sem efeitos para todo SQL. Faça backup antes e não reenvie uma tarefa interrompida sem verificar o banco. Reiniciar/recriar o painel marca tarefas pendentes/em execução como interrompidas, sem retomada automática. O processo Docker/cliente de uma transferência interrompida deve ser conferido antes de repetir. Não atualize/recrie o painel durante transferências.

O limite de upload é configurado em bytes no `.env`:

```dotenv
SQL_UPLOAD_MAX_BYTES=1073741824
SQL_IMPORT_MAX_BYTES=4294967296
```

O limite de envio padrão é 1 GiB. O SQL após descompactação tem limite padrão de 4 GiB (também aplicado a arquivos sem compressão). São aceitos SQL sem compactação e SQL gzip; ZIP/bzip2 não são suportados. Os limites são independentes dos limites do phpMyAdmin. Arquivos de importação são removidos após a tarefa terminar; uploads órfãos com mais de 24 horas são limpos durante novos envios. Há limite de 20 uploads pendentes. Ao cancelar a confirmação de execução, o upload não executa SQL e fica aguardando essa limpeza. Espaço em disco e eventuais limites de proxies externos também precisam comportar o arquivo.

<a id="informacoes-host"></a>

### 🖥️ Informações reais do host

A guia **Informações do host** consulta CPU, memória total/disponível/utilizada, swap, carga média, uptime, nome, sistema operacional, kernel, arquitetura e informações do daemon Docker. CPU é calculada entre amostras; a primeira leitura aguarda uma segunda amostra. Não utiliza `os.hostname()` ou memória do processo do painel para apresentar esses valores como sendo do host.

O Compose monta somente os arquivos Linux necessários de `/proc` e `/etc`, individualmente e em modo somente leitura, em `/host`. Não monta a raiz do host. Se as fontes não estiverem disponíveis, a interface informa isso. Em Docker Desktop, os recursos do daemon correspondem à VM Linux, não necessariamente ao hardware/sistema operacional do computador físico. Discos, temperaturas e números de série não são coletados por essa guia.

Para aplicar a nova interface e as montagens do host:

```bash
sudo docker compose up -d --build --no-deps panel
```

Recarregue o navegador. Esse comando recria o painel; aguarde transferências terminarem antes de executá-lo. O Compose usa caminhos de um host Linux, adequado ao ambiente local Linux e à VPS; outros sistemas exigem adaptar as montagens opcionais do host.

### 🤖 Conexão MCP para ferramentas de IA

A guia **Conexão MCP** permite gerar, listar e revogar chaves de API, distinguir leitura/execução, escolher ações de execução e consultar auditoria. A mesma chave pode acumular os dois escopos. O segredo é exibido uma única vez; somente seu hash e os metadados ficam no servidor. Não há chave padrão.

A integração dispõe de:

- **MCP Streamable HTTP:** `/mcp`, com SDK oficial e autenticação Bearer por requisição.
- **Consulta:** `GET /api/ai/read`, exclusivamente leitura de containers, tecnologias, logs, filas/jobs e processos.
- **Execução:** `PUT /api/ai/execute`, restrito às aplicações e ações permitidas para a chave, com requestId idempotente.
- **Contexto:** `infra_read` com `resource=context` reúne aplicações, revisões, saúde, WebSockets, automações e últimas operações da própria chave. `resource=guide` entrega a Skill e a referência.
- **Prévia:** `infra_plan` ou `POST /api/ai/plan` mostra comandos e impactos sem executar.
- **Acompanhamento:** `GET /api/ai/operations/{id}`, limitado às operações da própria chave.

Não há terminal, SQL, edição de arquivos ou acesso genérico ao Docker por essa API. Operações via IA são autorizadas pelos escopos/ações da chave e não abrem uma confirmação no painel; mantenha a aprovação de ferramentas no cliente e conceda somente as ações necessárias. `job.interrupt` para o worker inteiro, sem cancelamento seletivo ou rollback de um job.

Consulte a [documentação técnica completa](docs/MCP.md) para autenticação, parâmetros, exemplos, limites e configuração do VS Code. A [Skill jubart-mcp](.github/skills/jubart-mcp/SKILL.md) acompanha uma referência autocontida da API e orienta diagnóstico, interpretação de logs e execução autorizada. Ela pode ser copiada para o diretório de skills aceito pela ferramenta de IA; não altera nem instala configurações do editor automaticamente. A própria tela oferece links autenticados para abrir/baixar SKILL.md, sua referência e a documentação. Selecione explicitamente as aplicações e ações de cada chave. Chaves antigas mantêm seu escopo anterior; revogue e recrie para restringir. Início/parada/reinício afeta apenas o container da aplicação escolhida; configurar WebSocket permite ativação, porta e origens, preservando imagem, comando, provedor e domínio. Não há configuração global via IA.

As dependências MCP/Zod estão fixadas no package-lock e são instaladas no build do painel. Para disponibilizar:

```bash
sudo docker compose up -d --build --no-deps panel
```

Na VPS, utilize o subdomínio HTTPS do painel. No VS Code, use o exemplo apresentado na guia MCP e forneça a chave pelo armazenamento de segredos/input protegido suportado pelo cliente, sem gravá-la no repositório. Tokens em URL não são aceitos. A auditoria privada fica em `.panel-state/mcp/audit.jsonl`, com rotação em 10 MiB e cinco arquivos anteriores; o painel mostra os 200 eventos recentes.

### 🧭 Navegação do painel e formulários

O menu lateral agrupa páginas em **Workspace**, **PHP & FrankenPHP**, **Processos**, **Dados**, **Monitoramento** e **Integrações e documentação**. Clique no nome do grupo para expandir ou recolher. Em Processos, filas/workers, jobs, falhas e Scheduler possuem páginas próprias. Em PHP, configuração, servidor, arquivos INI, extensões e estado efetivo ficam separados. Cada página possui **Dicas desta página** com orientações sobre seu uso e os impactos das ações.

Ao criar um usuário de banco ou definir sua nova senha, você pode digitar a senha ou clicar em **Gerar senha**. A geração usa o gerador criptográfico do navegador e produz 32 caracteres. **Exibir/Ocultar** permite conferir o valor; gerar não salva nem modifica o banco. A gravação continua exigindo a confirmação da operação.

Na importação/exportação SQL, selecione **Driver / servidor** e o banco listado. O inventário é consultado com a conta administrativa já configurada na infraestrutura. **Atualizar bancos** refaz a consulta; falhas de acesso são exibidas na tela. Para executar importações, use a conta limitada solicitada no formulário.

Os editores de `.env` e de arquivos INI usam toda a largura disponível. **Maximizar** amplia o editor para a área da janela; **Restaurar** retorna ao tamanho anterior, sem perder o texto. Salvar mantém a revisão e a confirmação dos possíveis impactos.

Para aplicar esta atualização da interface, preservando os volumes:

```bash
sudo docker compose up -d --build --no-deps panel
```

Depois, atualize o navegador com **Ctrl + Shift + R**.

### 🗑️ Excluir uma cópia de backup local

Em **Dados → Backups dos bancos**, escolha MariaDB ou PostgreSQL e clique em **Excluir backup** na linha do arquivo. A confirmação mostra o arquivo, o comando previsto e o impacto antes de executar.

A exclusão é permanente: remove somente o dump local selecionado e seus marcadores `.sha256` e `.uploaded`. Uma eventual cópia remota permanece no destino S3. Não altera bancos ou volumes. O serviço recusa caminhos externos, links simbólicos e exclusões enquanto outro backup mantém a trava do diretório. Aguarde a conclusão do ciclo e tente novamente.

Esta atualização inclui o painel e o script dos dois serviços de backup. Para aplicá-la, após concluir eventuais backups ativos:

```bash
sudo docker compose up -d --build --no-deps panel backup backup-postgres
```

Atualize o navegador com **Ctrl + Shift + R**. O comando recria os serviços cuja imagem mudou e preserva os volumes e as cópias existentes.

### 🟢 Área Node.js no painel

O submenu **Node.js** reúne:

- **Aplicações Node.js**: lista filtrada e cadastro já com tipo Node, comando de inicialização, diretório de trabalho, porta interna, domínio e edição do `.env` do projeto. Salvar e aplicar usam as mesmas configurações da guia Aplicações.
- **Execução e logs Node.js**: estado, saúde, última subida, logs e ações de iniciar, reiniciar ou parar cada aplicação, com confirmação dos comandos e impactos.
- **Publicação Node.js**: instruções de dependências, build, publicação e atualização, além da diferença entre um processo Node e um build estático.

Os nomes de serviço `php` e `php-appN` são mantidos por compatibilidade; o tipo da aplicação determina se o container executa Node, PHP ou servidor estático. A imagem Node das aplicações é fixada pela referência completa em `APP_NODE_VERSION`, incluindo o digest; `NODE_VERSION` permanece separado para o painel. Dependências não são instaladas automaticamente ao iniciar a aplicação.

Para atualizar apenas o painel:

```bash
sudo docker compose up -d --build --no-deps panel
```

Na página **PHP em execução**, alterne entre as abas **Módulos carregados** e **Diretivas efetivas**. Cada aba mantém sua própria busca e filtros; use também as setas do teclado para alternar entre elas. Para aplicar atualizações da interface, execute `sudo docker compose up -d --build --no-deps panel` e atualize o navegador com Ctrl + Shift + R.

### Remover o cadastro de uma aplicação com pasta vazia

Na listagem de aplicações, salve eventuais rascunhos e clique em **Verificar pasta vazia**. Se a pasta não contiver arquivos ou subdiretórios, inclusive ocultos, aparecerá **Apagar cadastro**. A aplicação principal não pode ser removida; retire antes cadastros de filas, jobs e Scheduler vinculados à aplicação adicional.

A confirmação mostra a aplicação, pasta, comandos e impactos. O painel verifica novamente o diretório, para e remove somente o container correspondente, sem a opção de remover volumes, e retira o cadastro e roteamento. A pasta do host permanece, assim como bancos e volumes compartilhados. Uma cópia do cadastro anterior fica em `.panel-state/apps-before-remove.json`. Se outra operação modificar a pasta ou a configuração, a remoção será recusada; caso o container já tenha sido parado, ele poderá precisar ser iniciado novamente.

Para aplicar esta atualização: `sudo docker compose up -d --build --no-deps panel`. Depois, Ctrl + Shift + R no navegador.

### 💽 Armazenamento do host e dos containers

Em **Monitoramento → Armazenamento**, o painel mostra:

- Capacidade total, espaço usado e disponível no sistema de arquivos monitorado do host.
- Camada gravável de cada container do projeto e suas montagens.
- Volumes persistentes, contados uma única vez mesmo quando compartilhados, com os containers que os utilizam.
- Espaço de camadas de imagens do daemon Docker completo, incluindo outros projetos.

Containers usam o disco do host: não possuem SSDs independentes. O tamanho do sistema de arquivos de um container inclui camadas de imagens compartilhadas e não deve ser somado entre containers. Logs, pastas montadas do host (bind mounts), metadados e caches podem não estar incluídos no total coletado pelo Docker. Valores indisponíveis aparecem como `—`. A tela não identifica o dispositivo físico como SSD ou HDD, nem soma partições/discos distintos automaticamente.

No `.env`, `HOST_STORAGE_DIRECTORY=.` monitora o sistema de arquivos da pasta da infraestrutura. Para monitorar outro disco/partição, indique uma pasta existente nele, por exemplo `HOST_STORAGE_DIRECTORY=/mnt/dados/monitoramento`. Essa pasta é montada somente para leitura no painel; prefira uma pasta dedicada. Alterar a variável exige recriar o painel:

```bash
sudo docker compose up -d --build --no-deps panel
```

A consulta de disco pode percorrer muitos arquivos Docker; use **Atualizar armazenamento** quando precisar de uma nova amostra. A coleta não remove arquivos e não faz limpeza automática.

### 🧠 Limites de RAM dos containers

Em **Monitoramento → Memória dos containers**, consulte o consumo atual, o limite configurado no `.env` e o limite efetivo no container. Clique em **Configurar memória**, informe MiB e revise os comandos e impactos antes de confirmar.

- `0`: sem limite explícito; não reserva memória.
- Limite definido: mínimo de 64 MiB. O limite de memória + swap é igual ao de RAM, desativando swap para esse container.
- O limite é persistido antes da atualização em execução. Se o Docker recusar a atualização, a tela informa que a configuração foi salva; confira o limite efetivo e recrie somente o serviço para aplicar.
- Um limite insuficiente pode encerrar processos por OOM. O próprio painel também está sujeito ao limite escolhido; mantenha uma margem para consultas e operações.
- `memory_limit` do PHP é por processo e continua separado do limite total do container.

O painel grava variáveis como `CONTAINER_MEMORY_MARIADB=512m` e `CONTAINER_MEMORY_PHP_APP4=1024m`. Serviços base, aplicações geradas e workers/Scheduler usam essas variáveis nas próximas recriações. A cópia anterior do ambiente fica em `.panel-state/env-before-memory`.

Se alterar manualmente um limite no `.env`, execute, por exemplo:

```bash
# Substitua mariadb pelo serviço configurado; haverá interrupção durante a recriação.
sudo docker compose up -d --no-deps --force-recreate mariadb
```

Para serviços com profile, inclua-o: `sudo docker compose --profile app4 up -d --no-deps --force-recreate php-app4`. Os volumes são preservados. Para atualizar esta versão do painel, execute o comando de build do painel acima e atualize o navegador com Ctrl + Shift + R.

Referências: [espaço usado pelo Docker](https://docs.docker.com/reference/cli/docker/system/df/), [atualização de recursos de containers](https://docs.docker.com/reference/cli/docker/container/update/) e [limites de memória e swap](https://docs.docker.com/engine/containers/resource_constraints/).

### 🔎 Captura de requisições por CPU, memória e duração

Em **Monitoramento → Captura de requisições**, abra **Regras de captura → Nova regra**. Selecione a aplicação, o prefixo do endpoint (por exemplo `/usuarios`) e os limites:

- **CPU (%)**: 100% corresponde ao uso de um núcleo pelo container; processos com múltiplos núcleos podem ultrapassar 100%.
- **Memória (%)**: percentual reportado pelo Docker em relação ao limite disponível ao container. Sem limite explícito, a referência pode ser a memória do daemon/VM.
- **Duração (ms)**: tempo total da resposta no Traefik. Exemplo: `1000` captura respostas de pelo menos um segundo.

`0` desativa um critério. Escolha **Qualquer limite habilitado** (OU) ou **Todos os limites habilitados** (E). Salvar, editar, remover regras e limpar eventos pedem confirmação com resumo e impactos. Nenhuma regra é ativada automaticamente pela atualização: cadastre as regras desejadas.

A coleta ocorre no servidor do painel, mesmo com o navegador fechado, enquanto o serviço `panel` estiver ativo. Consulta logs JSON do Traefik e métricas Docker aproximadamente a cada cinco segundos quando há regras ativas. Registra aplicação, domínio, método, caminho sem query string, status HTTP, duração no proxy/origem e picos das amostras do mesmo container na janela da requisição, com tolerância de cinco segundos. Há busca, filtros por aplicação/motivo e detalhes de cada evento.

**Limites do diagnóstico:** amostragem não identifica a causa da lentidão. Requisições concorrentes podem contribuir para os picos; picos curtos podem não aparecer. O painel não captura stack traces, métodos internos ou SQL executado. Para investigar a causa, correlacione horário/endpoint com logs da aplicação, banco e uma solução de tracing/APM. Requisições que não passam pelo Traefik não são observadas. O acesso HTTPS terminado no proxy também pode ser capturado.

Os eventos do painel não guardam corpo, cabeçalhos ou query string. O caminho pode conter identificadores ou dados pessoais. Os access logs originais do Traefik são distintos e podem conter campos adicionais, inclusive a query string; limite o acesso aos logs. Os cabeçalhos do access log ficam desativados por padrão.

O estado fica em `.panel-state/request-captures.json`, com permissões restritas. Retenção dos eventos: sete dias e no máximo 1000 registros. Eventos idênticos são deduplicados; limpar a listagem não apaga logs Docker e não remove regras. O coletor lê até 2000 linhas por consulta e recupera no máximo os últimos 60 segundos após uma pausa. A tela avisa sobre truncamento ou lacuna; não há garantia de captura completa em alto tráfego ou durante indisponibilidade. Os logs do Traefik usam rotação configurável por `TRAEFIK_LOG_MAX_SIZE` e `TRAEFIK_LOG_MAX_FILES` no `.env`.

Para aplicar esta atualização, incluindo logs JSON e rotação no proxy:

```bash
sudo docker compose up -d --build --no-deps panel traefik
```

O proxy e o painel podem ter uma breve interrupção. Volumes são preservados. Depois, atualize o navegador com Ctrl + Shift + R e crie uma regra. Veja também a [documentação de access logs do Traefik](https://doc.traefik.io/traefik/observability/access-logs/).

### 🔄 Reiniciar serviços e retornar após reiniciar o host

Em **Workspace → Serviços**, cada serviço gerenciável possui **Reiniciar**, **Parar** e **Iniciar**, conforme o estado. As ações pedem confirmação e mostram os comandos. Filas e agendadores são administrados nas páginas de Processos. Em **Detalhes**, veja a política de inicialização efetiva do container. O painel é protegido contra interromper a própria interface: para reiniciá-lo, use o terminal do host.

```bash
sudo docker compose restart mariadb
sudo docker compose restart php
sudo docker compose restart traefik
sudo docker compose restart panel
```

Serviços contínuos usam `restart: unless-stopped`, incluindo aplicações PHP, Node e estáticas e os workers/Scheduler gerados que já foram iniciados. Quando o daemon Docker inicia após reiniciar o host, esses containers voltam automaticamente se estavam ativos. Containers parados manualmente permanecem parados; aplicações desabilitadas e ferramentas npm de execução única não são iniciadas automaticamente. A política não cria containers que nunca foram criados e não implica que um container unhealthy será reiniciado apenas por falhar no healthcheck.

No host Linux com systemd, confira e habilite o daemon Docker para iniciar com o sistema:

```bash
sudo systemctl is-enabled docker
sudo systemctl enable --now docker
sudo systemctl status docker --no-pager
```

Esses comandos são executados no host, não no terminal interno de uma aplicação. Docker Desktop possui uma configuração própria para iniciar ao entrar no sistema. Referência: [inicialização automática dos containers](https://docs.docker.com/engine/containers/start-containers-automatically/).

### 🛑 Processos de aplicações e recuperação de serviços presos

Em **Processos → Processos das aplicações**, selecione uma aplicação PHP ou Node habilitada. A listagem consulta `/proc` dentro do container e apresenta PID, processo pai, nome, estado e RAM residente. Não lê argumentos de linha de comando, que podem conter senhas. Atualiza a cada cinco segundos enquanto a página está ativa.

Para um processo filho identificado, clique em **Encerrar processo**, escolha **SIGTERM** (solicita encerramento gracioso) ou **SIGKILL** (forçado, sem limpeza), revise a confirmação e execute. Enviar um sinal não garante que o processo desapareça imediatamente: atualize a tabela; processos em espera ininterruptível de I/O podem continuar até o kernel liberar a operação. O painel verifica container, namespace e instante de criação do processo antes de sinalizar, reduzindo o risco de atingir um PID reutilizado. PID 1 é protegido. Containers com namespace PID compartilhado ou do host não podem ser operados por essa API.

**Reiniciar serviço da aplicação** executa novamente o comando de inicialização configurado, com confirmação dos impactos. Não existe reinício genérico seguro de um PID isolado: a infraestrutura não reproduz argumentos arbitrários de processos. Um processo filho pode ser recriado pelo supervisor da aplicação, se houver; caso contrário, use o reinício do serviço. As ações de sinal ficam em `.panel-state/process-actions.jsonl`, com ator, aplicação, PID, sinal, horário e resultado. O arquivo rotaciona ao atingir aproximadamente 1 MiB, mantendo uma cópia anterior.

**Limitação importante:** essa função encerra processos, não uma requisição HTTP individual. Um processo Node ou FrankenPHP pode atender várias requisições simultâneas, e encerrar esse processo interrompe todas elas, além de possíveis tarefas/gravações. Os eventos de Captura de requisições são registrados após a resposta e não demonstram qual PID executou um endpoint.

Cancelar uma requisição ativa com precisão exige instrumentação na aplicação, identificação de cada execução e suporte cooperativo ao cancelamento (por exemplo, AbortController no Node). Fechar a conexão ou aplicar timeout no proxy não garante que o código pare de executar. Esta versão não implementa esse cancelamento individual nem identifica automaticamente um processo como causador de um evento de lentidão.

Para atualizar:

```bash
sudo docker compose up -d --build --no-deps panel
```

Depois, Ctrl + Shift + R. Se ainda não aplicou a atualização anterior de captura, inclua `traefik` no comando para habilitar os access logs JSON.

<a id="imagens-fixadas-e-licencas"></a>

### 📌 Política de imagens fixadas e componentes open source

As **10 imagens externas** do Compose e dos estágios de build usam referências com **tag legível + digest SHA-256**. A tag identifica a linha escolhida; o digest fixa o conteúdo baixado, inclusive quando uma tag como `composer:2` ou `docker:cli` muda no registro. Imagens construídas localmente, como a do painel, são resultados do build; suas bases externas também estão fixadas.

| Imagem externa | Referência legível adotada |
| --- | --- |
| FrankenPHP / PHP | `dunglas/frankenphp:1-php8.4.27-bookworm` |
| MariaDB | `mariadb:11.4` |
| PostgreSQL | `postgres:18-bookworm` |
| Valkey | `valkey/valkey:8-alpine` |
| Traefik Proxy | `traefik:v3.7` |
| phpMyAdmin | `phpmyadmin:5.2-apache` |
| Node.js | `node:24-bookworm-slim` |
| Caddy | `caddy:2-alpine` |
| Composer | `composer:2` |
| Docker CLI / plugin Compose da imagem | `docker:cli` |

Cada referência acima é usada com `@sha256:...`. Os valores completos ficam no `.env`, no `.env.example`, nos defaults dos Dockerfiles e no [lock de imagens](config/images.lock.json). A guia Tecnologias e conceitos permite consultá-los. Não remova o digest ao mudar uma tag. Atualize versão e digest juntos, revise o lock e defaults, valide com `docker compose config --quiet` e reconstrua apenas os serviços afetados. Fixação não dispensa atualizações de segurança e não significa que APT ou compilação de extensões sejam reproduzíveis bit a bit.

A infraestrutura deve usar **dependências open source**, incluindo componentes de execução e ferramentas de build/teste. O inventário com licenças e links oficiais está em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). O [relatório npm](config/dependencies.licenses.json) relaciona as licenças declaradas das entradas do lock atual. Isso não substitui uma auditoria completa/SBOM das imagens e seus pacotes de sistema.

**Alteração de compatibilidade:** SQL Server via ODBC Microsoft está bloqueado para respeitar esta política. `PHP_INSTALL_SQLSERVER` deve permanecer `false`. A habilitação é recusada no painel/backend e no build; não há substituição automática por outro driver. Se uma imagem antiga tiver esses componentes, ela precisa ser reconstruída para aplicar a restrição. Bancos MariaDB/PostgreSQL e drivers open source permanecem disponíveis.

A verificação visual agora usa **Chromium**, sem exigir Google Chrome. Instale-o no ambiente de desenvolvimento e, se necessário, indique `CHROMIUM_BINARY=/caminho/para/chromium`. O navegador de testes não faz parte da imagem do painel.

Para aplicar as mudanças do painel e da imagem PHP, com breve interrupção dos serviços correspondentes:

```bash
sudo docker compose up -d --build --no-deps panel php
```

As outras aplicações PHP compartilham a imagem, mas precisam ser recriadas para utilizá-la; use também Reconstruir e aplicar PHP no painel quando houver aplicações adicionais ou workers. Volumes são preservados. Depois, Ctrl + Shift + R.

### 🔗 Integrações externas por aplicação

Abra **Integrações e documentação → Integrações externas → Nova integração**. Escolha a aplicação e a ferramenta:

| Ferramenta | Disponível nesta versão |
| --- | --- |
| GitHub Actions | Cadastro por aplicação, consulta de workflows e execuções, disparo manual do workflow configurado |
| GitLab CI, Forgejo Actions, Jenkins e outra ferramenta | Link configurável para abrir o painel externo; sem chamadas à API ou execução automática |

GitHub Actions é um serviço externo opcional. Vinculá-lo não instala componentes proprietários na infraestrutura e não muda a política open source dos componentes locais. Também não instala runners, concede acesso ao socket Docker, faz checkout, transfere artefatos ou configura SSH no servidor.

#### Configurar GitHub Actions

1. Prepare o workflow no repositório da aplicação, em `.github/workflows/deploy.yml`, por exemplo. Ele precisa aceitar `workflow_dispatch` e não pode exigir inputs nesta versão. Configure as etapas de testes, build, entrega/publicação e recuperação no próprio workflow.
2. Crie no GitHub um **fine-grained personal access token** restrito ao repositório. Use **Actions: read** para consultas ou **Actions: write** para disparos. Defina expiração e obtenha aprovação da organização quando exigida. Repositórios públicos podem permitir consultas sem token, sujeitos aos limites do GitHub; disparos pelo painel exigem token.
3. No painel, cadastre aplicação, owner (organização/usuário), repositório, arquivo do workflow ou ID, branch/tag e token. `PANEL_VAULT_KEY` no `.env` precisa estar configurada e permanecer estável para cifrar/decifrar a credencial.
4. Use **Workflows e execuções** para conferir o acesso. O painel mostra até 50 workflows e as últimas 20 execuções do workflow selecionado. As informações são atualizadas ao consultar, sem polling permanente da API externa.
5. Clique em **Disparar workflow**, confira repositório, workflow, ref e impactos e confirme. Isso envia uma solicitação ao GitHub. Aceitação não confirma execução bem-sucedida ou deploy concluído; acompanhe as execuções e os logs no GitHub. Um workflow pode consumir minutos/custos da conta.

Configure [GitHub Environments, Secrets e aprovações](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments) conforme as necessidades do deploy. O painel não administra esses recursos no GitHub e não envia inputs personalizados nesta versão. As chamadas usam os endpoints oficiais de [workflows](https://docs.github.com/en/rest/actions/workflows) e [execuções](https://docs.github.com/en/rest/actions/workflow-runs).

#### Credenciais, configuração e auditoria

- Metadados: `config/external-tools.json` — nome, aplicação, provedor, repositório, workflow e ref, sem token.
- Credenciais: `.panel-state/external-tools/secrets.json`, cifradas com AES-256-GCM usando `PANEL_VAULT_KEY`, em arquivo restrito. O valor não volta para a interface, confirmações ou auditoria.
- Token vazio preserva a credencial anterior. Marque **Remover token armazenado** para excluí-la; para revogar o token efetivamente, faça isso também no GitHub.
- Auditoria: `.panel-state/external-tools/audit.jsonl`, com operações de cadastro, remoção e disparo, sem segredos. Rotação aproximada de 1 MiB, mantendo o arquivo anterior.
- A integração GitHub chama somente `api.github.com` por HTTPS, sem seguir redirecionamentos. Links das outras ferramentas não são consultados pelo backend. Não coloque credenciais nas URLs dos atalhos.
- Chamadas do painel exigem sessão administrativa e CSRF nas alterações. Não foi criado um webhook público de deploy ou acesso GitHub com permissões administrativas sobre a VPS.

Excluir uma integração remove o vínculo local e a credencial guardada. Não apaga workflows, repositórios, arquivos da aplicação ou tokens no provedor. Aplicações removidas não podem mais usar a API da integração vinculada; remova ou atualize seus cadastros externos.

Para aplicar a atualização:

```bash
sudo docker compose up -d --build --no-deps panel
```

Depois, Ctrl + Shift + R. Não é necessário reconstruir PHP, Node ou bancos para cadastrar essas integrações.

### 🧰 Versões e pacotes pelo painel

A administração está separada em:

| Página | Função |
| --- | --- |
| **PHP & FrankenPHP → Versão do PHP** | Alterar versão PHP/FrankenPHP, consultar digest no Docker Hub, salvar e reconstruir/recriar aplicações PHP e automações ativas |
| **Node.js → Versão do Node** | Alterar imagem Node das aplicações e ferramentas, consultar digest, salvar e recriar aplicações Node e Vite/SSR em execução |
| **Workspace → Pacotes das aplicações** | Instalar dependências pelo lock, adicionar/trocar uma versão exata, remover uma dependência e executar scripts declarados no manifesto |
| **PHP & FrankenPHP → Extensões PHP** | Selecionar módulos compilados na imagem; aplicar exige reconstrução PHP |

#### Trocar versão do runtime

1. Abra a página do runtime e clique em **Trocar versão**.
2. Informe PHP + FrankenPHP, ou uma tag Node, como `24-bookworm-slim`.
3. Clique em **Consultar digest da versão digitada**. O painel consulta somente os repositórios Node/FrankenPHP no Docker Hub e preenche o SHA-256. Também é possível informar o digest manualmente. Essa consulta não instala a imagem.
4. Salve, após revisar a confirmação. O `.env` e `config/runtime-images.lock.json` são atualizados; a cópia anterior do ambiente fica em `.panel-state/env-before-runtime-version`.
5. Clique em **Aplicar versão salva**, confira os comandos e confirme a interrupção dos serviços afetados.

A existência de uma tag não comprova suporte de segurança, compatibilidade com o código ou suporte à arquitetura da VPS. Confira [versões suportadas do PHP](https://www.php.net/supported-versions.php) e [releases Node](https://nodejs.org/en/about/previous-releases) antes de escolher. Use uma combinação PHP/FrankenPHP publicada e compatível. O runtime é compartilhado; esta versão não escolhe uma versão PHP/Node diferente para cada aplicação.

**Separação Node:** `APP_NODE_VERSION` contém a referência completa, incluindo digest, das aplicações Node e ferramentas npm/Vite/SSR. `NODE_VERSION` continua sendo a base de build/execução do painel e pode permanecer independente. Se `APP_NODE_VERSION` estiver ausente, o Compose usa `NODE_VERSION` como fallback. A página de Node não reconstrói nem troca o runtime do próprio painel.

O catálogo inicial `config/images.lock.json` permanece como referência da infraestrutura. As alterações de runtime feitas pela nova interface são registradas em `config/runtime-images.lock.json`; os Dockerfiles e `.env.example` mantêm os defaults do repositório. A aplicação das versões preserva volumes, mas interrompe os serviços recriados. Trocar Node não reinstala automaticamente dependências nem recompila módulos nativos; revise a instalação e o build do projeto depois da troca.

#### Gerenciar pacotes por aplicação

Escolha a aplicação e o gerenciador. **npm** atende PHP com frontend, Node e aplicações estáticas; **Composer** aparece para aplicações PHP. O manifesto precisa existir (`package.json` ou `composer.json`). Para Node, o npm usa o diretório de trabalho configurado da aplicação; nos demais casos usa a raiz do projeto montada em `/var/www/html`.

- **Instalar pelo lock:** executa `npm ci` ou `composer install`, usando as versões resolvidas. Não é uma atualização geral de versões. npm exige um `package-lock.json` moderno v2/v3.
- **Adicionar / trocar versão:** informe pacote e versão exata, por exemplo `1.2.3`, e indique se é dependência de desenvolvimento. Não aceita `latest`, intervalos, URLs ou opções arbitrárias.
- **Remover:** retira uma dependência direta do manifesto/lock e reinstala as dependências resultantes.
- **Executar script:** escolhe somente scripts declarados no manifesto, por exemplo `build` ou `post-autoload-dump`. Essa ação executa código do projeto e exige uma confirmação própria.

As instalações npm usam `--ignore-scripts`; Composer usa `--no-scripts --no-plugins`. Se o projeto depender de scripts de inicialização, descoberta de pacotes ou build, execute os scripts declarados explicitamente depois de revisar seu conteúdo. Plugins Composer não são ativados por esta página. Não são instalados pacotes APT nem ferramentas globais no host.

Adicionar/remover primeiro prepara o lock sem instalar os pacotes. O painel revisa as licenças declaradas das dependências transitivas no lock antes da instalação. Licenças ausentes ou fora da lista revisada bloqueiam a instalação; nesse caso, os manifestos anteriores são restaurados. É uma revisão de metadados, não uma auditoria de código/SBOM. Pacotes locais do próprio projeto não recebem uma licença nova por essa revisão. Consulte a política em `THIRD_PARTY_NOTICES.md`.

Os comandos rodam em containers temporários, com UID/GID do diretório de trabalho, sem iniciar bancos/dependências e com cache em `/tmp`. A imagem precisa fornecer `timeout` (presente nas bases Debian adotadas); o comando tem limite de 30 minutos, com encerramento forçado após dez segundos adicionais. npm pode substituir `node_modules`; Composer altera `vendor`. O limite de memória do serviço também vale para o container temporário e pode precisar de ajuste para instalações/builds maiores.

As confirmações exibem os comandos previstos. Manifestos e locks anteriores são guardados em `.panel-state/package-backups/`. Esse backup não inclui `vendor` ou `node_modules`: se a instalação falhar depois de iniciada, pode haver atualização parcial das dependências, exigindo nova instalação/revisão. Não reinicie a aplicação automaticamente sem conferir o resultado. Evite operações concorrentes de deploy ou edição dos manifestos enquanto o gerenciador trabalha.

Pré-requisito: salve e aplique o cadastro da aplicação para gerar seus serviços e ferramentas. O painel não configura credenciais de registries privados. As operações usam os arquivos/configurações do projeto, sujeitos às permissões e à conectividade do ambiente.

Para aplicar esta atualização da infraestrutura e do painel:

```bash
sudo docker compose config --quiet
sudo docker compose up -d --build --no-deps panel
```

Depois, Ctrl + Shift + R. Não é necessário trocar o runtime nem instalar dependências das aplicações apenas para atualizar a interface. As novas versões só entram nos serviços após a ação **Aplicar versão salva**. Referências: [npm ci](https://docs.npmjs.com/cli/commands/npm-ci/), [npm install](https://docs.npmjs.com/cli/commands/npm-install/) e [Composer CLI](https://getcomposer.org/doc/03-cli.md).

### 👥 Usuários e permissões do painel

Em **Administração → Usuários e permissões**, um administrador pode criar contas, editar tarefas/recursos autorizados, redefinir senhas e desativar acessos. Essas contas são distintas dos usuários MariaDB/PostgreSQL e das chaves MCP.

O administrador definido por `PANEL_USERNAME` e `PANEL_PASSWORD` no `.env` permanece protegido: não pode ser editado, desativado ou substituído pela interface. Ele continua sendo a conta de recuperação. Novas contas podem ter **Administrador completo** (todas as áreas, inclusive usuários e credenciais) ou **acesso restrito**, com permissões explícitas:

| Permissão | Escopo |
| --- | --- |
| Visualizar serviços | Estado mínimo e saúde dos serviços selecionados |
| Consultar logs | Logs somente dos serviços selecionados; podem conter informações sensíveis |
| Iniciar / parar / reiniciar | Cada ação pode ser concedida separadamente, somente nos serviços selecionados |
| Monitorar host | CPU, memória e informações gerais do servidor; não concede configuração ou credenciais |
| Consultar backups | Arquivos individuais dos bancos selecionados, sem download, exclusão ou acesso a dumps globais |
| Executar backup | Cópia local somente do banco e servidor selecionados |

**Exemplos:**

- Para um observador, marque **Visualizar estado** e os serviços que ele pode acompanhar. Acrescente logs ou monitoramento do host apenas se necessários.
- Para um operador, conceda **Parar** e/ou **Reiniciar**, escolhendo os serviços. Isso pode interromper aplicações dependentes; cada ação pede confirmação.
- Para um usuário de backup, marque **Executar backup** e escolha, por exemplo, `mariadb / appdb`. Para consultar suas cópias locais, marque também **Consultar cópias**. A mesma conta pode ter bancos específicos de MariaDB e PostgreSQL.

Na criação e redefinição de senha, use **Gerar senha** ou informe uma senha de 16 a 128 caracteres. Na edição, senha vazia preserva a atual. Desativar uma conta, trocar senha ou alterar permissões invalida suas sessões anteriores na próxima requisição; o usuário precisa entrar novamente. Uma operação já aceita não é cancelada por essa mudança. Não há exclusão de contas pela interface, preservando a identificação na auditoria. As contas restritas não alteram a própria senha nesta versão; a redefinição é feita por um administrador.

#### Restrição aplicada na API

Contas restritas recebem uma interface própria, com somente os serviços, monitoramento e backups autorizados. Não carregam as telas administrativas. A API valida o usuário e a versão de suas permissões em todas as requisições autenticadas, nega por padrão os outros endpoints e filtra recursos antes de responder. Alterar o HTML ou chamar uma URL administrativa diretamente não concede acesso.

Operar um serviço permite ver seu estado mínimo para escolher a ação. A permissão de controle não concede terminal automaticamente (é necessária concessão separada), edição de `.env`, gestão de pacotes, contas de banco, chaves de API ou configuração do host. Filas e agendadores e o próprio serviço `panel` não podem ser operados por essas contas; use administração completa para essas áreas. Aplicações desabilitadas não podem ser iniciadas ou reiniciadas pela operação de serviço.

O backup delegado força **um único banco**, `BACKUP_RETENTION_DAYS=0` e `BACKUP_REMOTE_ENABLED=false`, sem aceitar diretório ou opções adicionais do usuário. Isso evita executar retenção global ou upload de outras cópias. O modo `delegated-once` também preserva os marcadores globais de sucesso/falha da agenda. Uma imagem de backup antiga recusa esse modo até ser atualizada, em vez de executar um ciclo global. Usa o destino local administrado da infraestrutura. A consulta exibe apenas arquivos individuais com banco e timestamp identificáveis, dentre os 30 backups mais recentes por servidor; cópias mais antigas ou dumps globais não são listados nesse acesso. Permissão de backup não permite alterar/remover bancos, importar SQL ou apagar backups.

#### Armazenamento e recuperação

- Contas e permissões: `.panel-state/panel-users/users.json`, com arquivo restrito e senhas armazenadas como hash **scrypt**, salt aleatório e comparação de tempo constante. Senhas, hashes e salts não são retornados pela API de usuários.
- Auditoria: `.panel-state/panel-users/audit.jsonl`, com criação/alteração de contas, login, negações e ações de serviço/backup. Rotação aproximada de 2 MiB, mantendo um arquivo anterior. Senhas não são registradas.
- Sessões: cookies HttpOnly/SameSite e estado em memória, com duração máxima de oito horas. Reiniciar o painel encerra sessões; os cadastros persistem na pasta da infraestrutura.
- Inclua `.panel-state` no backup administrativo seguro da infraestrutura. A pasta já está excluída pelo `.gitignore`; não publique esses arquivos.
- Para recuperar acesso, use a conta protegida do `.env`. Se alterar suas credenciais, recrie o painel. Na VPS, publique o painel com HTTPS e configure `PANEL_COOKIE_SECURE=true` conforme as instruções de proxy.

A autorização segue negação por padrão e validação a cada requisição, conforme a [orientação OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html). As credenciais usam derivação de senha com custo de memória, conforme as [recomendações de armazenamento de senhas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

Para aplicar esta atualização:

```bash
sudo docker compose up -d --build --no-deps panel backup backup-postgres
```

Aguarde backups ativos terminarem antes de atualizar os serviços de backup. Depois, Ctrl + Shift + R, entre com o administrador e cadastre as contas. Nenhum usuário adicional ou permissão é criado automaticamente pela atualização.

<a id="sec-escolher-quais-bancos-iniciar"></a>

## 🗄️ Escolher quais bancos iniciar

A infraestrutura inicia **MariaDB e PostgreSQL por padrão**. No `.env` da infraestrutura, configure:

| Cenário | `MARIADB_ENABLED` | `POSTGRES_ENABLED` |
| --- | --- | --- |
| Ambos (padrão) | `true` | `true` |
| Somente MariaDB | `true` | `false` |
| Somente PostgreSQL | `false` | `true` |
| Nenhum banco local | `false` | `false` |

Use apenas `true` ou `false`. O MariaDB controla também a inicialização de `backup` e `phpmyadmin`; o PostgreSQL controla `backup-postgres`. PHP, Node.js, aplicações estáticas, Traefik, Valkey e painel mantêm suas configurações. O PHP não depende da presença de um banco local para iniciar; a aplicação ainda precisa de uma conexão válida quando suas funcionalidades utilizam banco.

Na primeira inicialização, basta:

```bash
docker compose up -d --build
```

Ao **alterar a seleção em uma infraestrutura já iniciada**, execute a partir da pasta da infraestrutura:

```bash
# Aguarde backups em andamento terminarem. Esta parada interrompe conexões locais.
docker compose --profile '*' stop backup backup-postgres phpmyadmin mariadb postgres
# Sobe apenas os bancos selecionados e atualiza o painel com a configuração.
docker compose up -d --build
docker compose up -d --no-deps --force-recreate panel
docker compose ps -a
```

A parada explícita é necessária porque desativar um perfil não encerra containers já existentes. Os comandos acima **preservam bancos, volumes e arquivos de backup**. Ao reativar o banco, os dados anteriores continuam no mesmo volume; mantenha o nome do projeto Compose e os nomes dos volumes. Não use `down -v` para aplicar essa mudança.

A seleção usa perfis do Docker Compose. Mantenha estes dois perfis fixos no `.env`, acrescentando os demais que utilizar:

```dotenv
COMPOSE_PROFILES=db-mariadb-true,db-postgres-true
# Exemplo com aplicação adicional e Vite:
# COMPOSE_PROFILES=db-mariadb-true,db-postgres-true,app2,vite
```

Os flags movem os serviços desativados para perfis inativos. O painel preserva os perfis fixos ao salvar aplicações e bloqueia operações de banco e o início/reinício de seus serviços auxiliares quando o banco está desativado. Não use `--profile '*'` com `up`, nem inicie explicitamente um banco desativado via CLI: isso ignora a seleção de perfis. O curinga acima é usado somente para parar serviços já existentes.

Confira a seleção antes de subir:

```bash
docker compose config --quiet
docker compose config --services
```

Esta opção escolhe os **serviços locais**, sem migrar dados ou trocar automaticamente o driver da aplicação. Para PostgreSQL ou um servidor externo, ajuste conexão, host, porta e credenciais da aplicação e verifique as variáveis `DB_*` injetadas pelo serviço PHP no Compose, que mantêm o padrão MariaDB. As portas de publicação continuam em `MARIADB_BIND_ADDRESS`/`MARIADB_PORT` e `POSTGRES_BIND_ADDRESS`/`POSTGRES_PORT`. Requer Docker Compose com suporte a dependências opcionais (`required: false`, versão 2.20 ou posterior).

### 🔑 Conceder acesso a terminais por usuário

Em **Administração → Usuários e permissões**, crie ou edite um usuário. Para conceder somente terminais, mantenha **Administrador completo** desmarcado:

1. Marque **Abrir terminal nas aplicações selecionadas** e escolha os campos **Terminal da aplicação** desejados.
2. Para terminais de serviços, marque **Abrir terminal nos serviços selecionados** e escolha os campos **Terminal do serviço**.
3. Salve e confirme os impactos. O usuário verá a guia **Terminais autorizados**, com somente os recursos liberados.

As seleções de terminal são independentes de monitoramento, logs, iniciar/parar/reiniciar e backup. Não é necessário conceder acesso às demais páginas administrativas. Usuários existentes continuam sem terminal até receberem a permissão; administradores continuam com acesso completo. `PANEL_TERMINAL_ENABLED=false` desativa o recurso para todos.

O backend verifica a permissão em cada conexão e o dono da sessão ao transmitir dados. Alterar permissões, senha ou estado do usuário invalida o login anterior e encerra imediatamente seus terminais abertos. A sessão é também revalidada periodicamente enquanto transmite saída.

**Conceder terminal permite comandos livres no container**, incluindo ler `.env`, variáveis e credenciais acessíveis, alterar arquivos e acessar bancos permitidos pelas credenciais do container. Não há restrição por diretório ou por comando; as demais permissões do painel não limitam o que um shell pode fazer. Terminal de aplicação e terminal do seu serviço podem representar o mesmo container, com o mesmo poder de execução. Escolha recursos de confiança e conceda apenas o necessário.

Para aplicar a atualização local:

```bash
sudo docker compose up -d --build --force-recreate --no-deps panel
```

Recarregue com Ctrl+Shift+R. Não altera volumes nem bancos.

### ✨ Interface modernizada

A identidade visual usa uma barra lateral grafite com busca de páginas, conteúdo com superfícies e bordas discretas, tabelas consistentes, botões padronizados e modais com melhor hierarquia. Os temas claro e escuro continuam disponíveis no perfil; a preferência é preservada no navegador. A navegação de usuários restritos segue as mesmas regras visuais e de permissões.

No celular, toque em **Menu** para abrir a navegação. Selecione uma página, toque fora do menu ou pressione Escape para fechar. As tabelas largas têm rolagem horizontal e os formulários se reorganizam em uma coluna. A busca do menu administrativo encontra páginas pelo nome e pelo grupo, inclusive sem acentos.

Os estilos visuais ficam em `docker/panel/public/modern-ui.css`, sem modificar o Bootstrap distribuído. As operações, dados e configurações existentes são preservados. Para atualizar o painel local:

```bash
sudo docker compose up -d --build --force-recreate --no-deps panel
```

Depois recarregue com **Ctrl+Shift+R**. O comando recria somente o painel, encerra suas sessões e preserva volumes e dados. Não basta `restart` para atualizar o código da imagem.

### 🧩 Central de aplicativos da infraestrutura

A página inicial reúne os módulos do menu em cards com ícones, descrições e cores por área: Workspace, PHP, Node.js, Processos, Dados, Monitoramento, Administração e Integrações. Clique em um card para abrir a ferramenta ou use **Buscar módulo ou ferramenta**. A busca aceita termos sem acentos.

Os indicadores do topo mostram o resumo da infraestrutura; a tabela completa de containers fica em **Serviços**. O sidebar continua disponível e o botão inicial **Central de aplicativos** volta a esta tela. Contas restritas continuam visualizando apenas os recursos autorizados, sem acesso à central administrativa completa. Os cards não iniciam nem instalam serviços: apenas navegam para as páginas existentes.

<a id="console-sql"></a>

### 🧮 Console SQL: consultar e executar no banco

Em **Dados → Bancos de dados**, selecione MariaDB ou PostgreSQL e clique em **Console SQL** na linha do banco. A janela abre com esse banco selecionado e permite trocar entre os bancos de aplicação listados naquele SGBD.

1. Cadastre uma conta em **Dados → Conexões**, com nome, servidor, banco, usuário e senha. Use **Testar conexão** antes de salvar, se desejar. No console, selecione uma conexão e clique em **Conectar e abrir editor**; o acesso é validado antes de liberar a edição. Não há preenchimento implícito a partir do `.env`. Contas administrativas/de sistema e privilégios globais/administrativos continuam sujeitos às proteções do console.
2. Digite uma ou várias instruções separadas por `;`. Clique em **Executar tudo**, ou selecione um trecho e use **Executar seleção**. **Ctrl/⌘+Enter** executa a seleção, quando houver, ou todo o editor; confirme o resumo e os impactos.
3. Um `SELECT` retorna uma tabela com nomes das colunas, valores, `NULL`, quantidade de linhas e tempo de execução. Comandos sem linhas retornadas mostram o total de linhas afetadas.
4. A guia Resultados permite selecionar a instrução quando houver múltiplos resultados. **Exportar CSV** baixa apenas o resultado selecionado, não o banco inteiro.

Exemplos (substitua a tabela/colunas pelas existentes no projeto):

```sql
SELECT 1 AS teste;
```

```sql
SELECT id, name FROM users ORDER BY id DESC LIMIT 50;
```

```sql
UPDATE users SET name = 'Novo nome' WHERE id = 123;
```

As alterações dependem dos privilégios da conta usada. Para consultar sem permitir alterações, crie uma conta **somente leitura** em **Usuários dos bancos → Gerenciar acesso**. O console não classifica um comando como seguro apenas por começar com SELECT: funções e outras instruções podem ter efeitos conforme as permissões do banco.

**Limites e comportamento:**

- Até **20 instruções por lote**, **15 segundos por instrução**, **30 segundos de execução do lote**, **500 linhas no lote**, **100 colunas por resultado** e aproximadamente **1 MiB** de valores retornados. Células acima de 8 KiB são abreviadas; o SQL tem limite de 64 KiB.
- Ao atingir um limite de resultado, a conexão é encerrada e o resultado é marcado como limitado. Use `WHERE` e `LIMIT` para obter um recorte menor. O driver ainda precisa receber cada valor do protocolo antes de abreviá-lo; esses limites não representam um teto rígido de memória do servidor SQL.
- Cada instrução abre uma conexão nova. O lote é sequencial e para no primeiro erro ou limite, preservando os resultados anteriores; as próximas instruções não são executadas. Não há transação compartilhada nem rollback automático. Lotes com controle de transação, estado de sessão ou criação de rotinas/tabelas temporárias são recusados antes de iniciar. COPY via protocolo, DELIMITER e procedimentos com múltiplos conjuntos de resultados exigem importação/exportação ou um cliente dedicado.
- Comandos podem alterar/excluir dados e estruturas conforme os privilégios da conta. Selecionar um banco não restringe acessos a outros bancos/schemas já permitidos à conta. Não há desfazer automático; erro, timeout ou desconexão podem deixar alterações parciais ou já confirmadas. Confira o estado antes de repetir.
- O SQL, a senha e o resultado ficam somente na janela; não são salvos como histórico do painel. A auditoria guarda ator, SGBD, banco, usuário, hash do SQL e desfecho, sem gravar o SQL completo nem a senha. O próprio SGBD pode registrar consultas conforme sua configuração.
- O CSV contém somente as linhas retornadas, inclusive abreviações. Textos que poderiam ser interpretados como fórmulas recebem proteção ao exportar para planilhas. Preserve o arquivo como informação sensível.

O recurso exige **administrador completo do painel**, sessão válida e CSRF. Permissões de monitoramento, backups ou terminais não concedem a API SQL. A conexão utiliza somente `mariadb:3306` ou `postgres:5432` na rede Docker, sem publicar portas adicionais e sem executar comandos de shell. Os drivers mysql2 e node-postgres são open source, com versões exatas no lock e licenças registradas em `config/dependencies.licenses.json`.

Para atualizar o painel local com os drivers e a interface:

```bash
sudo docker compose up -d --build --force-recreate --no-deps panel
```

Recarregue com **Ctrl+Shift+R**. Nenhuma consulta é executada durante o build e os volumes são preservados. Para arquivos grandes, consulte a área **Importar / exportar SQL**; para recuperação, utilize os [backups](#backup-automatico).

#### Configurar acesso ao banco inicial e redefinir senhas

Em **Dados → Bancos de dados**, selecione **PostgreSQL** ou **MariaDB** e clique em **Configurar acesso** na linha do banco. O mesmo assistente está disponível em **Dados → Conexões** e na seleção de conexão do console SQL. Escolha um nome novo de usuário, uma senha (ou deixe gerar) e as permissões. Após revisar e confirmar, o painel:

1. Confere se o banco existe e se a conta é nova.
2. Cria uma conta de aplicação e guarda sua senha no cofre cifrado.
3. Concede permissões ao banco; no PostgreSQL, ao schema `public`, tabelas e sequências atuais, além dos padrões futuros do administrador que faz a concessão.
4. Testa o login com `SELECT 1` e salva uma conexão cifrada para o console e transferências.

O banco inicial definido em `POSTGRES_DB` costuma pertencer à conta administrativa de `POSTGRES_USER`; o console SQL mantém essa conta protegida. Criar um acesso de aplicação permite usar esse banco pelo painel sem liberar o administrador no editor. O assistente não troca a senha de contas existentes nem publica portas. Para uma conta existente, use **Usuários dos bancos → Permissões por banco**, **Nova conexão** e, se necessário, **Redefinir senha**.

Em **Dados → Conexões → Redefinir senha**, a senha muda no servidor e é sincronizada nas conexões salvas da mesma conta. A confirmação explica os impactos; cancelar preserva a senha atual. Credenciais MariaDB vinculadas ao `.env` da infraestrutura com host `%` continuam sendo sincronizadas nos consumidores gerenciados. **Clientes externos e `.env` dos projetos exigem atualização manual**, inclusive PostgreSQL. Depois, consulte a credencial em **Usuários dos bancos → Ver senha**. **Editar conexão** apenas altera o cadastro e não redefine a senha no servidor.

Se o acesso falhar de outro computador, confira `jubart database access --engine postgres`: com `POSTGRES_BIND_ADDRESS=127.0.0.1`, use túnel SSH no DBeaver/pgAdmin. Endereços apresentados nessa consulta são a configuração salva; confira a publicação efetiva em `jubart status` ou **Proxy & acessos**. O login do painel é separado do usuário do banco. `CONNECT` no inventário PostgreSQL não comprova acesso a schemas, tabelas ou sequências; o teste de login também não valida todas as operações da aplicação.

O fluxo não exclui bancos ou volumes. Se uma etapa falhar após criar a conta, a mensagem informa o que foi concluído e como continuar; revise usuários, permissões e conexões antes de repetir. As senhas não são passadas nos argumentos dos processos nem incluídas na confirmação ou no inventário.

```bash
jubart databases
jubart database list --engine postgres --database infra
jubart database users --engine postgres
jubart database access --engine postgres --database infra
jubart database help
```

Dentro do console `jubart>`, omita o prefixo `jubart`. As consultas exigem Docker e Node.js no host, ou o painel em execução como alternativa para executar o helper Node.js. Elas não criam contas nem alteram senhas.

#### 🔐 Conexões cadastradas

**Dados → Conexões** centraliza os acessos MariaDB e PostgreSQL gerenciados por este Jubart. Ao abrir a área ou um seletor de conexões, o painel cadastra os padrões que ainda não foram importados: contas de aplicação MariaDB do `.env` (principal e grupos `APP_N_DB_*`) e contas MariaDB/PostgreSQL com senha conhecida no cofre e acesso identificado ao banco. Contas administrativas protegidas, bloqueadas, bancos de sistema e senhas desconhecidas não são importados. No PostgreSQL, `POSTGRES_USER` é a conta administrativa da infraestrutura; use as contas de aplicação criadas no painel com acesso concedido ao banco. Essa importação automática não cria usuários nem altera permissões no SGBD. Cadastros existentes não são duplicados ou sobrescritos; conexões removidas não reaparecem. O registro dessa importação fica em `.panel-state/database-connections/defaults.json`, preservado junto ao cadastro e à chave. Trocas de senha feitas por este painel sincronizam as conexões da conta. Alterações feitas fora do painel não sobrescrevem automaticamente uma conexão já cadastrada; edite-a quando necessário. Cada cadastro contém nome, servidor, banco, usuário e senha. É possível criar, editar, testar e remover conexões. O teste executa somente `SELECT 1 AS connected;`, usando as verificações do console; ele não comprova permissões para todas as operações de exportação/importação. Testar antes de salvar é opcional. Ao editar, senha vazia mantém a atual; a senha salva nunca é devolvida ao navegador.

Console, importação e exportação exigem uma conexão cadastrada. O servidor resolve banco, usuário e senha pelo identificador, recusa divergências de banco/servidor e não aceita credenciais manuais como substituto nessas rotas. O editor abre após validar a conexão. As instruções continuam usando conexões SQL independentes, sem uma transação compartilhada. A exportação usa a conta selecionada, com as permissões necessárias ao dump; não troca silenciosamente para a conta administrativa.

As conexões são compartilhadas entre administradores do painel e não estão expostas às contas restritas ou ao MCP. A senha é cifrada com AES-256-GCM em `.panel-state/database-connections/connections.json`, usando a chave local em `.panel-state/database-connections/key`. Preserve **a pasta inteira** nos backups protegidos. Listagens, resultados e auditoria não incluem a senha. Remover um cadastro não remove banco/usuário nem interrompe tarefas já iniciadas; próximas execuções com aquele identificador são recusadas. Estes cadastros não configuram acesso a servidores externos ou hosts arbitrários.

### 🍎 Visual e movimento inspirados no macOS/iOS

A camada `docker/panel/public/apple-ui.css` personaliza os componentes Bootstrap com superfícies translúcidas, campos arredondados, ícones SVG locais em blocos coloridos, botões com relevo discreto e foco azul. A fonte é a de sistema, com alternativas para Linux e Windows; o projeto não distribui fontes nem ícones proprietários da Apple.

Os modais abrem com deslocamento, escala e desfoque (aproximadamente 420 ms), e fecham com animação antes da remoção da janela (230 ms), inclusive após salvar ou cancelar. Confirmações, teclado, foco e a montagem do terminal são preservados. A navegação entre páginas recebe uma transição de entrada de aproximadamente 380 ms, sem recriar as configurações de cada página.

A preferência **Reduzir movimento** do sistema/navegador desativa essas animações e mantém abertura/fechamento imediatos. A preferência de transparência reduzida é respeitada quando suportada pelo navegador. Os temas claro e escuro continuam no menu de perfil.

Para aplicar ao painel local:

```bash
sudo docker compose up -d --build --force-recreate --no-deps panel
```

Depois pressione Ctrl+Shift+R. A atualização não altera a VPS, bancos ou volumes.

### Cabeçalhos e listas compactas do painel

Os indicadores exibem rótulo e valor lado a lado. As listas baseadas no componente compartilhado reúnem busca, filtros, ações, ajuda contextual e contagem de resultados na barra acima da tabela. Em **Aplicações** (inclusive Node), **Nova aplicação** permanece visível; **Salvar configurações** e **Aplicar configuração** ficam no menu **Configurações**, junto ao estado do rascunho. A confirmação e as regras de aplicação das mudanças continuam as mesmas. Os menus fecham ao clicar fora ou pressionar Escape e podem ser operados pelo teclado.

Para aplicar a atualização visual, execute `sudo docker compose up -d --build --no-deps panel` e recarregue o navegador com Ctrl+Shift+R.

### Versão do painel

A versão atual do Jubart é `1.1.0`. Ela aparece na CLI e ao lado do logo na barra lateral do painel, inclusive para contas com acesso limitado. A fonte única é o campo `version` de `docker/panel/package.json`, também usado na identificação do servidor MCP. Ela é incorporada à interface durante o build, não é uma configuração do `.env`.

Para registrar uma nova versão, use `npm --prefix docker/panel version 1.1.1 --no-git-tag-version` (substitua pela versão desejada). O comando atualiza também o lockfile. Depois execute `sudo docker compose up -d --build --no-deps panel` e recarregue o navegador. Use o padrão MAJOR.MINOR.PATCH: correção incrementa PATCH; funcionalidade compatível incrementa MINOR; mudança incompatível incrementa MAJOR. Essa identificação é do Jubart e não altera versões das imagens ou das aplicações hospedadas.

### Hosts de proxy integrados ao Traefik

Em **Proxy & acessos → Hosts de proxy**, cadastre serviços que devem responder por domínio, como um dashboard em `http://192.168.1.20:3000` ou um container em `http://grafana:3000`. O Jubart gerencia o encaminhamento com o Traefik existente. **Novo host de proxy** aceita:

- Nome e até 20 domínios por host, sem protocolo, porta ou curinga.
- Protocolo HTTP/HTTPS, IP/nome DNS/container e porta do destino.
- HTTPS com Let's Encrypt e opção de redirecionar HTTP para HTTPS.
- Preservação do cabeçalho `Host` original e lista de IPs/redes CIDR permitidos.
- Métodos HTTP permitidos: todos (padrão) ou uma seleção de `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE` e `OPTIONS`.
- Habilitar/desativar, editar e remover, usando ações por ícones e confirmação.

As alterações guardam uma cópia anterior em `.panel-state/proxy-hosts/before.json` e gravam `config/proxy-hosts.json` e `docker/traefik/proxy-hosts.yml`. Se a gravação das rotas falhar, os arquivos já alterados são restaurados. A recarga usa o [file provider do Traefik](https://doc.traefik.io/traefik/reference/install-configuration/providers/others/file/), sem recriar containers. O estado mostrado indica a configuração publicada; não comprova que o destino está respondendo nem que o certificado foi emitido. Divergências entre cadastro e arquivo publicado permitem **Reaplicar rotas**.

Em **Editar host → Métodos HTTP (verbos)**, selecione **Permitir todos** ou **Permitir somente os selecionados**. A seleção é aplicada a todos os domínios do host, em HTTP e HTTPS, usando o [matcher Method do Traefik](https://doc.traefik.io/traefik/reference/routing-configuration/http/routing/rules-and-priority/#method). Métodos fora da seleção não são encaminhados; sem outra rota correspondente, o Traefik responde 404. `HEAD` não é incluído automaticamente ao marcar `GET`; inclua `OPTIONS` quando houver preflight CORS. Isso filtra o método recebido, preservando o verbo enviado ao destino. Hosts anteriores sem esse campo continuam permitindo todos, e a confirmação mostra a seleção antes de publicar.

O destino deve ser alcançável pelo container Traefik. Para containers, use o nome DNS do serviço e uma rede compartilhada. `127.0.0.1` aponta para o próprio container Traefik. HTTPS no destino usa a validação TLS padrão; não há opção para ignorar certificados inválidos. WebSocket acompanha o encaminhamento HTTP.

Para HTTPS público, configure e aplique HTTPS/email ACME em **Acessos web**, aponte o DNS para o servidor e disponibilize as portas necessárias ao desafio HTTP-01. Os hosts HTTPS habilitados aparecem em **Certificados → Verificar HTTPS**, onde é possível consultar o certificado servido. Remover um host preserva o serviço de destino e os certificados armazenados.

A [restrição por IP](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/ipallowlist/) usa o endereço que chega diretamente ao Traefik, sem confiar automaticamente em `X-Forwarded-For`; um CDN ou proxy anterior pode ser a origem observada. Lista vazia permite todas as origens.

Domínios já usados por aplicações, painel, WebSockets ou outros hosts são recusados. Edições de aplicações pelo painel/CLI e de WebSockets também verificam os hosts cadastrados. Os hosts usam as portas HTTP/HTTPS globais e a infraestrutura de certificados existente; seu cadastro não altera DNS, firewall, redes Docker nem a aplicação de destino.

Inclua `config/proxy-hosts.json`, `docker/traefik/proxy-hosts.yml` e o volume ACME no backup da instalação. A exportação `Jubart.json` mantém seu escopo anterior e não inclui esses hosts.

### Acesso individual a MariaDB, PostgreSQL e phpMyAdmin

Em **Proxy & acessos → Acesso aos bancos e phpMyAdmin**, os três serviços aparecem em lista. Clique em **Configurar acesso** para escolher **Somente neste servidor / túnel SSH** (`127.0.0.1`) ou **Público / outras máquinas** (`0.0.0.0`) e a porta no host. Não altere as portas internas: MariaDB usa 3306, PostgreSQL 5432 e phpMyAdmin 80. As portas padrão no host são 3306, 5432 e 8081, respectivamente.

A lista distingue **acesso salvo**, **configurado no .env** (nos detalhes) e **publicado no Docker**. “Pendente” indica divergência ou container sem execução; salvar um arquivo não significa que a porta esteja aplicada. O estado não afirma que o firewall do provedor permite acesso externo. Serviços desativados por `MARIADB_ENABLED=false`/`POSTGRES_ENABLED=false` não podem ser publicados por essa tela.

**Salvar e aplicar somente [serviço]** mostra um resumo, comandos e impactos antes de executar. O painel preserva uma cópia anterior em `.panel-state/service-access/`, atualiza somente as variáveis `*_BIND_ADDRESS`/`*_PORT` selecionadas e seu registro em `config/apps.json`, valida o Compose e executa:

```bash
# Exemplo para MariaDB; substitua por postgres ou phpmyadmin.
docker compose up -d --no-deps --no-build --force-recreate --wait --wait-timeout 90 mariadb
```

Não há build de imagem nem recriação dos serviços dependentes. As conexões do serviço selecionado sofrem uma breve interrupção; bancos e volumes são preservados. Se o acesso já estiver aplicado, o container não é recriado. Se a aplicação falhar, os valores permanecem salvos, a lista exibe a publicação real e permite reaplicar após corrigir o erro (por exemplo, porta ocupada). Atualize e reabra os detalhes se outra sessão mudar a configuração. Rascunhos não salvos de outras telas precisam ser resolvidos antes.

O acesso público é publicado em todas as interfaces e depende das regras do firewall do host/provedor. Clientes de banco usam as credenciais e permissões do SGBD, não a senha SSH. A porta direta do **phpMyAdmin usa HTTP**, sem criptografia; para acessá-lo com segurança pela Internet, use túnel SSH ou uma rota HTTPS no proxy. Esta opção de publicação direta não gera certificados nem substitui rotas HTTPS existentes.

A API administrativa é `GET /api/service-access` (listagem e revisão) e `POST /api/service-access/{mariadb|postgres|phpmyadmin}` com `revision`, `bindAddress` e `port`. Exige sessão de administrador e CSRF para aplicar; não está disponível às chaves MCP nem a contas restritas. Cada aplicação registra auditoria sem credenciais.

Para instalar esta atualização do painel local, execute `sudo docker compose up -d --build --no-deps panel` e pressione Ctrl+Shift+R. A VPS não é alterada por essa atualização local.

<a id="primeiro-acesso-vps"></a>
<a id="sec-primeiro-acesso-ao-painel-na-vps-http-https-ou-tunel-ssh"></a>

## Primeiro acesso ao painel na VPS: HTTP, HTTPS ou túnel SSH

Instalou a infraestrutura e não sabe onde entrar? O endereço `localhost` da sua máquina não é o `localhost` da VPS. Escolha um dos caminhos abaixo. Dentro do painel, consulte **Integrações → Como acessar**: informe IP/hostname, usuário e porta SSH da VPS e abra as instruções de cada serviço. Esses dados servem apenas para gerar exemplos, sem alterar o servidor ou exibir senhas.

- [Acesso privado por túnel SSH](#acesso-privado-tunel)
- [Acesso direto por HTTP](#acesso-direto-http)
- [Acesso por HTTPS e domínio](#acesso-https-dominio)
- [Bancos e phpMyAdmin pelo túnel](#bancos-pelo-tunel)
- [Diagnosticar problemas de acesso](#diagnosticar-acesso)

<a id="acesso-privado-tunel"></a>
### Proxy confiável do Laravel

Em **Integrações → Como acessar → Proxy confiável para Laravel**, o painel consulta os containers em execução e mostra o IP atual do Traefik nas redes compartilhadas com cada aplicação PHP. **Copiar variável** gera `TRUSTED_PROXIES=IP_ATUAL` (ou uma lista de IPs exatos, incluindo IPv6 quando disponível). A consulta é atualizada periodicamente e pelo botão **Atualizar IP do proxy**; não usa o IP público do domínio nem o IP do container PHP. Se não houver dados válidos ou os serviços estiverem parados, não sugere um valor.

O endereço pode mudar quando o Traefik for recriado. Confira esta informação após alterações na infraestrutura, atualize manualmente o `.env` da aplicação Laravel e execute `php artisan config:clear` e `php artisan config:cache` dentro do container da aplicação. O painel não escreve essa variável automaticamente, não configura o middleware Laravel e não garante que uma instalação com proxy intermediário use o Traefik como peer imediato: nesse caso, confirme o `REMOTE_ADDR` recebido pelo PHP. Não substitua a lista por `*` ou por toda a rede Docker. Para disponibilizar a tela após atualizar o código, reconstrua somente o painel com `docker compose up -d --build --no-deps panel`.

### Opção 1 — túnel SSH, sem publicar a porta do painel

No `.env` **da infraestrutura na VPS**, para uma instalação que usará HTTP somente dentro do túnel:

```dotenv
PANEL_BIND_ADDRESS=127.0.0.1
PANEL_PORT=9090
PANEL_PROXY_ENABLED=false
PANEL_TLS_ENABLED=false
PANEL_COOKIE_SECURE=false
# Defina PANEL_USERNAME e uma PANEL_PASSWORD forte antes de iniciar.
```

Na VPS, após editar:

```bash
docker compose up -d --build --no-deps panel
docker compose ps panel
```

No **seu computador**, execute (troque usuário e IP pelos da sua VPS; `-p` é a porta do SSH):

```bash
ssh -N -o ExitOnForwardFailure=yes -p 22 -L 19090:127.0.0.1:9090 usuario@IP_DA_VPS
```

Mantenha o terminal aberto e acesse **http://127.0.0.1:19090/** no navegador do seu computador. Entre com `PANEL_USERNAME`/`PANEL_PASSWORD` ou uma conta cadastrada no painel. A senha solicitada no terminal é a do SSH, que é independente da senha do painel. Ctrl+C encerra o túnel. Se 19090 estiver ocupada, escolha outra porta local e use-a na URL. Só a porta SSH precisa estar liberada externamente; não precisa abrir 9090 no firewall.

**Se o painel já usa HTTPS e `PANEL_COOKIE_SECURE=true`, não desative essa proteção para acessar por HTTP público.** Prefira sua URL HTTPS existente. Um túnel HTTP não permite autenticar com esse cookie: para manter HTTPS no túnel, encaminhe a porta HTTPS do proxy e preserve o hostname do certificado. O exemplo acima destina-se à instalação com HTTP privado pelo túnel.

<a id="acesso-direto-http"></a>
### Opção 2 — acesso direto por IP e porta HTTP

Para uma rede confiável, configure `PANEL_BIND_ADDRESS=0.0.0.0`, `PANEL_PORT=9090` e `PANEL_COOKIE_SECURE=false` na VPS. Recrie somente o painel com `docker compose up -d --no-deps panel`, libere TCP 9090 no firewall do host/provedor e entre por **http://IP_DA_VPS:9090/**. HTTP não criptografa usuário e senha: para a Internet, prefira HTTPS ou túnel SSH.

Não use `http://localhost:9090` no seu computador esperando chegar à VPS sem um túnel. Não use `https://IP_DA_VPS:9090`: a porta direta do painel serve HTTP. Expor em `0.0.0.0` só será efetivo após recriar o container; liberar apenas o firewall não muda uma publicação em `127.0.0.1`.

<a id="acesso-https-dominio"></a>
### Opção 3 — acesso por domínio com HTTPS no Traefik

Crie um registro DNS, por exemplo `painel.seudominio.com`, apontando para a VPS. No `.env` da infraestrutura, use o mesmo domínio:

```dotenv
HTTP_BIND_ADDRESS=0.0.0.0
HTTP_PORT=80
HTTPS_PORT=443
TRAEFIK_TLS_ENABLED=true
ACME_EMAIL=seu-email@exemplo.com
PANEL_BIND_ADDRESS=127.0.0.1
PANEL_PORT=9090
PANEL_PROXY_ENABLED=true
PANEL_DOMAIN=painel.seudominio.com
PANEL_TLS_ENABLED=true
PANEL_COOKIE_SECURE=true
```

Libere TCP **80 e 443** no firewall do host/provedor; mantenha a porta SSH disponível para administração. O domínio do painel não pode ser usado por outra aplicação. Aplique os valores na configuração do painel/JSON conforme as instruções de ambientes local/VPS e HTTPS deste README e recrie os serviços necessários:

```bash
docker compose config --quiet
docker compose up -d --no-deps traefik panel
docker compose logs --tail=100 traefik
```

O Traefik solicita o certificado automaticamente quando DNS, email e desafio ACME estão corretos. Acesse **https://painel.seudominio.com/**. A recriação do Traefik interrompe brevemente os acessos que passam pelo proxy; programe essa alteração em produção. O exemplo é para domínio público. HTTPS por IP exige configuração própria de certificado; abrir 443 sozinho não o configura.

<a id="bancos-pelo-tunel"></a>
### Bancos e phpMyAdmin por SSH

Execute cada comando no seu computador e mantenha-o aberto. As portas remotas abaixo são os padrões; confira as portas configuradas na sua VPS:

```bash
# MariaDB: cliente SQL em host 127.0.0.1, porta 13306
ssh -N -o ExitOnForwardFailure=yes -p 22 -L 13306:127.0.0.1:3306 usuario@IP_DA_VPS

# PostgreSQL: cliente SQL em host 127.0.0.1, porta 15432
ssh -N -o ExitOnForwardFailure=yes -p 22 -L 15432:127.0.0.1:5432 usuario@IP_DA_VPS

# phpMyAdmin: navegador em http://127.0.0.1:18081/
ssh -N -o ExitOnForwardFailure=yes -p 22 -L 18081:127.0.0.1:8081 usuario@IP_DA_VPS
```

Use as credenciais do banco no cliente SQL ou no phpMyAdmin, não a senha SSH. Os serviços precisam estar habilitados e em execução. Para acesso direto às portas dos bancos, configure a publicação individual em **Proxy & acessos**, aplique e libere a porta no firewall. As portas internas dos containers não são necessariamente as portas publicadas no host.

<a id="diagnosticar-acesso"></a>
### Se não abrir

Execute na VPS:

```bash
docker compose ps panel traefik mariadb postgres phpmyadmin
docker compose port panel 3000
docker compose logs --tail=100 panel
```

- **Connection refused:** serviço parado, endereço ou porta incorreta. Confira a publicação real no Docker.
- **Timeout:** confira IP, firewall do host e firewall do provedor.
- **Address already in use:** a porta local do túnel está ocupada; escolha outra.
- **Login por HTTP com cookie seguro:** use HTTPS ou o modo privado por túnel descrito acima.
- **Origem inválida:** confira a URL usada e a configuração de origem/proxy do painel; trocar a senha não corrige esse erro.

[Voltar ao primeiro acesso](#primeiro-acesso-vps).

### Dock de atalhos no rodapé

O painel oferece um dock somente com ícones, com nomes em tooltips ao passar o mouse ou focar pelo teclado, inspirado em desktops macOS/Ubuntu, com atalhos padrão para Central de aplicativos, Serviços, Aplicações, Bancos de dados e Containers & tráfego. Os atalhos só navegam entre páginas; não iniciam ou interrompem serviços.

Personalize em **Administração → Dock**, na opção **Personalizar dock** do perfil ou na engrenagem do rodapé. É possível adicionar/remover páginas, reordenar usando as setas, escolher ícones normais ou compactos, restaurar o padrão e desativar o dock. Mesmo desativado, a configuração continua acessível pelo perfil. Em telas pequenas, a faixa de atalhos tem rolagem horizontal; a engrenagem permanece disponível.

A escolha é salva em `localStorage`, separada por nome de usuário neste navegador, e sincroniza entre abas. Não é uma configuração global do `.env` nem acompanha automaticamente outro computador. Se o armazenamento estiver indisponível, a personalização funciona apenas na sessão atual. Contas restritas recebem somente as páginas permitidas; restaurar preferências não concede permissões. A opção de restauração pede confirmação; as demais escolhas de aparência e atalhos são aplicadas imediatamente.

### Certificados TLS no painel

Em **Workspace → Certificados**, consulte os certificados do armazenamento ACME: domínio/IP, emissor, início/fim da validade, tempo restante, fingerprint SHA-256 e resolver. Os alertas usam os dados X.509 reais: expirado, ainda não válido ou próximo de expirar. O alerta de proximidade considera o menor valor entre 30 dias e um terço da validade do certificado, para também atender certificados curtos; esse alerta não altera o agendamento do Traefik.

A página identifica resolvers no ambiente do container Traefik e distingue configuração encontrada de processo em execução. Não é garantia de que a próxima renovação terá sucesso: DNS, desafios ACME, acesso às portas e limites da autoridade precisam estar corretos. Configurações exclusivamente por arquivo/CLI podem não ser identificadas automaticamente. Certificados externos ou padrão do proxy podem não constar no inventário ACME.

**Consultar TLS** conecta ao Traefik pela rede interna com o nome/IP de uma aplicação cadastrada, mostrando o certificado apresentado, correspondência do nome e confiança na cadeia pelo verificador do painel. Não consulta destinos arbitrários nem comprova acessibilidade externa, DNS ou firewall. Em ambientes HTTP locais, não possuir certificado é esperado. Rotas HTTPS personalizadas precisam estar configuradas no proxy; a consulta não as cria.

**Reavaliar renovação** exige administrador e confirmação com comando e impacto. Executa somente:

```bash
docker compose restart --timeout 30 traefik
```

O reinício provoca breve interrupção do tráfego pelo proxy e permite reavaliar seu ciclo automático ACME. **Não força a emissão fora da janela de renovação, não garante um certificado novo imediatamente e não apaga `acme.json`.** O registro de última solicitação indica reinício/reavaliação, não comprovação de renovação. Atualize a lista, consulte TLS e verifique os logs para confirmar um novo prazo. A emissão continua sujeita à autoridade e a seus limites. Não exclua o armazenamento ACME para tentar renovar.

O comportamento de renovação e o parâmetro `certificatesDuration` estão descritos na [documentação oficial do Traefik](https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/). A duração configurada orienta a renovação; a validade efetiva depende da autoridade certificadora.

O Compose monta `traefik_acme` no painel em `/opt/panel-acme`, somente leitura; `PANEL_ACME_STORAGE` aponta internamente para `/opt/panel-acme/acme.json`. A API envia apenas metadados públicos, nunca contas, chaves privadas, PEM ou o JSON ACME completo. O painel não grava nesse volume. Armazenamento ausente, inválido ou sem acesso é indicado na interface. Um certificado em arquivo não comprova que ele esteja sendo servido.

Para aplicar a nova leitura do volume, recrie **somente o painel**:

```bash
docker compose up -d --build --no-deps panel
```

Recarregue o navegador. Essa atualização não renova certificados nem reinicia o Traefik. A API administrativa é `GET /api/certificates`, `POST /api/certificates/inspect` com o `id` da aplicação/painel listado e `POST /api/certificates/recheck`; operações POST exigem CSRF. Contas restritas e chaves MCP não têm acesso a essa área.

### Cartões, gráficos e movimento da interface

O dock usa uma faixa baixa, com ícones sem nomes e tooltips; o modo Compacto reduz mais a altura. Cartões de indicadores recebem cores discretas e exibem um indicador animado dentro do cartão enquanto aguardam a primeira amostra. Leituras indisponíveis continuam distintas de leituras em coleta.

Em **Containers & tráfego**, cada gráfico possui o botão **Expandir gráfico**: abre uma modal maximizada com o mesmo histórico e atualizações. Os controles do cabeçalho permitem restaurar, expandir novamente ou fechar, sem reiniciar a coleta. A expansão/restauração de todas as modais tem transição de aproximadamente 460 ms; a preferência **Reduzir movimento** desativa essa animação e as animações dos indicadores. O cabeçalho permanece separado da área rolável.

O sidebar mantém grupos e ícones coloridos, com fundo mais escuro nos dois temas para destacar a navegação. Essas alterações são visuais e não modificam configurações da infraestrutura.

### Imagens e versões do PHP/FrankenPHP e Node no painel

Use **Servidor PHP → Versão e imagem PHP** ou **Servidor Node → Versão e imagem Node**. As telas distinguem a referência configurada no `.env` da versão efetivamente consultada em containers de aplicações em execução. A consulta usa comandos fixos (`php -r 'echo PHP_VERSION;'` ou `node --version`), não executa scripts do projeto, limita a 20 containers por consulta e tem timeout. No caso do Node, a versão do processo do painel também aparece separadamente.

Em **Editar imagem / versão**, informe a referência completa, por exemplo `dunglas/frankenphp:1-php8.4.27-bookworm@sha256:<digest>` ou `node:24-bookworm-slim@sha256:<digest>`. Os exemplos indicam o formato, não uma recomendação de atualização. Para consultar o digest, informe a tag desejada e use **Consultar digest da versão digitada**. A consulta restringe-se aos repositórios oficiais previstos; PHP usa a variante Debian bookworm porque os instaladores da infraestrutura dependem dela.

Salvar altera as variáveis de versão e o lock em `config/runtime-images.lock.json`, com backup anterior em `.panel-state/env-before-runtime-version`. **Aplicar versão salva** é uma etapa separada, com confirmação dos comandos e impactos; PHP exige rebuild, e aplicações/processos afetados podem ser interrompidos. Os volumes são preservados. A existência da imagem/digest não comprova suporte de segurança nem compatibilidade de extensões, aplicação ou arquitetura. A atualização de Node das aplicações não troca o Node do painel nem reinstala dependências automaticamente.

### Listagem do .env da infraestrutura

Em **Administração → Variáveis da infraestrutura**, consulte as declarações do `.env`, com busca por nome/valor visível, filtro por grupo, linha e indicação de nomes duplicados. A tela é **somente leitura**: edite/aplique portas, versões, PHP, backups e demais parâmetros nas áreas específicas ou pelo terminal, seguindo suas instruções.

Senhas, chaves, tokens e outras variáveis identificadas como sensíveis não são enviados pela listagem. Para consultar uma delas, abra os detalhes e escolha **Exibir valor protegido**; confirme o acesso. Somente o valor solicitado é carregado. A consulta registra nome/linha e usuário na auditoria, sem registrar o valor. O valor é ocultado novamente após 60 segundos, ao fechar a janela ou sair da página, e não é salvo nas preferências do navegador. Os filtros não pesquisam dentro de valores protegidos.

São valores declarados no arquivo, sem expandir `${...}`, interpretar escapes ou resolver precedência do Compose/ambiente do container. Aspas não finalizadas são indicadas como declaração inválida. O reconhecimento de dados sensíveis é conservador por nome e formatos conhecidos; revise nomes de variáveis personalizados para não cadastrar segredos como parâmetros públicos. Nunca compartilhe capturas contendo valores exibidos.

A API é `GET /api/infra-env` e `POST /api/infra-env/reveal` com `id` e `revision` da listagem. Exige administrador, sessão e CSRF para revelar; não está disponível para contas restritas nem chaves MCP. Nenhum endpoint desta área permite gravar ou executar conteúdo do `.env`.

<a id="sec-websocket-por-aplicacao"></a>

## WebSocket por aplicação

No painel, abra **Processos → WebSocket**. Cada aplicação tem os botões **Como configurar**, **Configurar**, **Logs**, **Iniciar**, **Reiniciar** e **Parar**. O recurso vem desativado. [Voltar ao início](#).

1. Prepare o projeto no terminal da aplicação. Para Laravel, execute `composer require laravel/reverb` e `php artisan reverb:install`. Revise os arquivos criados pelo instalador. Reverb é gratuito, open source e não exige Octane. Sua versão é controlada pelo `composer.lock` do projeto.
2. Configure `REVERB_APP_ID`, `REVERB_APP_KEY` e `REVERB_APP_SECRET` no **.env da aplicação**. Defina `BROADCAST_CONNECTION=reverb`, `REVERB_HOST`, `REVERB_PORT` e `REVERB_SCHEME` com o endereço público do proxy. O botão **Como configurar** mostra um exemplo completo. Nunca exponha `REVERB_APP_SECRET` no frontend.
3. Configure as variáveis `VITE_REVERB_*` do Laravel Echo com esse mesmo endereço público e reconstrua o frontend. Limpe configurações antigas com `php artisan config:clear`. Broadcasting enfileirado exige um worker em **Processos → Filas**.
4. No painel, escolha **Configurar**, ative o servidor e selecione **Laravel Reverb** ou **Servidor Node.js**. Clique em **Salvar e aplicar** e revise os comandos na confirmação.
5. Confira o estado e os logs. A aplicação precisa implementar os eventos, canais e autorização de canais privados. A infraestrutura não cria essa lógica.

**Endereço:** “Mesmo domínio” funciona inclusive com IP cadastrado na aplicação. O Traefik encaminha `/app/` (conexão) e `/apps/` (publicação) ao Reverb sem remover o caminho. Para Node, informe o caminho do servidor, por exemplo `/socket.io/`. Esses caminhos ficam reservados ao WebSocket. “Subdomínio exclusivo” exige DNS apontando para a VPS. O cliente Node deve usar o protocolo do servidor: Socket.IO e WebSocket nativo não são intercambiáveis.

**HTTPS:** habilite HTTPS em **Proxy & acessos** antes de selecionar WSS. Use a porta pública HTTPS (normalmente 443) e `REVERB_SCHEME=https`. Em HTTP local, use a porta HTTP configurada (por exemplo 8080) e `http`. Não abra a porta interna WebSocket no firewall: o acesso usa as portas públicas existentes do Traefik. Páginas HTTPS precisam conectar usando WSS.

**Node:** prepare as dependências e um script `websocket` no `package.json`; o comando padrão é `npm run websocket`. O servidor deve ouvir em `0.0.0.0` e usar `process.env.PORT`. `WEBSOCKET_ALLOWED_ORIGINS` é uma lista JSON de hosts que **seu código Node deve validar**. O painel não impõe essa validação ao Node. No Reverb, o launcher impõe as origens em memória; exige o provedor `config` padrão de `config/reverb.php`. Informe hosts sem protocolo, porta ou curinga.

**Aplicação das mudanças:** a ação desta tela recria somente `websocket-<id>`, com `--no-deps`, preservando os containers HTTP, bancos e volumes. Alterar a versão compartilhada PHP/Node também recria os WebSockets desse runtime. Cada servidor usa as imagens fixadas da infraestrutura e `restart: unless-stopped`. Reinícios desconectam clientes; implemente reconexão. O painel verifica pré-requisitos do Reverb, mas não instala pacotes nem modifica o .env da aplicação. Se a inicialização falhar, a configuração fica salva e pode ser corrigida e reaplicada. Faça alterações no painel com uma conta administradora; as operações possuem auditoria.

Para configurar por arquivo, veja `APP_WEBSOCKET_*` no [.env.example](.env.example). Aplicações adicionais usam `APP_2_WEBSOCKET_*` etc. Após mudanças manuais, importe os apontamentos pelo fluxo de configuração ou ajuste a tela e aplique; não basta editar `.env` de um container em execução. O painel mantém o cadastro em `config/apps.json` e gera `config/apps.compose.yaml` e rotas individuais em `docker/traefik/websocket-<id>.json`.

<a id="sec-saude-interna-para-as-aplicacoes"></a>

## Saúde interna para as aplicações

A aplicação pode consultar a infraestrutura pelo endpoint **somente de leitura**:

```text
GET http://panel:3001/v1/health
```

Execute a chamada no backend, dentro do container principal de uma aplicação habilitada. A porta 3001 **não é publicada no host** e não tem rota no Traefik. Não é necessário liberar porta no firewall. O acesso não usa a senha do painel nem a chave MCP: o painel verifica o endereço real da conexão contra os IPs da rede `app`, o projeto Compose, o serviço cadastrado e o estado em execução do container no Docker. Cabeçalhos `X-Forwarded-For` não concedem acesso. Containers de workers, proxy, bancos ou outros projetos não são autorizados. Administradores com controle do host/Docker continuam tendo controle dessa fronteira de rede.

Laravel, no código do backend:

```php
$health = Http::timeout(25)
    ->get('http://panel:3001/v1/health')
    ->throw()
    ->json();
```

Importe `Illuminate\Support\Facades\Http`. Node.js:

```js
const response = await fetch('http://panel:3001/v1/health', {
  signal: AbortSignal.timeout(25000),
});
if (!response.ok) throw new Error(`Infra indisponível: HTTP ${response.status}`);
const health = await response.json();
```

A resposta contém `schemaVersion`, `observedAt`, a identificação da aplicação, `services`, `queues`, `jobs`, `scheduler` e `websocket`. `queues.registeredWorkers` conta consumidores cadastrados; `distinctQueues` conta pares conexão/fila; `runningWorkers` mostra consumidores em execução. `queues.statistics` contém contagens disponíveis de jobs total/pendentes/reservados/atrasados das filas cadastradas. Estatísticas Laravel indisponíveis são sinalizadas por `statisticsStatus=unavailable` e `statistics=null`; Node não possui ponte de filas genérica e retorna `not_applicable`. Ausência de dados não significa fila vazia. `jobs.registered` é cadastro de classes, não quantidade de jobs executados.

O estado agregado pode ser `operational`, `degraded` ou `unknown`. Healthchecks Docker não comprovam o funcionamento de um endpoint ou a conclusão de jobs. Serviços desativados não tornam a infraestrutura degradada. O status HTTP 200 significa que a consulta funcionou; leia o campo `status` para avaliar os serviços. Erros de coleta retornam 503, origem não autorizada retorna 403 e excesso de consultas retorna 429. Há limite de 30 consultas/minuto por endereço e cache de até 10 segundos por aplicação. Não consulte a infraestrutura a cada requisição do usuário; utilize uma rotina periódica e trate indisponibilidade sem interromper o fluxo principal da aplicação.

O endpoint não entrega .env, senhas, argumentos de jobs, caminhos do host ou logs e não permite mutações. O painel mostra o endereço também em **Como acessar**. Para disponibilizar essa funcionalidade após atualizar o código, reconstrua somente o painel:

```bash
docker compose up -d --build --no-deps panel
```

Não publique nem encaminhe a porta 3001 em outros proxies. A configuração padrão a mantém interna às redes Docker; a autorização identifica exclusivamente os IPs das aplicações na rede app.

<a id="sec-seguranca-por-aplicacao"></a>

## Segurança por aplicação

Em **Administração → Segurança**, as abas horizontais separam visão geral, IPs/redes, regras, recursos e eventos. O módulo usa Docker e Traefik existentes, sem novas imagens ou serviços comerciais. Nenhuma política vem ativada por padrão.

### IPs, redes e horários

1. Em **IPs e redes**, crie um grupo com nome e identificador, por exemplo `empresa`. Informe IPv4/IPv6 ou redes CIDR, uma por linha. IPv4 mapeado em IPv6 deve ser informado no formato IPv4 normal.
2. Em **Regras de acesso**, abra a aplicação. Escolha o comportamento quando nenhuma regra corresponder: Permitir ou Negar.
3. Adicione regras de Permitir/Negar com IPs/redes ou grupos. Opcionalmente marque dias, início, fim e fuso (padrão America/Sao_Paulo).
4. Para acesso exclusivo da empresa durante expediente, escolha **padrão Negar**, uma regra **Permitir**, grupo Empresa, segunda a sexta, 08:00–18:00. Fora desse período, o acesso será negado. Uma regra Negar correspondente sempre prevalece sobre permissões.
5. Use **Simular acesso** com IP e data ISO com fuso para conferir o rascunho. Ative a proteção e use **Salvar e aplicar**, revisando a confirmação.

O horário final é exclusivo. Períodos que cruzam meia-noite pertencem ao dia de início: sexta 22:00–02:00 também permite sábado até 01:59. Dias/fusos são calculados pelo relógio do servidor usando o fuso da regra, inclusive horário de verão do banco IANA. Regras sem horário valem sempre dentro da validade opcional. Início e expiração usam datas ISO com fuso; a expiração é exclusiva e apenas deixa de corresponder à regra, sem mudar o padrão da aplicação. Há limite de 200 entradas efetivas de IP/rede por regra, incluindo os grupos referenciados. Grupos em uso não podem ser removidos; editar um grupo altera as regras que o utilizam. Não há resolução de hostname em regras de IP.

### Alcance e operação

O Traefik aplica as cadeias `app-security-<id>` às rotas gerenciadas HTTP, HTTPS e WebSocket. Com proteção desativada, a cadeia fica vazia. Com proteção ativa, aplica limites HTTP configurados e consulta o autorizador interno `http://panel:3002/check?app=<id>`. **Não publique a porta 3002.** O autorizador aceita somente conexões do container Traefik em execução deste projeto, conferidas via Docker; não usa IP de cliente enviado diretamente ao painel. O ForwardAuth usa `trustForwardHeader=false` e o IP recebido do Traefik deve ser um endereço único válido. Cabeçalhos externos não autenticam chamadas ao autorizador.

A configuração inicial pressupõe conexão direta do cliente ao Traefik. CDNs, balanceadores ou outros proxies exigem revisão da cadeia de proxies confiáveis e testes antes de usar políticas de IP; IP compartilhado/NAT pode representar vários usuários. O módulo não configura automaticamente confiança em cabeçalhos desses serviços.

As regras abrangem **novas requisições HTTP e novos handshakes WebSocket**. Não encerram conexões já abertas ao terminar o horário. Não alteram firewall, SSH, portas de banco ou portas diretas dos containers. Rotas personalizadas externas ao gerador precisam receber explicitamente a cadeia da aplicação. O acesso administrativo ao painel não recebe políticas de aplicação, permitindo corrigir bloqueios equivocados.

Quando uma política está ativa, a indisponibilidade do painel/autorizador ou configuração inválida **nega novos acessos** à aplicação protegida. Planeje atualizações do painel considerando essa dependência. A revalidação de IPs do container Traefik usa cache de até 5 segundos; configurações de política podem usar cache de até 1 segundo. `security.json` é atualizado por arquivo e recarregado pelo Traefik; não reinicia containers. A interface confirma o salvamento, mas não comprova que um cliente externo recebeu o resultado esperado: teste a partir das redes permitidas e negadas.

O botão **Restaurar política anterior** reaplica o backup imediatamente anterior com confirmação. Ele não restaura quotas de CPU/PIDs. O estado privado fica em `.panel-state/security.json` e o arquivo gerado de middlewares em `docker/traefik/security.yml`. Auditoria das alterações usa a auditoria persistente dos usuários do painel. Credenciais MCP não recebem permissão para administrar segurança.

### Limites de tráfego e recursos

- Requisições por segundo e burst usam RateLimit do Traefik por IP, por instância. Zero desativa o limite.
- Requisições simultâneas usam InFlightReq por IP; não são uma contagem universal de sockets. WebSockets persistentes podem consumir esse limite. Zero desativa.
- CPU por aplicação usa quota Docker em núcleos (ex.: 0.5), não reserva CPUs. Zero remove a quota.
- PIDs limita processos/threads do container. `-1` remove o limite; valores limitados aceitam de 16 a 1048576. Reduzir pode impedir a aplicação de criar processos.
- RAM usa o controle existente por serviço. Reduções podem encerrar processos por OOM; memória por container é diferente de `memory_limit` do PHP.

CPU/PIDs alteram somente o container HTTP da aplicação identificada por labels do projeto e serviço, usando `docker update`. Valores persistem no .env (`CONTAINER_CPUS_<SERVICO>` e `CONTAINER_PIDS_<SERVICO>`) e no Compose gerado para futuras recriações. Workers e WebSockets têm execução independente. Se o container ainda não existir, apenas persistem os limites. Os valores mostrados nessa tabela são os configurados; falha parcial pode exigir conferir os limites reais no Docker. A configuração anterior do .env é guardada em `.panel-state/env-before-security-quotas`.

### Observação de tráfego

A visão geral mostra origens e contadores observados pelo autorizador na janela de até 60 segundos, somente para aplicações com proteção ativa. Limitadores podem rejeitar requisições antes do autorizador, portanto os contadores não abrangem todo o tráfego nem todos os 429. Eventos mostram até 500 negativas em memória e são apagados ao reiniciar o painel. IPs são dados potencialmente pessoais; restrinja a consulta aos administradores. Não são armazenados corpos, query strings nem credenciais nessa coleta.

Picos de acesso são **indícios**, não confirmação de DDoS. Esta camada não protege contra saturação da rede da VPS; essa mitigação pertence ao provedor ou à proteção anterior ao host.

Após atualizar o código, reconstrua somente o painel para iniciar o autorizador. As rotas estáticas já presentes no repositório e novos arquivos dinâmicos são observados pelo Traefik. O painel também adiciona a cadeia às rotas geradas de WebSockets e aplicações adicionais existentes, preservando seus destinos e demais middlewares. Nenhum firewall é alterado automaticamente.

### Bloqueio temporário do login

Por padrão, **3 tentativas incorretas** dentro de 15 minutos bloqueiam novas tentativas do mesmo IP por **60 segundos**. O formulário mostra uma animação e a contagem regressiva, desabilita os campos e volta a permitir o login após o prazo. Recarregar a página ou reiniciar o painel não remove o bloqueio, que fica registrado em `.panel-state/login-attempts.json`.

Em **Administração → Segurança → Login do painel**, o administrador pode alterar os limites. Também é possível defini-los no `.env` da infraestrutura:

```dotenv
PANEL_LOGIN_MAX_ATTEMPTS=3
PANEL_LOGIN_BLOCK_SECONDS=60
```

São aceitas de 1 a 20 tentativas e durações de 10 a 86400 segundos. As mudanças são lidas sem reconstruir o painel; bloqueios em andamento mantêm o prazo original. Um login válido ou o término do bloqueio reinicia a contagem. Sessões abertas continuam funcionando. O bloqueio é por origem, portanto usuários da mesma rede/NAT podem compartilhá-lo; ele não desliga o painel para todos. Cabeçalhos de IP encaminhados só são considerados quando enviados pelo Traefik reconhecido da própria infraestrutura.

A API responde com HTTP `429` e `Retry-After` enquanto a origem estiver bloqueada. Essa proteção limita tentativas de senha e não substitui proteção contra DDoS.

### Trocar a senha administrativa pelo painel

Entre com a conta `PANEL_USERNAME` e abra **Administração → Segurança → Login do painel → Alterar senha do painel**. Informe a senha atual, a nova senha e sua confirmação. O formulário indica se os requisitos de força foram atendidos e oferece **Gerar senha forte**, que cria 24 caracteres aleatórios no navegador. Guarde a senha gerada antes de confirmar.

A nova senha deve ter entre 16 e 128 caracteres e pelo menos três tipos entre letras minúsculas, maiúsculas, números e símbolos. Sequências comuns e caracteres que podem interferir no `.env`/Compose são recusados. As mesmas regras são verificadas pela API. Erros de senha atual também contam para o bloqueio temporário de login.

A troca grava somente `PANEL_PASSWORD` no `.env`, com permissão de arquivo restrita, e passa a valer imediatamente, inclusive após reiniciar o painel. Todas as sessões dessa conta são encerradas; entre novamente com a nova senha. Não exige reconstrução e não reinicia aplicações. Outras contas administrativas não podem trocar a senha da conta protegida por esse formulário. As senhas não são incluídas no registro de auditoria da troca.

### Identidade visual

A logo oficial fica em `icon.svg`, na raiz. O login e a identificação do painel usam sua versão transparente e animada, com a baleia ampliada e sem o quadrado azul. A animação respeita a preferência de movimento reduzido do navegador. O favicon mantém o ícone completo. Após substituir a logo, execute `node scripts/sync-brand.mjs` para atualizar as versões públicas e as imagens incorporadas às páginas de erro; `--panel-only` atualiza apenas os assets do painel. Para gerar os quadros do terminal a partir da baleia transparente, execute `python3 scripts/generate-cli-logo.py` (na máquina de desenvolvimento, com Pillow, librsvg e Cairo). A CLI instalada usa apenas o JSON gerado, sem bibliotecas de imagem adicionais. Inclua os arquivos atualizados no deploy e execute o build da interface ao alterar seus componentes. As páginas de erro carregam a logo sem depender da aplicação estar disponível.

### Compatibilidade do nome anterior

O projeto passou a se chamar **Jubart**. As chaves internas `infra-control-theme`, `infra-control-dock` e os labels Docker `io.infra-control.*` permanecem para preservar preferências e a identificação de containers de instalações existentes. Não é necessário renomear o diretório de instalação, o projeto Compose, volumes, cookies ou variáveis do `.env`. Os endpoints e nomes de ferramentas da API permanecem compatíveis. A skill atual está em `.github/skills/jubart-mcp`; atualize o caminho caso tenha instalado uma cópia manual da skill anterior.

### IA: panorama da configuração e criação de .env

Na tela **Conexão MCP**, o endpoint de configuração (`GET /api/ai/read?resource=configuration`, ou `infra_read` com `resource: configuration`) entrega valores atuais permitidos e o modelo público `.env.example`. A Skill `jubart-mcp` orienta o agente a entender essa visão parcial e criar um arquivo no workspace autorizado do cliente: `.env` para uma instalação nova ou `.env.proposed`/patch para uma existente, preservando credenciais e dados. Senhas reais não são exportadas; o modelo usa marcadores para geração local. A API não grava nem aplica o arquivo e a criação depende de uma ferramenta local de arquivos do agente. A consulta exige chave com leitura e respeita o escopo de aplicações.

### Páginas de erro do proxy Traefik

O serviço interno `error-pages` serve as páginas com a marca Jubart, independentemente do PHP e do painel. Usa a imagem Node já fixada por `NODE_VERSION`, arquivos somente para leitura, usuário sem privilégios e nenhuma porta publicada no host.

- Sem rota para o domínio, o fallback de baixa prioridade responde **404**. Navegação HTML recebe a página Jubart; clientes sem Accept HTML continuam recebendo um 404 em texto.
- Nas aplicações, navegações GET/HEAD com `Accept: text/html` usam as páginas **404, 500, 502, 503 e 504**, preservando o código HTTP. Requisições Inertia, Upgrade/WebSocket e métodos de escrita não usam esse middleware. As rotas WebSocket mantêm prioridade superior.
- APIs que solicitam JSON permanecem com suas respostas originais. Um endpoint que solicitar explicitamente HTML poderá receber a página personalizada.
- As rotas administrativas do painel e as permissões de segurança permanecem independentes. O serviço de páginas registra somente referência, horário UTC e status da página entregue, com rotação de logs; não registra URL, cookies ou tokens. Pelo middleware, somente o header Accept é encaminhado.

As definições ficam em `docker/traefik/errors.yml`, `routes.yml` e `apps.yml`; aplicações adicionais recebem rotas equivalentes pelo gerador do painel. Reiniciar o painel atualizado também adapta o arquivo `extra-apps.yml` existente, quando presente.

Em uma instalação existente, após atualizar os arquivos, inicie apenas o novo serviço:

```bash
docker compose up -d --no-deps error-pages
```

O Traefik acompanha os arquivos dinâmicos montados e os recarrega. Para aplicações adicionais já cadastradas, atualize/reinicie somente o painel pelo procedimento usual para executar a adaptação do arquivo gerado. Não é necessário parar bancos ou remover volumes. Confirme os logs do proxy e teste as rotas em ambiente local antes de levar à produção.

Exemplos de verificação (ajuste a porta ao `.env`):

```bash
# Domínio sem rota: página Jubart e HTTP 404
curl -i -H 'Host: sem-rota.invalid' -H 'Accept: text/html' http://127.0.0.1/

# Cliente sem solicitação de HTML: HTTP 404 em texto
curl -i -H 'Host: sem-rota.invalid' http://127.0.0.1/
```

As páginas dependem de `error-pages` e do Traefik estarem acessíveis. Conexão recusada, falha de DNS ou erro de certificado antes do HTTP continuam sendo apresentados pelo navegador. O fallback HTTPS usa o certificado disponível no proxy: não emite certificados para domínios desconhecidos. Alterar `PHP_DISPLAY_ERRORS` não desativa a personalização de erros de navegação no proxy.

As páginas de erro oferecem **Ver diagnóstico técnico**, com descrição do status e orientações para consultar Serviços → Logs. Quando entregues por `error-pages`, exibem UUID e horário UTC correspondentes ao evento `error.page.served` nos logs desse serviço. Essa referência identifica a entrega da página, não é um ID de rastreamento da requisição original no Traefik; correlacione horário e logs do proxy/aplicação para investigar a causa. Páginas estáticas do FrankenPHP indicam quando essa referência não está disponível. Logs completos continuam restritos ao acesso administrativo.

### Padrão localhost e primeira inicialização

O `.env.example` usa `APP_DOMAIN=localhost`, `HTTP_PORT=80`, `APP_URL=http://localhost`, TLS desativado e acessos restritos a `127.0.0.1`. O painel usa 9090 e o phpMyAdmin 8081. As aplicações adicionais usam `app2.localhost` e `app3.localhost`, inicialmente desativadas. Se a porta 80 estiver ocupada, altere HTTP_PORT e todas as URLs públicas correspondentes. Os caminhos absolutos do workspace e dos projetos precisam ser preenchidos conforme o computador; credenciais do modelo devem ser substituídas.

O Traefik inicia o serviço de páginas como dependência. Configurações dinâmicas geradas usam extensão `.yml`, inclusive segurança, aplicações adicionais e WebSockets. Instalações anteriores são migradas pelo painel atualizado. A ausência de políticas de segurança usa um middleware válido, sem cadeia vazia. Essas correções não dependem de variáveis adicionais no `.env`; não sobrescreva seu ambiente existente com o modelo.

O editor do `.env` da aplicação oferece números de linha, cores para variáveis/valores/comentários, busca com próxima/anterior ocorrência e Ctrl/⌘+F. Ao maximizar a janela, a área de código ocupa o espaço disponível e mantém os botões de ação visíveis. O componente CodeMirror é empacotado localmente; o conteúdo não é enviado a serviços externos de edição.

<a id="limites-phpmyadmin"></a>

<a id="sec-limites-de-importacao-e-exportacao-do-phpmyadmin"></a>

## Limites de importação e exportação do phpMyAdmin

Em **Dados → Bancos de dados → MariaDB → Limites do phpMyAdmin**, configure o tamanho máximo do arquivo enviado, a memória PHP e o tempo por operação. Os valores são persistidos no `.env` e **Salvar e aplicar** recria somente o phpMyAdmin, com backup da configuração anterior; não reinicia o banco nem as aplicações.

```dotenv
PHPMYADMIN_UPLOAD_LIMIT=128M
PHPMYADMIN_MEMORY_LIMIT=512M
PHPMYADMIN_MAX_EXECUTION_TIME=600
```

Esses são os padrões do modelo para instalações novas. Um `.env` existente com `PHPMYADMIN_UPLOAD_LIMIT=32M` continua limitado a 32 MiB até ser alterado e aplicado. Para um dump maior que 50 MiB, escolha 128 MiB ou um limite com margem acima do tamanho real do arquivo. Arquivos compactados podem consumir mais memória ao serem descompactados.

Downloads/exportações não possuem um teto fixo de tamanho no phpMyAdmin: o limite de upload não limita o arquivo baixado. Memória, tempo por operação, recursos do servidor e navegador condicionam a exportação. O formulário explica essa diferença e não oferece um limite de download inexistente.

Antes de aplicar, confirme que nenhuma importação/exportação está em andamento. Recriar o phpMyAdmin interrompe os acessos e pode interromper transferências. Erro ao consultar progresso não comprova que a importação foi revertida; verifique o estado do banco antes de reenviar o dump.

Se alterar o `.env` manualmente, aplique apenas esse serviço:

```bash
docker compose up -d --no-deps --no-build --force-recreate phpmyadmin
```

Para usar a nova tela e API, atualize/reconstrua o painel com este código. A compilação do frontend isoladamente não atualiza o servidor dentro de um container já criado.

<a id="paineis-vinculados"></a>

<a id="sec-paineis-jubart-vinculados-e-entrada-automatica"></a>

## Painéis Jubart vinculados e entrada automática

Em **Integrações → Painéis vinculados**, as abas **Atalhos**, **Compartilhamentos** e **Como funciona** centralizam o acesso a outras instalações.

1. **No painel que será acessado**, escolha a conta administradora principal ou cadastre outra conta em Usuários e permissões. O administrador principal também pode ser compartilhado, com acesso completo.
2. Na aba Compartilhamentos, escolha a conta, um nome, a URL acessível desse painel e validade de **1 a 30 dias**. O token é exibido somente na criação; copie-o e envie por canal privado.
3. **No painel que centraliza os atalhos**, abra Vincular painel e cole o token. Confira o endereço e a validade antes de salvar.
4. Clique em Abrir painel. Uma nova aba entra automaticamente com a conta concedida, sem digitar ou transportar sua senha.

O token contém endereço, nome, validade e uma credencial revogável própria. Ele é uma **credencial de acesso**, não uma senha criptografada nem uma simples configuração inofensiva. Quem o possui pode utilizar as permissões concedidas até revogação/expiração. Se escolher uma conta administrativa, estará concedendo acesso administrativo completo. A URL deve usar HTTPS fora de localhost/loopback. O token de compartilhamento não é cifrado no transporte por si só; não o publique em Git, logs ou mensagens públicas.

O painel que emite guarda somente o hash do segredo. O painel que recebe guarda a credencial cifrada com AES-256-GCM, sob `.panel-state/panel-links`, usando uma chave local de arquivo restrito. Preserve essa pasta e sua chave nos backups protegidos. A listagem e a auditoria não devolvem tokens/senhas. A gestão e a utilização dos atalhos são exclusivas de administradores do painel que os armazena.

Ao abrir um atalho, o servidor de origem contata somente o endpoint fixo de troca no endereço salvo, sem seguir redirecionamentos. O destino emite um ticket de **uso único**, válido por **30 segundos**. O navegador recebe esse ticket no fragmento da URL (não no query string), remove-o e troca por uma sessão HttpOnly no destino. As permissões são sempre as da conta escolhida; o token não amplia o perfil nem concede acesso pelo MCP.

Revogar um compartilhamento no painel emissor impede novas entradas e invalida sessões abertas por ele. Alterar senha/permissões ou desativar a conta também invalida o vínculo. Sessões duram até oito horas, limitadas pela validade do compartilhamento. **Remover um atalho não revoga a credencial no emissor**; revogue-a no painel que concedeu o acesso quando necessário. Após revogar ou alterar a conta, gere um novo token e substitua o vínculo.

Os dois painéis precisam executar uma versão que contenha este recurso. O endereço do destino precisa ser alcançável pelo servidor que armazena o atalho e pelo navegador que o abrirá. `localhost` em containers diferentes normalmente aponta para ambientes diferentes; use um endereço HTTPS comum acessível a ambos. A funcionalidade não abre firewall, configura DNS, cria túneis ou altera serviços automaticamente. Tokens vencidos e falhas de conexão são informados ao abrir o atalho.

<a id="configuracoes-servidor"></a>

<a id="sec-data-hora-e-regiao-do-servidor"></a>

## Data, hora e região do servidor

Em **Administração → Configurações do servidor**, consulte a hora do servidor, UTC, região e fuso. O relógio avança a partir da amostra retornada pelo servidor e consulta novamente a cada 30 segundos. Não depende da data configurada no navegador.

**Configurar região e fuso → Salvar e aplicar** persiste `TZ` (ex.: `America/Sao_Paulo`) e `SERVER_DATE_LOCALE` (ex.: `pt-BR`) no `.env`, valida o Compose e recria somente runtimes PHP/FrankenPHP, Node.js, workers, agendadores e WebSockets em execução. Serviços parados permanecem parados. Conexões e tarefas ativas podem ser interrompidas; revise os horários das agendas. Outros serviços e o próprio painel recebem o novo TZ na próxima recriação. O backup protegido do `.env` anterior fica em `.panel-state/server-settings/env-before-settings`.

O PHP usa `date.timezone = ${TZ}`; Node.js recebe `TZ` também nos serviços gerados. Aplicações podem sobrescrever o fuso nas suas configurações (como Laravel). Região controla apenas a apresentação da data nesta área, não o idioma das aplicações nem locales do sistema. Alterar data manualmente ou sincronização NTP deve ser feito no host; o painel não recebe permissão para alterar seu relógio.

O **Console SQL** organiza o trabalho em **Comandos**, **Resultados** e **Erros**. Comandos potencialmente modificadores (como DELETE, UPDATE, DROP, TRUNCATE, INSERT e ALTER) recebem confirmação destacada, com banco, conta e comandos identificados, e exigem marcar a ciência dos impactos antes de executar. UPDATE/DELETE sem WHERE no nível da operação recebem alerta adicional sobre afetar todos os registros. A triagem considera somente o SQL enviado (seleção ou editor), ignora literais/comentários comuns e trata construções desconhecidas de forma conservadora; não é um analisador SQL completo nem substitui permissões do banco. Cancelar não executa o lote. O editor tem realce SQL, numeração de linhas e Ctrl/⌘+Enter para executar a seleção ou todo o conteúdo. O SQL permanece no editor ao alternar abas. Após executar, a aba correspondente abre automaticamente; resultados anteriores ao primeiro erro continuam disponíveis por instrução. A tabela ocupa a altura disponível até o rodapé, com rolagem própria e exportação CSV do resultado selecionado. A interface mantém somente as abas, os controles necessários e um rodapé compacto; os limites e orientações ficam em Ajuda e limites. Os erros exibem a mensagem retornada e o número da instrução quando fornecido pelo lote; não há validação SQL antecipada. Fechar a janela descarta o conteúdo local do editor e os resultados.


Na área **Dados → Backups**, as guias **Cópias de segurança**, **Configurações** e **Atividade e estado** separam arquivos, automação e acompanhamento. Um resumo informa se a agenda está ativa, se há execução ao iniciar e qual o destino. Em Configurações → Automação, ative o switch, escolha frequência diária/semanal ou cron personalizado, horário e fuso, e use **Salvar e aplicar**. A guia Arquivos e retenção define pasta, bancos e conservação; Destino remoto configura S3. Os controles mostram um rascunho até salvar. O estado da agenda é a configuração salva, separado da disponibilidade do serviço e das datas do último sucesso/falha.

Novas instalações vêm com **BACKUP_ENABLED=false**, **BACKUP_RUN_ON_START=false**, **PG_BACKUP_ENABLED=false** e **PG_BACKUP_RUN_ON_START=false**. Backups manuais continuam disponíveis. Ativar a agenda não ativa automaticamente cópias ao iniciar: esse switch é independente e só funciona com a automação ativa. Desativar a automação no formulário também desmarca a execução ao iniciar. As cópias já existentes são preservadas.


<a id="publicacao-github"></a>

<a id="sec-publicacao-no-github-e-configuracoes-locais"></a>

## Publicação no GitHub e configurações locais

O repositório distribui código, `.env.example`, templates do proxy e catálogos de dependências/imagens. `.env`, `.env.*` (exceto `.env.example`), `.panel-state/`, backups, configurações salvas/geradas de aplicações e automações, integrações e rotas dinâmicas do proxy ficam ignorados pelo Git. Não ignore toda a pasta `config/`: os catálogos públicos `images.lock.json` e `dependencies.licenses.json` continuam versionados.

Após clonar e preparar seu `.env`, execute `node scripts/initialize-local.mjs` **antes do primeiro comando Compose**, pois o modelo usa arquivos locais em `COMPOSE_FILE`. O script requer Node.js 24 ou superior, usa apenas módulos locais/nativos, prepara arquivos ausentes, substitui os caminhos e segredos de exemplo no `.env` e preserva valores personalizados. O painel também prepara os arquivos ausentes ao iniciar. Aplicações são inicializadas a partir do `.env` quando acessadas; os demais cadastros são criados conforme utilizados.

Sem Node no host, o mesmo script pode ser executado em um container Node, montando a raiz do projeto e usando o UID/GID do usuário local. Use a imagem fixada em `NODE_VERSION` no `.env.example` como imagem desse container; não é necessário instalar as dependências npm para executar esse script.

```bash
JUBART_NODE_IMAGE="$(sed -n 's/^NODE_VERSION=//p' .env.example)"
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace" -w /workspace -e JUBART_HOST_DIRECTORY="$PWD" "node:$JUBART_NODE_IMAGE" node scripts/initialize-local.mjs
```


Antes de publicar, execute `node scripts/check-publication.mjs --history` e revise `git diff --cached`. O verificador detecta caminhos locais conhecidos no índice e no histórico, compara os conteúdos com segredos atuais do `.env` (sem exibir valores) e procura alguns padrões de tokens e chaves privadas. Também examina arquivos publicáveis antes do próximo `git add`. Não detecta todos os segredos nem substitui revisão manual. Sem `--history`, os commits anteriores não são examinados. Arquivos locais anteriormente rastreados precisam sair do índice com `git rm --cached` (sem apagar as cópias do disco); o `.gitignore` sozinho não resolve esse caso. Commits antigos continuam contendo arquivos antes versionados: parar de versionar não limpa o histórico. Se uma credencial tiver sido publicada, revogue-a e trate o histórico antes de tornar o repositório público. Backups da instalação devem preservar separadamente o `.env`, `config/` e `.panel-state/` protegidos.

<a id="migracao-jubart"></a>

<a id="sec-assistente-jubart-json-para-outra-infraestrutura"></a>

## Assistente Jubart.json para outra infraestrutura

O **Assistente de configuração** reúne o fluxo local → nuvem/VPS:

1. Em **Preparar meu ambiente → Configurar aqui**, cadastre acesso, aplicação e banco. Salve na etapa **Revisão**; teste sua aplicação localmente antes de transportá-la.
2. Escolha **Levar para a nuvem / VPS → Preparar Jubart.json**, ou **Levar para a VPS · Jubart.json** na revisão. O arquivo usa as configurações salvas; o assistente bloqueia a transferência enquanto houver rascunho não salvo.
3. Selecione as categorias e ajuste o destino. **Preparar para VPS por IP** publica em `0.0.0.0` e escolhe HTTP por porta; **Preparar para localhost** usa `127.0.0.1`. Ambos desativam TLS, cookie seguro e proxy por domínio do painel **no arquivo de destino**, sem mudar a origem. Para preservar HTTPS, escolha **Manter HTTP/HTTPS e proxy do arquivo** e revise DNS/certificados.
4. Instale e inicie o Jubart na VPS com o início rápido. Transfira o código/build das aplicações e os dumps dos bancos pelos meios apropriados. Entre no painel e abra **Assistente de configuração → Receber neste servidor → Importar e continuar**.
5. Carregue `Jubart.json`, confirme IP/domínio, portas e pastas reais de cada aplicação e revise os avisos. Importar salva sem iniciar serviços. O assistente continua na etapa de bancos, com a configuração importada carregada: prepare credenciais locais, cadastre/teste conexões, revise todas as aplicações habilitadas e aplique.

O arquivo não copia dados nem credenciais de bancos. As contas, senhas e conexões devem ser preparadas no destino. A liberação das portas no firewall é manual; alterar a porta/cookie do próprio painel exige recriá-lo no terminal conforme o início rápido. A exportação mantém sua instalação local intacta.

Em **Administração → Importar e exportar configurações**, use os assistentes de exportação e importação. O arquivo se chama **Jubart.json** (`format: "Jubart"`, `version: 1`), tem limite de 750 KiB e contém categorias escolhidas: aplicações/acessos, cadastros de filas/agendadores/jobs e preferências de fuso/versões/backups. A exportação não altera a instalação de origem.

As etapas são **Conteúdo → Novo ambiente → Revisão**. Informe IP/domínio das aplicações, interfaces de publicação, portas HTTP/HTTPS e do painel, domínio do painel, pastas das aplicações e pastas de backup. `0.0.0.0` significa escutar nas interfaces do servidor; não é o endereço público para abrir no navegador. O arquivo pode ser preparado para o destino ao exportar e adaptado novamente ao importar. Revise certificados, DNS, acessos aos bancos e subdomínios na área Proxy antes de aplicar.

A importação valida formato, portas, domínios e revisão, informa cadastros substituídos e pastas ainda indisponíveis. Aplicações com o mesmo ID são substituídas; outras aplicações existentes são preservadas. A categoria de automações substitui os respectivos cadastros, deixando workers/agendadores desativados para revisão. WebSockets importados também ficam desativados; revise domínio/origens antes de habilitar. Agendas de backup, execução ao iniciar e envio remoto são desativados na importação para revisão do destino.

**Importar e salvar não inicia/recria serviços, não altera o relógio do host e não publica novas portas imediatamente.** Após preparar código, diretórios, bancos e credenciais no destino, revise e aplique em Aplicações, Proxy, Automação e nas configurações de runtime/backup. As alterações de acesso ficam no cadastro até aplicar. Preferências importadas no `.env` entram nos serviços conforme suas próximas recriações. Serviços já em execução permanecem em execução com sua configuração anterior.

O arquivo não transporta bancos/dumps, arquivos das aplicações, volumes, senhas/chaves/tokens, usuários do painel, conexões cifradas, sessões, vínculos com outros painéis, certificados ou políticas de segurança. Prepare/reconfigure esses itens separadamente. Argumentos de jobs não são exportados. Comandos personalizados de inicialização permanecem no cadastro e podem conter informações sensíveis; revise o arquivo antes de compartilhar. Somente administradores podem exportar/importar; requisições POST exigem sessão e CSRF. Nenhuma ferramenta MCP nova é exposta por este recurso.

Antes de gravar, a configuração anterior fica em `.panel-state/migrations/<data-id>/`, com arquivos `0.before` (`.env`), `1.before` (`config/apps.json`) e `2.before` (`config/automation.json`), quando existirem. Esse backup local pode conter segredos do destino; preserve-o protegido. A importação verifica se a configuração mudou desde a revisão e recusa versões antigas. O arquivo Jubart.json não substitui um backup completo da instalação.

<a id="plugins-docker"></a>

<a id="sec-plugins-docker-por-json"></a>

## Plugins Docker por JSON

Em **Workspace → Plugins**, importe um manifesto **JubartPlugin v1** para instalar um serviço adicional na rede interna `app` existente. Use **Baixar modelo JSON**, substitua a imagem/portas e envie o arquivo para validar e revisar. O modelo contém uma imagem de exemplo que precisa ser substituída antes da instalação.

```json
{
  "format": "JubartPlugin",
  "version": 1,
  "id": "meu-plugin",
  "name": "Meu plugin",
  "description": "Serviço adicional",
  "image": "seu-registro/sua-imagem:1.0.0",
  "environment": {},
  "ports": [
    {"container": 8080, "host": 19090, "bind": "127.0.0.1", "protocol": "tcp"}
  ],
  "volumes": [{"name": "data", "target": "/data"}],
  "resources": {"memoryMiB": 512, "cpus": 1, "pids": 256}
}
```

- Um manifesto cria **um único serviço** (`plugin`) em projeto Compose próprio: `jp-<identificador-da-instalação>-<id>`. O Compose principal não é modificado nem recriado por estas ações.
- `image` exige tag explícita diferente de `latest` ou digest `sha256`. `command` opcional é uma lista de argumentos. `healthcheck` opcional é uma lista iniciada por `CMD`, por exemplo `["CMD", "programa-de-verificacao"]`; o programa precisa existir na imagem. Sem healthcheck, estar em execução não comprova saúde.
- A rede `app` é identificada na definição Compose e deve existir antes da instalação. Se ainda não existe, inicie um serviço da infraestrutura que a utilize. O plugin usa essa rede como **externa**, sem criar ou remover a rede compartilhada. Conectividade não configura automaticamente credenciais ou permissões de bancos.
- Portas do host precisam estar entre 1024 e 65535; o padrão é `127.0.0.1`. `0.0.0.0` permite publicação nas interfaces do servidor e exige cuidado com firewall. Conflitos com portas declaradas na infraestrutura, registradas por outros plugins ou publicadas no Docker são recusados. Não há configuração automática de domínio/TLS neste fluxo.
- Apenas volumes nomeados próprios são aceitos. Não são aceitos bind mounts, nomes de volumes externos, host network, socket Docker, modo privilegiado ou campos Compose arbitrários. O serviço usa `cap_drop: ALL`, `no-new-privileges`, limites de memória/CPU/processos e rotação de logs. Algumas imagens exigem capacidades que este modelo não oferece e podem não iniciar.
- Recursos: RAM 32–16384 MiB, CPU 0.1–16, processos 16–4096. Máximo de 25 plugins, 10 portas, 8 volumes e 50 variáveis por plugin. O arquivo enviado pela interface aceita até 128 KiB.
- O painel oferece **iniciar, parar, reiniciar, detalhes, logs e remover**. Toda alteração passa por revisão com impacto; remover pede também o ID. Os comandos atuam no serviço do projeto do plugin. Nenhum `down` geral da infraestrutura é executado. Instalação ou recriação pode falhar por imagem, porta, rede ou recursos: o cadastro é mantido para revisão, nova tentativa ou remoção.
- **Remover preserva os volumes por padrão.** Para apagar dados, marque explicitamente a opção irreversível. Antes de excluir, o painel confere as labels de propriedade dos volumes. Volumes em uso ou de outro projeto não são excluídos. Imagens e rede externa são preservadas.
- Manifesto e Compose ficam em `.panel-state/plugins/<id>/`, com arquivos privados. A remoção arquiva o cadastro em `.panel-state/plugins-removed/`. Variáveis podem conter segredos: não publique os arquivos de importação nem os diretórios locais. A listagem/revisão retorna apenas nomes das variáveis; logs ocultam valores conhecidos, mas aplicações podem registrar outros dados sensíveis.
- Para mudar um manifesto já instalado, remova o plugin preservando seus volumes e importe a nova versão com o mesmo ID. Não há atualização automática de imagens ou edição de Compose arbitrário nesta área.
- Volumes preservados podem ser reutilizados ao reinstalar o mesmo ID nesta instalação. A coleção de plugins não é incluída no `Jubart.json` de migração; prepare manifestos e dados separadamente para outra infraestrutura.

O recurso é administrativo. Imagens executam código no host Docker e têm acesso à rede interna selecionada. A separação dos projetos limita o alcance dos comandos de gestão, mas não elimina disputas por recursos nem os efeitos que o código do plugin possa causar nos serviços aos quais conseguir se conectar. O Docker do host deve já estar autenticado para imagens privadas; tokens de registro não fazem parte do manifesto.

Na importação de plugins, ajuste as portas na seção **Portas do plugin** antes de validar: informe a porta interna, a porta publicada no servidor, TCP/UDP e o alcance local ou pelas interfaces do servidor. É possível adicionar ou remover publicações nessa etapa. As portas **80 e 443 do host são reservadas ao Traefik**, mesmo quando não estão publicadas; portas internas 80 e 443 são permitidas. As demais portas da infraestrutura e de outros plugins também são verificadas. Publicar uma porta não configura o firewall da VPS. Para alterar portas de um plugin já instalado, abra **Proxy & acessos → Plugins → Configurar portas**. Adicione, remova ou edite as publicações e confirme em **Salvar e aplicar**. O Jubart verifica conflitos novamente e recria apenas o plugin, preservando seus volumes e demais configurações. Se o plugin estiver parado, continuará parado. Se estiver em execução, haverá uma breve interrupção. Se a aplicação falhar, as portas salvas ficam disponíveis para revisão e nova tentativa. Essa guia gerencia publicação direta de portas; domínio/HTTPS e firewall não são configurados por ela.


<a id="mercure"></a>

<a id="sec-mercure-por-aplicacao-php"></a>

## Mercure por aplicação PHP

Em **Processos → Mercure**, clique em **Configurar**, ative o switch e use **Salvar e aplicar**. O recurso vem desativado por padrão. A aplicação deve estar habilitada e as redes `app` e `proxy` devem existir. As origens permitidas incluem protocolo e porta, quando necessária, como `http://localhost:5173` ou `https://app.exemplo.com`; não são aceitos curingas. Assinantes anônimos ficam desativados por padrão e, quando autorizados, recebem apenas eventos públicos.

O botão **Como integrar** abre um guia em duas abas: **1. Backend**, com as variáveis de ambiente e os passos para publicar eventos e autorizar usuários; e **2. Frontend**, com a URL pública, conexão, renovação da autorização e verificação do recebimento. Exemplos completos de PHP, estrutura JWT, uso de EventSource e detalhes de cookies ficam em seções expansíveis. Os exemplos respeitam o protocolo detectado no hub. As chaves reais continuam disponíveis somente pela ação separada **Chaves**, com confirmação e auditoria; o guia mostra apenas os campos que precisam ser preenchidos no backend.

Cada aplicação possui um hub separado usando o módulo Mercure da imagem FrankenPHP já fixada na infraestrutura. O hub não monta o código da aplicação e funciona tanto com PHP tradicional quanto com Octane. A ativação valida a configuração no binário da imagem antes de publicar a rota. O painel tenta a configuração moderna e, se necessário, valida a configuração legada; a interface informa **Mercure 1.0** ou **Mercure 0.x** conforme o formato aceito. A detecção não atualiza imagens nem instala bibliotecas na aplicação. Falha de inicialização mantém o cadastro pendente e a rota desativada.

O endereço público é `http(s)://DOMINIO:PORTA/.well-known/mercure`, passando pelo Traefik e pela política de segurança da aplicação, sem portas públicas adicionais. A rota tem prioridade própria e envio imediato do fluxo SSE; não usa a interceptação de páginas de erro nem compressão do PHP. O domínio e o HTTPS acompanham as configurações da aplicação. Depois de mudar domínio, porta, HTTPS ou imagem FrankenPHP, aplique novamente o Mercure. Aplicar a configuração global retira rotas de hubs incompatíveis/pendentes; desativar ou remover a aplicação também encerra seu hub.

**Como integrar** abre instruções e exemplos adaptados ao protocolo detectado, com três guias: navegador, PHP/Laravel e eventos privados. O navegador usa `EventSource` e a URL pública; o backend publica por HTTP usando a URL interna na rede `app`. Como o hub é separado, `mercure_publish()` no processo da aplicação não publica neste hub. Workers e comandos também publicam por HTTP. Para Laravel, exponha as variáveis em um arquivo de configuração, leia com `config()` e atualize o cache e os workers após mudanças. O exemplo PHP usa JWT de curta duração e escopo de tópico; bibliotecas JWT e Symfony Mercure podem ser usadas conforme a versão do protocolo.

**Chaves** exige uma consulta explícita de administrador, com CSRF, registrada na auditoria. As chaves distintas de publicação e assinatura são geradas criptograficamente, ficam em arquivo privado `0600` dentro de `.panel-state/mercure/<aplicacao>/hub.env` e não aparecem na listagem. São segredos persistidos localmente, sem criptografia em repouso: proteja o acesso ao host e aos backups. Copie-as somente para o backend, nunca para variáveis `VITE_*`, frontend, Git ou tokens fixos em exemplos. O Jubart não modifica o `.env` da aplicação. **Gerar novas chaves** invalida a assinatura de tokens antigos após a recriação; atualize também as aplicações. Eventos privados exigem tokens com os tópicos que cada usuário pode assinar; CORS não substitui autorização. No navegador, EventSource nativo pode usar cookie HttpOnly emitido pelo backend. O guia informa o nome de cookie configurado para cada protocolo e modo HTTP/HTTPS.

Desativar encerra as conexões SSE, preservando chaves e o volume do histórico. O hub é administrado em projeto Compose separado com um único serviço, redes externas existentes e volume próprio. Essa separação também significa que `docker compose down` da infraestrutura principal não encerra esses projetos: desative seus hubs no painel antes de desligar toda a instalação. Os limites iniciais por hub são 256 MiB, 1 CPU e 128 processos. O histórico usa o armazenamento padrão da versão integrada: acompanhe o volume, pois não há retenção configurável nesta tela. Logs são limitados e os valores conhecidos das chaves são ocultados; não há registro de acesso HTTP do hub habilitado. Configurações Mercure, chaves e seus volumes não entram no `Jubart.json`; prepare-os separadamente ao migrar de servidor.

Referências: [FrankenPHP / Mercure](https://frankenphp.dev/docs/mercure/) e [configuração do hub](https://mercure.rocks/docs/hub/config).


<a id="manutencao-painel"></a>

<a id="sec-recompilar-o-painel-pela-administracao"></a>

## Recompilar o painel pela administração

Em **Administração → Manutenção do painel**, clique em **Recompilar painel** e confirme. A ação executa o equivalente a `docker compose up -d --build --no-deps panel`, usando explicitamente o projeto e os arquivos Compose desta instalação. Ela usa o código já presente no servidor; não baixa alterações do GitHub. Consultas SQL, transferências e operações em andamento impedem o início. Durante a recompilação, novas alterações administrativas ficam bloqueadas.

Um executor temporário usa a imagem atual do painel, suas montagens e o mesmo usuário/grupos do processo do painel para continuar trabalhando mesmo quando o serviço `panel` é recriado. As capabilities são removidas. Antes de iniciar, o servidor salva uma cópia privada da configuração Compose resolvida e do ambiente da solicitação, preservando os caminhos originais e escapando valores literais; o executor usa essa configuração congelada, sem precisar de permissões extras para ler configurações pertencentes a outro usuário do host. Ele não publica portas e é removido automaticamente ao terminar. Usa rede bridge para permitir a autenticação do BuildKit nos registros de imagens; a imagem do painel inclui os plugins Docker Compose e Buildx usados na construção. O comando atua somente no serviço `panel`, sem recriar aplicações ou bancos nem excluir volumes. A tela mostra uma indicação de andamento, sem percentual artificial; o resultado e a saída com valores conhecidos de segredos ocultados ficam em `.panel-state/panel-maintenance/state.json`, arquivo privado fora do Git. A confirmação final exige que o painel volte saudável. Logs de build podem conter dados produzidos pelos próprios comandos do projeto: mantenha o acesso administrativo protegido.

A sessão pode ser encerrada durante a recriação. Aguarde o retorno, entre novamente e consulte **Manutenção do painel** para ver o resultado. Se o `.env` mudou a porta ou o domínio, use o novo endereço. Falhas de build ou de saúde ficam registradas; confira o serviço antes de repetir. Não há rollback automático de imagens. O instalador e o Docker do host continuam sendo pré-requisitos.

Para disponibilizar esse botão pela primeira vez em uma instalação existente, atualize o código e execute uma vez no terminal:

```bash
docker compose up -d --build --no-deps panel
```

Depois dessa atualização, as próximas recompilações podem ser iniciadas pelo próprio painel.


Na mesma tela **Administração → Manutenção do painel**, **Iniciar serviços** executa o equivalente a `docker compose up -d --build`. Use após salvar/aplicar os apontamentos no assistente de configuração. O comando respeita os perfis ativos de `COMPOSE_PROFILES`: serviços opcionais desabilitados não são ativados por esse botão. Plugins e hubs Mercure em projetos separados continuam com sua administração própria. Serviços existentes podem ser recriados, inclusive o painel, encerrando conexões e a sessão. Volumes são preservados. A ação usa o mesmo executor restrito e a configuração privada congelada da manutenção do painel; consultas e transferências em andamento impedem o início.

A conclusão confirma os serviços habilitados em execução e os healthchecks disponíveis aprovados. Um serviço sem healthcheck em execução não comprova funcionamento de todas as rotas. Falhas podem deixar parte dos serviços iniciada: veja a saída e corrija os apontamentos antes de tentar novamente. Durante o processo, a tela mostra andamento sem percentual artificial. Se o painel reiniciar, entre novamente e consulte **Última operação**. Essa ação substitui a etapa manual de subir os demais serviços após `./install.sh`.

### IP fixo do Traefik

Instalações novas pelo instalador oficial reservam automaticamente um IPv4 para o Traefik, fora da faixa dinâmica. Instalações existentes mantêm a rede atual e oferecem uma migração explícita em **Integrações → Como acessar → IP fixo do Traefik**. Consulte o [procedimento de instalação, migração e rollback](docs/proxy-network.md) antes de aplicar na VPS.
