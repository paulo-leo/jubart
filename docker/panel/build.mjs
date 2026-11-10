import {build} from 'esbuild';
await build({entryPoints:['frontend/App.jsx'],bundle:true,format:'esm',target:['es2022'],minify:true,sourcemap:false,jsx:'automatic',outfile:'public/react-app.js',external:['/vendor/*'],define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked'});
