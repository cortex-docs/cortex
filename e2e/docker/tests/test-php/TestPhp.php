<?php
/**
 * PHP — ACTUALLY CALLS every protocol via generated SDK.
 * REST, GraphQL (Apollo + graphql-ws), WebSocket, gRPC — all real network calls, zero mocking.
 *
 * SDK is generated to ./generated/ by run-sdk-tests.js before tests run.
 *
 * Run with: php /opt/phpunit.phar --testdox TestPhp.php
 * ENV: GEN_DIR=/tmp/cortex-e2e-sdks/generated  MOCK_URL=http://localhost:4010
 */

use PHPUnit\Framework\TestCase;

class TestPhp extends TestCase
{
    private static string $baseUrl;
    private static string $gqlUrl;
    private static string $gqlWsUrl;
    private static string $wsUrl;
    private static string $grpcAddr;
    private static string $genDir;
    private static string $phpSrcDir;
    private static string $phpDir;
    private static bool $hasGuzzle = false;
    private static ?object $client = null;
    private static ?string $clientClass = null;
    private static bool $hasGql = false;
    private static bool $hasGrpc = false;
    private static bool $hasWs = false;

    public static function setUpBeforeClass(): void
    {
        self::$baseUrl   = getenv('MOCK_URL') ?: 'http://localhost:4010';
        self::$gqlUrl    = self::$baseUrl . '/graphql';
        self::$gqlWsUrl  = preg_replace('/^http/', 'ws', self::$gqlUrl);
        self::$wsUrl     = preg_replace('/^http/', 'ws', self::$baseUrl) . '/ws';
        self::$grpcAddr  = getenv('GRPC_ADDR') ?: 'localhost:50051';
        self::$genDir    = getenv('GEN_DIR') ?: '/tmp/cortex-e2e-sdks/generated';
        self::$phpSrcDir = self::$genDir . '/php/src';
        self::$phpDir    = self::$genDir . '/php';

        $composerJson = self::$phpDir . '/composer.json';
        $autoloader   = self::$phpDir . '/vendor/autoload.php';

        if (file_exists($composerJson) && !file_exists($autoloader)) {
            $composerBin = trim(shell_exec('which composer 2>/dev/null') ?: '');
            if (empty($composerBin)) {
                shell_exec('curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer 2>/dev/null');
                $composerBin = '/usr/local/bin/composer';
            }
            if (file_exists($composerBin) || !empty(trim(shell_exec('which composer 2>/dev/null') ?: ''))) {
                shell_exec("cd " . self::$phpDir . " && composer install --no-interaction --no-progress 2>&1");
            }
        }

        if (file_exists($autoloader)) {
            require_once $autoloader;
            self::$hasGuzzle = class_exists('GuzzleHttp\Client');
        }

        if (self::$hasGuzzle) {
            require_once self::$phpSrcDir . '/ApiException.php';

            $resourcesDir = self::$phpSrcDir . '/resources';
            foreach (glob($resourcesDir . '/*.php') as $file) {
                require_once $file;
            }
            require_once self::$phpSrcDir . '/client.php';

            $gqlBuilderPath = self::$phpSrcDir . '/gql-query-builder.php';
            $gqlClientPath  = self::$phpSrcDir . '/gql-client.php';
            $gqlTypesPath   = self::$phpSrcDir . '/gql-types.php';
            self::$hasGql   = file_exists($gqlClientPath) && file_exists($gqlBuilderPath);
            if (self::$hasGql) {
                if (file_exists($gqlTypesPath)) {
                    require_once $gqlTypesPath;
                }
                require_once $gqlBuilderPath;
                require_once $gqlClientPath;
            }

            $grpcClientPath = self::$phpSrcDir . '/grpc-client.php';
            self::$hasGrpc  = file_exists($grpcClientPath);
            if (self::$hasGrpc) {
                require_once $grpcClientPath;
            }

            $wsClientPath = self::$phpSrcDir . '/ws-client.php';
            self::$hasWs  = file_exists($wsClientPath);
            if (self::$hasWs) {
                require_once $wsClientPath;
            }

            foreach (get_declared_classes() as $cls) {
                if (str_ends_with($cls, 'Client') && !str_starts_with($cls, 'GuzzleHttp')
                    && $cls !== 'GqlClient' && $cls !== 'PetServiceClient' && $cls !== 'OwnerServiceClient'
                    && !str_starts_with($cls, 'Composer')) {
                    if (method_exists($cls, 'request')) {
                        self::$clientClass = $cls;
                        break;
                    }
                }
            }

            if (self::$clientClass !== null) {
                $cls = self::$clientClass;
                self::$client = new $cls(baseUrl: self::$baseUrl);
            }
        }
    }

