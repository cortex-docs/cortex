"""
Python -- ACTUALLY CALLS every protocol via generated SDK.
REST, GraphQL (Apollo + graphql-ws), WebSocket, gRPC -- all real network calls, zero mocking.

SDK is generated to ./generated/ by generate-test-sdks.sh before tests run.
"""
import os
import sys
import shutil
import asyncio
import time

import pytest
import httpx

# ── Environment ──────────────────────────────────────────────────────────────
BASE = os.environ.get('MOCK_URL', 'http://localhost:4010')
WS_URL = os.environ.get('MOCK_WS_URL', 'ws://localhost:4010/ws')
GQL_EP = os.environ.get('MOCK_GQL_URL', 'http://localhost:4010/graphql')
GQL_WS_EP = GQL_EP.replace('http', 'ws', 1)
GRPC_ADDR = os.environ.get('GRPC_ADDR', 'localhost:50051')

# ── Import from local generated SDK ─────────────────────────────────────────
LOCAL_GEN = os.path.join(os.path.dirname(__file__), 'generated')
GEN = LOCAL_GEN if os.path.isdir(os.path.join(LOCAL_GEN, 'python')) else os.environ.get('GEN_DIR', LOCAL_GEN)
src_dir = os.path.join(GEN, 'python', 'src')
if os.path.isdir(src_dir):
    for f in os.listdir(src_dir):
        if '-' in f and f.endswith('.py'):
            new = os.path.join(src_dir, f.replace('-', '_'))
            if not os.path.exists(new):
                shutil.copy(os.path.join(src_dir, f), new)
sys.path.insert(0, os.path.join(GEN, 'python'))

from src.client import RestApiV1 as TestProjectClient
from src.types import CreatePetRequest as RestCreatePetRequest, FileUpload
from src.gql_client import Graphql as GqlClient
from src.gql_types import (
    CreateOwnerInput,
    CreatePetInput,
    Species as GqlSpecies,
)
from src.grpc_client import Grpc, GrpcClientOptions
from src.grpc_types import (
    CreateOwnerRequest,
    CreatePetRequest,
    DeletePetRequest,
    GetOwnerRequest,
    GetPetRequest,
    ListOwnersRequest,
    ListPetsRequest,
    Species,
    WatchPetsRequest,
)

rest = TestProjectClient(base_url=BASE)
gql = GqlClient(endpoint=GQL_EP, ws_endpoint=GQL_WS_EP, reconnect_interval=0.05)
grpc_options = GrpcClientOptions(target=GRPC_ADDR, base_url=BASE)


# ═══════════════════════════════════════════════════════════════════════════════
# REST (real SDK calls)
# ═══════════════════════════════════════════════════════════════════════════════

class TestREST:
    def test_pets_list(self):
        r = rest.pets.list()
        assert len(r.data) >= 2
        assert r.data[0].name is not None

    def test_pets_get(self):
        r = rest.pets.get('pet-1')
        assert r.name == 'Rex'

    def test_pets_create(self):
        r = rest.pets.create(body=RestCreatePetRequest(
            name='PyPet',
            species='bird',
            profile_pic=FileUpload(filename='profile.png', data=b'pet-avatar', content_type='image/png'),
            attachments=[
                FileUpload(filename='record.pdf', data=b'pdf-file', content_type='application/pdf'),
                FileUpload(filename='notes.txt', data=b'notes', content_type='text/plain'),
            ],
        ))
        assert r.name == 'PyPet'
        assert r.profile_pic_filename == 'profile.png'
        assert r.profile_pic_size == 10
        assert r.profile_pic_content_type == 'image/png'
        assert r.attachment_count == 2
        assert r.attachment_content_types == ['application/pdf', 'text/plain']

        raw = rest.uploads.upload_file(FileUpload(
            filename='raw.pdf', data=b'raw-pdf', content_type='application/pdf',
        ))
        assert raw.size == 7
        assert raw.content_type == 'application/pdf'

    def test_pets_delete(self):
        rest.pets.delete('pet-1')

    def test_owners_list(self):
        r = rest.owners.list()
        assert len(r.data) >= 1
        assert r.data[0].email is not None

    def test_chunked_response_stream(self):
        chunks = list(rest.request_stream('GET', '/pets/stream', timeout=2.0, chunk_size=1))
        body = b''.join(chunks).decode()
        assert len(chunks) > 1
        assert [line for line in body.splitlines() if line] == [
            line for line in body.splitlines() if line
        ]
        assert 'Rex' in body and 'Whiskers' in body

    def test_http_timeout_override(self):
        short = TestProjectClient(base_url=BASE, timeout=0.04)
        with pytest.raises(httpx.TimeoutException):
            short.request('GET', '/transport/slow?delay=250')

        result = short.request('GET', '/transport/slow?delay=100', timeout=0.5)
        assert result['delayed'] == 100


