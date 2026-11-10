import React,{useEffect,useRef,useState} from 'react';
import {Terminal as XTerminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {usePanel,Button,Modal} from './ui.jsx';
import '@xterm/xterm/css/xterm.css';

export function Terminal({service,onClose,exportText,appId,appName}){
 const panel=usePanel(),panelRef=useRef(panel);panelRef.current=panel;
 const focusTimer=useRef(null),term=useRef(null),connection=useRef(null),source=useRef(null),input=useRef(''),chain=useRef(Promise.resolve()),lock=useRef(false);
 const [hostNode,setHostNode]=useState(null);
 const [shell,setShell]=useState('sh'),[status,setStatus]=useState('Desconectado. Escolha o shell e abra a sessão.'),[connected,setConnected]=useState(false),[opening,setOpening]=useState(false),[command,setCommand]=useState('');
 const post=(action,data={})=>{const id=connection.current;if(!id)return Promise.resolve();return panelRef.current.api(`/terminal/${id}/${action}`,{method:'POST',body:JSON.stringify(data),quiet:true});};
 const disconnect=async()=>{const id=connection.current;connection.current=null;clearTimeout(focusTimer.current);source.current?.close();source.current=null;input.current='';if(term.current)term.current.options.disableStdin=true;setConnected(false);if(id)await panelRef.current.api(`/terminal/${id}/close`,{method:'POST',body:'{}',quiet:true}).catch(()=>{});};
 const send=data=>{const id=connection.current;if(!id)return;const chars=Array.from(data);for(let i=0;i<chars.length;i+=1024){const chunk=chars.slice(i,i+1024).join('');chain.current=chain.current.then(()=>{if(connection.current===id)return post('input',{data:chunk});}).catch(e=>{setStatus(e.message);void disconnect();});}};
 useEffect(()=>{
  if(!hostNode)return;
  const terminal=new XTerminal({cursorBlink:true,fontSize:13,fontFamily:'ui-monospace, SFMono-Regular, Consolas, monospace',scrollback:5000,allowProposedApi:false,theme:{background:'#0d1117',foreground:'#e6edf3',cursor:'#58a6ff'},screenReaderMode:true,disableStdin:true});
  const fit=new FitAddon();terminal.loadAddon(fit);terminal.open(hostNode);term.current=terminal;
  const resize=()=>{try{fit.fit();if(connection.current)void post('resize',{cols:terminal.cols,rows:terminal.rows}).catch(e=>setStatus(e.message));}catch{}};
  const observer=new ResizeObserver(resize);observer.observe(hostNode);resize();
  const listener=terminal.onData(data=>{if(!connection.current)return;if(input.current.length+data.length>65536){setStatus('Entrada muito grande. Cole trechos menores.');return;}input.current+=data;});
  const flush=setInterval(()=>{if(!input.current||!connection.current)return;const data=input.current.slice(0,2048);input.current=input.current.slice(2048);send(data);},20);
  return()=>{clearInterval(flush);observer.disconnect();listener.dispose();void disconnect();terminal.dispose();term.current=null;};
 },[service,hostNode]);
 const open=async()=>{if(lock.current||connection.current)return;lock.current=true;setOpening(true);try{
  const result=await panel.mutate(appId?`/apps/${appId}/terminal`:`/services/${service}/terminal`,{shell,cols:term.current.cols,rows:term.current.rows});if(result.cancelled)return;
  connection.current=result.id;term.current.reset();term.current.options.disableStdin=false;setConnected(true);setStatus('Conectado · saída em tempo real · TTY persistente');
  const events=new EventSource(`/api/terminal/${result.id}/stream`);source.current=events;
  events.onopen=()=>{requestAnimationFrame(()=>term.current?.focus());focusTimer.current=setTimeout(()=>{if(connection.current===result.id)term.current?.focus();},320);};
  events.onmessage=event=>{try{const raw=atob(JSON.parse(event.data));term.current?.write(Uint8Array.from(raw,c=>c.charCodeAt(0)));}catch{setStatus('Saída do terminal inválida.');void disconnect();}};
  events.addEventListener('exit',()=>{setStatus('Sessão encerrada. Abra uma nova sessão para continuar.');void disconnect();});
  events.onerror=()=>{setStatus('Conexão encerrada. Abra uma nova sessão.');void disconnect();};term.current.focus();
 }catch(e){setStatus(e.message);}finally{lock.current=false;setOpening(false);}};
 const close=async()=>{if(opening)return;if(connection.current&&!await panel.confirm({title:'Encerrar terminal?',summary:[['Serviço',service]],execution:'Encerrar o shell interativo e fechar a conexão.',impact:'Comandos em execução podem ser interrompidos. Processos em segundo plano podem continuar.',confirmLabel:'Encerrar'}))return;await disconnect();onClose();};
 const exportOutput=async()=>{const name=appId?`${appId}-terminal.log`:`${service}-terminal.log`,content=text();if(exportText)return exportText(name,content);if(!await panel.confirm({title:'Exportar visualização?',summary:[['Arquivo',name]],execution:'Baixar a visualização como texto.',impact:'O arquivo pode conter informações sensíveis.'}))return;const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const text=()=>{const b=term.current?.buffer.active;if(!b)return '';return Array.from({length:b.length},(_,i)=>b.getLine(i)?.translateToString(true)||'').join('\n');};
 return <Modal id="terminal-dialog" title={`Terminal interativo · ${appName||service}`} onClose={close} large>
  <div className="terminal-toolbar"><label>Shell<select aria-label="Shell do terminal" className="form-control form-control-sm" disabled={connected||opening} value={shell} onChange={e=>setShell(e.target.value)}><option>sh</option><option>bash</option></select></label><span className={`terminal-connection ${connected?'is-connected':''}`} role="status">{connected?'● Conectado':'○ Desconectado'}</span>{connected&&<><Button onClick={()=>term.current?.focus()}>Focar terminal</Button><Button onClick={()=>{send('\x03');term.current?.focus();}}>Ctrl+C · interromper</Button><Button onClick={()=>{send('\t');term.current?.focus();}}>Tab</Button></>}</div>
  <p className="terminal-status" role="status">{status}</p>
  <div className={`terminal-surface ${connected?'is-connected':'is-disconnected'}`}>
    <div id="terminal-output" className="interactive-terminal" ref={setHostNode} onClick={()=>{if(connected)term.current?.focus();}} aria-label={`Terminal do container ${service}`} aria-describedby="terminal-keyboard-help"/>
    {!connected&&<div className="terminal-connect-overlay"><div className="terminal-connect-icon" aria-hidden="true">&gt;_</div><h3>{opening?'Abrindo terminal…':'Conecte para começar a digitar'}</h3><p>O shell será aberto dentro do container <strong>{service}</strong>.</p><Button id="terminal-connect" data-autofocus primary disabled={opening} onClick={open}>{opening?'Aguardando conexão…':`Conectar ao container ${service}`}</Button><small>Você revisará os impactos antes de abrir a sessão.</small></div>}
  </div>
  <form className="terminal-command-form" onSubmit={e=>{e.preventDefault();if(!connected||!command)return;send(command+'\r');setCommand('');term.current?.focus();}}>
    <label htmlFor="terminal-command">Comando ou resposta ao programa</label>
    <div className="terminal-command-row"><span aria-hidden="true">&gt;</span><input id="terminal-command" className="form-control form-control-sm" value={command} onChange={e=>setCommand(e.target.value)} disabled={!connected} placeholder={connected?'Digite aqui e pressione Enter, ou digite diretamente na área escura':'Conecte ao container para habilitar a digitação'} autoComplete="off" spellCheck={false} maxLength={4096}/><Button disabled={!connected||!command} primary onClick={()=>{send(command+'\r');setCommand('');term.current?.focus();}}>Enviar ↵</Button></div>
  </form>
  <p id="terminal-keyboard-help" className="terminal-help">{connected?'Clique na área escura para usar setas, Tab, Ctrl+C e programas interativos. O campo acima também envia comandos e respostas.':'A área de digitação será habilitada após conectar.'} <span>Shell: {shell} · limite de 15 min sem entrada / 1 h por sessão.</span></p>
  <div className="action-group"><Button onClick={exportOutput}>Exportar visualização</Button><Button onClick={()=>term.current?.clear()}>Limpar visualização</Button><Button danger disabled={!connected} onClick={async()=>{if(await panel.confirm({title:'Desconectar terminal?',summary:[['Serviço',service]],execution:'Encerrar o shell do container.',impact:'Pode interromper comandos em execução; processos em segundo plano podem continuar.'})){await disconnect();setStatus('Desconectado.');}}}>Desconectar</Button></div>
 </Modal>;
}