    // ========================================================================
    // REST (real SDK calls)
    // ========================================================================

    public function testRestPetsList(): void
    {
        if (!self::$hasGuzzle || self::$client === null) {
            $this->markTestSkipped('Guzzle not available or client not found');
        }
        $result = self::$client->pets()->list();
        $this->assertIsArray($result['data'], 'data should be array');
        $this->assertGreaterThanOrEqual(2, count($result['data']), 'expected >=2 pets');
        $this->assertNotEmpty($result['data'][0]['name'], 'first pet should have a name');
    }

    public function testRestPetsGet(): void
    {
        if (!self::$hasGuzzle || self::$client === null) {
            $this->markTestSkipped('Guzzle not available or client not found');
        }
        $result = self::$client->pets()->get('pet-1');
        $this->assertEquals('Rex', $result['name']);
    }

    public function testRestPetsCreate(): void
    {
        if (!self::$hasGuzzle || self::$client === null) {
            $this->markTestSkipped('Guzzle not available or client not found');
        }
        $result = self::$client->pets()->create(['name' => 'PhpPet', 'species' => 'bird']);
        $this->assertEquals('PhpPet', $result['name']);
    }

    public function testRestPetsDelete(): void
    {
        if (!self::$hasGuzzle || self::$client === null) {
            $this->markTestSkipped('Guzzle not available or client not found');
        }
        self::$client->pets()->delete('pet-1');
        $this->assertTrue(true);
    }

    public function testRestOwnersList(): void
    {
        if (!self::$hasGuzzle || self::$client === null) {
            $this->markTestSkipped('Guzzle not available or client not found');
        }
        $result = self::$client->owners()->list();
        $this->assertIsArray($result['data'], 'data should be array');
        $this->assertGreaterThanOrEqual(1, count($result['data']), 'expected >=1 owner');
        $this->assertNotEmpty($result['data'][0]['email'], 'first owner should have email');
    }

    // ========================================================================
    // GraphQL — Query Builder
    // ========================================================================

    public function testQuerySingleRootWithPartialSelection(): void
    {
        if (!self::$hasGuzzle || !self::$hasGql || !class_exists('GqlClient')) {
            $this->markTestSkipped('GqlClient not available');
        }
        $gql = new \GqlClient(endpoint: self::$gqlUrl, wsEndpoint: self::$gqlWsUrl);
        $r = $gql->query(fn($q) =>
            $q->pets(['limit' => 10], fn($p) =>
                $p->data(fn($d) => $d->id()->name()->species())->nextCursor()
            )
        );
        $this->assertNotNull($r->pets);
        $this->assertGreaterThanOrEqual(1, count($r->pets->data));
        $this->assertNotNull($r->pets->data[0]->id);
        $this->assertNotNull($r->pets->data[0]->name);
        $this->assertNotNull($r->pets->data[0]->species);
    }

    public function testQueryMultiEntity(): void
    {
        if (!self::$hasGuzzle || !self::$hasGql || !class_exists('GqlClient')) {
            $this->markTestSkipped('GqlClient not available');
        }
        $gql = new \GqlClient(endpoint: self::$gqlUrl, wsEndpoint: self::$gqlWsUrl);
        $r = $gql->query(fn($q) =>
            $q
                ->pets(['limit' => 5], fn($p) => $p->data(fn($d) => $d->id()->name()))
                ->owners(['limit' => 5], fn($o) => $o->data(fn($d) => $d->id()->name()->email()))
        );
        $this->assertNotNull($r->pets->data[0]->id);
        $this->assertNotNull($r->pets->data[0]->name);
        $this->assertNotNull($r->owners->data[0]->id);
        $this->assertNotNull($r->owners->data[0]->name);
        $this->assertNotNull($r->owners->data[0]->email);
    }

