export const dockStorageKey=username=>'infra-control-dock:'+encodeURIComponent(username);
export function normalizeDock(value,allowed,defaults=[]){const ids=new Set(allowed);return {enabled:value?.enabled!==false,size:value?.size==='small'?'small':'normal',labels:false,items:[...new Set(Array.isArray(value?.items)?value.items:defaults)].filter(id=>typeof id==='string'&&ids.has(id))};}
export function loadDock(storage,username,allowed,defaults){try{return normalizeDock(JSON.parse(storage.getItem(dockStorageKey(username))),allowed,defaults);}catch{return normalizeDock(null,allowed,defaults);}}
