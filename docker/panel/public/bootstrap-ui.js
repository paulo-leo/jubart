import { Dialog } from '/vendor/bootstrap/bootstrap.bundle.min.js';
// Os fluxos de aprovação permanecem no painel; Bootstrap controla as janelas.
export function showDialog(element){
 element.classList.add('dialog','dialog-instant');
 if(!element.dataset.bsManaged){
  element.dataset.bsManaged='true';
  if(['confirm-dialog','app-env-dialog'].includes(element.id))element.addEventListener('cancel',event=>{event.preventDefault();event.stopImmediatePropagation();element.dispatchEvent(new Event('panel-dialog-cancel',{cancelable:true}));},true);
 }
 return Dialog.getOrCreateInstance(element,{keyboard:true,backdrop:false}).show();
}
export function closeDialog(element){if(!element.open)return;const instance=Dialog.getInstance(element);return instance?instance.hide():element.close();}
export function bootstrapClasses(root=document){
 const all=selector=>Array.from(root.querySelectorAll(selector));
 all('button.button,button.primary,button.text-button,button.icon-button').forEach(button=>{
  const primary=button.classList.contains('primary'),danger=button.classList.contains('danger')||button.classList.contains('destructive');
  button.classList.remove('btn-solid','btn-outline','btn-text','theme-primary','theme-secondary','theme-danger');
  button.classList.add(primary?'btn-solid':button.matches('.text-button,.icon-button')?'btn-text':'btn-outline',danger?'theme-danger':primary?'theme-primary':'theme-secondary',button.classList.contains('small')?'btn-xs':'btn-sm');
 });
 all('input:not([type=checkbox]):not([type=radio]),select,textarea').forEach(el=>el.classList.add('form-control','form-control-sm'));
 all('input[type=checkbox]').forEach(el=>el.classList.add('form-check-input'));
 all('table').forEach(el=>el.classList.add('table','table-sm','table-hover','mb-0'));
 all('.table-wrap').forEach(el=>el.classList.add('table-responsive'));
 all('.panel,.stat,.volume-card,.app-card,.login-card,.metric-chart').forEach(el=>el.classList.add('card'));
 all('.badge').forEach(el=>{el.classList.remove('theme-success','theme-danger','theme-warning','theme-secondary','theme-primary');el.classList.add('badge-subtle',el.classList.contains('good')?'theme-success':el.classList.contains('bad')?'theme-danger':el.classList.contains('warning')?'theme-warning':'theme-secondary');});
 all('dialog').forEach(el=>el.classList.add('dialog','dialog-instant'));
 all('.notice').forEach(el=>{el.classList.remove('theme-success','theme-danger','theme-info');el.classList.add('alert',el.classList.contains('error')?'theme-danger':el.classList.contains('success')?'theme-success':'theme-info');});
}
