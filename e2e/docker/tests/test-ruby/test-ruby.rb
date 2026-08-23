# Integration test: imports the GENERATED Ruby SDK and tests it
# against a real mock server. All REST/GraphQL/WS/gRPC calls go through SDK classes, zero mocking.
require 'minitest/autorun'
require 'uri'

BASE_URL = ENV.fetch('MOCK_URL', 'http://localhost:4010')
GQL_URL = "#{BASE_URL}/graphql"
GQL_WS_URL = GQL_URL.sub(/^http/, 'ws')
WS_URL = "ws://#{URI(BASE_URL).host}:#{URI(BASE_URL).port}/ws"
LOCAL_GEN_DIR = File.join(__dir__, 'generated')
GEN_DIR = File.directory?(File.join(LOCAL_GEN_DIR, 'ruby')) ? LOCAL_GEN_DIR : ENV.fetch('GEN_DIR', '/tmp/cortex-e2e-sdks/generated')

# --- Install dependencies ---
begin
  require 'faraday'
rescue LoadError
  puts "  Installing faraday gem..."
  system('gem install faraday --no-document 2>/dev/null') || system('gem install faraday --no-doc 2>/dev/null')
  require 'faraday'
end

# --- Locate generated SDK ---
RUBY_SRC = File.join(GEN_DIR, 'ruby', 'src')
RUBY_LIB = File.join(GEN_DIR, 'ruby', 'lib')

# --- Load SDK files in dependency order ---
Dir.glob(File.join(RUBY_LIB, '**', 'errors.rb')).each { |f| load f }

# Load types first (required by resources)
types_path = File.join(RUBY_SRC, 'types.rb')
load types_path if File.exist?(types_path)

Dir.glob(File.join(RUBY_SRC, 'resources', '*.rb')).each { |f| load f }
load File.join(RUBY_SRC, 'client.rb')

GQL_PATH = File.join(RUBY_SRC, 'gql-client.rb')
HAS_GQL = File.exist?(GQL_PATH)
load GQL_PATH if HAS_GQL

WS_PATH = File.join(RUBY_SRC, 'ws-client.rb')
HAS_WS = begin
  if File.exist?(WS_PATH)
    load WS_PATH
    true
  else
    false
  end
rescue LoadError => e
  puts "    (ws-client skipped: #{e.message})"
  false
end

GRPC_PATH = File.join(RUBY_SRC, 'grpc-client.rb')
HAS_GRPC = begin
  if File.exist?(GRPC_PATH)
    load GRPC_PATH
    true
  else
    false
  end
rescue LoadError => e
  puts "    (grpc-client skipped: #{e.message})"
  false
end

# --- Discover the generated module ---
SDK_MODULE = begin
  defined?(TestProjectSdk) && TestProjectSdk.const_defined?(:RestApiV1, false) ? TestProjectSdk : nil
end

# ── REST ─────────────────────────────────────────────────────────

class TestREST < Minitest::Test
  def setup
    skip 'SDK module not found' if SDK_MODULE.nil?
    @rest = SDK_MODULE::RestApiV1.new(base_url: BASE_URL)
  end

  def test_rest_pets_list
    r = @rest.pets.list
    assert r.data.length >= 2
    refute_nil r.data[0].name
  end

  def test_rest_pets_get
    r = @rest.pets.get('pet-1')
    assert_equal 'Rex', r.name
  end

  def test_rest_pets_create
    r = @rest.pets.create({
      name: 'RubyPet',
      species: 'bird',
      profilePic: FileUpload.new(filename: 'profile.png', data: 'pet-avatar', content_type: 'image/png'),
      attachments: [
        FileUpload.new(filename: 'record.pdf', data: 'pdf-file', content_type: 'application/pdf'),
        FileUpload.new(filename: 'notes.txt', data: 'notes', content_type: 'text/plain')
      ]
    })
    assert_equal 'RubyPet', r.name
    assert_equal 'profile.png', r.profile_pic_filename
    assert_equal 10, r.profile_pic_size
    assert_equal 'image/png', r.profile_pic_content_type
    assert_equal 2, r.attachment_count
    assert_equal ['application/pdf', 'text/plain'], r.attachment_content_types

    raw = @rest.uploads.upload_file(FileUpload.new(filename: 'raw.pdf', data: 'raw-pdf', content_type: 'application/pdf'))
    assert_equal 7, raw.size
    assert_equal 'application/pdf', raw.content_type
  end

  def test_rest_pets_delete
    @rest.pets.delete('pet-1')
  end

  def test_rest_owners_list
    r = @rest.owners.list
    assert r.data.length >= 1
    refute_nil r.data[0].email
  end

  def test_chunked_response_stream
    chunks = []
    @rest.request_stream(:get, '/pets/stream', timeout: 2) { |chunk| chunks << chunk }
    body = chunks.join
    assert_operator chunks.length, :>=, 2
    assert_includes body, 'Rex'
    assert_includes body, 'Whiskers'
  end

  def test_http_timeout_override
    short = SDK_MODULE::RestApiV1.new(base_url: BASE_URL, timeout: 0.04)
    assert_raises(StandardError) { short.request(:get, '/transport/slow?delay=250') }

    longer = SDK_MODULE::RestApiV1.new(base_url: BASE_URL, timeout: 0.5)
    assert_equal 100, longer.request(:get, '/transport/slow?delay=100')['delayed']
  end