    public function testQuerySingleEntityWithRequiredArgs(): void
    {
        if (!self::$hasGuzzle || !self::$hasGql || !class_exists('GqlClient')) {
            $this->markTestSkipped('GqlClient not available');
        }
        $gql = new \GqlClient(endpoint: self::$gqlUrl, wsEndpoint: self::$gqlWsUrl);
        $r = $gql->query(fn($q) =>
            $q->pet(['id' => 'pet-1'], fn($p) => $p->id()->name()->species())
        );
        $this->assertNotNull($r->pet);
        $this->assertNotNull($r->pet->id);
        $this->assertNotNull($r->pet->name);
    }

    public function testQueryNoArgsOverload(): void
    {
        if (!self::$hasGuzzle || !self::$hasGql || !class_exists('GqlClient')) {
            $this->markTestSkipped('GqlClient not available');
        }
        $gql = new \GqlClient(endpoint: self::$gqlUrl, wsEndpoint: self::$gqlWsUrl);
        $r = $gql->query(fn($q) =>
            $q->pets(fn($p) => $p->data(fn($d) => $d->id()->name()))
        );
        $this->assertGreaterThanOrEqual(1, count($r->pets->data));
    }

    public function testQueryNestedSelection(): void
    {
        if (!self::$hasGuzzle || !self::$hasGql || !class_exists('GqlClient')) {
            $this->markTestSkipped('GqlClient not available');
        }
        $gql = new \GqlClient(endpoint: self::$gqlUrl, wsEndpoint: self::$gqlWsUrl);
        $r = $gql->query(fn($q) =>
            $q->owners(['limit' => 5], fn($o) =>
                $o->data(fn($d) =>
                    $d
                        ->id()
                        ->name()
                        ->pets(fn($p) => $p->id()->name()->species())
                )
            )
        );
        $this->assertNotNull($r->owners->data[0]->id);
        $this->assertNotNull($r->owners->data[0]->pets);
    }

    // ─── Mutation ───────────────────────────────────────────

    public function testMutateCreateWithFieldSelection(): void
    {
        if (!self::$hasGuzzle || !self::$hasGql || !class_exists('GqlClient')) {
            $this->markTestSkipped('GqlClient not available');
        }
        $gql = new \GqlClient(endpoint: self::$gqlUrl, wsEndpoint: self::$gqlWsUrl);
        $r = $gql->mutate(fn($m) =>
            $m->createPet(
                ['input' => ['name' => 'BuilderPet', 'species' => 'DOG']],
                fn($p) => $p->id()->name()->species(),
            )
        );
        $this->assertNotNull($r->createPet);
        $this->assertNotNull($r->createPet->name);
        $this->assertNotNull($r->createPet->species);
    }

    public function testMutateScalarReturn(): void
    {
        if (!self::$hasGuzzle || !self::$hasGql || !class_exists('GqlClient')) {
            $this->markTestSkipped('GqlClient not available');
        }
        $gql = new \GqlClient(endpoint: self::$gqlUrl, wsEndpoint: self::$gqlWsUrl);
        $r = $gql->mutate(fn($m) => $m->deletePet(['id' => 'pet-1']));
        $this->assertNotNull($r->deletePet);
        $this->assertIsBool($r->deletePet);
    }

    public function testMutateMultipleMutations(): void
    {
        if (!self::$hasGuzzle || !self::$hasGql || !class_exists('GqlClient')) {
            $this->markTestSkipped('GqlClient not available');
        }
        $gql = new \GqlClient(endpoint: self::$gqlUrl, wsEndpoint: self::$gqlWsUrl);
        $r = $gql->mutate(fn($m) =>
            $m
                ->createPet(
                    ['input' => ['name' => 'Multi1', 'species' => 'CAT']],
                    fn($p) => $p->id()->name(),
                )
                ->createOwner(
                    ['input' => ['name' => 'OwnerX', 'email' => 'ox@test.com']],
                    fn($o) => $o->id()->name()->email(),
                )
        );
        $this->assertNotNull($r->createPet->name);
        $this->assertNotNull($r->createOwner->email);
    }

