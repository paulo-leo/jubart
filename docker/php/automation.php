<?php
// Ponte administrativa: apenas consulta de filas e dispatch de classes App\Jobs.
// Não aceita comandos shell, PHP arbitrário nem payloads serializados.
declare(strict_types=1);
class InfraInputException extends RuntimeException {}
ob_start();
try {
    $input = json_decode(stream_get_contents(STDIN), true, 32, JSON_THROW_ON_ERROR);
    if (!is_file(getcwd().'/vendor/autoload.php') || !is_file(getcwd().'/bootstrap/app.php')) {
        throw new InfraInputException('Laravel não preparado. Instale as dependências e configure a aplicação.');
    }
    require getcwd().'/vendor/autoload.php';
    $app = require getcwd().'/bootstrap/app.php';
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    $action = $argv[1] ?? '';
    if ($action === 'status') {
        $queues = [];
        foreach ($input['queues'] ?? [] as $queue) {
            if (!in_array($queue['connection'], ['redis', 'database'], true) || !preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/', $queue['queue'])) {
                throw new InfraInputException('Fila inválida.');
            }
            try {
                $connection = $app['queue']->connection($queue['connection']);
                $details = ['total' => $connection->size($queue['queue'])];
                foreach (['pendingSize' => 'pending', 'delayedSize' => 'delayed', 'reservedSize' => 'reserved'] as $method => $key) {
                    if (method_exists($connection, $method)) $details[$key] = $connection->$method($queue['queue']);
                }
                $queues[] = ['id' => $queue['id'], 'counts' => $details];
            } catch (Throwable $e) {
                $queues[] = ['id' => $queue['id'], 'error' => 'Não foi possível consultar essa fila. Verifique conexão e logs.'];
            }
        }
        $failed = []; $failedError = null;
        try {
            // Não consulta payloads. Usa o provedor database padrão do Laravel.
            $driver = config('queue.failed.driver');
            if (in_array($driver, ['database', 'database-uuids'], true)) {
                $rows = $app['db']->connection(config('queue.failed.database'))->table(config('queue.failed.table', 'failed_jobs'))
                    ->select($driver === 'database-uuids' ? ['id', 'uuid', 'connection', 'queue', 'failed_at'] : ['id', 'connection', 'queue', 'failed_at'])->orderByDesc('id')->limit(30)->get();
                foreach ($rows as $row) $failed[] = ['id' => (string)($row->uuid ?? $row->id), 'connection' => $row->connection, 'queue' => $row->queue, 'failedAt' => (string)$row->failed_at];
            } else $failedError = 'Listagem de falhas disponível para provedores database/database-uuids.';
        } catch (Throwable $e) { $failedError = 'Registro de falhas não disponível; verifique tabela e conexão.'; }
        $result = ['queues' => $queues, 'failed' => $failed, 'failedError' => $failedError];
    } elseif ($action === 'validate-worker') {
        $connection = $input['connection'] ?? '';
        if (!in_array($connection, ['redis', 'database'], true)) throw new InfraInputException('Conexão inválida.');
        $driver = config('queue.connections.'.$connection.'.driver');
        if (!in_array($driver, ['redis', 'database'], true)) throw new InfraInputException('Configure uma conexão de fila Redis ou database na aplicação.');
        $retryAfter = (int)config('queue.connections.'.$connection.'.retry_after', 0);
        if ($retryAfter <= (int)($input['timeout'] ?? 0)) throw new InfraInputException('retry_after da conexão deve ser maior que o timeout do worker. Ajuste config/queue.php na aplicação.');
        $app['queue']->connection($connection)->size($input['queue']);
        $result = ['valid' => true];
    } elseif ($action === 'dispatch') {
        $class = $input['class'] ?? '';
        if (!preg_match('/^App\\\\Jobs\\\\[A-Za-z_][A-Za-z0-9_]*(?:\\\\[A-Za-z_][A-Za-z0-9_]*)*$/', $class)
            || !class_exists($class) || !is_subclass_of($class, Illuminate\Contracts\Queue\ShouldQueue::class)) {
            throw new InfraInputException('A classe precisa existir em App\\Jobs e implementar ShouldQueue.');
        }
        if (!in_array($input['connection'] ?? '', ['redis', 'database'], true)
            || !preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/', $input['queue'] ?? '')) throw new InfraInputException('Destino inválido.');
        $arguments = $input['arguments'] ?? [];
        if (!is_array($arguments) || !array_is_list($arguments)) throw new InfraInputException('Os argumentos devem ser um array JSON posicional.');
        $job = (new ReflectionClass($class))->newInstanceArgs($arguments);
        if (!method_exists($job, 'onConnection') || !method_exists($job, 'onQueue')) throw new InfraInputException('Use o trait Queueable no job.');
        $job->onConnection($input['connection'])->onQueue($input['queue']);
        $app->make(Illuminate\Contracts\Bus\Dispatcher::class)->dispatch($job);
        $result = ['queued' => true];
    } else throw new InfraInputException('Operação inválida.');
    ob_end_clean();
    echo '__INFRA_JSON__'.json_encode(['ok' => true, 'data' => $result], JSON_THROW_ON_ERROR);
} catch (Throwable $e) {
    ob_end_clean();
    // Mensagens não expõem SQL, credenciais, stacktrace ou payload.
    $message = $e instanceof InfraInputException
        ? $e->getMessage() : 'A operação Laravel falhou. Consulte os logs da aplicação.';
    echo '__INFRA_JSON__'.json_encode(['ok' => false, 'error' => $message]);
    exit(0); // O protocolo JSON carrega o estado de falha.
}
