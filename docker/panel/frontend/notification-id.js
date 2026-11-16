// Identificador apenas visual: não é token de sessão nem credencial.
let sequence=0;
export function notificationId(source=globalThis.crypto){
 if(typeof source?.randomUUID==='function')return source.randomUUID();
 // randomUUID não existe em HTTP fora de localhost. O contador evita colisões
 // entre avisos criados no mesmo milissegundo, sem exigir contexto seguro.
 return `notice-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
}
