<?php

declare(strict_types=1);

require __DIR__.'/Core.php';
require __DIR__.'/Baidu.php';

use LoliCode\DailySeo\Runner;
use LoliCode\DailySeo\BaiduSubmitter;

// All network and submission dependencies below are in-memory fixtures.
// This file does not include run.php, boot Flarum or call any real API.
$temporaryRoot = sys_get_temp_dir().'/lolicode-seo-offline-'.bin2hex(random_bytes(8));
mkdir($temporaryRoot, 0700);
$passed = 0;
$failed = 0;
$number = 0;

function expect(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function png(int $width = 512, int $height = 512, string $pixel = "\xff\x00\x00\xff"): string
{
    $chunk = static function (string $type, string $data): string {
        return pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));
    };
    return "\x89PNG\r\n\x1a\n"
        .$chunk('IHDR', pack('NNCCCCC', $width, $height, 8, 6, 0, 0, 0))
        .$chunk('IDAT', gzcompress(str_repeat("\0".str_repeat($pixel, $width), $height)))
        .$chunk('IEND', '');
}

function fixture(): array
{
    return [
        Runner::HOME => ['status' => 200, 'body' => '<!doctype html><html><head><link rel="canonical" href="https://lolicode.com/"></head><body>PRIVATE_HTML_FIXTURE</body></html>'],
        Runner::ROBOTS => ['status' => 200, 'body' => "User-agent: *\nDisallow: /admin\nSitemap: https://lolicode.com/sitemap.xml\n"],
        Runner::SITEMAP => ['status' => 200, 'body' => '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://lolicode.com/</loc><lastmod>2026-10-20</lastmod></url></urlset>'],
        Runner::ICON => ['status' => 200, 'body' => png()],
        Runner::FEED => ['status' => 200, 'body' => json_encode([
            'productVersion' => '1.0.0',
            'version' => '4.1.0',
            'platforms' => ['windows-x86_64' => ['url' => 'https://github.com/treasureGrove/LoliCode-Releases/releases/download/v1.0.0/setup.exe', 'signature' => 'PUBLIC_SIGNATURE_FIXTURE']],
        ])],
    ];
}

function setup(?callable $submitOverride = null, ?callable $baidu = null): array
{
    global $temporaryRoot, $number;
    $number++;
    $directory = $temporaryRoot.'/'.$number;
    $context = (object) ['documents' => fixture(), 'requests' => [], 'submissions' => []];
    $runner = new Runner(
        $directory,
        static function (string $url) use ($context): array {
            $context->requests[] = $url;
            expect(array_key_exists($url, $context->documents), 'HTTP URL must be allowlisted');
            return $context->documents[$url];
        },
        static function (array $urls) use ($context, $submitOverride): int {
            $context->submissions[] = $urls;
            expect($urls === [Runner::HOME], 'Only homepage may be submitted');
            return $submitOverride === null ? 200 : $submitOverride($urls);
        },
        $baidu,
    );
    return [$runner, $context, $directory];
}

function test(string $name, callable $body): void
{
    global $passed, $failed;
    try {
        $body();
        $passed++;
        echo 'PASS '.$name.PHP_EOL;
    } catch (Throwable $error) {
        $failed++;
        echo 'FAIL '.$name.': '.$error->getMessage().PHP_EOL;
    }
}

function now(string $time = '2026-10-20T09:00:00+00:00'): DateTimeImmutable
{
    return new DateTimeImmutable($time);
}

test('first valid run submits only homepage and stores a digest', function (): void {
    [$runner, $context, $directory] = setup();
    $result = $runner->run(now());
    expect($result['status'] === 'submitted', 'first submission');
    expect(count($context->requests) === 5 && $context->submissions === [[Runner::HOME]], 'exact HTTP and submission scope');
    $state = json_decode(file_get_contents($directory.'/state/state.json'), true);
    expect(strlen($state['last_success']['digest']) === 64, 'successful digest');
    expect($result['google']['status'] === 'not_configured' && $result['baidu']['status'] === 'not_configured', 'unconfigured engines');
    expect(!str_contains(file_get_contents($directory.'/state/events.jsonl'), 'PRIVATE_HTML_FIXTURE'), 'raw HTML is absent');
});