end

# ── GraphQL — Query Builder ──────────────────────────────────────

class TestGraphQL < Minitest::Test
  def setup
    skip 'no gql-client.rb' unless HAS_GQL
    @gql = Graphql.new(endpoint: GQL_URL, ws_endpoint: GQL_WS_URL, reconnect_interval: 0.05)
  end

  def teardown
    @gql&.dispose if @gql&.respond_to?(:dispose)
  end

  # ── Query ────────────────────────────────────────────

  def test_query_single_root_field_with_partial_selection
    r = @gql.query { |q|
      q.pets(limit: 10) { |p|
        p.data { |d| d.id.name.species }.next_cursor
      }
    }
    refute_nil r.pets
    assert r.pets.data.length >= 1
    refute_nil r.pets.data[0].id
    refute_nil r.pets.data[0].name
    refute_nil r.pets.data[0].species
  end

  def test_query_multi_entity
    r = @gql.query { |q|
      q
        .pets(limit: 5) { |p| p.data { |d| d.id.name } }
        .owners(limit: 5) { |o| o.data { |d| d.id.name.email } }
    }
    refute_nil r.pets.data[0].id
    refute_nil r.pets.data[0].name
    refute_nil r.owners.data[0].id
    refute_nil r.owners.data[0].name
    refute_nil r.owners.data[0].email
  end

  def test_query_single_entity_with_required_args
    r = @gql.query { |q| q.pet(id: 'pet-1') { |p| p.id.name.species } }
    refute_nil r.pet
    refute_nil r.pet.id
    refute_nil r.pet.name
  end

  def test_query_no_args
    r = @gql.query { |q| q.pets { |p| p.data { |d| d.id.name } } }
    assert r.pets.data.length >= 1
  end

  def test_query_nested_selection_owners_pets
    r = @gql.query { |q|
      q.owners(limit: 5) { |o|
        o.data { |d|
          d
            .id
            .name
            .pets { |p| p.id.name.species }
        }
      }
    }
    refute_nil r.owners.data[0].id
    refute_nil r.owners.data[0].pets
  end

  # ── Mutation ─────────────────────────────────────────

  def test_mutate_create_with_field_selection
    r = @gql.mutate { |m|
      m.create_pet(input: { name: 'BuilderPet', species: 'DOG' }) { |p|
        p.id.name.species
      }
    }
    refute_nil r.create_pet
    refute_nil r.create_pet.name
    refute_nil r.create_pet.species
  end

  def test_mutate_scalar_return
    r = @gql.mutate { |m| m.delete_pet(id: 'pet-1') }
    refute_nil r.delete_pet
    assert_equal true, r.delete_pet
  end

  def test_mutate_multiple_mutations
    r = @gql.mutate { |m|
      m
        .create_pet(input: { name: 'Multi1', species: 'CAT' }) { |p| p.id.name }
        .create_owner(input: { name: 'OwnerX', email: 'ox@test.com' }) { |o| o.id.name.email }
    }
    refute_nil r.create_pet.name
    refute_nil r.create_owner.email
  end

  # ── Subscription (real WebSocket via graphql-ws) ─────

  def test_subscribe_pet_adopted_receives_event
    event = @gql.subscribe_once { |s|
      s.pet_adopted(species: 'DOG') { |p| p.id.name.species }
    }
    refute_nil event.pet_adopted
    refute_nil event.pet_adopted.id
    assert_equal 'Rex', event.pet_adopted.name
    assert_equal 'DOG', event.pet_adopted.species
  end

  def test_subscribe_owner_activity_receives_event
    event = @gql.subscribe_once { |s|
      s.owner_activity(owner_id: 'owner-1') { |o| o.id.name.email }
    }
    refute_nil event.owner_activity
    refute_nil event.owner_activity.id
    assert_equal 'Alice', event.owner_activity.name
    assert_equal 'alice@example.com', event.owner_activity.email
  end

  def test_subscribe_unsubscribe_stops_events
    event_count = 0
    unsubscribe = @gql.subscribe(
      ->(s) { s.pet_adopted { |p| p.id.name } },
      ->(event) { event_count += 1 }
    )
    sleep 0.5
    unsubscribe.call
    count_after_unsub = event_count
    sleep 0.5
    assert_equal count_after_unsub, event_count
  end
