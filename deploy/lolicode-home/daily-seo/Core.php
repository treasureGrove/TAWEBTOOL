<?php

declare(strict_types=1);

namespace LoliCode\DailySeo;

use Closure;
use DateTimeImmutable;
use DateTimeZone;
use DOMDocument;
use DOMXPath;
use RuntimeException;
use Throwable;

final class CheckFailure extends RuntimeException
{
}

/**
 * Network and submission dependencies are deliberately injected.
 * $http(string $url): array{status:int, body:string, headers?:array}
 * $submit(array $urls): int
 */
final class Runner
{
    public const HOME = 'https://lolicode.com/';
    public const ROBOTS = self::HOME.'robots.txt';
    public const SITEMAP = self::HOME.'sitemap-desktop.xml';
    public const ICON = self::HOME.'desktop-assets/site-icon-512.png';
    public const FEED = self::HOME.'downloads/updates/latest.json';

    private Closure $http;
    private Closure $submit;
    private ?Closure $baidu;

    public function __construct(
        private string $stateDirectory,
        callable $http,
        callable $submit,
        ?callable $baidu = null,
    ) {
        $this->http = Closure::fromCallable($http);
        $this->submit = Closure::fromCallable($submit);
        $this->baidu = $baidu === null ? null : Closure::fromCallable($baidu);
    }