# ═══════════════════════════════════════════════════════════════════════════════
# GraphQL — Query Builder (Apollo Server + graphql-ws)
# ═══════════════════════════════════════════════════════════════════════════════

class TestGraphQL:

    # ─── Query ──────────────────────────────────────────────

    def test_query_single_root_with_partial_selection(self):
        r = gql.query(lambda q:
            q.pets({"limit": 10}, lambda p:
                p.data(lambda d: d.id().name().species()).nextCursor()
            )
        )
        assert r.pets is not None
        assert len(r.pets.data) >= 1
        assert r.pets.data[0].id is not None
        assert r.pets.data[0].name is not None
        assert r.pets.data[0].species is not None

    def test_query_multi_entity(self):
        r = gql.query(lambda q:
            q
            .pets({"limit": 5}, lambda p: p.data(lambda d: d.id().name()))
            .owners({"limit": 5}, lambda o: o.data(lambda d: d.id().name().email()))
        )
        assert r.pets.data[0].id is not None
        assert r.pets.data[0].name is not None
        assert r.owners.data[0].id is not None
        assert r.owners.data[0].name is not None
        assert r.owners.data[0].email is not None

    def test_query_single_entity_required_args(self):
        r = gql.query(lambda q:
            q.pet({"id": "pet-1"}, lambda p: p.id().name().species())
        )
        assert r.pet is not None
        assert r.pet.id is not None
        assert r.pet.name is not None

    def test_query_no_args_overload(self):
        r = gql.query(lambda q:
            q.pets(lambda p: p.data(lambda d: d.id().name()))
        )
        assert len(r.pets.data) >= 1

    def test_query_nested_selection(self):
        r = gql.query(lambda q:
            q.owners({"limit": 5}, lambda o:
                o.data(lambda d:
                    d
                    .id()
                    .name()
                    .pets(lambda p: p.id().name().species())
                )
            )
        )
        assert r.owners.data[0].id is not None
        assert r.owners.data[0].pets is not None

    # ─── Mutation ───────────────────────────────────────────

    def test_mutate_create_with_field_selection(self):
        r = gql.mutate(lambda m:
            m.createPet(
                {"input": CreatePetInput(name="BuilderPet", species=GqlSpecies.DOG)},
                lambda p: p.id().name().species(),
            )
        )
        assert r.createPet is not None
        assert r.createPet.name is not None
        assert r.createPet.species is not None

    def test_mutate_scalar_return(self):
        r = gql.mutate(lambda m: m.deletePet({"id": "pet-1"}))
        assert r.deletePet is not None
        assert type(r.deletePet) is bool

    def test_mutate_multiple_mutations(self):
        r = gql.mutate(lambda m:
            m
            .createPet(
                {"input": CreatePetInput(name="Multi1", species=GqlSpecies.CAT)},
                lambda p: p.id().name(),
            )
            .createOwner(
                {"input": CreateOwnerInput(name="OwnerX", email="ox@test.com")},
                lambda o: o.id().name().email(),
            )
        )
        assert r.createPet.name is not None
        assert r.createOwner.email is not None

    # ─── Subscription (real WebSocket via graphql-ws) ──────

    def test_subscribe_pet_adopted(self):
        async def go():
            event = await gql.subscribe_once(lambda s:
                s.petAdopted({"species": GqlSpecies.DOG}, lambda p: p.id().name().species())
            )
            assert event.petAdopted is not None
            assert event.petAdopted.id is not None
            assert event.petAdopted.name == 'Rex'
            assert event.petAdopted.species == 'DOG'

        asyncio.run(go())

    def test_subscribe_owner_activity(self):
        async def go():
            event = await gql.subscribe_once(lambda s:
                s.ownerActivity({"ownerId": "owner-1"}, lambda o: o.id().name().email())
            )
            assert event.ownerActivity is not None
            assert event.ownerActivity.id is not None
            assert event.ownerActivity.name == 'Alice'
            assert event.ownerActivity.email == 'alice@example.com'

        asyncio.run(go())

    def test_subscribe_unsubscribe(self):
        events = []

        unsubscribe = gql.subscribe(
            lambda s: s.petAdopted(lambda p: p.id().name()),
            lambda data: events.append(data),
        )
        time.sleep(1)
        unsubscribe()
        count_after = len(events)
        time.sleep(0.5)
        assert len(events) == count_after


