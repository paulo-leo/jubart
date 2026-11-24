// Biblioteca SVG local: grade 24px, traço consistente, sem serviços externos.
const paths={
 next:'<path d="m5 5 10 7-10 7V5zM19 5v14"/>',
 eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
 'eye-off':'<path d="m3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3 3.9M6.1 6.1A20 20 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.9-1.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
 copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"/>',
 key:'<circle cx="8" cy="8" r="5"/><path d="m11.5 11.5 9.5 9.5m-3-3 3-3m-6 0 3-3"/>',
 shield:'<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z"/><path d="m8 12 3 3 5-6"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 node:'<path d="m12 2 9 5v10l-9 5-9-5V7zM9 9l-3 3 3 3m6-6 3 3-3 3"/>',
 services:'<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6h.01M7 17h.01m4-11h6m-6 11h6"/>',
 packages:'<path d="m12 2 9 5v10l-9 5-9-5V7zm-9 5 9 5 9-5m-9 5v10M7 4.8l9 5"/>',
 storage:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>',
 memory:'<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zm0-7v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>',
 captures:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3"/>',
 scheduler:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',

 mcp:'<path d="m8 5-5 7 5 7m8-14 5 7-5 7M14 3l-4 18"/>',
 dbusers:'<circle cx="9" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2m1-16a4 4 0 0 1 0 8m3 3 2 5"/>',backups:'<path d="M4 4h16v16H4zM8 4v7h8V4M8 20v-5h8v5"/>',transfers:'<path d="M7 3v15m-4-4 4 4 4-4m6 7V6m-4 4 4-4 4 4"/>',host:'<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
 documentation:'<path d="M4 3h7v18H4zm9 0h7v18h-7M6 7h3m-3 4h3m6-4h3m-3 4h3"/>',
 php:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m9 8-4 4 4 4m6-8 4 4-4 4"/>',
 overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 metrics:'<path d="M3 17h4l3-10 4 14 3-10h4"/>',apps:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 9v11"/>',proxy:'<path d="M3 7h17l-4-4m4 14H3l4 4M20 7l-4 4M3 17l4-4"/>',
 automation:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',databases:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',volumes:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18M7 17h.01M11 17h.01"/>',
 refresh:'<path d="M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-2l2 2M4 17l2 2a8 8 0 0 0 13-2"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 logs:'<path d="M7 3h10l4 4v14H3V3h4m10 0v5h4M7 12h10M7 16h7"/>',terminal:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m6 8 4 4-4 4m7 0h5"/>',play:'<path d="m8 4 12 8-12 8z"/>',stop:'<rect x="5" y="5" width="14" height="14" rx="1"/>',save:'<path d="M4 3h14l3 3v15H3V3h1m3 0v6h10V3M7 21v-8h10v8"/>',plus:'<path d="M12 4v16M4 12h16"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M3 17v4h18v-4"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 1 1 4 3c-1 .5-1 1-1 2m0 3h.01"/>',settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>'};
export function icon(name){return `<svg class="ui-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths[({'php-version':'php','php-server':'services','php-ini':'logs','php-modules':'packages','php-runtime':'terminal','node-version':'node','node-apps':'node','node-runtime':'terminal','node-guide':'documentation','plugins':'packages','topology':'proxy','architecture':'proxy','setup':'settings','panel-maintenance':'refresh','server-settings':'settings','db-connections':'databases','configuration-transfer':'settings','infra-env':'settings',security:'shield',mercure:'proxy',websockets:'proxy',certificates:'shield','dock-settings':'settings','connection-guide':'help','panel-users':'dbusers','app-processes':'terminal','panel-links':'proxy','external-tools':'proxy',jobs:'play',failures:'logs',automation:'settings',volumes:'storage'})[name]]||paths.apps}</svg>`;}