    public function run(DateTimeImmutable $now, bool $dryRun = false): array
    {
        $now = $now->setTimezone(new DateTimeZone('Asia/Singapore'));
        $base = [
            'version' => 1,
            'site' => self::HOME,
            'timezone' => 'Asia/Singapore',
            'day' => $now->format('Y-m-d'),
            'at' => $now->format(DATE_ATOM),
            'dry_run' => $dryRun,
            'google' => ['status' => 'not_configured', 'discovery' => 'sitemap'],
            'baidu' => ['status' => $this->baidu === null ? 'not_configured' : 'not_submitted'],
        ];
        $lock = null;

        try {
            $this->prepareDirectory();
            $lockPath = $this->safeFile('run.lock');
            $lock = fopen($lockPath, 'c');
            if ($lock === false) {
                throw new RuntimeException('lock_open_failed');
            }
            chmod($lockPath, 0600);
            if (!flock($lock, LOCK_EX | LOCK_NB)) {
                return $base + ['status' => 'locked', 'exit_code' => 75];
            }

            $state = $this->readState();
            if (!$dryRun) {
                $state['last_attempt'] = $base + ['status' => 'checking'];
                $this->writeState($state);
            }

            try {
                $checked = $this->check();
            } catch (CheckFailure $error) {
                return $this->finish($base + [
                    'status' => 'check_failed',
                    'error_code' => $error->getMessage(),
                    'exit_code' => 2,
                ], $state, $dryRun);
            }

            $digest = $checked['digest'];
            $base['productVersion'] = $checked['productVersion'];
            $base['nativeVersion'] = $checked['nativeVersion'];
            $base['digest'] = $digest;
            $base['changed'] = ($state['last_checked']['digest'] ?? null) !== $digest;
            $unchanged = ($state['last_success']['digest'] ?? null) === $digest;
            $baiduUnchanged = $this->baidu === null || ($state['last_baidu_success']['digest'] ?? null) === $digest;
            if ($dryRun) {
                return $base + [
                    'status' => 'dry_run',
                    'action' => ($state['last_submission_attempt']['day'] ?? null) === $base['day']
                        ? 'daily_limit'
                        : ($unchanged && $baiduUnchanged ? 'unchanged' : 'would_submit'),
                    'exit_code' => 0,
                ];
            }
            $state['last_checked'] = ['digest' => $digest, 'day' => $base['day'], 'at' => $base['at']];
            if (($state['last_submission_attempt']['day'] ?? null) === $base['day']) {
                // The daily allowance limits API calls, not fresh health checks.
                // Keep the original attempt as evidence of the earlier request.
                $base['baidu'] = ['status' => 'not_submitted'];
                return $this->finish($base + [
                    'status' => 'already_submitted_today',
                    'indexnow' => ['status' => 'not_submitted'],
                    'exit_code' => 0,
                ], $state, false);
            }
            if ($unchanged && $baiduUnchanged) {
                if ($this->baidu !== null) {
                    $base['baidu'] = ['status' => 'unchanged'];
                }
                return $this->finish($base + [
                    'status' => 'unchanged',
                    'indexnow' => ['status' => 'unchanged'],
                    'exit_code' => 0,
                ], $state, false);
            }

            // Only an actual submission attempt consumes the day's allowance.
            // A previous unchanged/check-failed run can still detect and submit
            // the first new revision later that day.
            $state['last_submission_attempt'] = $base + ['status' => 'submitting'];
            $state['last_attempt'] = $base + ['status' => 'submitting'];
            $this->writeState($state);
            $failed = false;
            $pending = false;
            if ($unchanged) {
                $base['indexnow'] = ['status' => 'unchanged'];
            } else {
                try {
                    $httpStatus = ($this->submit)([self::HOME]);
                    if (!is_int($httpStatus)) {
                        throw new RuntimeException('invalid_submission_status');
                    }
                    $pending = $httpStatus === 202;
                    $failed = !in_array($httpStatus, [200, 202], true);
                    $base['indexnow'] = [
                        'status' => $httpStatus === 200 ? 'received' : ($pending ? 'received_pending_validation' : 'failed'),
                        'http_status' => $httpStatus,
                        'url_count' => 1,
                    ];
                    if ($httpStatus === 200) {
                        $state['last_success'] = ['digest' => $digest, 'day' => $base['day'], 'at' => $base['at'], 'http_status' => 200];
                    }
                } catch (Throwable $error) {
                    $failed = true;
                    $base['indexnow'] = ['status' => 'failed', 'http_status' => null];
                    $base['error_code'] = 'submission_exception';
                }
            }
            if ($this->baidu !== null) {
                if ($baiduUnchanged) {
                    $base['baidu'] = ['status' => 'unchanged'];
                } else {
                    try {
                        $response = ($this->baidu)([self::HOME]);
                        $base['baidu'] = $this->sanitizeBaidu($response);
                    } catch (Throwable $error) {
                        $base['baidu'] = ['status' => 'failed', 'error_code' => 'submission_exception'];
                    }
                    if ($base['baidu']['status'] === 'received') {
                        $state['last_baidu_success'] = ['digest' => $digest, 'day' => $base['day'], 'at' => $base['at']];
                    } else {
                        $failed = true;
                    }
                }
            }
            $result = $base + [
                'status' => $failed ? 'submission_failed' : ($pending ? 'pending_validation' : 'submitted'),
                'meaning' => 'Receipt does not confirm indexing.',
                'exit_code' => $failed ? 3 : 0,
            ];
            $state['last_submission_attempt'] = $result;
            return $this->finish($result, $state, false);
        } catch (Throwable $error) {
            // Never include arbitrary exception text: it could contain HTML,
            // request details, credentials, or filesystem configuration.
            return $base + ['status' => 'state_failed', 'error_code' => 'local_state_error', 'exit_code' => 4];
        } finally {
            if (is_resource($lock)) {
                flock($lock, LOCK_UN);
                fclose($lock);
            }
        }
    }

    private function sanitizeBaidu(mixed $response): array
    {
        if (!is_array($response) || !in_array($response['status'] ?? '', ['received', 'failed', 'quota_exhausted', 'configuration_invalid'], true)) {
            return ['status' => 'failed', 'error_code' => 'invalid_adapter_result'];
        }
        $safe = ['status' => $response['status']];
        foreach (['http_status', 'success', 'remain'] as $key) {
            if (isset($response[$key]) && is_int($response[$key])) {
                $safe[$key] = $response[$key];
            }
        }
        if (isset($response['error_code']) && (is_int($response['error_code'])
            || in_array($response['error_code'], ['configuration_invalid', 'transport_failed', 'invalid_response', 'submission_exception'], true))) {
            $safe['error_code'] = $response['error_code'];
        }
        if ($safe['status'] === 'received' && (($safe['http_status'] ?? null) !== 200 || ($safe['success'] ?? null) !== 1)) {
            return ['status' => 'failed', 'error_code' => 'invalid_response'];
        }
        return $safe;
    }