test('overnight submission still permits fresh morning checks without either API', function (): void {
    $baiduCalls = 0;
    [$runner, $context, $directory] = setup(null, static function () use (&$baiduCalls): array {
        $baiduCalls++;
        return ['status' => 'received', 'http_status' => 200, 'success' => 1];
    });
    $first = $runner->run(now('2026-10-20T00:10:00+08:00'));
    $result = $runner->run(now('2026-10-20T08:45:00+08:00'));
    expect($result['status'] === 'already_submitted_today', 'daily submission duplicate');
    expect(count($context->requests) === 10 && count($context->submissions) === 1 && $baiduCalls === 1, 'fresh GET checks but no additional API calls');
    $state = json_decode(file_get_contents($directory.'/state/state.json'), true);
    expect($state['last_submission_attempt'] === $first, 'original submission evidence preserved');
    expect($state['last_checked']['at'] === '2026-10-20T08:45:00+08:00', 'last checked time refreshed');
    $public = json_decode(file_get_contents($directory.'/public-status.json'), true);
    expect($public['checkedAt'] === '2026-10-20T08:45:00+08:00' && $public['changed'] === false && $public['health'] === 'degraded', 'morning public health is fresh');
    expect($public['engineStatus']['indexnow'] === 'not_submitted' && $public['engineStatus']['baidu'] === 'not_submitted', 'no new receipt fabricated');
});

test('same-day changed release refreshes public versions without reusing an earlier receipt', function (): void {
    [$runner, $context, $directory] = setup();
    $first = $runner->run(now('2026-10-20T00:10:00+08:00'));
    $feed = json_decode($context->documents[Runner::FEED]['body'], true);
    $feed['productVersion'] = '1.0.1';
    $feed['version'] = '4.1.1';
    $context->documents[Runner::FEED]['body'] = json_encode($feed);
    $result = $runner->run(now('2026-10-20T08:45:00+08:00'));
    $state = json_decode(file_get_contents($directory.'/state/state.json'), true);
    $public = json_decode(file_get_contents($directory.'/public-status.json'), true);
    expect($result['status'] === 'already_submitted_today' && $result['changed'] === true && $result['digest'] !== $first['digest'], 'changed release checked within daily limit');
    expect($state['last_submission_attempt'] === $first && $state['last_success']['digest'] === $first['digest'], 'successful receipt stays attached to the earlier digest');
    expect($public['checkedAt'] === $result['at'] && $public['productVersion'] === '1.0.1' && $public['nativeVersion'] === '4.1.1', 'latest versions and timestamp exposed');
    expect($public['engineStatus']['indexnow'] === 'not_submitted' && count($context->submissions) === 1, 'new digest not claimed as submitted');
});

test('morning page failure after an overnight submission remains visible', function (): void {
    [$runner, $context, $directory] = setup();
    $first = $runner->run(now('2026-10-20T00:10:00+08:00'));
    $context->documents[Runner::HOME]['status'] = 503;
    $result = $runner->run(now('2026-10-20T08:45:00+08:00'));
    $state = json_decode(file_get_contents($directory.'/state/state.json'), true);
    $public = json_decode(file_get_contents($directory.'/public-status.json'), true);
    expect($result['status'] === 'check_failed' && $result['exit_code'] === 2 && $result['error_code'] === 'home_not_200', 'daily allowance does not hide health failures');
    expect(count($context->requests) === 6 && count($context->submissions) === 1, 'failed GET does not resubmit');
    expect($state['last_submission_attempt'] === $first, 'prior submission evidence survives check failure');
    expect($public['checkedAt'] === '2026-10-20T08:45:00+08:00' && $public['health'] === 'check_failed', 'fresh failure summary');
    expect($public['changed'] === null && $public['productVersion'] === null && $public['nativeVersion'] === null, 'failed check does not imply content validation');
});

