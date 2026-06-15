package com.test.project;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

import com.test.project.grpc.*;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public class TestJava {

    static final String BASE_URL = System.getenv("MOCK_URL") != null
            ? System.getenv("MOCK_URL")
            : "http://localhost:4010";
    static final String GQL_URL = BASE_URL + "/graphql";
    static final String GQL_WS_URL = GQL_URL.replaceFirst("^http", "ws");
    static final String WS_URL = System.getenv("MOCK_WS_URL") != null
            ? System.getenv("MOCK_WS_URL")
            : "ws://localhost:4010/ws";

    static TestProjectClient rest;
    static GqlClient gql;
    static PetServiceClient petGrpc;
    static OwnerServiceClient ownerGrpc;

    @BeforeAll
    static void setUp() {
        rest = new TestProjectClient(BASE_URL, null, null);
        gql = new GqlClient(GQL_URL, GQL_WS_URL);
        petGrpc = new PetServiceClient(BASE_URL);
        ownerGrpc = new OwnerServiceClient(BASE_URL);
    }

    @AfterAll
    static void tearDown() throws Exception {
        gql.dispose();
        petGrpc.close();
        ownerGrpc.close();
    }

    // ─── REST ─────────────────────────────────────────────────────────

    @Test
    void restPetsList() throws Exception {
        var r = rest.getPets().list(null);
        assertTrue(r.getData().size() >= 2, "should have at least 2 pets");
        assertNotNull(r.getData().get(0).getName(), "first pet should have name");
    }

    @Test
    void restPetsGet() throws Exception {
        var r = rest.getPets().get("pet-1");
        assertEquals("Rex", r.getName(), "expected name Rex");
    }

    @Test
    void restPetsCreate() throws Exception {
        var r = rest.getPets().create(new com.test.project.models.CreatePetRequest().name("JavaPet").species("bird"));
        assertEquals("JavaPet", r.getName(), "expected name JavaPet");
    }

    @Test
    void restPetsDelete() throws Exception {
        rest.getPets().delete("pet-1");
    }

    @Test
    void restOwnersList() throws Exception {
        var r = rest.getOwners().list(null);
        assertTrue(r.getData().size() >= 1, "should have at least 1 owner");
        assertNotNull(r.getData().get(0).getEmail(), "first owner should have email");
    }

    @Test
    void restOwnersGet() throws Exception {
        var r = rest.getOwners().get("owner-1");
        assertNotNull(r.getId(), "owner should have id");
    }

    @Test
    void restOwnersCreate() throws Exception {
        var r = rest.getOwners().create(new com.test.project.models.CreateOwnerRequest().name("SDK Owner").email("sdk@test.com"));
        assertNotNull(r.getName(), "owner should have name");
    }

    // ─── GraphQL — Query Builder ──────────────────────────────────────

    @Test
    void graphqlQuerySingleRootWithPartialSelection() throws Exception {
        var r = gql.query(
                q -> q.pets(new PetsQueryVariables().limit(10), p -> p.data(d -> d.id().name().species()).nextCursor()),
                PetsQuery.class);
        assertNotNull(r.getPets(), "response should have pets");
        assertTrue(r.getPets().getData().size() >= 1, "should have at least 1 pet");
        assertNotNull(r.getPets().getData().get(0).getName(), "first pet should have name");
    }

    @Test
    void graphqlQueryMultiEntity() throws Exception {
        var pets = gql.query(
                q -> q.pets(new PetsQueryVariables().limit(5), p -> p.data(d -> d.id().name())),
                PetsQuery.class);
        var owners = gql.query(
                q -> q.owners(new OwnersQueryVariables().limit(5), o -> o.data(d -> d.id().name().email())),
                OwnersQuery.class);
        assertNotNull(pets.getPets(), "response should have pets");
        assertNotNull(owners.getOwners(), "response should have owners");
    }

    @Test
    void graphqlQuerySingleEntityWithRequiredArgs() throws Exception {
        var r = gql.query(
                q -> q.pet(new PetQueryVariables().id("pet-1"), p -> p.id().name().species()),
                PetQuery.class);
        assertNotNull(r.getPet(), "response should have pet");
        assertNotNull(r.getPet().getName(), "pet should have name");
    }

    @Test
    void graphqlQueryNoArgsOverload() throws Exception {
        var r = gql.query(q -> q.pets(p -> p.data(d -> d.id().name())), PetsQuery.class);
        assertTrue(r.getPets().getData().size() >= 1, "should have at least 1 pet");
    }

    @Test
    void graphqlQueryNestedSelection() throws Exception {
        var r = gql.query(
                q -> q.owners(new OwnersQueryVariables().limit(5),
                        o -> o.data(d -> d.id().name().pets(p -> p.id().name().species()))),
                OwnersQuery.class);
        assertNotNull(r.getOwners(), "response should have owners");
        assertNotNull(r.getOwners().getData().get(0).getId(), "first owner should have id");
    }

    // ─── GraphQL — Mutations ──────────────────────────────────────────

    @Test
    void graphqlMutateCreateWithFieldSelection() throws Exception {
        var r = gql.mutate(
                m -> m.createPet(
                        new CreatePetMutationVariables().input(new CreatePetInput().name("BuilderPet").species(Species.DOG)),
                        p -> p.id().name().species()),
                CreatePetMutation.class);
        assertNotNull(r.getCreatePet(), "response should have createPet");
        assertNotNull(r.getCreatePet().getName(), "created pet should have name");
    }

    @Test
    void graphqlMutateScalarReturn() throws Exception {
        var r = gql.mutate(
                m -> m.deletePet(new DeletePetMutationVariables().id("pet-1")),
                DeletePetMutation.class);
        assertNotNull(r.getDeletePet(), "response should have deletePet");
    }

    @Test
    void graphqlMutateMultipleMutationsInOneCall() throws Exception {
        var pet = gql.mutate(
                m -> m.createPet(
                        new CreatePetMutationVariables().input(new CreatePetInput().name("Multi1").species(Species.CAT)),
                        p -> p.id().name()),
                CreatePetMutation.class);
        var owner = gql.mutate(
                m -> m.createOwner(
                        new CreateOwnerMutationVariables().input(new CreateOwnerInput().name("OwnerX").email("ox@test.com")),
                        o -> o.id().name().email()),
                CreateOwnerMutation.class);
        assertNotNull(pet.getCreatePet(), "response should have createPet");
        assertNotNull(owner.getCreateOwner(), "response should have createOwner");
    }

    // ─── GraphQL — Subscriptions (real WebSocket via graphql-transport-ws) ──

    @Test
    void graphqlSubscribePetAdoptedReceivesEvent() throws Exception {
        var event = gql.subscribeOnce(
                s -> s.petAdopted(new PetAdoptedSubscriptionVariables().species(Species.DOG), p -> p.id().name().species()),
                PetAdoptedSubscription.class);
        assertNotNull(event.getPetAdopted(), "event should have petAdopted");
        assertNotNull(event.getPetAdopted().getId(), "pet should have id");
        assertEquals("Rex", event.getPetAdopted().getName(), "expected pet name Rex");
    }

    @Test
    void graphqlSubscribeOwnerActivityReceivesEvent() throws Exception {
        var event = gql.subscribeOnce(
                s -> s.ownerActivity(new OwnerActivitySubscriptionVariables().ownerId("owner-1"), o -> o.id().name().email()),
                OwnerActivitySubscription.class);
        assertNotNull(event.getOwnerActivity(), "event should have ownerActivity");
        assertNotNull(event.getOwnerActivity().getId(), "owner should have id");
        assertEquals("Alice", event.getOwnerActivity().getName(), "expected owner name Alice");
        assertEquals("alice@example.com", event.getOwnerActivity().getEmail(), "expected email");
    }

    @Test
    void graphqlSubscribeUnsubscribeStopsReceivingEvents() throws Exception {
        AtomicInteger eventCount = new AtomicInteger(0);
        Runnable unsubscribe = gql.subscribe(
                s -> s.petAdopted(p -> p.id().name()),
                data -> eventCount.incrementAndGet());
        Thread.sleep(500);
        unsubscribe.run();
        int countAfterUnsub = eventCount.get();
        Thread.sleep(500);
        assertEquals(countAfterUnsub, eventCount.get(), "should not receive events after unsubscribe");
    }

    // ─── WebSocket ────────────────────────────────────────────────────

    @Test
    void wsConnectAndReceivePresence() throws Exception {
        WsClient ws = new WsClient(WS_URL, true, 3000, 3);
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> receivedMsg = new AtomicReference<>();

        ws.onChatPresence(msg -> {
            receivedMsg.set(msg);
            latch.countDown();
        });

        ws.connect().get(5, TimeUnit.SECONDS);
        assertTrue(latch.await(5, TimeUnit.SECONDS), "should receive presence message");
        assertNotNull(receivedMsg.get(), "presence message should not be null");
        ws.disconnect();
    }

    @Test
    void wsClientHasChannelMethods() {
        WsClient ws = new WsClient(WS_URL);
        assertNotNull(ws);
        ws.onChatMessages(msg -> {
        });
        ws.onChatTyping(msg -> {
        });
        ws.onChatPresence(msg -> {
        });
    }

    @Test
    void wsSendMessage() throws Exception {
        WsClient ws = new WsClient(WS_URL, true, 3000, 3);
        ws.connect().get(5, TimeUnit.SECONDS);
        ws.sendChatMessages(Map.of("text", "hello from Java SDK"));
        ws.disconnect();
    }

    // ─── gRPC ──────────────────────────────────────────────────────────

    @Test
    void grpcPetServiceListPets() throws Exception {
        var r = petGrpc.listPets(new ListPetsRequest());
        assertTrue(r.getData().size() >= 2, "should have at least 2 pets");
        assertNotNull(r.getData().get(0).getName(), "first pet should have name");
    }

    @Test
    void grpcPetServiceGetPet() throws Exception {
        var r = petGrpc.getPet(new GetPetRequest().id("pet-1"));
        assertEquals("Rex", r.getName(), "expected name Rex");
    }

    @Test
    void grpcPetServiceCreatePet() throws Exception {
        var r = petGrpc.createPet(new CreatePetRequest().name("GrpcJavaPet"));
        assertNotNull(r.getId(), "created pet should have id");
    }

    @Test
    void grpcPetServiceDeletePet() throws Exception {
        petGrpc.deletePet(new DeletePetRequest().id("pet-1"));
    }

    @Test
    void grpcOwnerServiceListOwners() throws Exception {
        var r = ownerGrpc.listOwners(new ListOwnersRequest());
        assertTrue(r.getData().size() >= 1, "should have at least 1 owner");
    }

    @Test
    void grpcOwnerServiceGetOwner() throws Exception {
        var r = ownerGrpc.getOwner(new GetOwnerRequest().id("owner-1"));
        assertEquals("Alice", r.getName(), "expected name Alice");
        assertEquals("alice@example.com", r.getEmail(), "expected email");
    }

    @Test
    void grpcOwnerServiceCreateOwner() throws Exception {
        var r = ownerGrpc.createOwner(new CreateOwnerRequest().name("GrpcOwner").email("grpc@test.com"));
        assertNotNull(r.getId(), "created owner should have id");
    }
}