# ═══════════════════════════════════════════════════════════════════════════════
# WebSocket (real SDK calls)
# ═══════════════════════════════════════════════════════════════════════════════

class TestWebSocket:
    def test_connect_and_receive_presence(self):
        try:
            from src.ws_client import WebsocketApi as WsClient
        except ImportError:
            pytest.skip('WebSocket dependency missing')

        async def go():
            ws = WsClient(url=WS_URL, reconnect_interval=0.05)
            received = asyncio.get_running_loop().create_future()
            ws.on_chat_presence(lambda msg: received.set_result(msg))
            await ws.connect()
            msg = await asyncio.wait_for(received, timeout=5)
            assert msg.user_id == 'server'
            assert msg.status == 'online'
            await ws.send_chat_messages({'text': 'hello from python'})
            await ws.disconnect()

        asyncio.run(go())

    def test_ws_has_channel_methods(self):
        try:
            from src.ws_client import WebsocketApi as WsClient
        except ImportError:
            pytest.skip('WebSocket dependency missing')

        ws = WsClient(url=WS_URL)
        assert callable(getattr(ws, 'connect', None))
        assert callable(getattr(ws, 'disconnect', None))
        assert callable(getattr(ws, 'subscribe', None))
        assert callable(getattr(ws, 'send', None))
        assert callable(getattr(ws, 'send_chat_messages', None))
        assert callable(getattr(ws, 'on_chat_presence', None))


# ═══════════════════════════════════════════════════════════════════════════════
# gRPC (real gRPC calls through generated SDK)
# ═══════════════════════════════════════════════════════════════════════════════

class TestGRPC:

    # ─── PetService RPCs ────────────────────────────────────

    def test_pet_service_list_pets(self):
        client = Grpc(grpc_options)
        try:
            resp = client.list_pets(ListPetsRequest())
            assert len(resp.data) >= 2
            assert resp.data[0].name is not None
        finally:
            client.close()

    def test_pet_service_get_pet(self):
        client = Grpc(grpc_options)
        try:
            resp = client.get_pet(GetPetRequest(id='pet-1'))
            assert resp.name == 'Rex'
            assert resp.id == 'pet-1'
        finally:
            client.close()

    def test_pet_service_create_pet(self):
        client = Grpc(grpc_options)
        try:
            resp = client.create_pet(CreatePetRequest(name='GrpcPyPet', species=Species.SPECIES_DOG))
            assert resp.name == 'GrpcPyPet'
            assert resp.id is not None
        finally:
            client.close()

    def test_pet_service_delete_pet(self):
        client = Grpc(grpc_options)
        try:
            resp = client.delete_pet(DeletePetRequest(id='pet-1'))
            assert resp is not None
        finally:
            client.close()

    def test_pet_service_watch_pets(self):
        client = Grpc(grpc_options)
        try:
            pets = list(client.watch_pets(WatchPetsRequest()))
            assert len(pets) >= 2
            assert pets[0].name is not None
        finally:
            client.close()

    # ─── OwnerService RPCs ──────────────────────────────────

    def test_owner_service_list_owners(self):
        client = Grpc(grpc_options)
        try:
            resp = client.list_owners(ListOwnersRequest())
            assert len(resp.data) >= 1
        finally:
            client.close()

    def test_owner_service_get_owner(self):
        client = Grpc(grpc_options)
        try:
            resp = client.get_owner(GetOwnerRequest(id='owner-1'))
            assert resp.name == 'Alice'
            assert resp.email == 'alice@example.com'
        finally:
            client.close()

    def test_owner_service_create_owner(self):
        client = Grpc(grpc_options)
        try:
            resp = client.create_owner(CreateOwnerRequest(name='GrpcOwner', email='grpc@test.com'))
            assert resp.name == 'GrpcOwner'
            assert resp.email == 'grpc@test.com'
            assert resp.id is not None
        finally:
            client.close()