test('same-day dry run checks without updating persistent evidence or calling APIs', function (): void {
    [$runner, $context, $directory] = setup();
    $runner->run(now('2026-10-20T00:10:00+08:00'));
    $beforeState = file_get_contents($directory.'/state/state.json');
    $beforePublic = file_get_contents($directory.'/public-status.json');
    $beforeEvents = file_get_contents($directory.'/state/events.jsonl');
    $result = $runner->run(now('2026-10-20T08:45:00+08:00'), true);
    expect($result['status'] === 'dry_run' && $result['action'] === 'daily_limit', 'existing dry-run daily limit behavior');
    expect(count($context->requests) === 10 && count($context->submissions) === 1, 'dry run only checks');
    expect(file_get_contents($directory.'/state/state.json') === $beforeState && file_get_contents($directory.'/public-status.json') === $beforePublic && file_get_contents($directory.'/state/events.jsonl') === $beforeEvents, 'dry run preserves all evidence');
});

test('next day unchanged content is checked but not submitted', function (): void {
    [$runner, $context, $directory] = setup();
    $first = $runner->run(now());
    $result = $runner->run(now('2026-10-21T09:00:00Z'));
    expect($result['status'] === 'unchanged', 'unchanged state');
    expect(count($context->requests) === 10 && count($context->submissions) === 1, 'checked once on each day');
    $state = json_decode(file_get_contents($directory.'/state/state.json'), true);
    expect($state['last_success']['digest'] === $first['digest'] && $state['last_success']['day'] === '2026-10-20', 'success date not fabricated');
});

test('changed HTML is submitted the next day', function (): void {
    [$runner, $context] = setup();
    $first = $runner->run(now());
    $context->documents[Runner::HOME]['body'] = str_replace('PRIVATE_HTML_FIXTURE', 'Updated product copy', $context->documents[Runner::HOME]['body']);
    $result = $runner->run(now('2026-10-21T09:00:00Z'));
    expect($result['status'] === 'submitted' && $result['digest'] !== $first['digest'], 'changed digest');
    expect(count($context->submissions) === 2, 'new revision submitted');
});

test('unchanged check does not consume the first submission of a changed day', function (): void {
    [$runner, $context] = setup();
    $runner->run(now());
    expect($runner->run(now('2026-10-21T01:00:00Z'))['status'] === 'unchanged', 'morning unchanged');
    $context->documents[Runner::HOME]['body'] .= '<!-- updated today -->';
    expect($runner->run(now('2026-10-21T03:00:00Z'))['status'] === 'submitted', 'first changed revision still eligible');
    $context->documents[Runner::HOME]['body'] .= '<!-- another update -->';
    expect($runner->run(now('2026-10-21T05:00:00Z'))['status'] === 'already_submitted_today', 'no second submission on same day');
    expect(count($context->submissions) === 2, 'one submission on each day');
});

test('feed version-only change triggers submission and excludes public signatures', function (): void {
    [$runner, $context, $directory] = setup();
    $first = $runner->run(now());
    $feed = json_decode($context->documents[Runner::FEED]['body'], true);
    $feed['productVersion'] = '1.0.1';
    $feed['version'] = '4.1.1';
    $context->documents[Runner::FEED]['body'] = json_encode($feed);
    $second = $runner->run(now('2026-10-21T09:00:00Z'));
    expect($second['status'] === 'submitted' && $first['digest'] !== $second['digest'], 'feed release updates digest');
    $public = json_decode(file_get_contents($directory.'/public-status.json'), true);
    expect($public['productVersion'] === '1.0.1' && $public['nativeVersion'] === '4.1.1', 'public versions');
    expect(!str_contains(json_encode($public), 'PUBLIC_SIGNATURE_FIXTURE'), 'signature never exposed');
});