end

# ── WebSocket ────────────────────────────────────────────────────

class TestWebSocket < Minitest::Test
  def setup
    skip 'WebSocket client not available' unless HAS_WS && defined?(WebsocketApi)
  end

  def test_connect_receive_presence
    ws = WebsocketApi.new(url: WS_URL, reconnect_interval: 0.05)
    received = nil

    ws.on_chat_presence { |msg| received = msg }
    ws.connect

    10.times do
      break if received
      sleep 0.5
    end

    refute_nil received, 'timed out waiting for presence message'
    assert_equal 'server', received.user_id
    assert_equal 'online', received.status

    # Keep the restored connection open for a client-initiated heartbeat tick.
    sleep 0.2
    ws.send_chat_messages({ text: 'hello from generated SDK' })
    ws.disconnect
  end

  def test_ws_client_has_channel_methods
    ws = WebsocketApi.new(url: WS_URL)
    assert ws.respond_to?(:subscribe), 'missing subscribe'
    assert ws.respond_to?(:send_message), 'missing send_message'
    assert ws.respond_to?(:connect), 'missing connect'
    assert ws.respond_to?(:disconnect), 'missing disconnect'
    assert ws.respond_to?(:send_chat_messages), 'missing send_chat_messages'
    assert ws.respond_to?(:on_chat_presence), 'missing on_chat_presence'
  end
end

# ── gRPC (real calls through generated SDK) ──────────────────────

class TestGRPC < Minitest::Test
  def setup
    skip 'gRPC client not available' unless HAS_GRPC && defined?(Grpc)
    @pet_client = Grpc.new(base_url: BASE_URL)
    @owner_client = @pet_client
  end

  def teardown
    @pet_client&.close
    @owner_client&.close
  end

  # ── PetService RPCs ──────────────────────────────────

  def test_pet_service_list_pets
    r = @pet_client.list_pets({})
    refute_nil r.data
    assert r.data.length >= 2
    refute_nil r.data[0].name
  end

  def test_pet_service_get_pet
    r = @pet_client.get_pet({ id: 'pet-1' })
    assert_equal 'Rex', r.name
    assert_equal 'pet-1', r.id
  end

  def test_pet_service_create_pet
    r = @pet_client.create_pet({ name: 'GrpcRubyPet', species: 'SPECIES_DOG' })
    assert_equal 'GrpcRubyPet', r.name
    refute_nil r.id
  end

  def test_pet_service_delete_pet
    r = @pet_client.delete_pet({ id: 'pet-1' })
    refute_nil r
  end

  # ── PetService server-streaming RPC ──────────────────

  def test_pet_service_watch_pets_stream
    pet_count = 0
    first_pet_name = nil

    @pet_client.watch_pets({}) do |pet|
      pet_count += 1
      first_pet_name ||= pet.name
    end

    assert pet_count >= 2
    refute_nil first_pet_name
  end

  # ── OwnerService RPCs ────────────────────────────────

  def test_owner_service_list_owners
    r = @owner_client.list_owners({})
    refute_nil r.data
    assert r.data.length >= 1
  end

  def test_owner_service_get_owner
    r = @owner_client.get_owner({ id: 'owner-1' })
    assert_equal 'Alice', r.name
    assert_equal 'alice@example.com', r.email
  end

  def test_owner_service_create_owner
    r = @owner_client.create_owner({ name: 'GrpcOwner', email: 'grpc@test.com' })
    assert_equal 'GrpcOwner', r.name
    assert_equal 'grpc@test.com', r.email
    refute_nil r.id
  end
end