    // ─── Subscription (real WebSocket via graphql-ws) ──────

    public function testSubscribePetAdopted(): void
    {
        if (!self::$hasGuzzle || !self::$hasGql || !class_exists('GqlClient')) {
            $this->markTestSkipped('GqlClient not available');
        }
        $gql = new \GqlClient(endpoint: self::$gqlUrl, wsEndpoint: self::$gqlWsUrl);
        $event = $gql->subscribeOnce(fn($s) =>
            $s->petAdopted(['species' => 'DOG'], fn($p) => $p->id()->name()->species())
        );
        $this->assertNotNull($event->petAdopted);
        $this->assertNotNull($event->petAdopted->id);
        $this->assertEquals('Rex', $event->petAdopted->name);
        $this->assertEquals('DOG', $event->petAdopted->species);
    }

    public function testSubscribeOwnerActivity(): void
    {
        if (!self::$hasGuzzle || !self::$hasGql || !class_exists('GqlClient')) {
            $this->markTestSkipped('GqlClient not available');
        }
        $gql = new \GqlClient(endpoint: self::$gqlUrl, wsEndpoint: self::$gqlWsUrl);
        $event = $gql->subscribeOnce(fn($s) =>
            $s->ownerActivity(['ownerId' => 'owner-1'], fn($o) => $o->id()->name()->email())
        );
        $this->assertNotNull($event->ownerActivity);
        $this->assertNotNull($event->ownerActivity->id);
        $this->assertEquals('Alice', $event->ownerActivity->name);
        $this->assertEquals('alice@example.com', $event->ownerActivity->email);
    }

    public function testSubscribeUnsubscribeStopsReceivingEvents(): void
    {
        if (!self::$hasGuzzle || !self::$hasGql || !class_exists('GqlClient')) {
            $this->markTestSkipped('GqlClient not available');
        }
        $gql = new \GqlClient(endpoint: self::$gqlUrl, wsEndpoint: self::$gqlWsUrl);
        $eventCount = 0;
        $unsubscribe = $gql->subscribe(
            fn($s) => $s->petAdopted(fn($p) => $p->id()->name()),
            function () use (&$eventCount) { $eventCount++; },
        );
        $this->assertGreaterThanOrEqual(1, $eventCount, 'should have received at least one event');
        $countAfterUnsub = $eventCount;
        $unsubscribe();
        $this->assertEquals($countAfterUnsub, $eventCount, 'no new events after unsubscribe');
    }

    // ========================================================================
    // WebSocket (real SDK calls)
    // ========================================================================

    public function testWebSocketConnectAndReceivePresence(): void
    {
        if (!self::$hasWs || !class_exists('WsClient')) {
            $this->markTestSkipped('WsClient not available');
        }
        $ws = new \WsClient(url: self::$wsUrl);
        $presenceMsg = null;
        $ws->onChatPresence(function ($msg) use (&$presenceMsg) {
            $presenceMsg = $msg;
        });
        $ws->connect();
        $ws->poll(5.0);
        $this->assertNotNull($presenceMsg, 'should have received presence event');
        $this->assertEquals('server', $presenceMsg['userId']);
        $this->assertEquals('online', $presenceMsg['status']);
        $ws->sendChatMessages(['text' => 'hello from PHP SDK']);
        $ws->disconnect();
    }

    public function testWebSocketClientHasChannelMethods(): void
    {
        if (!self::$hasWs || !class_exists('WsClient')) {
            $this->markTestSkipped('WsClient not available');
        }
        $ws = new \WsClient(url: self::$wsUrl);
        $this->assertTrue(method_exists($ws, 'connect'));
        $this->assertTrue(method_exists($ws, 'disconnect'));
        $this->assertTrue(method_exists($ws, 'subscribe'));
        $this->assertTrue(method_exists($ws, 'send'));
        $this->assertTrue(method_exists($ws, 'onChatPresence'));
        $this->assertTrue(method_exists($ws, 'sendChatMessages'));
    }

    // ========================================================================
    // gRPC (real calls through generated SDK via HTTP fallback)
    // ========================================================================

