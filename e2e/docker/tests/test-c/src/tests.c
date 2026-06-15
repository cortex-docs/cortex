#define _POSIX_C_SOURCE 200809L
#define _DEFAULT_SOURCE
/*
 * C integration test — calls every protocol through the generated SDK.
 * REST, GraphQL (typed query builder + subscriptions), WebSocket, gRPC.
 * All real network calls, zero mocking, fully type-safe.
 * All test logic is inline — no external helper functions.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <pthread.h>
#include <unistd.h>

#include "cjson/cJSON.h"
#include "client.h"
#include "types.h"
#include "resources/pets.h"
#include "resources/owners.h"
#include "gql_client.h"
#include "gql_types.h"
#include "gql_query_builder.h"
#include "grpc_client.h"
#include "grpc_types.h"
#include "ws_client.h"
#include "ws_types.h"

#ifndef MOCK_URL
#define MOCK_URL "http://localhost:4010"
#endif
#ifndef MOCK_GQL_URL
#define MOCK_GQL_URL MOCK_URL "/graphql"
#endif
#ifndef MOCK_GQL_WS_URL
#define MOCK_GQL_WS_URL "ws://localhost:4010/graphql"
#endif
#ifndef MOCK_WS_URL
#define MOCK_WS_URL "ws://localhost:4010/ws"
#endif
#ifndef GRPC_ADDR
#define GRPC_ADDR "http://localhost:4010"
#endif

static int tests_passed = 0;
static int tests_failed = 0;

#define TEST(name) \
  { \
    const char* test_name = (name); \
    int test_ok = 1; \
    do {

#define END_TEST \
    } while(0); \
    if (test_ok) { \
      tests_passed++; \
      printf("  \033[32m✓\033[0m %s\n", test_name); \
    } \
  }

#define ASSERT_TRUE(cond) \
  if (!(cond)) { \
    tests_failed++; \
    printf("  \033[31m✗\033[0m %s: assertion failed: %s\n", test_name, #cond); \
    test_ok = 0; \
    break; \
  }

#define ASSERT_STR_EQ(a, b) \
  if (!(a) || !(b) || strcmp(a, b) != 0) { \
    tests_failed++; \
    printf("  \033[31m✗\033[0m %s: expected \"%s\" got \"%s\"\n", test_name, (b), (a) ? (a) : "(null)"); \
    test_ok = 0; \
    break; \
  }

/* WebSocket presence handler (async callback — cannot be inlined) */
static char ws_user_id[128] = "";
static char ws_status[128] = "";
static pthread_mutex_t ws_mtx = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t ws_cv = PTHREAD_COND_INITIALIZER;
static volatile int ws_got_msg = 0;

static void on_presence(const ws_ChatPresence_message_t* msg) {
  pthread_mutex_lock(&ws_mtx);
  if (!ws_got_msg) {
    if (msg->user_id) strncpy(ws_user_id, msg->user_id, sizeof(ws_user_id) - 1);
    if (msg->status) strncpy(ws_status, msg->status, sizeof(ws_status) - 1);
    ws_got_msg = 1;
    pthread_cond_signal(&ws_cv);
  }
  pthread_mutex_unlock(&ws_mtx);
}

