# Componentes e licenças de terceiros

Inventário dos principais componentes escolhidos para a infraestrutura. As referências exatas das imagens estão em [config/images.lock.json](config/images.lock.json). A política do projeto é selecionar dependências open source; gratuidade isoladamente não atende a essa política.

| Componente | Licença principal / fonte oficial |
| --- | --- |
| PHP 8.4 | [PHP License 3.01](https://www.php.net/license/3_01.txt); componentes internos possuem avisos próprios |
| FrankenPHP | [MIT](https://github.com/php/frankenphp/blob/main/LICENSE) |
| Caddy | [Apache-2.0](https://github.com/caddyserver/caddy/blob/master/LICENSE) |
| Traefik Proxy comunitário | [MIT](https://github.com/traefik/traefik/blob/master/LICENSE.md) |
| MariaDB Community Server | [GPL-2.0](https://github.com/MariaDB/server/blob/main/COPYING) |
| PostgreSQL | [PostgreSQL License](https://www.postgresql.org/about/licence/) |
| Valkey | [BSD-3-Clause](https://github.com/valkey-io/valkey/blob/8.0/COPYING) |
| phpMyAdmin | [GPL-2.0-or-later](https://github.com/phpmyadmin/phpmyadmin/blob/master/LICENSE) |
| Node.js | [MIT e avisos de bibliotecas incorporadas](https://github.com/nodejs/node/blob/main/LICENSE) |
| Composer | [MIT](https://github.com/composer/composer/blob/main/LICENSE) |
| Docker CLI | [Apache-2.0](https://github.com/docker/cli/blob/master/LICENSE) |
| Docker Compose | [Apache-2.0](https://github.com/docker/compose/blob/main/LICENSE) |
| Moby / Docker Engine comunitário | [Apache-2.0](https://github.com/moby/moby/blob/master/LICENSE) |
| Python | [PSF e avisos incorporados](https://docs.python.org/3/license.html) |
| rclone | [MIT](https://rclone.org/licence/) |
| Instalador de extensões PHP | [MIT](https://github.com/mlocati/docker-php-extension-installer/blob/master/LICENSE) |
| Bootstrap (CSS e JavaScript) | [MIT](https://github.com/twbs/bootstrap/blob/main/LICENSE); arquivos e avisos locais em docker/panel/public/vendor/bootstrap |
| React, React DOM, react-markdown, remark-gfm, Zod, MCP SDK e esbuild | MIT, conforme os metadados fixados em docker/panel/package-lock.json |
| Chromium, verificação visual opcional | [Projeto open source e licenças de seus componentes](https://www.chromium.org/chromium-projects/) |

As imagens Debian/Alpine, os pacotes APT, extensões PHP e bibliotecas transitivas são distribuições compostas, com licenças próprias. A licença principal de um projeto não substitui esses avisos. Preserve arquivos LICENSE, COPYING, NOTICE e copyright das distribuições ao redistribuir imagens e bundles.

## Inventário npm

[config/dependencies.licenses.json](config/dependencies.licenses.json) registra as versões e as licenças declaradas de todas as 225 entradas de pacotes do lock atual, incluindo transitivas, build e variantes de plataforma. Foram encontrados MIT, ISC, BSD-2-Clause e BSD-3-Clause. O teste de política compara esse inventário ao lock e rejeita licenças ausentes ou não revisadas.

Esse relatório é baseado em metadados npm, não em uma auditoria integral dos arquivos binários. Não constitui SBOM completo das imagens nem comprova todas as licenças dos pacotes APT ou módulos compilados. Novas dependências e atualizações devem ser revisadas antes de incorporadas.

## Componentes excluídos

- SQL Server e o Microsoft ODBC Driver não são dependências da infraestrutura. A opção antiga `PHP_INSTALL_SQLSERVER` permanece apenas para compatibilidade, obrigatoriamente em `false`. O painel e o build recusam sua ativação, pois a instalação de sqlsrv/pdo_sqlsrv depende do ODBC Microsoft. As extensões PHP Microsoft possuem sua própria licença MIT, mas isso não torna sua dependência ODBC open source. Referências: [licença das extensões PHP](https://github.com/microsoft/msphpsql/blob/dev/LICENSE) e [instalação/licença do ODBC](https://learn.microsoft.com/en-us/sql/connect/odbc/linux-mac/installing-the-microsoft-odbc-driver-for-sql-server).
- Docker Desktop não é requisito. Use o Engine comunitário/Moby com Docker CLI e Compose na VPS Linux.
- O teste visual usa Chromium; Google Chrome não é mais uma dependência do script.
- Produtos Enterprise, SaaS e plugins proprietários não são instalados por padrão. S3, SMTP e ferramentas de IA externas são integrações opcionais: os provedores não se tornam open source por serem acessados por esta infraestrutura.

A política se aplica aos componentes mantidos neste repositório. Aplicações, plugins e pacotes enviados pelo administrador exigem revisão própria. Este inventário não atribui uma licença nova ao código autoral do projeto nem altera as licenças das aplicações hospedadas.