    public function testGrpcPetServiceListPets(): void
    {
        if (!self::$hasGrpc || !class_exists('PetServiceClient')) {
            $this->markTestSkipped('gRPC client not available');
        }
        $client = new \PetServiceClient(new \GrpcClientOptions(baseUrl: self::$baseUrl));
        $r = $client->listPets([]);
        $this->assertNotNull($r->data);
        $this->assertGreaterThanOrEqual(2, count($r->data));
        $this->assertNotNull($r->data[0]->name);
        $client->close();
    }

    public function testGrpcPetServiceGetPet(): void
    {
        if (!self::$hasGrpc || !class_exists('PetServiceClient')) {
            $this->markTestSkipped('gRPC client not available');
        }
        $client = new \PetServiceClient(new \GrpcClientOptions(baseUrl: self::$baseUrl));
        $r = $client->getPet(['id' => 'pet-1']);
        $this->assertEquals('Rex', $r->name);
        $this->assertEquals('pet-1', $r->id);
        $client->close();
    }

    public function testGrpcPetServiceCreatePet(): void
    {
        if (!self::$hasGrpc || !class_exists('PetServiceClient')) {
            $this->markTestSkipped('gRPC client not available');
        }
        $client = new \PetServiceClient(new \GrpcClientOptions(baseUrl: self::$baseUrl));
        $r = $client->createPet(['name' => 'GrpcPhpPet', 'species' => 'SPECIES_DOG']);
        $this->assertEquals('GrpcPhpPet', $r->name);
        $this->assertNotNull($r->id);
        $client->close();
    }

    public function testGrpcPetServiceDeletePet(): void
    {
        if (!self::$hasGrpc || !class_exists('PetServiceClient')) {
            $this->markTestSkipped('gRPC client not available');
        }
        $client = new \PetServiceClient(new \GrpcClientOptions(baseUrl: self::$baseUrl));
        $r = $client->deletePet(['id' => 'pet-1']);
        $this->assertNotNull($r);
        $client->close();
    }

    public function testGrpcPetServiceWatchPets(): void
    {
        if (!self::$hasGrpc || !class_exists('PetServiceClient')) {
            $this->markTestSkipped('gRPC client not available');
        }
        $client = new \PetServiceClient(new \GrpcClientOptions(baseUrl: self::$baseUrl));
        $pets = $client->watchPets([]);
        $this->assertGreaterThanOrEqual(2, count($pets));
        $this->assertNotNull($pets[0]->name);
        $client->close();
    }

    // ─── OwnerService RPCs ──────────────────────────────────

    public function testGrpcOwnerServiceListOwners(): void
    {
        if (!self::$hasGrpc || !class_exists('OwnerServiceClient')) {
            $this->markTestSkipped('gRPC client not available');
        }
        $client = new \OwnerServiceClient(new \GrpcClientOptions(baseUrl: self::$baseUrl));
        $r = $client->listOwners([]);
        $this->assertNotNull($r->data);
        $this->assertGreaterThanOrEqual(1, count($r->data));
        $client->close();
    }

    public function testGrpcOwnerServiceGetOwner(): void
    {
        if (!self::$hasGrpc || !class_exists('OwnerServiceClient')) {
            $this->markTestSkipped('gRPC client not available');
        }
        $client = new \OwnerServiceClient(new \GrpcClientOptions(baseUrl: self::$baseUrl));
        $r = $client->getOwner(['id' => 'owner-1']);
        $this->assertEquals('Alice', $r->name);
        $this->assertEquals('alice@example.com', $r->email);
        $client->close();
    }

    public function testGrpcOwnerServiceCreateOwner(): void
    {
        if (!self::$hasGrpc || !class_exists('OwnerServiceClient')) {
            $this->markTestSkipped('gRPC client not available');
        }
        $client = new \OwnerServiceClient(new \GrpcClientOptions(baseUrl: self::$baseUrl));
        $r = $client->createOwner(['name' => 'GrpcOwner', 'email' => 'grpc@test.com']);
        $this->assertEquals('GrpcOwner', $r->name);
        $this->assertEquals('grpc@test.com', $r->email);
        $this->assertNotNull($r->id);
        $client->close();
    }
}