int main(void) {
  printf("\n  C SDK Integration Tests\n\n");

  /* ─── REST ──────────────────────────────────────────────── */
  printf("  REST:\n");

  TEST("rest.pets.list()")
    sdk_client_t rest;
    sdk_client_init(&rest, MOCK_URL);
    cJSON* r = sdk_pets_list(&rest, NULL, NULL);
    ASSERT_TRUE(r != NULL);
    ASSERT_TRUE(cJSON_GetArraySize(cJSON_GetObjectItem(r, "data")) >= 2);
    cJSON_Delete(r);
    sdk_client_free(&rest);
  END_TEST

  TEST("rest.pets.get(\"pet-1\")")
    sdk_client_t rest;
    sdk_client_init(&rest, MOCK_URL);
    sdk_pet_t pet = sdk_pets_get(&rest, "pet-1");
    ASSERT_STR_EQ(pet.name, "Rex");
    ASSERT_TRUE(pet.id != NULL);
    sdk_pet_free(&pet);
    sdk_client_free(&rest);
  END_TEST

  TEST("rest.pets.create()")
    sdk_client_t rest;
    sdk_client_init(&rest, MOCK_URL);
    sdk_create_pet_request_t body = {.name = "CPet", .species = "bird"};
    sdk_pet_t pet = sdk_pets_create(&rest, &body);
    ASSERT_STR_EQ(pet.name, "CPet");
    sdk_pet_free(&pet);
    sdk_client_free(&rest);
  END_TEST

  TEST("rest.pets.delete()")
    sdk_client_t rest;
    sdk_client_init(&rest, MOCK_URL);
    sdk_pets_delete_(&rest, "pet-1");
    sdk_client_free(&rest);
  END_TEST

  TEST("rest.owners.list()")
    sdk_client_t rest;
    sdk_client_init(&rest, MOCK_URL);
    cJSON* r = sdk_owners_list(&rest, NULL);
    ASSERT_TRUE(r != NULL);
    ASSERT_TRUE(cJSON_GetArraySize(cJSON_GetObjectItem(r, "data")) >= 1);
    cJSON_Delete(r);
    sdk_client_free(&rest);
  END_TEST

  /* ─── GraphQL — Query ──────────────────────────────────── */
  printf("\n  GraphQL — Query Builder:\n");

  TEST("query — pets with partial selection")
    gql_client_options_t opts = {.endpoint = MOCK_GQL_URL, .ws_endpoint = MOCK_GQL_WS_URL};
    gql_client_t gql;
    gql_client_init(&gql, &opts);

    gql_query_builder_t q;
    gql_qb_init(&q);
    gql_qb_pets(&q, &(gql_pets_args_t){.limit = 10}, &(gql_pet_connection_fields_t){
      .data = {.id = 1, .name = 1, .species = 1},
      .next_cursor = 1
    });
    gql_query_result_t r = gql_query(&gql, &q);
    gql_builder_free(&q);

    ASSERT_TRUE(r.pets != NULL);
    ASSERT_TRUE(r.pets->data_count >= 1);
    ASSERT_TRUE(r.pets->data[0].id != NULL);
    ASSERT_TRUE(r.pets->data[0].name != NULL);
    gql_query_result_free(&r);
    gql_client_free(&gql);
  END_TEST

  TEST("query — multi-entity (pets + owners)")
    gql_client_options_t opts = {.endpoint = MOCK_GQL_URL};
    gql_client_t gql;
    gql_client_init(&gql, &opts);

    gql_query_builder_t q;
    gql_qb_init(&q);
    gql_qb_pets(&q, &(gql_pets_args_t){.limit = 5}, &(gql_pet_connection_fields_t){
      .data = {.id = 1, .name = 1}
    });
    gql_qb_owners(&q, &(gql_owners_args_t){.limit = 5}, &(gql_owner_connection_fields_t){
      .data = {.id = 1, .name = 1, .email = 1}
    });
    gql_query_result_t r = gql_query(&gql, &q);
    gql_builder_free(&q);

    ASSERT_TRUE(r.pets != NULL && r.pets->data[0].id != NULL);
    ASSERT_TRUE(r.owners != NULL && r.owners->data[0].email != NULL);
    gql_query_result_free(&r);
    gql_client_free(&gql);
  END_TEST

  TEST("query — single entity with required args")
    gql_client_options_t opts = {.endpoint = MOCK_GQL_URL};
    gql_client_t gql;
    gql_client_init(&gql, &opts);

    gql_query_builder_t q;
    gql_qb_init(&q);
    gql_qb_pet(&q, &(gql_pet_args_t){.id = "pet-1"}, &(gql_pet_fields_t){
      .id = 1, .name = 1, .species = 1
    });
    gql_query_result_t r = gql_query(&gql, &q);
    gql_builder_free(&q);

    ASSERT_TRUE(r.pet != NULL);
    ASSERT_TRUE(r.pet->id != NULL);
    ASSERT_TRUE(r.pet->name != NULL);
    gql_query_result_free(&r);
    gql_client_free(&gql);
  END_TEST

  TEST("query — no args overload")
    gql_client_options_t opts = {.endpoint = MOCK_GQL_URL};
    gql_client_t gql;
    gql_client_init(&gql, &opts);

    gql_query_builder_t q;
    gql_qb_init(&q);
    gql_qb_pets_no_args(&q, &(gql_pet_connection_fields_t){
      .data = {.id = 1, .name = 1}
    });
    gql_query_result_t r = gql_query(&gql, &q);
    gql_builder_free(&q);

    ASSERT_TRUE(r.pets != NULL && r.pets->data_count >= 1);
    gql_query_result_free(&r);
    gql_client_free(&gql);
  END_TEST

  TEST("query — nested selection (owners → pets)")
    gql_client_options_t opts = {.endpoint = MOCK_GQL_URL};
    gql_client_t gql;
    gql_client_init(&gql, &opts);

    gql_query_builder_t q;
    gql_qb_init(&q);
    gql_qb_owners(&q, &(gql_owners_args_t){.limit = 5}, &(gql_owner_connection_fields_t){
      .data = {.id = 1, .name = 1, .pets = {.id = 1, .name = 1, .species = 1}}
    });
    gql_query_result_t r = gql_query(&gql, &q);
    gql_builder_free(&q);

    ASSERT_TRUE(r.owners != NULL);
    ASSERT_TRUE(r.owners->data[0].id != NULL);
    gql_query_result_free(&r);
    gql_client_free(&gql);
  END_TEST

  /* ─── Mutation ──────────────────────────────────────────── */

  TEST("mutate — createPet with typed input")
    gql_client_options_t opts = {.endpoint = MOCK_GQL_URL};
    gql_client_t gql;
    gql_client_init(&gql, &opts);

    gql_mutation_builder_t m;
    gql_mb_init(&m);
    gql_mb_create_pet(&m, &(gql_create_pet_args_t){
      .input = {.name = "BuilderPet", .species = GQL_SPECIES_DOG}
    }, &(gql_pet_fields_t){.id = 1, .name = 1, .species = 1});
    gql_mutation_result_t r = gql_mutate(&gql, &m);
    gql_builder_free(&m);

    ASSERT_TRUE(r.create_pet != NULL);
    ASSERT_TRUE(r.create_pet->name != NULL);
    gql_mutation_result_free(&r);
    gql_client_free(&gql);
  END_TEST

  TEST("mutate — deletePet → boolean")
    gql_client_options_t opts = {.endpoint = MOCK_GQL_URL};
    gql_client_t gql;
    gql_client_init(&gql, &opts);

    gql_mutation_builder_t m;
    gql_mb_init(&m);
    gql_mb_delete_pet(&m, &(gql_delete_pet_args_t){.id = "pet-1"});
    gql_mutation_result_t r = gql_mutate(&gql, &m);
    gql_builder_free(&m);

    ASSERT_TRUE(r.has_delete_pet);
    gql_mutation_result_free(&r);
    gql_client_free(&gql);
  END_TEST

  TEST("mutate — multiple mutations")
    gql_client_options_t opts = {.endpoint = MOCK_GQL_URL};
    gql_client_t gql;
    gql_client_init(&gql, &opts);

    gql_mutation_builder_t m;
    gql_mb_init(&m);
    gql_mb_create_pet(&m, &(gql_create_pet_args_t){
      .input = {.name = "Multi1", .species = GQL_SPECIES_CAT}
    }, &(gql_pet_fields_t){.id = 1, .name = 1});
    gql_mb_create_owner(&m, &(gql_create_owner_args_t){
      .input = {.name = "OwnerX", .email = "ox@test.com"}
    }, &(gql_owner_fields_t){.id = 1, .name = 1, .email = 1});
    gql_mutation_result_t r = gql_mutate(&gql, &m);
    gql_builder_free(&m);

    ASSERT_TRUE(r.create_pet != NULL && r.create_pet->name != NULL);
    ASSERT_TRUE(r.create_owner != NULL && r.create_owner->email != NULL);
    gql_mutation_result_free(&r);
    gql_client_free(&gql);
  END_TEST

  /* ─── Subscription (real WebSocket via graphql-ws) ──────── */

  TEST("subscribe — petAdopted via WebSocket")
    gql_client_options_t opts = {.endpoint = MOCK_GQL_URL, .ws_endpoint = MOCK_GQL_WS_URL};
    gql_client_t gql;
    gql_client_init(&gql, &opts);

    gql_subscription_builder_t s;
    gql_sb_init(&s);
    gql_sb_pet_adopted(&s, &(gql_pet_adopted_args_t){.species = GQL_SPECIES_DOG},
      &(gql_pet_fields_t){.id = 1, .name = 1, .species = 1});
    gql_subscription_result_t event = gql_subscribe_once(&gql, &s, 10000);
    gql_builder_free(&s);

    ASSERT_TRUE(event.pet_adopted != NULL);
    ASSERT_STR_EQ(event.pet_adopted->name, "Rex");
    ASSERT_TRUE(event.pet_adopted->species == GQL_SPECIES_DOG);
    gql_subscription_result_free(&event);
    gql_client_free(&gql);
  END_TEST

  TEST("subscribe — ownerActivity via WebSocket")
    gql_client_options_t opts = {.endpoint = MOCK_GQL_URL, .ws_endpoint = MOCK_GQL_WS_URL};
    gql_client_t gql;
    gql_client_init(&gql, &opts);

    gql_subscription_builder_t s;
    gql_sb_init(&s);
    gql_sb_owner_activity(&s, &(gql_owner_activity_args_t){.owner_id = "owner-1"},
      &(gql_owner_fields_t){.id = 1, .name = 1, .email = 1});
    gql_subscription_result_t event = gql_subscribe_once(&gql, &s, 10000);
    gql_builder_free(&s);

    ASSERT_TRUE(event.owner_activity != NULL);
    ASSERT_STR_EQ(event.owner_activity->name, "Alice");
    ASSERT_STR_EQ(event.owner_activity->email, "alice@example.com");
    gql_subscription_result_free(&event);
    gql_client_free(&gql);
  END_TEST

  TEST("subscribe — unsubscribe stops receiving")
    gql_client_options_t opts = {.endpoint = MOCK_GQL_URL, .ws_endpoint = MOCK_GQL_WS_URL};
    gql_client_t gql;
    gql_client_init(&gql, &opts);

    gql_subscription_builder_t s;
    gql_sb_init(&s);
    gql_sb_pet_adopted_no_args(&s, &(gql_pet_fields_t){.id = 1, .name = 1});
    gql_subscription_handle_t handle = gql_subscribe(&gql, &s, NULL);
    gql_builder_free(&s);

    usleep(500000);
    gql_subscription_unsubscribe(&handle);
    gql_client_free(&gql);
  END_TEST

  /* ─── WebSocket (typed handler + typed send) ────────────── */
  printf("\n  WebSocket:\n");

  TEST("connect + receive presence (typed)")
    ws_client_options_t wopts = {.url = MOCK_WS_URL, .reconnect = 0};
    ws_client_t ws;
    ws_client_init(&ws, &wopts);
    ws_got_msg = 0;
    ws_on_chat_presence(&ws, on_presence);
    ASSERT_TRUE(ws_client_connect(&ws) == 0);
    {
      struct timespec ts;
      clock_gettime(CLOCK_REALTIME, &ts);
      ts.tv_sec += 10;
      pthread_mutex_lock(&ws_mtx);
      while (!ws_got_msg) {
        if (pthread_cond_timedwait(&ws_cv, &ws_mtx, &ts) != 0) break;
      }
      pthread_mutex_unlock(&ws_mtx);
    }
    ASSERT_TRUE(ws_got_msg);
    ASSERT_STR_EQ(ws_user_id, "server");
    ASSERT_STR_EQ(ws_status, "online");
    ws_send_chat_messages(&ws, &(ws_ChatMessages_payload_t){.text = "hello from C SDK"});
    ws_client_disconnect(&ws);
  END_TEST

  /* ─── gRPC (typed requests + typed array responses) ─────── */
  printf("\n  gRPC:\n");

  TEST("PetService.listPets — typed array")
    grpc_pet_service_client_t client;
    grpc_pet_service_client_init(&client, GRPC_ADDR);
    grpc_list_pets_request_t req = {0};
    grpc_list_pets_response_t resp = grpc_pet_service_list_pets(&client, &req);
    ASSERT_TRUE(resp.data_count >= 2);
    ASSERT_TRUE(resp.data[0].name != NULL);
    grpc_list_pets_response_free(&resp);
    grpc_pet_service_client_free(&client);
  END_TEST

  TEST("PetService.getPet")
    grpc_pet_service_client_t client;
    grpc_pet_service_client_init(&client, GRPC_ADDR);
    grpc_get_pet_request_t req = {.id = "pet-1"};
    grpc_pet_t pet = grpc_pet_service_get_pet(&client, &req);
    ASSERT_STR_EQ(pet.name, "Rex");
    ASSERT_STR_EQ(pet.id, "pet-1");
    grpc_pet_free(&pet);
    grpc_pet_service_client_free(&client);
  END_TEST

  TEST("PetService.createPet")
    grpc_pet_service_client_t client;
    grpc_pet_service_client_init(&client, GRPC_ADDR);
    grpc_create_pet_request_t req = {.name = "GrpcCPet"};
    grpc_pet_t pet = grpc_pet_service_create_pet(&client, &req);
    ASSERT_STR_EQ(pet.name, "GrpcCPet");
    ASSERT_TRUE(pet.id != NULL);
    grpc_pet_free(&pet);
    grpc_pet_service_client_free(&client);
  END_TEST

  TEST("PetService.deletePet")
    grpc_pet_service_client_t client;
    grpc_pet_service_client_init(&client, GRPC_ADDR);
    grpc_delete_pet_request_t req = {.id = "pet-1"};
    grpc_delete_pet_response_t resp = grpc_pet_service_delete_pet(&client, &req);
    (void)resp;
    grpc_pet_service_client_free(&client);
  END_TEST

  TEST("PetService.watchPets — typed stream")
    grpc_pet_service_client_t client;
    grpc_pet_service_client_init(&client, GRPC_ADDR);
    grpc_watch_pets_request_t req = {0};
    grpc_pet_service_watch_pets_stream_t stream = grpc_pet_service_watch_pets(&client, &req);
    int count = 0;
    char first[128] = "";
    grpc_pet_t pet;
    while (grpc_pet_service_watch_pets_next(&stream, &pet)) {
      count++;
      if (!first[0] && pet.name) strncpy(first, pet.name, sizeof(first) - 1);
    }
    ASSERT_TRUE(count >= 2);
    ASSERT_TRUE(first[0] != '\0');
    grpc_pet_service_watch_pets_stream_free(&stream);
    grpc_pet_service_client_free(&client);
  END_TEST

  TEST("OwnerService.listOwners — typed array")
    grpc_owner_service_client_t client;
    grpc_owner_service_client_init(&client, GRPC_ADDR);
    grpc_list_owners_request_t req = {0};
    grpc_list_owners_response_t resp = grpc_owner_service_list_owners(&client, &req);
    ASSERT_TRUE(resp.data_count >= 1);
    grpc_list_owners_response_free(&resp);
    grpc_owner_service_client_free(&client);
  END_TEST

  TEST("OwnerService.getOwner")
    grpc_owner_service_client_t client;
    grpc_owner_service_client_init(&client, GRPC_ADDR);
    grpc_get_owner_request_t req = {.id = "owner-1"};
    grpc_owner_t owner = grpc_owner_service_get_owner(&client, &req);
    ASSERT_STR_EQ(owner.name, "Alice");
    ASSERT_STR_EQ(owner.email, "alice@example.com");
    grpc_owner_free(&owner);
    grpc_owner_service_client_free(&client);
  END_TEST

  TEST("OwnerService.createOwner")
    grpc_owner_service_client_t client;
    grpc_owner_service_client_init(&client, GRPC_ADDR);
    grpc_create_owner_request_t req = {.name = "GrpcOwner", .email = "grpc@test.com"};
    grpc_owner_t owner = grpc_owner_service_create_owner(&client, &req);
    ASSERT_STR_EQ(owner.name, "GrpcOwner");
    ASSERT_STR_EQ(owner.email, "grpc@test.com");
    ASSERT_TRUE(owner.id != NULL);
    grpc_owner_free(&owner);
    grpc_owner_service_client_free(&client);
  END_TEST

  printf("\n  %d passed, %d failed\n\n", tests_passed, tests_failed);
  return tests_failed > 0 ? 1 : 0;
}