test('non-stable feed fields and signatures do not create false changes', function (): void {
    [$runner, $context] = setup();
    $first = $runner->run(now(), true);
    $feed = json_decode($context->documents[Runner::FEED]['body'], true);
    $feed['notes'] = 'Unrelated generated description';
    $feed['pub_date'] = '2026-10-21T00:00:00Z';
    $feed['platforms']['windows-x86_64']['signature'] = 'DIFFERENT_PUBLIC_SIGNATURE';
    $context->documents[Runner::FEED]['body'] = json_encode($feed);
    expect($runner->run(now(), true)['digest'] === $first['digest'], 'only stable selected fields hashed');
});

test('invalid release feed stops before API calls', function (): void {
    [$runner, $context] = setup();
    $context->documents[Runner::FEED]['body'] = '{"version":"not-a-version"}';
    expect($runner->run(now())['error_code'] === 'feed_invalid_version' && $context->submissions === [], 'feed validation');
});

test('icon and sitemap bytes both participate in the digest', function (): void {
    [$runner, $context] = setup();
    $first = $runner->run(now(), true);
    $context->documents[Runner::ICON]['body'] = png(512, 512, "\x00\xff\x00\xff");
    $second = $runner->run(now(), true);
    $context->documents[Runner::SITEMAP]['body'] = str_replace('2026-10-20', '2026-10-19', $context->documents[Runner::SITEMAP]['body']);
    $third = $runner->run(now(), true);
    expect($first['digest'] !== $second['digest'] && $second['digest'] !== $third['digest'], 'all requested inputs hashed');
    expect(count($context->submissions) === 0, 'digest checks were dry');
});

test('dry run never submits or writes state/log and does not consume the date', function (): void {
    [$runner, $context, $directory] = setup();
    $result = $runner->run(now(), true);
    expect($result['status'] === 'dry_run' && $result['action'] === 'would_submit', 'dry run action');
    expect($context->submissions === [] && !file_exists($directory.'/state/state.json') && !file_exists($directory.'/state/events.jsonl'), 'no persistent attempt or event');
    expect($runner->run(now())['status'] === 'submitted', 'real run remains eligible');
});

test('local midnight creates a new day even while the UTC date is unchanged', function (): void {
    [$runner, $context] = setup();
    $first = $runner->run(now('2026-10-20T15:59:00Z'));
    $context->documents[Runner::HOME]['body'] .= '<!-- revision -->';
    $second = $runner->run(now('2026-10-20T16:01:00Z'));
    expect($first['day'] === '2026-10-20' && $second['day'] === '2026-10-21', 'Singapore dates');
    expect(count($context->submissions) === 2, 'each local date submitted once');
});

