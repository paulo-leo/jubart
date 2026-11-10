// Copie/importe este objeto na configuração server do vite.config.js da aplicação.
// Preserve os plugins Laravel/Vue/React e as demais opções já existentes.
export default {
    host: '0.0.0.0',
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: true,
    origin: `${process.env.VITE_HMR_PROTOCOL === 'wss' ? 'https' : 'http'}://${process.env.VITE_HMR_HOST || 'localhost'}:${process.env.VITE_HMR_CLIENT_PORT || 5173}`,
    hmr: {
        host: process.env.VITE_HMR_HOST || 'localhost',
        protocol: process.env.VITE_HMR_PROTOCOL || 'ws',
        clientPort: Number(process.env.VITE_HMR_CLIENT_PORT || 5173),
    },
    watch: { usePolling: process.env.VITE_USE_POLLING === 'true' },
};
