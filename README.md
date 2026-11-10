<a id="inicio"></a>

> **Política de dependências:** utilizar componentes de infraestrutura open source e imagens externas fixadas por tag + digest SHA-256. Consulte [Imagens fixadas](#imagens-fixadas-e-licencas) e [licenças de terceiros](THIRD_PARTY_NOTICES.md).

# 🖥️ Infra Control — painel de infraestrutura para aplicações web

![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![PHP](https://img.shields.io/badge/Runtime-PHP-777BB4?logo=php&logoColor=white)
![Node.js](https://img.shields.io/badge/Runtime-Node.js-339933?logo=node.js&logoColor=white)
![Estáticas](https://img.shields.io/badge/Builds-React%20%2F%20Vite-646CFF?logo=vite&logoColor=white)
![Traefik](https://img.shields.io/badge/Proxy-Traefik-24A1C1)
![MariaDB](https://img.shields.io/badge/Banco-MariaDB-003545?logo=mariadb&logoColor=white)
![Valkey 8](https://img.shields.io/badge/Cache-Valkey_8-FF6B35)

**Uma infraestrutura compartilhada para publicar e administrar aplicações PHP, Node.js e estáticas, do ambiente local à VPS.**

O **Infra Control** reúne Docker Compose, proxy por domínio/subdomínio, bancos, cache, backups e um painel administrativo em React. Cada aplicação escolhe seu runtime: PHP com FrankenPHP, um processo Node.js ou arquivos estáticos servidos pelo Caddy. Laravel, WordPress e builds React/Vite são exemplos de projetos atendidos.

O painel permite cadastrar aplicações, configurar acessos, gerenciar bancos e usuários, agendar backups, importar/exportar SQL e acompanhar o host e os containers. A **Conexão MCP** disponibiliza diagnóstico e operações de filas/jobs autorizadas para ferramentas de IA. Diretórios, versões e credenciais ficam no `.env` da infraestrutura; os cadastros e apontamentos do painel ficam em arquivos JSON. As particularidades de cada aplicação continuam no próprio projeto.

**Autor:** Paulo Leonardo da S. Cassimiro · Engenheiro de Software e Analista de Sistemas, com atuação em desenvolvimento.

> [!TIP]
> 🚀 **Primeiro uso:** siga o [início rápido](#inicio-rapido), abra o painel e escolha o tipo da aplicação: **PHP, Node.js ou Estática**. Octane é opcional e exclusivo de projetos Laravel preparados para ele.

> [!WARNING]
> 🛑 **Proteja seus dados:** `docker compose down -v` apaga os volumes nomeados. Para manutenção, use os comandos de [recriação sem apagar volumes](#manutencao). Não versione senhas nem backups.

[🚀 Início rápido](#inicio-rapido) · [📦 Tipos de aplicação](#tipos-aplicacao) · [➕ Cadastrar aplicações](#cadastrar-aplicacoes) · [🖥️ Painel](#painel-administrativo) · [🤖 Integração MCP](docs/MCP.md) · [👨‍💻 Visão de arquitetura](#visao-arquitetura)

### 🗺️ Navegação

| Começar e desenvolver | Operar e manter | Proteger e recuperar |
| --- | --- | --- |
| [📦 PHP, Node.js e Estáticas](#tipos-aplicacao) | [🚀 Comandos rápidos](#comandos-rapidos) | [🔐 Certificados HTTPS](#certificados) |
| [➕ Cadastrar aplicações](#cadastrar-aplicacoes) | [📂 Trocar pasta do projeto](#trocar-projeto) | [💾 Backup automático](#backup-automatico) |
| [🌍 Local e VPS](#local-vps) | [🔧 Aplicar alterações do .env](#manutencao) | [🗄️ Backup e restauração SQL](#backup-manual) |
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

## 🚀 Início rápido: publicar sua primeira aplicação

1. Prepare o `.env` da infraestrutura a partir de `.env.example`, **somente se ainda não existir**. Configure credenciais, `PANEL_WORKSPACE_DIRECTORY` e `PANEL_PROJECTS_DIRECTORY` com caminhos existentes. Mantenha o nome do projeto Compose de uma instalação existente para continuar usando seus volumes.
2. Construa e suba apenas o painel, sem depender da aplicação inicial:

   ```bash
   docker compose up -d --build --no-deps panel
   ```

3. Acesse `http://localhost:9090` no padrão local, ou a porta/endereço definidos no `.env`. Entre com `PANEL_USERNAME` e `PANEL_PASSWORD`.
4. Na guia **Aplicações**, configure a aplicação principal ou use **Nova aplicação**. Escolha **PHP**, **Node.js** ou **Estática**, informe domínio e pasta existente e ajuste os campos específicos:

   | Tipo | Exemplo | Preparação |
   | --- | --- | --- |
   | PHP | Laravel ou WordPress | Dependências e raiz pública corretas; Octane apenas quando instalado |
   | Node.js | API ou aplicação com servidor próprio | Dependências/build preparados, comando de início e escuta em `0.0.0.0` na porta interna |
   | Estática | React/Vite ou HTML | Build pronto com `index.html`; informar `dist`, `build` ou `.` e escolher SPA quando necessário |

5. Confirme o rascunho, clique em **Salvar configurações** e depois **Aplicar configuração**. O painel gera o serviço e o roteamento adequados ao tipo escolhido.
6. Depois de preparar os apontamentos, suba os demais serviços compartilhados conforme a configuração:

   ```bash
   docker compose config --quiet
   docker compose up -d --build
   docker compose ps -a
   ```

O painel não cria o código da aplicação, instala suas dependências ou executa migrações automaticamente. Use as [instruções por tipo](#tipos-aplicacao). No Linux, acrescente `sudo` se sua instalação Docker exigir. Na VPS, configure DNS, publicação de portas e HTTPS na área **Proxy & acessos**.

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

## 🌍 Configuração local e VPS

O `.env` da infraestrutura concentra variáveis operacionais e credenciais; `.env.example` contém o modelo sem senhas reais. Os cadastros do painel ficam em JSON e as configurações avançadas do PHP em INIs. Cada aplicação mantém suas próprias opções e dependências. Nos serviços PHP, as variáveis de banco e `APP_URL` injetadas pelo Compose prevalecem sobre o arquivo do projeto.

| Variável | Local | VPS |
| --- | --- | --- |
| `HTTP_BIND_ADDRESS` | `127.0.0.1` | `0.0.0.0` |
| `HTTP_PORT` | `8080` | `80` |
| `HTTPS_PORT` | `8443` | `443` |
| `APP_DOMAIN` | `localhost` | `app.exemplo.com` |
| `APP_URL` | `http://localhost:8080` | `https://app.exemplo.com` |
| `TRAEFIK_TLS_ENABLED` | `false` | `true` |
| `ACME_EMAIL` | vazio | seu email válido |

Na VPS aponte DNS A/AAAA corretamente e permita entrada nas portas 80 e 443. Traefik termina TLS; Octane recebe HTTP interno. O Compose fornece `OCTANE_HTTPS` conforme TLS; configure proxies confiáveis no Laravel conforme sua versão. Na aplicação use `APP_ENV=production`, `APP_DEBUG=false` e cookies seguros ao habilitar HTTPS.

MariaDB publica por padrão `127.0.0.1:3306` no host; ajuste `MARIADB_BIND_ADDRESS` e `MARIADB_PORT` no `.env`. phpMyAdmin atende http://localhost:8081 com `DB_USERNAME` e `DB_PASSWORD`; endereço, porta, versão e upload são configuráveis com `PHPMYADMIN_*`. Na VPS mantenha-o em loopback e acesse com `ssh -N -L 8081:127.0.0.1:8081 usuario@IP_DA_VPS`.

---

<a id="octane-deploy"></a>

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

## 📦 npm

```bash
docker compose run --rm node install
docker compose run --rm node run build
```

Com lockfile, prefira `ci` a `install`. `APP_NODE_VERSION`, `NODE_UID` e `NODE_GID` ficam no `.env`; ajuste IDs conforme `id -u`/`id -g`. O serviço é executado sob demanda pelo perfil `tools`, usando o mesmo diretório da aplicação.

Referências: [FrankenPHP com Laravel](https://frankenphp.dev/docs/laravel/), [Laravel Octane](https://laravel.com/docs/13.x/octane), [imagens FrankenPHP](https://frankenphp.dev/docs/docker/). Consulte a documentação correspondente à versão efetiva do seu Laravel.

---

<a id="comandos-rapidos"></a>

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
curl --fail --show-error --max-time 15 http://localhost:8080/
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

Acesse a aplicação pela URL normal, por exemplo http://localhost:8080. Os assets e WebSocket HMR usam http://localhost:5173 e ws, por padrão. Se os arquivos não atualizarem no ambiente Docker, habilite `VITE_USE_POLLING=true` e recrie Vite.

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

## 🎭 Páginas de erro do servidor

No modo `traditional`, `docker/php/errors` contém páginas independentes do Laravel para 404, 500, 502, 503 e 504. A configuração do Caddy captura esses status em navegações HTML, preservando o código HTTP. Respostas da aplicação para API e requisições com `X-Inertia` não são substituídas. Os handlers de falhas internas do servidor também usam as páginas estáticas.

As páginas não corrigem o erro: um Laravel sem dependências continuará retornando 500. Consulte os logs para diagnóstico. Não são exibidos caminhos, senhas ou detalhes de exceções. Em produção, mantenha `APP_DEBUG=false` na aplicação.

```bash
docker compose config --quiet
docker compose run --rm --no-deps php frankenphp validate --config /etc/frankenphp/Caddyfile --adapter caddyfile
docker compose up -d --no-deps --force-recreate php
curl -i -H 'Accept: text/html' http://localhost:8080/rota-inexistente
```

Edite o HTML diretamente para personalizar; não precisa reconstruir a imagem. No modo Octane, o servidor usa a configuração do pacote Octane e este Caddyfile não se aplica: personalize as páginas no Laravel ou integre um Caddyfile específico compatível com a versão do Octane. Erros gerados pelo próprio Traefik (como backend PHP desligado) também não passam pelo handler do FrankenPHP e não usam essas páginas.

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

Com `HTTP_PORT=8080`, mantenha a mesma porta para todos, incluindo nas URLs: `http://financeiro.localhost:8080`. Os domínios não incluem porta. Navegadores modernos normalmente resolvem subdomínios `.localhost` para loopback; se seu ambiente não resolver, adicione no `/etc/hosts`:

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

## 🖥️ Infra Control: painel administrativo

O painel Node.js gerencia os serviços deste projeto Docker Compose, com uma interface local inspirada no fluxo de ferramentas de gerenciamento de proxy. Ele oferece:

- **Visão geral:** estado dos containers, healthchecks e logs recentes.
- **Serviços:** iniciar, parar e reiniciar os serviços declarados no Compose, com confirmação.
- **Aplicações:** configurar os slots `main`, `app2` e `app3`, seus domínios, diretórios, raízes públicas, modos e portas HTTP internas.
- **Proxy:** editar portas públicas, endereço de publicação, TLS e email ACME.
- **Volumes:** consultar volumes e montagens, sem apagar dados.

### 🔑 Acesso e credenciais

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

`PANEL_WORKSPACE_DIRECTORY` precisa ser o caminho absoluto **real no host** desta pasta. `PANEL_PROJECTS_DIRECTORY` deve conter os projetos que deseja vincular; é montado em somente leitura no painel para conferir os caminhos, nos mesmos endereços do host. Os containers PHP recebem suas montagens individuais com escrita conforme o Compose. Projetos fora dessa árvore precisam de montagem adicional no serviço `panel` para a validação dos caminhos.

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
> 🔐 O painel monta o socket Docker para administrar containers e a pasta da infraestrutura para atualizar configurações. Esse acesso equivale a privilégio administrativo no host. Mantenha o painel em `127.0.0.1`, use senha forte e não o publique diretamente na internet. Na VPS, prefira túnel SSH: `ssh -N -L 9090:127.0.0.1:9090 usuario@IP_DA_VPS`. O painel só oferece operações sobre serviços do projeto e não permite shell arbitrário ou exclusão de volumes, mas isso não reduz o privilégio do socket em caso de comprometimento do painel.

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

## ⏱️ Painel: filas, jobs e Laravel Scheduler

A área **Filas & Scheduler** do Infra Control gerencia o trabalho em segundo plano de cada aplicação Laravel. Funciona nos modos tradicional e Octane; não exige Supervisor. Os processos usam a imagem, o diretório e as credenciais do respectivo projeto.

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

O `.env` controla a disponibilidade:

```dotenv
PANEL_TERMINAL_ENABLED=true
```

Depois de alterar, recrie o painel. Para aplicar também o código novo:

```bash
sudo docker compose up -d --build --no-deps panel
```

O botão **Terminal** aparece em serviços em execução, exceto o próprio painel. Escolha `sh` ou `bash` e digite um comando, por exemplo:

```bash
pwd
php -v
php artisan list
php artisan migrate:status
```

O comando executa **dentro do container selecionado**, com seu usuário e diretório de trabalho. No PHP, `/var/www/html` corresponde ao volume da aplicação. A interface mostra stdout, stderr e código de saída; permite limpar ou exportar a saída. Cada comando inicia um novo shell: `cd` ou `export` não persistem no próximo envio. Para combinar operações, use, por exemplo, `cd /var/www/html && php artisan list`.

É um console de comandos **não interativo**, sem terminal TTY. Não execute editores, prompts de senha, `tail -f`, workers contínuos ou processos em segundo plano. A imagem precisa fornecer o shell escolhido e `timeout`; imagens mínimas podem não ter essas ferramentas. O processo em primeiro plano tem limite de 25 segundos, com até dois segundos adicionais antes de encerramento forçado; a conexão Docker também tem limite. Limitar o comando não desfaz alterações já realizadas, nem garante encerramento de processos que se destacarem dele.

Para Bash interativo completo e comandos longos, continue usando no host:

```bash
sudo docker exec -it php bash
```

Somente um comando pode executar pelo console de cada instância do painel por vez; ações administrativas de recriação aguardam seu término. O console usa as mesmas proteções de sessão e CSRF das demais operações e aceita apenas serviços deste projeto. Ainda assim, é uma funcionalidade administrativa: comandos podem alterar arquivos do volume e dados da aplicação. Não digite segredos literais, pois o comando aparece na tela e em exportações do console. O histórico não é salvo no cadastro JSON.

Se não quiser permitir essa funcionalidade, defina `PANEL_TERMINAL_ENABLED=false` e recrie `panel`. Mantenha o painel em loopback/túnel SSH, conforme as instruções de acesso.

### 📋 Listagem e edição de aplicações no painel

A tela Aplicações apresenta uma lista compacta com nome, indicação de principal (`main`) ou adicional, domínio, modo, porta interna e estado de habilitação/execução. Clique na linha, no nome ou em **Ver detalhes** para abrir a edição. Os botões também podem ser acessados pelo teclado.

A janela separa identificação, arquivos e execução. **Cancelar** ou Escape descartam as alterações daquela janela. **Guardar no rascunho** atualiza apenas os dados na interface; depois use **Salvar configurações** e **Aplicar configuração** para persistir e atualizar os containers. A aplicação principal permanece habilitada.

Para atualizar o painel após esta mudança:

```bash
sudo docker compose up -d --build --no-deps panel
```

## 📈 Métricas ao vivo: CPU, memória e requisições

A guia **Métricas ao vivo** do painel apresenta:

- CPU e RAM agregadas do projeto, com gráficos e consumo por container.
- CPU individual, memória usada/limite, PIDs, entrada/saída de rede e I/O de disco, a partir de `docker stats`.
- Requisições HTTP/HTTPS acumuladas, requisições por segundo, respostas 5xx e latência média por intervalo, a partir do exporter Prometheus embutido no Traefik.
- Contadores por rota de aplicação, coletados apenas após existir tráfego.

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

Alterar a senha no painel não atualiza clientes automaticamente. Atualize o `.env` da aplicação correspondente, recrie o serviço PHP que recebe essa credencial e, se o Laravel utiliza configuração em cache, reconstrua esse cache. Para a aplicação principal que recebe `DB_PASSWORD` da infraestrutura:

```bash
# Depois de atualizar a senha real no banco e DB_PASSWORD no .env da infra:
sudo docker compose up -d --no-deps --force-recreate php
sudo docker compose exec php php artisan config:clear
# Em produção, após validar as variáveis:
sudo docker compose exec php php artisan config:cache
```

Atualize também workers/Scheduler e outras aplicações que usem essa conta. Para serviços adicionais, use `php-app2`/`php-app3`, conforme o projeto. Senhas administrativas não são alteradas nessa guia: editar apenas `POSTGRES_PASSWORD` ou `DB_ROOT_PASSWORD` no `.env` não muda a senha existente no banco. Siga a manutenção interativa da conta antes de recriar clientes.

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

O painel mantém os componentes Bootstrap 6 e recebe uma personalização em `docker/panel/public/style.css`: tipografia de sistema, paletas próprias para claro/escuro, navegação com destaque discreto, botões com cantos moderados, campos com foco visível e tabelas compactas. A seção **Identidade do painel** concentra os tokens e os ajustes, sem modificar os arquivos do framework. A escolha de tema continua no perfil.

Após modificar os estilos, aplique com `sudo docker compose up -d --build --no-deps panel` e recarregue o navegador. Os fluxos, confirmações e configurações permanecem os mesmos.

O menu de perfil no topo concentra a identificação da conta e a opção de sair. A aparência é selecionada por um switch **claro/escuro**, acessível por teclado, com estado anunciado a leitores de tela e preferência persistida. A opção Sistema não aparece mais no menu; preferências antigas seguem válidas até o usuário escolher explicitamente claro ou escuro.

### 🌍 Acesso ao painel na VPS: porta ou subdomínio

A seção **Proxy & acessos → Painel administrativo · acesso** configura a porta direta, o endereço de publicação, o subdomínio, HTTPS e cookie seguro. Após guardar o rascunho, salve o JSON e aplique. O Traefik é recriado nessa operação. **Para alterar a porta ou o cookie do próprio painel, finalize pelo terminal:**

```bash
sudo docker compose up -d --no-deps --force-recreate panel
```

Esse passo encerra a sessão atual e permite ao painel terminar a operação antes da própria recriação. Acesse o novo endereço e faça login novamente. Não remove volumes.

**Opção A — acesso direto por IP e porta**, por exemplo `http://IP_DA_VPS:9090`:

```dotenv
PANEL_BIND_ADDRESS=0.0.0.0
PANEL_PORT=9090
PANEL_PROXY_ENABLED=false
PANEL_TLS_ENABLED=false
PANEL_COOKIE_SECURE=false
```

Libere a porta TCP escolhida no firewall da VPS/provedor, preferencialmente apenas para seus IPs. Esse acesso direto é HTTP; para login pela internet, prefira a opção HTTPS abaixo. Publicação em `127.0.0.1` mantém a porta restrita ao host, conforme a [documentação de portas do Docker](https://docs.docker.com/engine/network/port-publishing/).

**Opção B — subdomínio com HTTPS**, por exemplo `https://painel.seudominio.com`:

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
ACME_EMAIL=admin@seudominio.com
```

Crie um registro DNS A (e AAAA apenas se IPv6 estiver configurado) para o IP da VPS e permita TCP 80/443 no firewall. Escolha um domínio diferente das aplicações. O Traefik encaminha para `panel:3000` pela rede interna, redireciona HTTP para HTTPS e usa o mesmo resolvedor Let's Encrypt da infraestrutura. A porta 9090 pode continuar fechada externamente. A rota está em `docker/traefik/panel.yml`; a autenticação existente continua obrigatória.

Se editar diretamente os apontamentos no `.env`, sincronize com `node docker/panel/runtime-cli.mjs --from-env` e recarregue o painel antes de salvar/aplicar configurações. Para aplicar diretamente pelo terminal:

```bash
sudo docker compose up -d --no-deps --force-recreate traefik panel
```

Ao migrar de HTTP para HTTPS, abra o endereço HTTPS após a recriação; cookies seguros não funcionam por HTTP. Mantenha `PANEL_USERNAME` e `PANEL_PASSWORD` configurados e não publique o socket Docker nem a porta interna 3000 separadamente.


<a id="cadastrar-aplicacoes"></a>

### ➕ Cadastrar novas aplicações

Na guia **Aplicações**, clique em **Nova aplicação**, informe nome, tipo (PHP, Node.js ou Estática), domínio e uma pasta existente no host. Preencha os campos específicos do tipo, confirme **Cadastrar no rascunho**, clique em **Salvar configurações** e depois **Aplicar configuração**. Cada etapa apresenta seu resumo antes da execução. Cancelar a confirmação não adiciona o cadastro.

O cadastro vincula um projeto existente; não cria código, diretórios, dependências ou bancos automaticamente. O diretório precisa estar acessível pelo volume `PANEL_PROJECTS_DIRECTORY`. Novas aplicações recebem identificadores como `app4`, com serviços `php-app4`, `php-app5` etc., mesmo nos tipos Node.js/Estática. O domínio/subdomínio escolhe o destino; portas internas podem se repetir em containers diferentes. O limite de proteção é de 100 aplicações.

A infraestrutura gera serviços em `config/apps.compose.yaml` e rotas das novas aplicações em `docker/traefik/extra-apps.json`. As três configurações antigas e seus volumes são preservados. **Não edite os arquivos gerados.** Para PHP adicional, configure acesso próprio ao banco: por exemplo, `APP_4_DB_DATABASE`, `APP_4_DB_USERNAME` e `APP_4_DB_PASSWORD` no `.env` da infraestrutura antes de aplicar. As credenciais de banco da aplicação principal não são herdadas por esses novos cadastros. Crie o banco/usuário na guia Bancos. Os serviços compartilhados permanecem disponíveis pelas redes internas.

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

A prévia é calculada no backend antes de confirmar e **não executa comandos**. Identificadores gerados, validações e condições podem ser resolvidos na execução; essas etapas são descritas no resumo. Comandos usam o diretório da infraestrutura, seu `.env` e os arquivos Compose configurados. Senhas, argumentos de jobs e o conteúdo do comando de terminal são ocultados para evitar reproduzir credenciais nos resumos. O comando de terminal continua visível no formulário em que foi informado.

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

Em **Importar / exportar SQL**, selecione o SGBD e o banco e clique em **Criar exportação SQL**. Confira o comando e confirme. Todas as exportações, inclusive pequenas, passam pela fila; isso permite processar arquivos grandes sem carregar o dump inteiro na memória do navegador ou do painel.

A fila processa **uma tarefa por vez**, com até 20 tarefas pendentes/em execução. Mostra estado, bytes transferidos, criação, início e término. Quando a exportação concluir, o botão **Baixar .sql** disponibiliza o arquivo por streaming, com autenticação. O arquivo fica em `.panel-state/sql-transfers/`, com acesso privado. Exports não são enviados automaticamente para S3 nem seguem a retenção dos backups agendados; são transferências administrativas independentes. Preserve espaço e remova exports antigos manualmente quando não forem mais necessários.

MariaDB usa [`mariadb-dump`](https://mariadb.com/docs/server/clients-and-utilities/backup-restore-and-import-clients/mariadb-dump) com `--single-transaction`, rotinas, eventos e triggers. Não altere schemas durante o dump; a consistência transacional se aplica às tabelas transacionais, não a todos os engines. PostgreSQL usa [`pg_dump`](https://www.postgresql.org/docs/current/app-pgdump.html) em SQL de texto, sem proprietários/ACLs. Os comandos são mostrados antes de confirmar. Esses arquivos são destinados ao mesmo SGBD, sem conversão entre MariaDB e PostgreSQL.

### 📥 Importar SQL existente

1. Se necessário, crie o banco na guia Bancos e uma conta com permissões nesse banco na guia Usuários.
2. Na guia de transferências, escolha SGBD e banco, selecione um arquivo `.sql` de texto e informe usuário/senha da conta do banco.
3. Confirme o envio. Depois, revise a segunda confirmação para **executar** a importação.
4. Acompanhe a tarefa na fila e confira o resultado na aplicação/banco.

Use uma conta limitada ao banco e somente SQL confiável. As contas administrativas principais são recusadas pela interface de transferência. O cliente de importação executa com UID sem privilégios e ambiente limpo, recebendo apenas a senha informada por entrada padrão. A senha não é gravada no histórico da fila; fica em memória enquanto a tarefa aguarda execução. O alcance efetivo do SQL depende das permissões dessa conta: selecionar um banco não reescreve nem filtra o conteúdo do script. Dumps que exigem superusuário, proprietários ou extensões especiais devem ser adaptados ou tratados manualmente.

Importações **podem alterar/remover dados e falhar parcialmente**; não existe rollback geral ou validação sem efeitos para todo SQL. Faça backup antes e não reenvie uma tarefa interrompida sem verificar o banco. Reiniciar/recriar o painel marca tarefas pendentes/em execução como interrompidas, sem retomada automática. O processo Docker/cliente de uma transferência interrompida deve ser conferido antes de repetir. Não atualize/recrie o painel durante transferências.

O limite de upload é configurado em bytes no `.env`:

```dotenv
SQL_UPLOAD_MAX_BYTES=1073741824
```

O padrão é 1 GiB. O envio aceita SQL sem compactação. Arquivos de importação são removidos após a tarefa terminar; uploads órfãos com mais de 24 horas são limpos durante novos envios. Há limite de 20 uploads pendentes. Ao cancelar a confirmação de execução, o upload não executa SQL e fica aguardando essa limpeza. Espaço em disco e eventuais limites de proxies externos também precisam comportar o arquivo.

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
- **Execução:** `PUT /api/ai/execute`, restrito às ações de automação permitidas para a chave, com requestId idempotente.
- **Acompanhamento:** `GET /api/ai/operations/{id}`, limitado às operações da própria chave.

Não há terminal, SQL, edição de arquivos ou acesso genérico ao Docker por essa API. Operações via IA são autorizadas pelos escopos/ações da chave e não abrem uma confirmação no painel; mantenha a aprovação de ferramentas no cliente e conceda somente as ações necessárias. `job.interrupt` para o worker inteiro, sem cancelamento seletivo ou rollback de um job.

Consulte a [documentação técnica completa](docs/MCP.md) para autenticação, parâmetros, exemplos, limites e configuração do VS Code. A [Skill infra-control-mcp](.github/skills/infra-control-mcp/SKILL.md) acompanha uma referência autocontida da API e orienta diagnóstico, interpretação de logs e execução autorizada. Ela pode ser copiada para o diretório de skills aceito pela ferramenta de IA; não altera nem instala configurações do editor automaticamente. A referência da Skill espelha `docs/MCP.md`; mantenha ambos sincronizados ao alterar o contrato.

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

A infraestrutura deve usar **dependências open source**, incluindo componentes de execução e ferramentas de build/teste. O inventário com licenças e links oficiais está em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). O [relatório npm](config/dependencies.licenses.json) relaciona as licenças declaradas das 225 entradas do lock atual. Isso não substitui uma auditoria completa/SBOM das imagens e seus pacotes de sistema.

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

Operar um serviço permite ver seu estado mínimo para escolher a ação. A permissão de controle não concede terminal, edição de `.env`, gestão de pacotes, contas de banco, chaves de API ou configuração do host. Filas e agendadores e o próprio serviço `panel` não podem ser operados por essas contas; use administração completa para essas áreas. Aplicações desabilitadas não podem ser iniciadas ou reiniciadas pela operação de serviço.

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