    private function check(): array
    {
        $documents = [];
        foreach (['home' => self::HOME, 'robots' => self::ROBOTS, 'sitemap' => self::SITEMAP, 'icon' => self::ICON, 'feed' => self::FEED] as $name => $url) {
            try {
                $response = ($this->http)($url);
            } catch (Throwable $error) {
                throw new CheckFailure($name.'_transport_failed');
            }
            if (!is_array($response) || ($response['status'] ?? null) !== 200 || !is_string($response['body'] ?? null)) {
                throw new CheckFailure($name.'_not_200');
            }
            $limits = ['home' => 2097152, 'robots' => 131072, 'sitemap' => 262144, 'icon' => 2097152, 'feed' => 262144];
            if (strlen($response['body']) > $limits[$name] || $response['body'] === '') {
                throw new CheckFailure($name.'_invalid_size');
            }
            foreach (($response['headers'] ?? []) as $header => $value) {
                if ($name !== 'feed' && strtolower((string) $header) === 'x-robots-tag' && preg_match('/\b(?:noindex|none)\b/i', (string) $value)) {
                    throw new CheckFailure($name.'_noindex_header');
                }
            }
            $documents[$name] = $response['body'];
        }

        $this->checkHome($documents['home']);
        foreach (['Googlebot', 'Bingbot', 'Baiduspider'] as $agent) {
            foreach (['/', '/sitemap-desktop.xml', '/desktop-assets/site-icon-512.png'] as $path) {
                if (!$this->robotsAllows($documents['robots'], $agent, $path)) {
                    throw new CheckFailure('robots_blocks_required_resource');
                }
            }
        }
        $this->checkSitemap($documents['sitemap']);
        $size = @getimagesizefromstring($documents['icon']);
        if (!str_starts_with($documents['icon'], "\x89PNG\r\n\x1a\n") || $size === false || $size[0] !== 512 || $size[1] !== 512) {
            throw new CheckFailure('icon_not_512_png');
        }
        $feed = $this->checkFeed($documents['feed']);

        $hash = hash_init('sha256');
        foreach (['home', 'icon', 'sitemap'] as $name) {
            hash_update($hash, $name.':'.strlen($documents[$name]).':');
            hash_update($hash, $documents[$name]);
        }
        hash_update($hash, json_encode($feed, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        return ['digest' => hash_final($hash), 'productVersion' => $feed['productVersion'], 'nativeVersion' => $feed['nativeVersion']];
    }

    private function checkFeed(string $json): array
    {
        try {
            $feed = json_decode($json, true, 32, JSON_THROW_ON_ERROR);
        } catch (Throwable $error) {
            throw new CheckFailure('feed_invalid_json');
        }
        $productVersion = $feed['productVersion'] ?? null;
        $nativeVersion = $feed['version'] ?? null;
        foreach ([$productVersion, $nativeVersion] as $version) {
            if (!is_string($version) || !preg_match('/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/D', $version)) {
                throw new CheckFailure('feed_invalid_version');
            }
        }
        $installer = $feed['platforms']['windows-x86_64']['url'] ?? null;
        $this->checkDownloadUrl($installer);
        $stable = ['productVersion' => $productVersion, 'nativeVersion' => $nativeVersion, 'installerUrl' => $installer];
        $download = $feed['downloads']['windows-x86_64-installer-github'] ?? null;
        if ($download !== null) {
            $this->checkDownloadUrl($download['url'] ?? null);
            if (!is_string($download['sha256'] ?? null) || !preg_match('/^[a-f0-9]{64}$/Di', $download['sha256'])) {
                throw new CheckFailure('feed_invalid_installer_sha256');
            }
            $stable['installerDownloadUrl'] = $download['url'];
            $stable['installerSha256'] = strtolower($download['sha256']);
        }
        return $stable;
    }

    private function checkDownloadUrl(mixed $url): void
    {
        $parsed = is_string($url) && strlen($url) <= 2048 && !preg_match('/[\x00-\x20]/', $url) ? parse_url($url) : false;
        if ($parsed === false || ($parsed['scheme'] ?? '') !== 'https' || empty($parsed['host']) || isset($parsed['user']) || isset($parsed['fragment'])) {
            throw new CheckFailure('feed_invalid_installer_url');
        }
    }

    private function checkHome(string $html): void
    {
        $old = libxml_use_internal_errors(true);
        try {
            $dom = new DOMDocument();
            if (!$dom->loadHTML($html, LIBXML_NONET)) {
                throw new CheckFailure('home_invalid_html');
            }
            $xpath = new DOMXPath($dom);
            $links = $xpath->query('//head/link[contains(concat(" ", translate(normalize-space(@rel), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), " "), " canonical ")]');
            if ($links === false || $links->length !== 1 || trim($links->item(0)->getAttribute('href')) !== self::HOME) {
                throw new CheckFailure('home_wrong_canonical');
            }
            foreach ($xpath->query('//head/meta[@name]') as $meta) {
                if (in_array(strtolower($meta->getAttribute('name')), ['robots', 'googlebot', 'bingbot', 'baiduspider'], true)
                    && preg_match('/\b(?:noindex|none)\b/i', $meta->getAttribute('content'))) {
                    throw new CheckFailure('home_noindex_meta');
                }
            }
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($old);
        }
    }

    private function checkSitemap(string $xml): void
    {
        if (preg_match('/<!\s*(?:DOCTYPE|ENTITY)\b/i', $xml)) {
            throw new CheckFailure('sitemap_forbidden_declaration');
        }
        $old = libxml_use_internal_errors(true);
        try {
            $dom = new DOMDocument();
            if (!$dom->loadXML($xml, LIBXML_NONET)) {
                throw new CheckFailure('sitemap_invalid_xml');
            }
            $root = $dom->documentElement;
            if ($root->localName !== 'urlset' || $root->namespaceURI !== 'http://www.sitemaps.org/schemas/sitemap/0.9') {
                throw new CheckFailure('sitemap_not_urlset');
            }
            $xpath = new DOMXPath($dom);
            $xpath->registerNamespace('s', 'http://www.sitemaps.org/schemas/sitemap/0.9');
            $locations = $xpath->query('/s:urlset/s:url/s:loc');
            $homeCount = 0;
            foreach ($locations as $location) {
                $url = trim($location->textContent);
                $parsed = parse_url($url);
                if ($parsed === false || ($parsed['scheme'] ?? '') !== 'https'
                    || ($parsed['host'] ?? '') !== 'lolicode.com'
                    || isset($parsed['user']) || isset($parsed['port']) || isset($parsed['fragment'])) {
                    throw new CheckFailure('sitemap_foreign_url');
                }
                $homeCount += $url === self::HOME ? 1 : 0;
            }
            if ($homeCount !== 1) {
                throw new CheckFailure('sitemap_home_missing_or_duplicate');
            }
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($old);
        }
    }

    private function robotsAllows(string $robots, string $agent, string $path): bool
    {
        $groups = [];
        $agents = [];
        $rules = [];
        foreach (preg_split('/\r\n|\r|\n/', $robots) as $line) {
            $line = trim(explode('#', $line, 2)[0]);
            if (!str_contains($line, ':')) {
                continue;
            }
            [$field, $value] = array_map('trim', explode(':', $line, 2));
            $field = strtolower($field);
            if ($field === 'user-agent') {
                if ($rules !== []) {
                    $groups[] = ['agents' => $agents, 'rules' => $rules];
                    $agents = [];
                    $rules = [];
                }
                $agents[] = strtolower($value);
            } elseif (in_array($field, ['allow', 'disallow'], true) && $agents !== []) {
                $rules[] = ['allow' => $field === 'allow', 'path' => $value];
            }
        }
        $groups[] = ['agents' => $agents, 'rules' => $rules];
        $selected = [];
        $specificity = -1;
        foreach ($groups as $group) {
            $match = -1;
            foreach ($group['agents'] as $candidate) {
                if ($candidate === '*') {
                    $match = max($match, 0);
                } elseif ($candidate !== '' && str_starts_with(strtolower($agent), $candidate)) {
                    $match = max($match, strlen($candidate));
                }
            }
            if ($match > $specificity) {
                $specificity = $match;
                $selected = $group['rules'];
            } elseif ($match >= 0 && $match === $specificity) {
                $selected = array_merge($selected, $group['rules']);
            }
        }
        $bestLength = -1;
        $allowed = true;
        foreach ($selected as $rule) {
            if ($rule['path'] === '') {
                continue;
            }
            $pattern = preg_quote($rule['path'], '~');
            $pattern = str_replace('\*', '.*', $pattern);
            $pattern = preg_replace('/\\\\\\$$/', '$', $pattern);
            if (preg_match('~^'.$pattern.'~', $path)) {
                $length = strlen(str_replace(['*', '$'], '', $rule['path']));
                if ($length > $bestLength || ($length === $bestLength && $rule['allow'])) {
                    $bestLength = $length;
                    $allowed = $rule['allow'];
                }
            }
        }
        return $allowed;
    }

    private function prepareDirectory(): void
    {
        if (is_link($this->stateDirectory)) {
            throw new RuntimeException('state_symlink');
        }
        if (!is_dir($this->stateDirectory) && !mkdir($this->stateDirectory, 0755, true) && !is_dir($this->stateDirectory)) {
            throw new RuntimeException('state_directory_unavailable');
        }
        if (!is_writable($this->stateDirectory)) {
            throw new RuntimeException('state_not_writable');
        }
        chmod($this->stateDirectory, 0755);
        $private = $this->stateDirectory.DIRECTORY_SEPARATOR.'state';
        if (is_link($private) || (!is_dir($private) && !mkdir($private, 0700))) {
            throw new RuntimeException('private_state_directory_unavailable');
        }
        chmod($private, 0700);
    }

    private function safeFile(string $name): string
    {
        $path = $this->stateDirectory.DIRECTORY_SEPARATOR.'state'.DIRECTORY_SEPARATOR.$name;
        if (is_link($path) || (file_exists($path) && !is_file($path))) {
            throw new RuntimeException('state_file_not_regular');
        }
        return $path;
    }

    private function readState(): array
    {
        $path = $this->safeFile('state.json');
        if (!file_exists($path)) {
            return ['version' => 1];
        }
        $state = json_decode(file_get_contents($path), true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($state) || ($state['version'] ?? null) !== 1) {
            throw new RuntimeException('invalid_state');
        }
        return $state;
    }

    private function writeState(array $state): void
    {
        $path = $this->safeFile('state.json');
        $temporary = $this->safeFile('state.json.tmp');
        if (file_put_contents($temporary, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n", LOCK_EX) === false) {
            throw new RuntimeException('state_write_failed');
        }
        chmod($temporary, 0600);
        if (!rename($temporary, $path)) {
            throw new RuntimeException('state_replace_failed');
        }
    }

    private function finish(array $result, array $state, bool $dryRun): array
    {
        if (!$dryRun) {
            $state['last_attempt'] = $result;
            $this->writeState($state);
            $path = $this->safeFile('events.jsonl');
            if (file_put_contents($path, json_encode($result, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n", FILE_APPEND | LOCK_EX) === false) {
                throw new RuntimeException('log_write_failed');
            }
            chmod($path, 0600);
            $this->writePublicStatus($result);
        }
        return $result;
    }

    private function writePublicStatus(array $result): void
    {
        $public = [
            'date' => $result['day'],
            'site' => self::HOME,
            'checkedAt' => $result['at'],
            'health' => $result['status'] === 'check_failed'
                ? 'check_failed'
                : ($result['status'] === 'submission_failed' ? 'submission_failed' : 'degraded'),
            'changed' => $result['changed'] ?? null,
            'productVersion' => $result['productVersion'] ?? null,
            'nativeVersion' => $result['nativeVersion'] ?? null,
            'engineStatus' => [
                'indexnow' => $result['indexnow']['status'] ?? 'not_submitted',
                'google' => $result['status'] === 'check_failed' ? 'not_configured' : 'sitemap_available_no_api',
                'baidu' => $result['baidu']['status'],
            ],
        ];
        $path = $this->stateDirectory.DIRECTORY_SEPARATOR.'public-status.json';
        $temporary = $path.'.tmp';
        foreach ([$path, $temporary] as $candidate) {
            if (is_link($candidate) || (file_exists($candidate) && !is_file($candidate))) {
                throw new RuntimeException('public_status_not_regular');
            }
        }
        if (file_put_contents($temporary, json_encode($public, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n", LOCK_EX) === false) {
            throw new RuntimeException('public_status_write_failed');
        }
        chmod($temporary, 0644);
        if (!rename($temporary, $path)) {
            throw new RuntimeException('public_status_replace_failed');
        }
    }
}
