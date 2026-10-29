<?php

declare(strict_types=1);

namespace LoliCode\DailySeo;

use Closure;
use RuntimeException;
use Throwable;

final class BaiduSubmitter
{
    private Closure $transport;

    public function __construct(private string $credentialFile, ?callable $transport = null)
    {
        $this->transport = Closure::fromCallable($transport ?? self::post(...));
    }

    public function submit(array $urls): array
    {
        if ($urls !== [Runner::HOME]) {
            return ['status' => 'configuration_invalid', 'error_code' => 'configuration_invalid'];
        }
        try {
            if (is_link($this->credentialFile) || !is_file($this->credentialFile)
                || (fileperms($this->credentialFile) & 0077) !== 0) {
                throw new RuntimeException('Invalid private credential file');
            }
            $configuration = json_decode(file_get_contents($this->credentialFile), true, 8, JSON_THROW_ON_ERROR);
            if (($configuration['site'] ?? null) !== 'https://lolicode.com'
                || !is_string($configuration['token'] ?? null)
                || !preg_match('/^[A-Za-z0-9_-]{8,256}$/D', $configuration['token'])) {
                throw new RuntimeException('Invalid root-domain configuration');
            }
            $endpoint = 'https://data.zz.baidu.com/urls?'.http_build_query(
                ['site' => 'https://lolicode.com', 'token' => $configuration['token']],
                '',
                '&',
                PHP_QUERY_RFC3986,
            );
        } catch (Throwable $error) {
            return ['status' => 'configuration_invalid', 'error_code' => 'configuration_invalid'];
        }

        try {
            $response = ($this->transport)($endpoint, Runner::HOME."\n");
        } catch (Throwable $error) {
            return ['status' => 'failed', 'error_code' => 'transport_failed'];
        } finally {
            unset($configuration, $endpoint);
        }
        $status = is_int($response['status'] ?? null) ? $response['status'] : 0;
        try {
            $body = json_decode($response['body'], true, 16, JSON_THROW_ON_ERROR);
            if (!is_array($body)) {
                throw new RuntimeException('Invalid response');
            }
        } catch (Throwable $error) {
            return ['status' => 'failed', 'http_status' => $status, 'error_code' => 'invalid_response'];
        }
        $success = is_int($body['success'] ?? null) ? $body['success'] : 0;
        $quota = is_string($body['message'] ?? null) && preg_match('/quota|配额|额度/iu', $body['message']);
        $result = [
            'status' => $status === 200 && $success === 1 ? 'received' : ($quota ? 'quota_exhausted' : 'failed'),
            'http_status' => $status,
            'success' => $success,
        ];
        if (isset($body['remain']) && is_int($body['remain']) && $body['remain'] >= 0) {
            $result['remain'] = $body['remain'];
        }
        if (isset($body['error']) && is_int($body['error'])) {
            $result['error_code'] = $body['error'];
        }
        return $result;
    }

    private static function post(string $endpoint, string $payload): array
    {
        $body = '';
        $handle = curl_init($endpoint);
        if ($handle === false) {
            throw new RuntimeException('HTTP initialization failed');
        }
        curl_setopt_array($handle, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: text/plain; charset=utf-8'],
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$body): int {
                if (strlen($body) + strlen($chunk) > 65536) {
                    return 0;
                }
                $body .= $chunk;
                return strlen($chunk);
            },
        ]);
        try {
            if (curl_exec($handle) === false) {
                throw new RuntimeException('HTTP transport failed');
            }
            return ['status' => (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE), 'body' => $body];
        } finally {
            curl_close($handle);
        }
    }
}
