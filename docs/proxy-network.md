# IP fixo do Traefik e TRUSTED_PROXIES

## Instalação nova

O instalador oficial (`install.sh`) consulta as redes Docker e as rotas IPv4 do host antes de subir o painel. Em uma instalação sem containers ou redes do projeto, escolhe uma faixa /24 sem sobreposição observada, reserva `.2` para o Traefik e deixa `.128/25` para atribuição dinâmica. A seleção requer Docker local por socket Unix e o comando `ip`; contextos remotos não permitem essa seleção automática.

A configuração fica no `.env` da infraestrutura (`JUBART_TRAEFIK_IPV4`) e no arquivo local `config/proxy-network.compose.yaml`. O instalador adiciona esse arquivo ao `COMPOSE_FILE`. Ambos devem ser preservados nos backups da instalação; o arquivo gerado não vai para o Git. Use o Compose com todos os arquivos configurados, não somente `-f compose.yaml`.

O algoritmo evita os conflitos observados naquele momento. Redes ou rotas adicionadas posteriormente também precisam respeitar a faixa reservada. Uma rede IPv6 ativa exige planejamento específico; a migração pelo painel é limitada a IPv4.

## Instalação existente

Um `git pull`, reconstrução do painel ou execução do instalador sobre um projeto já existente não migra a rede automaticamente. O endereço continua dinâmico até a operação explícita abaixo.

1. Atualize o código e reconstrua somente o painel, a partir da pasta da infraestrutura:

   ```sh
   docker compose config --quiet
   docker compose up -d --build --no-deps panel
   ```

2. Mantenha acesso SSH ou acesso direto ao painel disponível. Abra **Integrações → Como acessar → IP fixo do Traefik**.
3. Revise a rede, o IP observado e a linha `TRUSTED_PROXIES`. Use **Revisar migração para IP fixo** e confirme a operação.
4. O painel grava `JUBART_TRAEFIK_IPV4` no `.env` da infraestrutura e recria somente o Traefik, mantendo o endereço atual e a rede. Há uma breve interrupção das conexões HTTP/HTTPS, Mercure e WebSocket. PHP, bancos, painel e volumes não são recriados pela operação.
5. Confira o estado **fixo**, teste a aplicação e confira os links HTTPS. O `.env` das aplicações não é editado. Como o IP atual é preservado, um `TRUSTED_PROXIES` já correto não precisa mudar.

Não copie o IP local para a VPS: use o endereço observado na própria instalação. A operação recusa redes sem propriedade Compose compatível, divergências de IP, containers ambíguos e prévias desatualizadas. Se o IP estiver ocupado no momento da recriação, a operação falha em vez de escolher outro silenciosamente.

O estado e o valor anterior da variável ficam em `.panel-state/proxy-network.json`; o arquivo não contém uma cópia completa do `.env`. Não execute `docker compose down` nem remova redes para realizar essa migração.

## Rollback e recuperação

O botão **Revisar rollback** fica disponível para uma migração compatível realizada pelo painel. Ele restaura a configuração anterior da variável e recria somente o Traefik. O Docker pode atribuir outro IP ao voltar ao modo dinâmico; confira a linha `TRUSTED_PROXIES` exibida e atualize o Laravel se necessário.

Se a operação falhar, o painel tenta restaurar a variável e recuperar somente o Traefik. Se isso também falhar, use SSH: confira o estado salvo e restaure apenas `JUBART_TRAEFIK_IPV4` no `.env` da infraestrutura ao valor anterior. Quando não havia valor anterior, remova a variável. Preserve todas as outras variáveis e execute:

```sh
docker compose config --quiet
docker compose up -d --no-deps --no-build --force-recreate --wait --wait-timeout 60 traefik
```

Confira novamente o IP. Se ele mudou, atualize `TRUSTED_PROXIES` no `.env` do sspa-server e execute `php artisan config:clear` seguido de `php artisan config:cache` no container PHP correspondente. Não use `TRUSTED_PROXIES=*` como alternativa.

## Validação local

Testes unitários cobrem seleção de faixa, preservação da configuração existente, revisão, migração, rollback, conflitos e recuperação de falha. O teste opcional abaixo cria projetos Docker descartáveis, sem publicar portas, e verifica o endereço fixo após recriação, a preservação da rede e do container de aplicação, e o rollback:

```sh
cd docker/panel
JUBART_PROXY_DOCKER_TEST=1 node --test test/proxy-network-docker.test.mjs
```

A validação isolada não migra a instalação em uso nem substitui a conferência da rede real na VPS.
