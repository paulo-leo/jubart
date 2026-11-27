# Atualizações oficiais pelo painel

Abra **Administração → Manutenção do painel → Atualização oficial**. O gerenciador consulta as tags estáveis de `paulo-leo/jubart` no GitHub e as imagens `paulo2021/jubart` no Docker Hub. URLs ou repositórios alternativos não são aceitos. A distribuição validada é Linux amd64.

## Usar

1. Clique em **Verificar atualizações**. A tela informa a versão do painel em execução, a versão do código da instalação e a versão oficial encontrada.
2. Escolha uma versão mais recente e clique em **Revisar atualização**. A preparação confere as duas imagens, o commit, os hashes dos arquivos, o espaço livre, as permissões e as alterações locais. A prévia vale por 15 minutos e não modifica código, configurações ou serviços.
3. Revise os arquivos preparados, os arquivos montados preservados e eventuais conflitos. Arquivos personalizados que não precisam mudar são mantidos; conflitos em arquivos necessários bloqueiam a aplicação. Não há opção de sobrescrever alterações à força.
4. Clique em **Confirmar e aplicar** e confira a confirmação. A execução continua em um container independente mesmo durante a reconexão do painel.
5. Aguarde a verificação de saúde. Entre novamente se a sessão encerrar e consulte **Histórico** ou o resultado da operação.

O canal usa tags `vX.Y.Z`; não depende da existência de GitHub Releases nem de `latest`. Imagens ainda não publicadas, revisões incompatíveis, versões anteriores ou mudanças de versão principal não são aplicadas por esse fluxo. Atualizações entre versões principais precisam de uma migração planejada.

## O que muda e o que fica preservado

O gerenciador sincroniza os arquivos públicos do Jubart: painel, CLI, instalador, documentação, ferramentas e definições da infraestrutura. Baixa o painel e o runtime da CLI por digest. A imagem do painel também precisa declarar a mesma versão, commit e origem GitHub.

Somente o serviço **panel** recebe `up -d --no-deps --no-build --pull never panel`. Aplicações, bancos, proxy, consumidores de fila e volumes não recebem comandos de parada ou recriação. O executor compara os IDs, inicializações e montagens dos demais containers antes e depois. Serviços em projetos separados também não recebem comandos.

Arquivos montados por containers dos demais serviços são preservados, mesmo quando fazem parte do código distribuído. Isso evita substituir uma configuração que possa ser recarregada por um serviço em execução. Esses arquivos aparecem na prévia. Novas configurações/imagens dos demais serviços podem ser revisadas e aplicadas posteriormente pelas suas áreas administrativas; o gerenciador não promete atualizar seus runtimes sem reiniciá-los.

O `.env`, os cadastros locais em `config/`, usuários, chaves, certificados, dados e projetos não são substituídos pelos arquivos da distribuição. O gerenciador apenas acrescenta o override `config/jubart-release.compose.yaml` a `COMPOSE_FILE`, preservando os demais valores. Esse override fixa a imagem do painel e desativa o build local. `config/cli-image` passa a selecionar o digest verificado da CLI. Ambos são incluídos no backup de retorno.

A atualização sincroniza a cópia de trabalho e registra o commit oficial no histórico privado; não executa `git reset`, não altera remotos e não reescreve os metadados de `.git`. Um checkout Git pode mostrar os arquivos sincronizados como modificados. Para desenvolvimento ou manutenção manual com Git, revise essas diferenças antes de trocar de branch ou executar merges.

## Retornar e recuperar

Antes da troca, o gerenciador guarda os arquivos que serão alterados, seus modos, a seleção de imagens e a configuração resolvida do painel. Se a aplicação ou o healthcheck da nova versão falhar, tenta restaurar esses arquivos e reaplicar somente a imagem anterior do painel.

Depois de uma atualização concluída, **Histórico → Revisar retorno à versão anterior** prepara a restauração do último backup. A prévia e o executor verificam se os arquivos e o ambiente ainda correspondem à atualização. Alterações posteriores bloqueiam o retorno para evitar perda de configurações ou credenciais novas. A imagem anterior precisa continuar disponível no Docker local; não execute limpezas de imagens antes de conferir a atualização.

Falhas de recuperação são registradas para revisão manual. Não execute `docker compose down`, não remova volumes e não inicie todos os serviços para corrigir apenas o painel. O host e a CLI continuam sendo opções de recuperação.

## Acesso, rede e armazenamento

As rotas `/api/panel-updates` e suas ações exigem sessão de administrador; ações POST exigem CSRF. A chave MCP não concede acesso a essas rotas. Consultas SQL, transferências, terminais e operações em andamento impedem o início da manutenção. Novas alterações administrativas ficam bloqueadas durante a execução.

O executor mantém o usuário/grupos do painel, remove as capabilities gerais e usa `no-new-privileges`. Quando o painel roda como root, somente o executor de atualização recebe `DAC_OVERRIDE` e `CHOWN` para atualizar arquivos pertencentes ao usuário do host e preservar seus proprietários; isso não é usado nas ações locais de recompilação. A instalação e o socket Docker já precisam estar montados no painel.

As consultas usam HTTPS e validam certificados. O cliente de consulta respeita as variáveis de proxy de saída do processo quando configuradas. O daemon Docker também precisa conseguir baixar as imagens. Não se exige token GitHub ou Docker Hub para ler os repositórios públicos; limites de consulta podem exigir aguardar e tentar novamente.

Catálogo, preparação, histórico e backups ficam em `.panel-state/official-updates/`, com arquivos privados. O estado da operação continua em `.panel-state/panel-maintenance/`. Os logs ocultam valores conhecidos de credenciais do ambiente. Preserve esses diretórios em seus backups e planeje espaço para os arquivos de retorno; não apague um backup necessário à recuperação.

## Operações locais

A guia **Operações locais** mantém a recompilação do código já instalado e a inicialização geral dos serviços. Essas operações não são o mecanismo de atualização oficial. **Iniciar serviços** continua podendo recriar aplicações e bancos conforme o Compose, e exige confirmação separada.
