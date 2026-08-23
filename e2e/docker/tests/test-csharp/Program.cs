using System.Text.Json;
using System.Text;
using TestProject.Sdk;
using TestProject.Sdk.Models;
using Gql = TestProject.Sdk.Gql;
using Grpc = TestProject.Sdk.Grpc;
using Xunit;

namespace TestCsharp;

public class SdkIntegrationTests : IAsyncLifetime
{
    private static readonly string BaseUrl =
        Environment.GetEnvironmentVariable("MOCK_URL") ?? "http://localhost:4010";
    private static readonly string GqlUrl = $"{BaseUrl}/graphql";
    private static readonly string GqlWsUrl = GqlUrl.Replace("http://", "ws://").Replace("https://", "wss://");
    private static readonly string WsUrl =
        Environment.GetEnvironmentVariable("MOCK_WS_URL") ?? "ws://localhost:4010/ws";

    private RestApiV1 _rest = null!;
    private Graphql _gql = null!;
    private Grpc.Grpc _grpc = null!;

    public Task InitializeAsync()
    {
        _rest = new RestApiV1(baseUrl: BaseUrl);
        _gql = new Graphql(endpoint: GqlUrl, wsEndpoint: GqlWsUrl,
            reconnectInterval: TimeSpan.FromMilliseconds(50), maxReconnectAttempts: 5);
        _grpc = new Grpc.Grpc(address: BaseUrl);
        return Task.CompletedTask;
    }

    public Task DisposeAsync()
    {
        _rest.Dispose();
        _gql.Dispose();
        _grpc.Dispose();
        return Task.CompletedTask;
    }

    // ════════════════════════════════════════════════════════════
    // REST — typed responses via TestProjectClient SDK
    // ════════════════════════════════════════════════════════════

    [Fact]
    public async Task RestPetsList()
    {
        var r = await _rest.Pets.ListAsync();
        Assert.True(r.Data.Count >= 2);
        Assert.NotNull(r.Data[0].Name);
    }

    [Fact]
    public async Task RestPetsGet()
    {
        var r = await _rest.Pets.GetAsync("pet-1");
        Assert.Equal("Rex", r.Name);
    }

    [Fact]
    public async Task RestPetsCreate()
    {
        var r = await _rest.Pets.CreateAsync(new CreatePetRequest {
            Name = "CsPet",
            Species = "bird",
            ProfilePic = new FileUpload {
                FileName = "profile.png", Data = Encoding.UTF8.GetBytes("pet-avatar"), ContentType = "image/png"
            },
            Attachments = new List<FileUpload> {
                new() { FileName = "record.pdf", Data = Encoding.UTF8.GetBytes("pdf-file"), ContentType = "application/pdf" },
                new() { FileName = "notes.txt", Data = Encoding.UTF8.GetBytes("notes"), ContentType = "text/plain" }
            },
        });
        Assert.Equal("CsPet", r.Name);
        Assert.Equal("profile.png", r.ProfilePicFilename);
        Assert.Equal(10, r.ProfilePicSize);
        Assert.Equal("image/png", r.ProfilePicContentType);
        Assert.Equal(2, r.AttachmentCount);
        Assert.Equal(new[] { "application/pdf", "text/plain" }, r.AttachmentContentTypes);

        var raw = await _rest.Uploads.UploadFileAsync(new FileUpload {
            FileName = "raw.pdf", Data = Encoding.UTF8.GetBytes("raw-pdf"), ContentType = "application/pdf"
        });
        Assert.Equal(7, raw.Size);
        Assert.Equal("application/pdf", raw.ContentType);
    }

    [Fact]
    public async Task RestPetsDelete()
    {
        await _rest.Pets.DeleteAsync("pet-1");
    }

    [Fact]
    public async Task RestOwnersList()
    {
        var r = await _rest.Owners.ListAsync();
        Assert.True(r.Data.Count >= 1);
        Assert.NotNull(r.Data[0].Email);
    }

    [Fact]
    public async Task RestChunkedResponseStream()
    {
        var chunks = new List<byte[]>();
        await foreach (var chunk in _rest.RequestStreamAsync(HttpMethod.Get, "/pets/stream"))
            chunks.Add(chunk.ToArray());
        var body = Encoding.UTF8.GetString(chunks.SelectMany(chunk => chunk).ToArray());
        Assert.Contains("Rex", body);
        Assert.Contains("Whiskers", body);
        Assert.True(body.Split('\n', StringSplitOptions.RemoveEmptyEntries).Length >= 2);
    }

    [Fact]
    public async Task RestTimeoutOverride()
    {
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () =>
        {
            await foreach (var _ in _rest.RequestStreamAsync(
                HttpMethod.Get,
                "/transport/slow?delay=250",
                timeout: TimeSpan.FromMilliseconds(40))) { }
        });

