import {z} from 'zod';
import {planApp,publicPlan,applyApp} from './apps-cli.mjs';
export const cliAppActions=['application.create','application.update','application.remove','application.apply'];
const app=z.string().regex(/^(main|app(?:[2-9]|[1-9][0-9]|100))$/);
export const cliAppChanges=z.object({name:z.string().min(1).max(200).optional(),domain:z.string().min(1).max(253).optional(),directory:z.string().min(1).max(4096).optional(),type:z.enum(['php','node','static']).optional(),port:z.number().int().min(1024).max(65535).optional(),enabled:z.boolean().optional(),documentRoot:z.string().min(1).max(4096).optional(),mode:z.enum(['traditional','octane']).optional(),startCommand:z.string().min(1).max(4096).optional(),workingDirectory:z.string().min(1).max(4096).optional(),buildDirectory:z.string().min(1).max(4096).optional(),spa:z.boolean().optional()}).strict();
export const cliAppSchemas=cliAppActions.map(action=>z.object({action:z.literal(action),app,changes:cliAppChanges,saveOnly:z.boolean(),revision:z.string().regex(/^[a-f0-9]{64}$/)}).strict());
const request=data=>({action:data.action.split('.')[1],id:data.app,changes:data.changes,saveOnly:data.saveOnly});
export async function prepareCLIApp(root,data){
 const plan=await planApp(root,data);return {action:'application.'+data.action,app:plan.id,changes:data.changes,saveOnly:!!data.saveOnly,revision:plan.revision};
}
export async function planCLIApp(root,data,directories){
 const plan=await planApp(root,request(data));
 if(plan.revision!==data.revision)throw Object.assign(new Error('Configuração alterada desde a prévia. Gere uma nova prévia.'),{status:409});
 if(data.action==='application.remove'){if(!directories)throw Object.assign(new Error('Verificação de pasta indisponível.'),{status:503});await directories.removalGuard(data.app)();}
 return {...publicPlan(plan),action:data.action,executes:false,commands:[{kind:'internal',text:`Gerenciar ${plan.id} usando o mesmo planApp/applyApp da CLI Jubart; validar caminhos, vínculos e revisão; salvar backup privado e somente os arquivos previstos.`},...(!data.saveOnly&&plan.runtimeChange?[{kind:'internal',text:`Aplicar somente ${plan.summary.service} e o proxy Traefik, conforme o cadastro. A CLI pode criar/reconstruir o runtime selecionado; não remove volumes ou arquivos dos projetos.`}]:[])],impact:data.saveOnly?'Salva o cadastro e arquivos gerados para a aplicação, preservando as credenciais existentes. Não aplica containers.':'Pode criar/recriar ou remover o container selecionado e recarregar Traefik. Pastas e comandos configurados definem o acesso do runtime aos arquivos do host. Arquivos de projeto, bancos e volumes são preservados.'};
}
export const executeCLIApp=(root,data,run,directories)=>applyApp(root,request(data),data.revision,{run,guard:data.action==='application.remove'?directories.removalGuard(data.app):undefined});
