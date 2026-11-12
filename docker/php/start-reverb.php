<?php
// Inicializador somente do container WebSocket; não altera arquivos da aplicação.
chdir('/var/www/html');
if (!is_file('vendor/autoload.php') || !is_file('bootstrap/app.php')) {
    fwrite(STDERR, "Instale as dependências Laravel/Reverb na aplicação antes de iniciar WebSocket.\n"); exit(1);
}
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
$origins = json_decode(getenv('WEBSOCKET_ALLOWED_ORIGINS') ?: '[]', true);
$apps = config('reverb.apps.apps');
if (config('reverb.apps.provider') !== 'config' || !is_array($apps) || !$apps || !is_array($origins) || !$origins) {
    fwrite(STDERR, "Configure config/reverb.php com provider config e origens permitidas no painel.\n"); exit(1);
}
foreach ($apps as &$definition) { $definition['allowed_origins'] = $origins; }
unset($definition);
config(['reverb.apps.apps' => $apps]);
$input = new Symfony\Component\Console\Input\ArgvInput(['artisan', 'reverb:start', '--host=0.0.0.0', '--port='.(int)getenv('WEBSOCKET_PORT')]);
$status = $kernel->handle($input, new Symfony\Component\Console\Output\ConsoleOutput());
$kernel->terminate($input, $status);
exit($status);