test('concurrent lock prevents HTTP and submission', function (): void {
    [$runner, $context, $directory] = setup();
    mkdir($directory.'/state', 0700, true);
    $lock = fopen($directory.'/state/run.lock', 'c');
    flock($lock, LOCK_EX | LOCK_NB);
    try {
        $result = $runner->run(now());
        expect($result['status'] === 'locked' && $result['exit_code'] === 75, 'lock status');
        expect($context->requests === [] && $context->submissions === [], 'locked run has no external activity');
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
});

test('HTTP failure is a check failure and never marks success', function (): void {
    [$runner, $context, $directory] = setup();
    $context->documents[Runner::SITEMAP]['status'] = 404;
    $result = $runner->run(now());
    $state = json_decode(file_get_contents($directory.'/state/state.json'), true);
    expect($result['status'] === 'check_failed' && $result['error_code'] === 'sitemap_not_200', 'HTTP check failure');
    expect($context->submissions === [] && !isset($state['last_success']), 'no success');
});

foreach (['https://tools.treasuregrove.art/lolicode/', 'http://lolicode.com/', 'https://lolicode.com.evil.example/'] as $wrongCanonical) {
    test('canonical rejects '.$wrongCanonical, function () use ($wrongCanonical): void {
        [$runner, $context] = setup();
        $context->documents[Runner::HOME]['body'] = str_replace('href="https://lolicode.com/"', 'href="'.$wrongCanonical.'"', $context->documents[Runner::HOME]['body']);
        $result = $runner->run(now());
        expect($result['error_code'] === 'home_wrong_canonical' && $context->submissions === [], 'wrong canonical is rejected');
    });
}

test('noindex HTTP header prevents submission', function (): void {
    [$runner, $context] = setup();
    $context->documents[Runner::HOME]['headers'] = ['X-Robots-Tag' => 'noindex'];
    expect($runner->run(now())['error_code'] === 'home_noindex_header', 'header validated');
});

test('robots disallow root prevents submission', function (): void {
    [$runner, $context] = setup();
    $context->documents[Runner::ROBOTS]['body'] = "User-agent: *\nDisallow: /$\n";
    expect($runner->run(now())['error_code'] === 'robots_blocks_required_resource', 'robots end anchor');
    expect($context->submissions === [], 'robots rejection');
});

test('robots longest allow rule can permit the icon', function (): void {
    [$runner, $context] = setup();
    $context->documents[Runner::ROBOTS]['body'] = "User-agent: *\nDisallow: /desktop-assets/*\nAllow: /desktop-assets/site-icon-512.png$\n";
    expect($runner->run(now())['status'] === 'submitted', 'longest allow wins');
});

test('crawler specific robots block is enforced', function (): void {
    [$runner, $context] = setup();
    $context->documents[Runner::ROBOTS]['body'] = "User-agent: *\nAllow: /\nUser-agent: Bingbot\nDisallow: /\n";
    expect($runner->run(now())['error_code'] === 'robots_blocks_required_resource', 'Bing-specific group wins');
});

test('sitemap index and foreign locations are rejected', function (): void {
    [$runner, $context] = setup();
    $context->documents[Runner::SITEMAP]['body'] = '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>';
    expect($runner->run(now(), true)['error_code'] === 'sitemap_not_urlset', 'urlset required');
    $context->documents[Runner::SITEMAP] = fixture()[Runner::SITEMAP];
    $context->documents[Runner::SITEMAP]['body'] = str_replace('</urlset>', '<url><loc>https://evil.example/</loc></url></urlset>', $context->documents[Runner::SITEMAP]['body']);
    expect($runner->run(now(), true)['error_code'] === 'sitemap_foreign_url', 'foreign URL denied');
});

test('XML entity declarations are rejected without resolution', function (): void {
    [$runner, $context] = setup();
    $context->documents[Runner::SITEMAP]['body'] = '<!DOCTYPE urlset [<!ENTITY leak SYSTEM "file:///nonexistent">]><urlset/>';
    expect($runner->run(now())['error_code'] === 'sitemap_forbidden_declaration', 'entity denied');
});

test('wrong icon dimensions are a check failure', function (): void {
    [$runner, $context] = setup();
    $context->documents[Runner::ICON]['body'] = png(1, 1);
    expect($runner->run(now())['error_code'] === 'icon_not_512_png', 'icon dimensions');
});

test('API failure is distinct, not successful, and retry is deferred to tomorrow', function (): void {
    $responses = [503, 200];
    [$runner, $context, $directory] = setup(static function () use (&$responses): int { return array_shift($responses); });
    $first = $runner->run(now());
    $state = json_decode(file_get_contents($directory.'/state/state.json'), true);
    expect($first['status'] === 'submission_failed' && $first['exit_code'] === 3 && !isset($state['last_success']), 'failed receipt never marked success');
    expect($runner->run(now())['status'] === 'already_submitted_today' && count($context->submissions) === 1, 'no same-day retry');
    expect($runner->run(now('2026-10-21T09:00:00Z'))['status'] === 'submitted' && count($context->submissions) === 2, 'next-day recovery');
});

test('failed new revision preserves the previous successful digest', function (): void {
    $responses = [200, 429];
    [$runner, $context, $directory] = setup(static function () use (&$responses): int { return array_shift($responses); });
    $first = $runner->run(now());
    $context->documents[Runner::HOME]['body'] .= '<!-- changed -->';
    $runner->run(now('2026-10-21T09:00:00Z'));
    $state = json_decode(file_get_contents($directory.'/state/state.json'), true);
    expect($state['last_success']['digest'] === $first['digest'], 'success digest preserved after failure');
});

test('202 remains pending and is eligible for verification retry tomorrow', function (): void {
    [$runner, $context, $directory] = setup(static fn (): int => 202);
    expect($runner->run(now())['status'] === 'pending_validation', '202 classified');
    expect(!isset(json_decode(file_get_contents($directory.'/state/state.json'), true)['last_success']), '202 not confirmed');
    $runner->run(now('2026-10-21T09:00:00Z'));
    expect(count($context->submissions) === 2, 'pending may retry tomorrow');
});

test('exception messages and raw response content never reach proof or logs', function (): void {
    [$runner, $context, $directory] = setup(static function (): int { throw new RuntimeException('PRIVATE_KEY_SENTINEL raw response'); });
    $result = $runner->run(now());
    $all = json_encode($result).file_get_contents($directory.'/state/state.json').file_get_contents($directory.'/state/events.jsonl');
    expect($result['error_code'] === 'submission_exception', 'safe error code');
    expect(!str_contains($all, 'PRIVATE_KEY_SENTINEL') && !str_contains($all, 'PRIVATE_HTML_FIXTURE'), 'no sensitive raw content');
});

test('corrupt persisted state fails closed before HTTP', function (): void {
    [$runner, $context, $directory] = setup();
    mkdir($directory.'/state', 0700, true);
    file_put_contents($directory.'/state/state.json', '{not-json');
    expect($runner->run(now())['status'] === 'state_failed', 'state failure');
    expect($context->requests === [] && $context->submissions === [], 'state failure did not submit');
});

test('public summary has exact allowed fields and private state is inaccessible', function (): void {
    [$runner, $context, $directory] = setup();
    $runner->run(now());
    $public = json_decode(file_get_contents($directory.'/public-status.json'), true);
    expect(array_keys($public) === ['date', 'site', 'checkedAt', 'health', 'changed', 'productVersion', 'nativeVersion', 'engineStatus'], 'exact top-level whitelist');
    expect(array_keys($public['engineStatus']) === ['indexnow', 'google', 'baidu'], 'exact engine whitelist');
    expect($public['site'] === Runner::HOME && $public['health'] === 'degraded', 'expected no-OAuth degradation');
    expect((fileperms($directory.'/state') & 0777) === 0700 && (fileperms($directory.'/public-status.json') & 0777) === 0644, 'public/private permission split');
    expect(!isset($public['digest']) && !str_contains(json_encode($public), 'PRIVATE_HTML_FIXTURE'), 'no private content');
});

test('Baidu success has its own confirmed digest and daily deduplication', function (): void {
    $baiduCalls = 0;
    [$runner, $context, $directory] = setup(null, static function (array $urls) use (&$baiduCalls): array {
        expect($urls === [Runner::HOME], 'Baidu homepage scope');
        $baiduCalls++;
        return ['status' => 'received', 'http_status' => 200, 'success' => 1, 'remain' => 9, 'raw' => 'NEVER_SAVE_THIS'];
    });
    expect($runner->run(now())['baidu']['status'] === 'received', 'Baidu receipt');
    $runner->run(now());
    $runner->run(now('2026-10-21T09:00:00Z'));
    $state = json_decode(file_get_contents($directory.'/state/state.json'), true);
    expect($baiduCalls === 1 && isset($state['last_baidu_success']), 'Baidu success baseline');
    expect(!str_contains(json_encode($state), 'NEVER_SAVE_THIS'), 'adapter raw values stripped');
});

test('Baidu failure does not overwrite IndexNow success or falsely mark itself successful', function (): void {
    [$runner, $context, $directory] = setup(null, static fn (): array => ['status' => 'quota_exhausted', 'http_status' => 400, 'success' => 0, 'remain' => 0, 'error_code' => 400]);
    $result = $runner->run(now());
    $state = json_decode(file_get_contents($directory.'/state/state.json'), true);
    expect($result['status'] === 'submission_failed' && $result['exit_code'] === 3, 'partial failure is visible');
    expect(isset($state['last_success']) && !isset($state['last_baidu_success']), 'per-engine success state');
});

function makeBaidu(array $configuration, callable $transport): BaiduSubmitter
{
    global $temporaryRoot, $number;
    $number++;
    $directory = $temporaryRoot.'/'.$number.'/credentials';
    mkdir($directory, 0700, true);
    $file = $directory.'/baidu.json';
    file_put_contents($file, json_encode($configuration));
    chmod($file, 0600);
    return new BaiduSubmitter($file, $transport);
}

test('Baidu adapter accepts root credentials and sends only the canonical URL', function (): void {
    $adapter = makeBaidu(['site' => 'https://lolicode.com', 'token' => 'OFFLINE_FAKE_TOKEN'], static function (string $endpoint, string $body): array {
        expect(str_starts_with($endpoint, 'https://data.zz.baidu.com/urls?'), 'fixed HTTPS Baidu endpoint');
        parse_str(parse_url($endpoint, PHP_URL_QUERY), $query);
        expect($query['site'] === 'https://lolicode.com' && $body === Runner::HOME."\n", 'root-domain body');
        return ['status' => 200, 'body' => '{"success":1,"remain":9}'];
    });
    expect($adapter->submit([Runner::HOME]) === ['status' => 'received', 'http_status' => 200, 'success' => 1, 'remain' => 9], 'bounded parsed receipt');
});

test('Baidu adapter rejects tool-site credentials before transport', function (): void {
    $calls = 0;
    $adapter = makeBaidu(['site' => 'https://tools.treasuregrove.art', 'token' => 'OFFLINE_FAKE_TOKEN'], static function () use (&$calls): array {
        $calls++;
        return [];
    });
    expect($adapter->submit([Runner::HOME])['status'] === 'configuration_invalid' && $calls === 0, 'cross-site token configuration not reused');
});

test('Baidu quota and transport errors never expose response text or credential URL', function (): void {
    $adapter = makeBaidu(['site' => 'https://lolicode.com', 'token' => 'OFFLINE_FAKE_TOKEN'], static fn (): array => ['status' => 400, 'body' => '{"error":400,"message":"over quota PRIVATE_RESPONSE_SENTINEL"}']);
    $quota = $adapter->submit([Runner::HOME]);
    expect($quota['status'] === 'quota_exhausted' && $quota['error_code'] === 400, 'quota classified');
    expect(!str_contains(json_encode($quota), 'PRIVATE_RESPONSE_SENTINEL'), 'raw error omitted');
    $adapter = makeBaidu(['site' => 'https://lolicode.com', 'token' => 'OFFLINE_FAKE_TOKEN'], static function (string $endpoint): array { throw new RuntimeException($endpoint); });
    $error = $adapter->submit([Runner::HOME]);
    expect($error === ['status' => 'failed', 'error_code' => 'transport_failed'], 'transport sanitized');
});

echo json_encode(['passed' => $passed, 'failed' => $failed, 'real_http_calls' => 0, 'real_submission_calls' => 0], JSON_UNESCAPED_SLASHES), PHP_EOL;

// Remove only the fresh test tree, checking the resolved absolute root first.
if (dirname($temporaryRoot) === rtrim(sys_get_temp_dir(), '/\\') && str_starts_with(basename($temporaryRoot), 'lolicode-seo-offline-')) {
    $resolvedRoot = realpath($temporaryRoot);
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($resolvedRoot, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($iterator as $entry) {
        $path = $entry->getPathname();
        if (!str_starts_with($path, $resolvedRoot.DIRECTORY_SEPARATOR)) {
            throw new RuntimeException('Cleanup escaped isolated temporary directory');
        }
        $entry->isDir() && !$entry->isLink() ? rmdir($path) : unlink($path);
    }
    rmdir($temporaryRoot);
}
exit($failed === 0 ? 0 : 1);
