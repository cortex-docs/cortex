#include <iostream>
#include <string>
#include <cassert>
#include <functional>
#include <chrono>
#include <thread>
#include <atomic>
#include <mutex>
#include <condition_variable>

#include "client.hpp"
#include "types.hpp"
#include "gql_client.hpp"
#include "gql_types.hpp"
#include "gql_query_builder.hpp"
#include "grpc_client.hpp"
#include "grpc_types.hpp"
#include "ws_client.hpp"
#include "ws_types.hpp"

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
    std::string test_name = (name); \
    try {

#define END_TEST \
      tests_passed++; \
      std::cout << "  \033[32m✓\033[0m " << test_name << std::endl; \
    } catch (const std::exception& e) { \
      tests_failed++; \
      std::cout << "  \033[31m✗\033[0m " << test_name << ": " << e.what() << std::endl; \
    } \
  }

#define ASSERT_TRUE(cond) \
  if (!(cond)) throw std::runtime_error("assertion failed: " #cond)

#define ASSERT_EQ(a, b) \
  do { \
    auto _a = (a); auto _b = (b); \
    if (_a != _b) throw std::runtime_error( \
      std::string("assertion failed: ") + #a " == " #b); \
  } while(0)

int main() {
  std::cout << "\n  C++ SDK Integration Tests\n" << std::endl;

  sdk::ClientOptions rest_opts{.base_url = MOCK_URL};
  sdk::gql::GqlClientOptions gql_opts{.endpoint = MOCK_GQL_URL, .ws_endpoint = MOCK_GQL_WS_URL};

  // ─── REST ─────────────────────────────────────────────────────────

  std::cout << "  REST:" << std::endl;

  TEST("rest.pets.list() — typed ListResponse")
    sdk::TestProjectClient rest(rest_opts);
    auto r = rest.pets.list();
    ASSERT_TRUE(r.data.size() >= 2);
    ASSERT_TRUE(!r.data[0].name.empty());
  END_TEST

  TEST("rest.pets.get() — typed Pet")
    sdk::TestProjectClient rest(rest_opts);
    sdk::Pet pet = rest.pets.get("pet-1");
    ASSERT_EQ(pet.name, std::string("Rex"));
    ASSERT_TRUE(!pet.id.empty());
  END_TEST

  TEST("rest.pets.create() — typed request + response")
    sdk::TestProjectClient rest(rest_opts);
    sdk::Pet pet = rest.pets.create({.name = "CppPet", .species = "bird"});
    ASSERT_EQ(pet.name, std::string("CppPet"));
  END_TEST

  TEST("rest.pets.delete()")
    sdk::TestProjectClient rest(rest_opts);
    rest.pets.delete_("pet-1");
  END_TEST

  TEST("rest.owners.list() — typed ListResponse")
    sdk::TestProjectClient rest(rest_opts);
    auto r = rest.owners.list();
    ASSERT_TRUE(r.data.size() >= 1);
    ASSERT_TRUE(!r.data[0].email.empty());
  END_TEST

  // ─── GraphQL — Query Builder ──────────────────────────────────────

  std::cout << "\n  GraphQL — Query Builder:" << std::endl;

  TEST("query — typed PetsQuery with typed variables")
    sdk::gql::GqlClient gql(gql_opts);
    auto r = gql.query<sdk::gql::PetsQuery>([](sdk::gql::QueryBuilder& q) {
      q.pets({.limit = 10}, [](sdk::gql::PetConnectionSelector& p) {
        p.data([](sdk::gql::PetSelector& d) { d.id().name().species(); }).next_cursor();
      });
    });
    ASSERT_TRUE(r.pets.data.size() >= 1);
    ASSERT_TRUE(!r.pets.data[0].id.empty());
    ASSERT_TRUE(!r.pets.data[0].name.empty());
  END_TEST

  TEST("query — typed multi-entity")
    sdk::gql::GqlClient gql(gql_opts);
    auto pets = gql.query<sdk::gql::PetsQuery>([](sdk::gql::QueryBuilder& q) {
      q.pets({.limit = 5}, [](sdk::gql::PetConnectionSelector& p) {
        p.data([](sdk::gql::PetSelector& d) { d.id().name(); });
      });
    });
    auto owners = gql.query<sdk::gql::OwnersQuery>([](sdk::gql::QueryBuilder& q) {
      q.owners({.limit = 5}, [](sdk::gql::OwnerConnectionSelector& o) {
        o.data([](sdk::gql::OwnerSelector& d) { d.id().name().email(); });
      });
    });
    ASSERT_TRUE(!pets.pets.data[0].id.empty());
    ASSERT_TRUE(!owners.owners.data[0].email.empty());
  END_TEST

  TEST("query — typed PetQuery with required args")
    sdk::gql::GqlClient gql(gql_opts);
    auto r = gql.query<sdk::gql::PetQuery>([](sdk::gql::QueryBuilder& q) {
      q.pet({.id = "pet-1"}, [](sdk::gql::PetSelector& p) { p.id().name().species(); });
    });
    ASSERT_TRUE(r.pet.has_value());
    ASSERT_TRUE(!r.pet->id.empty());
    ASSERT_TRUE(!r.pet->name.empty());
  END_TEST

  TEST("query — no-args overload")
    sdk::gql::GqlClient gql(gql_opts);
    auto r = gql.query<sdk::gql::PetsQuery>([](sdk::gql::QueryBuilder& q) {
      q.pets([](sdk::gql::PetConnectionSelector& p) {
        p.data([](sdk::gql::PetSelector& d) { d.id().name(); });
      });
    });
    ASSERT_TRUE(r.pets.data.size() >= 1);
  END_TEST

  TEST("query — typed nested selection (owners -> pets)")
    sdk::gql::GqlClient gql(gql_opts);
    auto r = gql.query<sdk::gql::OwnersQuery>([](sdk::gql::QueryBuilder& q) {
      q.owners({.limit = 5}, [](sdk::gql::OwnerConnectionSelector& o) {
        o.data([](sdk::gql::OwnerSelector& d) {
          d.id().name().pets([](sdk::gql::PetSelector& p) { p.id().name().species(); });
        });
      });
    });
    ASSERT_TRUE(!r.owners.data[0].id.empty());
    ASSERT_TRUE(!r.owners.data[0].name.empty());
  END_TEST

  // ─── Mutation ─────────────────────────────────────────

  TEST("mutate — typed CreatePetMutation")
    sdk::gql::GqlClient gql(gql_opts);
    auto r = gql.mutate<sdk::gql::CreatePetMutation>([](sdk::gql::MutationBuilder& m) {
      m.create_pet({.input = {.name = "BuilderPet", .species = sdk::gql::Species::DOG}},
        [](sdk::gql::PetSelector& p) { p.id().name().species(); });
    });
    ASSERT_TRUE(!r.create_pet.name.empty());
    ASSERT_TRUE(r.create_pet.species == sdk::gql::Species::DOG);
  END_TEST

  TEST("mutate — typed DeletePetMutation")
    sdk::gql::GqlClient gql(gql_opts);
    auto r = gql.mutate<sdk::gql::DeletePetMutation>([](sdk::gql::MutationBuilder& m) {
      m.delete_pet({.id = "pet-1"});
    });
    ASSERT_TRUE(r.delete_pet);
  END_TEST

  TEST("mutate — typed CreatePet + CreateOwner")
    sdk::gql::GqlClient gql(gql_opts);
    auto pet_r = gql.mutate<sdk::gql::CreatePetMutation>([](sdk::gql::MutationBuilder& m) {
      m.create_pet({.input = {.name = "Multi1", .species = sdk::gql::Species::CAT}},
        [](sdk::gql::PetSelector& p) { p.id().name(); });
    });
    ASSERT_TRUE(!pet_r.create_pet.name.empty());
    auto owner_r = gql.mutate<sdk::gql::CreateOwnerMutation>([](sdk::gql::MutationBuilder& m) {
      m.create_owner({.input = {.name = "OwnerX", .email = "ox@test.com"}},
        [](sdk::gql::OwnerSelector& o) { o.id().name().email(); });
    });
    ASSERT_TRUE(!owner_r.create_owner.email.empty());
  END_TEST

  // ─── Subscription ─────────────────────────────────────

  TEST("subscribe — typed PetAdoptedSubscription")
    sdk::gql::GqlClient gql(gql_opts);
    auto event = gql.subscribe_once<sdk::gql::PetAdoptedSubscription>([](sdk::gql::SubscriptionBuilder& s) {
      s.pet_adopted({.species = sdk::gql::Species::DOG},
        [](sdk::gql::PetSelector& p) { p.id().name().species(); });
    });
    ASSERT_TRUE(!event.pet_adopted.id.empty());
    ASSERT_EQ(event.pet_adopted.name, std::string("Rex"));
    ASSERT_TRUE(event.pet_adopted.species == sdk::gql::Species::DOG);
  END_TEST

  TEST("subscribe — typed OwnerActivitySubscription")
    sdk::gql::GqlClient gql(gql_opts);
    auto event = gql.subscribe_once<sdk::gql::OwnerActivitySubscription>([](sdk::gql::SubscriptionBuilder& s) {
      s.owner_activity({.owner_id = "owner-1"},
        [](sdk::gql::OwnerSelector& o) { o.id().name().email(); });
    });
    ASSERT_TRUE(!event.owner_activity.id.empty());
    ASSERT_EQ(event.owner_activity.name, std::string("Alice"));
    ASSERT_EQ(event.owner_activity.email, std::string("alice@example.com"));
  END_TEST

  TEST("subscribe — unsubscribe stops events")
    sdk::gql::GqlClient gql(gql_opts);
    std::atomic<int> event_count{0};
    auto handle = gql.subscribe(
      [](sdk::gql::SubscriptionBuilder& s) {
        s.pet_adopted([](sdk::gql::PetSelector& p) { p.id().name(); });
      },
      [&event_count](const nlohmann::json&) { event_count.fetch_add(1); }
    );
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    handle.unsubscribe();
    int count_after = event_count.load();
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    ASSERT_EQ(event_count.load(), count_after);
  END_TEST

  // ─── WebSocket ────────────────────────────────────────────────────

  std::cout << "\n  WebSocket:" << std::endl;

  TEST("connect + receive typed ChatPresenceMessage")
    sdk::ws::WsClient ws({.url = MOCK_WS_URL, .reconnect = false});
    sdk::ws::ChatPresenceMessage presence;
    std::mutex mtx;
    std::condition_variable cv;
    bool got_msg = false;
    ws.on_chat_presence([&](const nlohmann::json& msg) {
      std::lock_guard<std::mutex> lock(mtx);
      presence = msg.get<sdk::ws::ChatPresenceMessage>();
      got_msg = true;
      cv.notify_one();
    });
    ws.connect();
    {
      std::unique_lock<std::mutex> lock(mtx);
      ASSERT_TRUE(cv.wait_for(lock, std::chrono::seconds(10), [&] { return got_msg; }));
    }
    ASSERT_EQ(presence.user_id, std::string("server"));
    ASSERT_EQ(presence.status, std::string("online"));
    ws.send_chat_messages(nlohmann::json(sdk::ws::ChatMessagesPayload{.text = "hello from SDK"}));
    ws.disconnect();
  END_TEST

  // ─── gRPC ─────────────────────────────────────────────────────────

  std::cout << "\n  gRPC:" << std::endl;

  TEST("PetService.listPets")
    auto client = sdk::grpc::PetServiceClient::connect(GRPC_ADDR);
    auto resp = client.list_pets({}).into_inner();
    ASSERT_TRUE(resp.data.size() >= 2);
    ASSERT_TRUE(!resp.data[0].name.empty());
  END_TEST

  TEST("PetService.getPet")
    auto client = sdk::grpc::PetServiceClient::connect(GRPC_ADDR);
    auto pet = client.get_pet({.id = "pet-1"}).into_inner();
    ASSERT_EQ(pet.name, std::string("Rex"));
    ASSERT_EQ(pet.id, std::string("pet-1"));
  END_TEST

  TEST("PetService.createPet")
    auto client = sdk::grpc::PetServiceClient::connect(GRPC_ADDR);
    auto pet = client.create_pet({.name = "GrpcCppPet", .species = sdk::grpc::Species::SPECIES_DOG}).into_inner();
    ASSERT_EQ(pet.name, std::string("GrpcCppPet"));
    ASSERT_TRUE(!pet.id.empty());
  END_TEST

  TEST("PetService.deletePet")
    auto client = sdk::grpc::PetServiceClient::connect(GRPC_ADDR);
    client.delete_pet({.id = "pet-1"}).into_inner();
  END_TEST

  TEST("PetService.watchPets — server stream")
    auto client = sdk::grpc::PetServiceClient::connect(GRPC_ADDR);
    auto stream = client.watch_pets({}).into_inner();
    int count = 0;
    std::string first_name;
    sdk::grpc::Pet pet;
    while (stream.next(pet)) { count++; if (first_name.empty()) first_name = pet.name; }
    ASSERT_TRUE(count >= 2);
    ASSERT_TRUE(!first_name.empty());
  END_TEST

  TEST("OwnerService.listOwners")
    auto client = sdk::grpc::OwnerServiceClient::connect(GRPC_ADDR);
    auto resp = client.list_owners({}).into_inner();
    ASSERT_TRUE(resp.data.size() >= 1);
  END_TEST

  TEST("OwnerService.getOwner")
    auto client = sdk::grpc::OwnerServiceClient::connect(GRPC_ADDR);
    auto owner = client.get_owner({.id = "owner-1"}).into_inner();
    ASSERT_EQ(owner.name, std::string("Alice"));
    ASSERT_EQ(owner.email, std::string("alice@example.com"));
  END_TEST

  TEST("OwnerService.createOwner")
    auto client = sdk::grpc::OwnerServiceClient::connect(GRPC_ADDR);
    auto owner = client.create_owner({.name = "GrpcOwner", .email = "grpc@test.com"}).into_inner();
    ASSERT_EQ(owner.name, std::string("GrpcOwner"));
    ASSERT_EQ(owner.email, std::string("grpc@test.com"));
    ASSERT_TRUE(!owner.id.empty());
  END_TEST

  // ─── Summary ──────────────────────────────────────────────────────

  std::cout << "\n  " << tests_passed << " passed, " << tests_failed << " failed\n" << std::endl;
  return tests_failed > 0 ? 1 : 0;
}
