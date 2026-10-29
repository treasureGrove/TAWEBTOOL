#!/usr/bin/env php
<?php

declare(strict_types=1);

require __DIR__.'/Core.php';
require __DIR__.'/Baidu.php';

use LoliCode\DailySeo\Runner;
use LoliCode\DailySeo\BaiduSubmitter;

const STATE_DIRECTORY = '/var/lib/lolicode-seo';
const FORUM_DIRECTORY = '/var/www/forum';
const BAIDU_CREDENTIALS = STATE_DIRECTORY.'/credentials/baidu.json';

$arguments = array_slice($argv, 1);
if ($arguments === ['--help']) {
    echo "Usage: php run.php [--dry-run]\nRun as www-data. State: ".STATE_DIRECTORY."\n";
    exit(0);
}
if ($arguments !== [] && $arguments !== ['--dry-run']) {
    echo "{\"status\":\"invalid_arguments\",\"exit_code\":64}\n";
    exit(64);
}
$user = function_exists('posix_getpwnam') ? posix_getpwnam('www-data') : false;
if ($user === false || !function_exists('posix_geteuid') || posix_geteuid() !== $user['uid']) {
    echo "{\"status\":\"requires_www_data\",\"exit_code\":64}\n";
    exit(64);
}

$http = static function (string $url): array {
    if (!in_array($url, [Runner::HOME, Runner::ROBOTS, Runner::SITEMAP, Runner::ICON, Runner::FEED], true)) {
        throw new RuntimeException('URL is not allowlisted');
    }
    $body = '';
    $headers = [];
    $handle = curl_init($url);
    if ($handle === false) {
        throw new RuntimeException('HTTP initialization failed');
    }
    curl_setopt_array($handle, [
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_USERAGENT => 'LoliCode-SEO-Check/1.0 (+https://lolicode.com/)',
        CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$body): int {
            if (strlen($body) + strlen($chunk) > 2097152) {
                return 0;
            }
            $body .= $chunk;
            return strlen($chunk);
        },
        CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$headers): int {
            if (str_contains($line, ':')) {
                [$name, $value] = explode(':', $line, 2);
                if (strtolower(trim($name)) === 'x-robots-tag') {
                    $headers['x-robots-tag'] = ($headers['x-robots-tag'] ?? '').','.trim($value);
                }
            }
            return strlen($line);
        },
    ]);
    try {
        if (curl_exec($handle) === false) {
            throw new RuntimeException('HTTP transport failed');
        }
        return ['status' => (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE), 'body' => $body, 'headers' => $headers];
    } finally {
        curl_close($handle);
    }
};

$submit = static function (array $urls): int {
    if ($urls !== [Runner::HOME]) {
        throw new RuntimeException('Only the official homepage may be submitted');
    }
    if (!is_file(FORUM_DIRECTORY.'/storage/indexnow.key')) {
        throw new RuntimeException('Existing IndexNow configuration is required');
    }
    // Lazy bootstrap: dry runs, checks, unchanged days and duplicate runs never
    // boot the forum or call a submission API. Key access stays in its service.
    chdir(FORUM_DIRECTORY);
    $site = require FORUM_DIRECTORY.'/site.php';
    $app = $site->bootApp();
    return $app->getContainer()->make(
        \TreasureGrove\ResourceHub\Search\IndexNow::class
    )->submit($urls);
};

$baidu = is_file(BAIDU_CREDENTIALS) ? new BaiduSubmitter(BAIDU_CREDENTIALS) : null;
$runner = new Runner(STATE_DIRECTORY, $http, $submit, $baidu === null ? null : $baidu->submit(...));
$result = $runner->run(new DateTimeImmutable('now'), $arguments === ['--dry-run']);
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), PHP_EOL;
exit($result['exit_code']);