        var body = new List<byte>();
        await foreach (var chunk in _rest.RequestStreamAsync(
            HttpMethod.Get,
            "/transport/slow?delay=100",
            timeout: TimeSpan.FromMilliseconds(500)))
            body.AddRange(chunk.ToArray());
        Assert.Contains("\"delayed\":100", Encoding.UTF8.GetString(body.ToArray()));
    }

    // ════════════════════════════════════════════════════════════
    // GraphQL — typed responses via Query Builder
    // ════════════════════════════════════════════════════════════

    // ─── Query ─────────────────────────────────────────

    [Fact]
    public async Task GqlQueryPetsWithPartialSelection()
    {
        var r = await _gql.QueryAsync<Gql.PetsQuery>(q =>
            q.Pets(new { limit = 10 }, p =>
                p.Data(d => d.Id().Name().Species()).NextCursor()
            )
        );

        Assert.NotNull(r.Pets);
        Assert.True(r.Pets.Data.Count >= 1);
        Assert.NotNull(r.Pets.Data[0].Id);
        Assert.NotNull(r.Pets.Data[0].Name);
        Assert.NotNull(r.Pets.Data[0].Species);
    }

    [Fact]
    public async Task GqlQuerySingleEntityWithRequiredArgs()
    {
        var r = await _gql.QueryAsync<Gql.PetQuery>(q =>
            q.Pet(new { id = "pet-1" }, p => p.Id().Name().Species())
        );

        Assert.NotNull(r.Pet);
        Assert.Equal("Rex", r.Pet!.Name);
    }

    [Fact]
    public async Task GqlQueryNoArgsOverload()
    {
        var r = await _gql.QueryAsync<Gql.PetsQuery>(q =>
            q.Pets(p => p.Data(d => d.Id().Name()))
        );

        Assert.True(r.Pets.Data.Count >= 1);
    }

    [Fact]
    public async Task GqlQueryNestedSelection()
    {
        var r = await _gql.QueryAsync<Gql.OwnersQuery>(q =>
            q.Owners(new { limit = 5 }, o =>
                o.Data(d =>
                    d
                        .Id()
                        .Name()
                        .Pets(p => p.Id().Name().Species())
                )
            )
        );

        Assert.NotNull(r.Owners.Data[0].Id);
        Assert.NotNull(r.Owners.Data[0].Pets);
    }

    // ─── Mutation ──────────────────────────────────────

    [Fact]
    public async Task GqlMutateCreateWithFieldSelection()
    {
        var r = await _gql.MutateAsync<Gql.CreatePetMutation>(m =>
            m.CreatePet(new { input = new { name = "BuilderPet", species = "DOG" } }, p =>
                p.Id().Name().Species()
            )
        );

        Assert.NotNull(r.CreatePet);
        Assert.NotNull(r.CreatePet.Name);
        Assert.NotNull(r.CreatePet.Species);
    }

    [Fact]
    public async Task GqlMutateScalarReturn()
    {
        var r = await _gql.MutateAsync<Gql.DeletePetMutation>(m =>
            m.DeletePet(new { id = "pet-1" })
        );

        Assert.True(r.DeletePet);
    }

    [Fact]
    public async Task GqlMutateMultipleMutations()
    {
        var r = await _gql.MutateAsync<JsonElement>(m =>
            m
                .CreatePet(new { input = new { name = "Multi1", species = "CAT" } }, p => p.Id().Name())
                .CreateOwner(new { input = new { name = "OwnerX", email = "ox@test.com" } }, o =>
                    o.Id().Name().Email()
                )
        );

        Assert.NotNull(r.GetProperty("createPet").GetProperty("name").GetString());
        Assert.NotNull(r.GetProperty("createOwner").GetProperty("email").GetString());
    }

    // ─── Subscription (real WebSocket via graphql-ws) ──

    [Fact]
    public async Task GqlSubscribePetAdopted()
    {
        var evt = await _gql.SubscribeOnceAsync<Gql.PetAdoptedSubscription>(s =>
            s.PetAdopted(new { species = "DOG" }, p => p.Id().Name().Species())
        );

        Assert.NotNull(evt.PetAdopted);
        Assert.Equal("Rex", evt.PetAdopted.Name);
        Assert.Equal(Gql.Species.DOG, evt.PetAdopted.Species);
    }

    [Fact]
    public async Task GqlSubscribeOwnerActivity()
    {
        var evt = await _gql.SubscribeOnceAsync<Gql.OwnerActivitySubscription>(s =>
            s.OwnerActivity(new { ownerId = "owner-1" }, o => o.Id().Name().Email())
        );

        Assert.NotNull(evt.OwnerActivity);
        Assert.Equal("Alice", evt.OwnerActivity.Name);
        Assert.Equal("alice@example.com", evt.OwnerActivity.Email);
    }

    [Fact]
    public async Task GqlSubscribeUnsubscribeStopsEvents()
    {
        var eventCount = 0;
        var unsubscribe = _gql.Subscribe(
            s => s.PetAdopted(p => p.Id().Name()),
            _ => { Interlocked.Increment(ref eventCount); }
        );

        await Task.Delay(500);
        unsubscribe();
        var countAfterUnsub = eventCount;
        await Task.Delay(500);
        Assert.Equal(countAfterUnsub, eventCount);
    }

    // ════════════════════════════════════════════════════════════
    // WebSocket — typed messages via WsClient SDK
    // ════════════════════════════════════════════════════════════

    [Fact]
    public async Task WsConnectAndReceivePresence()
    {
        var ws = new WebsocketApi(url: WsUrl, reconnect: true,
            reconnectInterval: TimeSpan.FromMilliseconds(50), maxReconnectAttempts: 5);
        var tcs = new TaskCompletionSource<JsonElement>();
        using var cts = new CancellationTokenSource(5000);
        cts.Token.Register(() => tcs.TrySetException(new TimeoutException("timeout")));

        ws.OnChatPresence(msg =>
        {
            tcs.TrySetResult(msg);
        });

        await ws.ConnectAsync();

        var msg = await tcs.Task;
        Assert.Equal("server", msg.GetProperty("userId").GetString());
        Assert.Equal("online", msg.GetProperty("status").GetString());

        await ws.SendChatMessagesAsync(new { text = "hello from generated SDK" });
        await ws.DisconnectAsync();
    }

    [Fact]
    public void WsClientHasChannelMethods()
    {
        var ws = new WebsocketApi(url: WsUrl, reconnect: false);

        Assert.NotNull(typeof(WebsocketApi).GetMethod("ConnectAsync"));
        Assert.NotNull(typeof(WebsocketApi).GetMethod("DisconnectAsync"));
        Assert.NotNull(typeof(WebsocketApi).GetMethod("SendAsync"));
        Assert.NotNull(typeof(WebsocketApi).GetMethod("Subscribe"));
        Assert.NotNull(typeof(WebsocketApi).GetMethod("OnChatPresence"));
        Assert.NotNull(typeof(WebsocketApi).GetMethod("SendChatMessagesAsync"));

        ws.Dispose();
    }

    // ════════════════════════════════════════════════════════════
    // gRPC — typed responses via PetServiceClient / OwnerServiceClient
    // ════════════════════════════════════════════════════════════

    [Fact]
    public async Task GrpcPetServiceListPets()
    {
        var r = await _grpc.ListPetsAsync(new Grpc.ListPetsRequest());
        Assert.NotNull(r.Data);
        Assert.True(r.Data.Count >= 2);
        Assert.NotNull(r.Data[0].Name);
    }

    [Fact]
    public async Task GrpcPetServiceGetPet()
    {
        var r = await _grpc.GetPetAsync(new Grpc.GetPetRequest { Id = "pet-1" });
        Assert.Equal("Rex", r.Name);
        Assert.Equal("pet-1", r.Id);
    }

    [Fact]
    public async Task GrpcPetServiceCreatePet()
    {
        var r = await _grpc.CreatePetAsync(new Grpc.CreatePetRequest
        {
            Name = "GrpcCsPet",
            Species = Grpc.Species.SPECIES_DOG
        });
        Assert.Equal("GrpcCsPet", r.Name);
        Assert.False(string.IsNullOrEmpty(r.Id));
    }

    [Fact]
    public async Task GrpcPetServiceDeletePet()
    {
        var r = await _grpc.DeletePetAsync(new Grpc.DeletePetRequest { Id = "pet-1" });
        Assert.NotNull(r);
    }

    [Fact]
    public async Task GrpcPetServiceWatchPets()
    {
        var pets = await _grpc.WatchPetsAsync(new Grpc.WatchPetsRequest());
        Assert.True(pets.Count >= 2);
        Assert.NotNull(pets[0].Name);
    }

    [Fact]
    public async Task GrpcOwnerServiceListOwners()
    {
        var r = await _grpc.ListOwnersAsync(new Grpc.ListOwnersRequest());
        Assert.NotNull(r.Data);
        Assert.True(r.Data.Count >= 1);
    }

    [Fact]
    public async Task GrpcOwnerServiceGetOwner()
    {
        var r = await _grpc.GetOwnerAsync(new Grpc.GetOwnerRequest { Id = "owner-1" });
        Assert.Equal("Alice", r.Name);
        Assert.Equal("alice@example.com", r.Email);
    }

    [Fact]
    public async Task GrpcOwnerServiceCreateOwner()
    {
        var r = await _grpc.CreateOwnerAsync(new Grpc.CreateOwnerRequest
        {
            Name = "GrpcOwner",
            Email = "grpc@test.com"
        });
        Assert.Equal("GrpcOwner", r.Name);
        Assert.Equal("grpc@test.com", r.Email);
        Assert.False(string.IsNullOrEmpty(r.Id));
    }
}
