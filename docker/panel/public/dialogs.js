import { showDialog, closeDialog } from '/bootstrap-ui.js';
const dialog = document.querySelector('#confirm-dialog');
const title = document.querySelector('#confirm-title');
const message = document.querySelector('#confirm-message');
const note = document.querySelector('#confirm-note');
const accept = document.querySelector('#confirm-accept');
const icon = document.querySelector('#confirm-icon');
let pending = null;

export function confirmAction({ title: heading, message: description, confirmLabel = 'Confirmar', tone = 'primary', note: detail = '', summary = [], execution = 'Executar a ação indicada nesta janela.', impact = description }) {
  // Cliques repetidos não abrem outra confirmação ou executam a mesma ação duas vezes.
  if (pending) return Promise.resolve(false);
  title.textContent = heading;
  message.textContent = description;
  let review=document.querySelector('#confirm-review');
  if(!review){review=document.createElement('div');review.id='confirm-review';note.before(review);}
  review.replaceChildren();
  if(summary.length){const heading=document.createElement('h3');heading.textContent='Resumo';review.append(heading);const list=document.createElement('dl');list.className='confirmation-summary';for(const [key,value] of summary){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;list.append(dt,dd);}review.append(list);}
  for(const [heading,text] of [['O que será executado',execution],['Possíveis impactos',impact]]){const h=document.createElement('h3'),p=document.createElement('p');h.textContent=heading;p.textContent=text;review.append(h,p);}

  note.textContent = detail;
  note.hidden = !detail;
  accept.textContent = confirmLabel;
  dialog.dataset.tone = tone;
  icon.textContent = tone === 'danger' ? '!' : '↗';
  accept.className = tone === 'danger' ? 'primary destructive' : 'primary';
  dialog.returnValue = 'cancel';
  return new Promise(resolve => {
    pending = resolve;
    showDialog(dialog);
    document.querySelector('#confirm-cancel').focus({preventScroll:true});
    dialog.scrollTop=0;review.scrollTop=0;
  });
}
function finish(approved) {
  if (!pending) return;
  const resolve = pending;
  pending = null;
  closeDialog(dialog);
  resolve(approved);
}
document.querySelector('#confirm-cancel').addEventListener('click', () => finish(false));
document.querySelector('#confirm-close').addEventListener('click', () => finish(false));
accept.addEventListener('click', () => finish(true));
dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); finish(false); } });
dialog.addEventListener('panel-dialog-cancel', event => { event.preventDefault(); finish(false); });
dialog.addEventListener('close', () => { if (pending && !dialog.open) { const resolve = pending; pending = null; resolve(false); } });
dialog.addEventListener('click', event => {
  const bounds = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) finish(false);
});
