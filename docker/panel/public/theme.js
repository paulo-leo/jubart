(() => {
  const key = 'infra-control-theme', media = window.matchMedia('(prefers-color-scheme: dark)');
  let choice = 'light';
  try { const saved=localStorage.getItem(key); if(['light','dark','system'].includes(saved))choice=saved; } catch {}
  function apply(){const resolved=choice==='system'?(media.matches?'dark':'light'):choice;document.documentElement.dataset.theme=resolved;document.documentElement.dataset.bsTheme=resolved;document.documentElement.style.colorScheme=resolved;window.dispatchEvent(new CustomEvent('panel-theme-change',{detail:{choice,resolved}}));}
  window.panelTheme={get:()=>choice,set(value){if(!['light','dark','system'].includes(value))return;choice=value;try{localStorage.setItem(key,value);}catch{}apply();}};
  media.addEventListener('change',()=>{if(choice==='system')apply();});
  window.addEventListener('storage',event=>{if(event.key===key){choice=['light','dark','system'].includes(event.newValue)?event.newValue:'light';apply();}});
  apply();
})();
