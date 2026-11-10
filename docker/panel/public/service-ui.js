import { showDialog, closeDialog } from '/bootstrap-ui.js';
import { confirmAction } from '/dialogs.js';
export function initServiceUI({ api, notice, getSnapshot }) {
  const $ = selector => document.querySelector(selector);
  let logService = '', reloadLogs = null, terminalService = '', executing = false;
  const date = value => !value || value.startsWith('0001-') ? '—' : new Date(value).toLocaleString('pt-BR');
  async function download(filename, text) {
    if(!await confirmAction({title:'Exportar conteúdo?',message:'Revise o arquivo que será baixado.',summary:[['Arquivo',filename]],execution:'Gerar um arquivo de texto com o conteúdo desta janela e iniciar o download.',impact:'Logs e comandos podem conter informações sensíveis. O arquivo ficará no dispositivo usado para acessar o painel.',confirmLabel:'Exportar arquivo'}))return;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function openLogs(service, loader) {
    logService = service; reloadLogs = loader;
    $('#logs-title').textContent = `Logs · ${service}`;
    $('#logs-content').textContent = 'Carregando…'; $('#logs-info').textContent = 'Até 1.000 linhas recentes, com datas. Conteúdo exportado é o que está nesta janela.';
    if (!$('#logs-dialog').open) showDialog($('#logs-dialog'));
    try { const text = await loader(); if (logService === service) $('#logs-content').textContent = text || 'Nenhum log neste intervalo.'; } catch (error) { $('#logs-content').textContent = error.message; }
  }
  $('#close-logs').addEventListener('click', () => closeDialog($('#logs-dialog')));
  $('#logs-refresh').addEventListener('click', () => { if (reloadLogs) openLogs(logService, reloadLogs); });
  $('#logs-export').addEventListener('click', () => download(`${logService}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`, $('#logs-content').textContent));
  $('#logs-clear-view').addEventListener('click', async () => { if(!await confirmAction({title:'Limpar a visualização dos logs?',message:'O conteúdo atual será removido desta janela.',execution:'Limpar somente o texto exibido na interface.',impact:'A atualização pode carregar os logs novamente. Nenhum arquivo ou histórico do Docker será apagado.',confirmLabel:'Limpar visualização'}))return; $('#logs-content').textContent = ''; $('#logs-info').textContent = 'Visualização limpa. Atualizar consulta novamente o histórico disponível.'; });
  $('#logs-clear-history').addEventListener('click', async () => {
    const service = logService;
    
    try { await api('/logs/clear', { method: 'POST', body: JSON.stringify({ service }) }); $('#logs-content').textContent = ''; $('#logs-info').textContent = 'Histórico do painel reiniciado. Atualize para consultar novas mensagens.'; } catch (e) { $('#logs-info').textContent = e.message; }
  });
  function openTerminal(service) {
    if (executing) { notice('Aguarde o comando atual terminar.', 'error'); return; }
    terminalService = service; $('#terminal-title').textContent = `Console · ${service}`;
    $('#terminal-output').textContent = 'Pronto. Cada comando abre um novo shell dentro do container.\n';
    $('#terminal-form').reset(); $('#terminal-status').textContent = 'Comandos com até 25 segundos · sem interação/TTY';
    showDialog($('#terminal-dialog')); $('#terminal-command').focus();
  }
  $('#close-terminal').addEventListener('click', () => closeDialog($('#terminal-dialog')));
  $('#terminal-clear').addEventListener('click', async () => {if(!await confirmAction({title:'Limpar a saída do terminal?',message:'A saída exibida será removida desta janela.',execution:'Limpar o texto do console na interface.',impact:'Não interrompe processos nem desfaz comandos. Exporte a saída antes se precisar preservá-la.',confirmLabel:'Limpar saída'}))return; $('#terminal-output').textContent = ''; });
  $('#terminal-export').addEventListener('click', () => download(`${terminalService}-console.log`, $('#terminal-output').textContent));
  $('#terminal-form').addEventListener('submit', async event => {
    event.preventDefault(); if (executing) return;
    executing = true; $('#terminal-run').disabled = true;
    const command = $('#terminal-command').value, shell = $('#terminal-shell').value;

    $('#terminal-status').textContent = 'Aguardando confirmação…';
    try {
      const result = await api(`/services/${terminalService}/exec`, { method: 'POST', body: JSON.stringify({ command, shell }) });
      $('#terminal-output').textContent += `\n$ ${command}\n` + result.stdout + (result.stderr ? '\n' + result.stderr : '');
      $('#terminal-status').textContent = `${result.timedOut ? 'Limite de tempo atingido · ' : ''}Código de saída: ${result.exitCode}`;
    } catch (e) { $('#terminal-status').textContent = e.message || 'Comando cancelado; nada foi executado.'; }
    finally { executing = false; $('#terminal-run').disabled = false; $('#terminal-output').scrollTop = $('#terminal-output').scrollHeight; }
  });
  function openDetails(service) {
    const item = getSnapshot()?.services.find(s => s.name === service); if (!item) return;
    $('#details-title').textContent = `Detalhes · ${service}`;
    const rows = { Container: item.container || 'Não criado', 'ID curto': item.containerId || '—', Imagem: item.image, Estado: item.state, Saúde: item.health || 'Sem healthcheck', Criação: date(item.createdAt), 'Última inicialização': date(item.startedAt), 'Último encerramento': date(item.finishedAt), 'Código de saída': item.exitCode ?? '—', Reinícios: item.restartCount, 'Diretório de trabalho': item.workingDir || '/', 'Portas publicadas': (item.ports || []).join('\n') || 'Nenhuma' };
    const list = $('#details-list'); list.replaceChildren();
    for (const [label, value] of Object.entries(rows)) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = String(value); list.append(dt, dd); }
    showDialog($('#details-dialog'));
  }
  $('#close-details').addEventListener('click', () => closeDialog($('#details-dialog')));
  return { openLogs, openTerminal, openDetails };
}
