package runner_test

import (
	"context"
	"io"
	"os"
	"strings"
	"testing"
	"time"

	gqlclient "goe2e/generated/gqlclient"
	grpcclient "goe2e/generated/grpcclient"
	sdk "goe2e/generated/sdk"
)

func TestRESTGeneratedClient(t *testing.T) {
	client := sdk.NewRestApiV1(sdk.WithBaseURL(baseURL()))

	pets, err := client.PetResource.List(ptr(10), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(pets.Data) < 2 {
		t.Fatalf("expected at least 2 pets, got %d", len(pets.Data))
	}
	if pets.Data[0].Name == "" {
		t.Fatal("expected typed pet name")
	}

	pet, err := client.PetResource.Get("pet-1")
	if err != nil {
		t.Fatal(err)
	}
	if pet.Name != "Rex" {
		t.Fatalf("expected Rex, got %s", pet.Name)
	}

	attachments := []sdk.FileUpload{
		{Filename: "record.pdf", Data: []byte("pdf-file"), ContentType: "application/pdf"},
		{Filename: "notes.txt", Data: []byte("notes"), ContentType: "text/plain"},
	}
	created, err := client.PetResource.Create(sdk.CreatePetRequest{
		Name:    "GoPet",
		Species: "bird",
		ProfilePic: &sdk.FileUpload{
			Filename: "profile.png", Data: []byte("pet-avatar"), ContentType: "image/png",
		},
		Attachments: &attachments,
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.Name != "GoPet" {
		t.Fatalf("expected GoPet, got %s", created.Name)
	}
	if created.ProfilePicFilename == nil || *created.ProfilePicFilename != "profile.png" || created.ProfilePicSize == nil || *created.ProfilePicSize != 10 {
		t.Fatalf("expected uploaded profile picture metadata, got %#v", created)
	}
	if created.ProfilePicContentType == nil || *created.ProfilePicContentType != "image/png" || created.AttachmentCount == nil || *created.AttachmentCount != 2 {
		t.Fatalf("expected uploaded MIME metadata, got %#v", created)
	}
	raw, err := client.UploadResource.UploadFile(sdk.FileUpload{Filename: "raw.pdf", Data: []byte("raw-pdf"), ContentType: "application/pdf"})
	if err != nil || raw.Size != 7 || raw.ContentType != "application/pdf" { t.Fatalf("raw upload failed: %#v %v", raw, err) }

	if err := client.PetResource.Delete("pet-1"); err != nil {
		t.Fatal(err)
	}

	owners, err := client.OwnerResource.List(nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(owners.Data) == 0 || owners.Data[0].Email == "" {
		t.Fatalf("expected typed owner data, got %#v", owners)
	}
}

func TestRESTStreamingAndTimeoutOverride(t *testing.T) {
	client := sdk.NewRestApiV1(sdk.WithBaseURL(baseURL()), sdk.WithTimeout(2*time.Second))
	stream, err := client.RequestStream("GET", "/pets/stream", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(stream)
	_ = stream.Close()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(string(body), "\n") < 2 || !strings.Contains(string(body), "Rex") || !strings.Contains(string(body), "Whiskers") {
		t.Fatalf("expected both streamed records, got %q", body)
	}

	short := sdk.NewRestApiV1(sdk.WithBaseURL(baseURL()), sdk.WithTimeout(40*time.Millisecond))
	if err := short.Request("GET", "/transport/slow?delay=250", nil, nil, nil); err == nil {
		t.Fatal("expected the short client timeout to cancel the request")
	}
	longer := sdk.NewRestApiV1(sdk.WithBaseURL(baseURL()), sdk.WithTimeout(500*time.Millisecond))
	var result map[string]int
	if err := longer.Request("GET", "/transport/slow?delay=100", nil, nil, &result); err != nil {
		t.Fatal(err)
	}
	if result["delayed"] != 100 {
		t.Fatalf("expected delayed=100, got %#v", result)
	}
}

func TestGraphQLGeneratedClient(t *testing.T) {
	gql := gqlclient.NewGraphql(
		gqlclient.WithEndpoint(gqlURL()),
		gqlclient.WithWsEndpoint(gqlWsURL()),
		gqlclient.WithSubscriptionReconnect(true, 50*time.Millisecond, 5),
	)
	defer gql.Dispose()

	t.Run("query — single root field with partial selection", func(t *testing.T) {
		r, err := gql.Query(func(q *gqlclient.QueryBuilder) *gqlclient.QueryBuilder {
			return q.Pets(&gqlclient.PetsArgs{Limit: ptr(10)}, func(p *gqlclient.PetConnectionSelector) *gqlclient.PetConnectionSelector {
				return p.Data(func(d *gqlclient.PetSelector) *gqlclient.PetSelector {
					return d.Id().Name().Species()
				}).NextCursor()
			})
		})
		if err != nil {
			t.Fatal(err)
		}
		if r.Pets == nil || len(r.Pets.Data) == 0 {
			t.Fatalf("expected pets data, got %#v", r.Pets)
		}
		if r.Pets.Data[0].Name == "" {
			t.Fatal("expected pet name")
		}
	})

	t.Run("query — multi-entity (pets + owners in one call)", func(t *testing.T) {
		r, err := gql.Query(func(q *gqlclient.QueryBuilder) *gqlclient.QueryBuilder {
			return q.
				Pets(&gqlclient.PetsArgs{Limit: ptr(5)}, func(p *gqlclient.PetConnectionSelector) *gqlclient.PetConnectionSelector {
					return p.Data(func(d *gqlclient.PetSelector) *gqlclient.PetSelector {
						return d.Id().Name()
					})
				}).
				Owners(&gqlclient.OwnersArgs{Limit: ptr(5)}, func(o *gqlclient.OwnerConnectionSelector) *gqlclient.OwnerConnectionSelector {
					return o.Data(func(d *gqlclient.OwnerSelector) *gqlclient.OwnerSelector {
						return d.Id().Name().Email()
					})
				})
		})
		if err != nil {
			t.Fatal(err)
		}
		if r.Pets == nil || len(r.Pets.Data) == 0 {
			t.Fatal("expected pets data")
		}
		if r.Owners == nil || len(r.Owners.Data) == 0 {
			t.Fatal("expected owners data")
		}
	})

	t.Run("query — single entity with required args", func(t *testing.T) {
		r, err := gql.Query(func(q *gqlclient.QueryBuilder) *gqlclient.QueryBuilder {
			return q.Pet(gqlclient.PetArgs{Id: "pet-1"}, func(p *gqlclient.PetSelector) *gqlclient.PetSelector {
				return p.Id().Name().Species()
			})
		})
		if err != nil {
			t.Fatal(err)
		}
		if r.Pet == nil || r.Pet.Name != "Rex" {
			t.Fatalf("expected Rex, got %#v", r.Pet)
		}
	})

	t.Run("query — no args (optional args omitted)", func(t *testing.T) {
		r, err := gql.Query(func(q *gqlclient.QueryBuilder) *gqlclient.QueryBuilder {
			return q.Pets(nil, func(p *gqlclient.PetConnectionSelector) *gqlclient.PetConnectionSelector {
				return p.Data(func(d *gqlclient.PetSelector) *gqlclient.PetSelector {
					return d.Id().Name()
				})
			})
		})
		if err != nil {
			t.Fatal(err)
		}
		if r.Pets == nil || len(r.Pets.Data) == 0 {
			t.Fatal("expected pets data")
		}
	})

	t.Run("query — nested selection (owners → pets)", func(t *testing.T) {
		r, err := gql.Query(func(q *gqlclient.QueryBuilder) *gqlclient.QueryBuilder {
			return q.Owners(&gqlclient.OwnersArgs{Limit: ptr(5)}, func(o *gqlclient.OwnerConnectionSelector) *gqlclient.OwnerConnectionSelector {
				return o.Data(func(d *gqlclient.OwnerSelector) *gqlclient.OwnerSelector {
					return d.Id().Name().Pets(func(p *gqlclient.PetSelector) *gqlclient.PetSelector {
						return p.Id().Name().Species()
					})
				})
			})
		})
		if err != nil {
			t.Fatal(err)
		}
		if r.Owners == nil || len(r.Owners.Data) == 0 {
			t.Fatal("expected owners data")
		}
	})

	t.Run("mutate — create with input and field selection", func(t *testing.T) {
		r, err := gql.Mutate(func(m *gqlclient.MutationBuilder) *gqlclient.MutationBuilder {
			return m.CreatePet(gqlclient.CreatePetArgs{
				Input: gqlclient.CreatePetInput{
					Name:    "BuilderPet",
					Species: "DOG",
				},
			}, func(p *gqlclient.PetSelector) *gqlclient.PetSelector {
				return p.Id().Name().Species()
			})
		})
		if err != nil {
			t.Fatal(err)
		}
		if r.CreatePet == nil || r.CreatePet.Name == "" {
			t.Fatalf("expected created pet, got %#v", r.CreatePet)
		}
	})

	t.Run("mutate — scalar return (deletePet → boolean)", func(t *testing.T) {
		r, err := gql.Mutate(func(m *gqlclient.MutationBuilder) *gqlclient.MutationBuilder {
			return m.DeletePet(gqlclient.DeletePetArgs{Id: "pet-1"})
		})
		if err != nil {
			t.Fatal(err)
		}
		if r.DeletePet == nil || !*r.DeletePet {
			t.Fatal("expected deletePet to return true")
		}
	})

	t.Run("mutate — multiple mutations in one call", func(t *testing.T) {
		r, err := gql.Mutate(func(m *gqlclient.MutationBuilder) *gqlclient.MutationBuilder {
			return m.
				CreatePet(gqlclient.CreatePetArgs{
					Input: gqlclient.CreatePetInput{
						Name:    "Multi1",
						Species: "CAT",
					},
				}, func(p *gqlclient.PetSelector) *gqlclient.PetSelector {
					return p.Id().Name()
				}).
				CreateOwner(gqlclient.CreateOwnerArgs{
					Input: gqlclient.CreateOwnerInput{
						Name:  "OwnerX",
						Email: "ox@test.com",
					},
				}, func(o *gqlclient.OwnerSelector) *gqlclient.OwnerSelector {
					return o.Id().Name().Email()
				})
		})
		if err != nil {
			t.Fatal(err)
		}
		if r.CreatePet == nil || r.CreatePet.Name == "" {
			t.Fatal("expected created pet")
		}
		if r.CreateOwner == nil || r.CreateOwner.Email == "" {
			t.Fatal("expected created owner")
		}
	})

	t.Run("subscribe — petAdopted receives event via WebSocket", func(t *testing.T) {
		event, err := gql.SubscribeOnce(func(s *gqlclient.SubscriptionBuilder) *gqlclient.SubscriptionBuilder {
			return s.PetAdopted(&gqlclient.PetAdoptedArgs{Species: ptr(gqlclient.Species("DOG"))}, func(p *gqlclient.PetSelector) *gqlclient.PetSelector {
				return p.Id().Name().Species()
			})
		})
		if err != nil {
			t.Fatal(err)
		}
		if event.PetAdopted == nil || event.PetAdopted.Name != "Rex" {
			t.Fatalf("expected Rex, got %#v", event.PetAdopted)
		}
		if event.PetAdopted.Species != "DOG" {
			t.Fatalf("expected DOG, got %s", event.PetAdopted.Species)
		}
	})

	t.Run("subscribe — ownerActivity receives event via WebSocket", func(t *testing.T) {
		event, err := gql.SubscribeOnce(func(s *gqlclient.SubscriptionBuilder) *gqlclient.SubscriptionBuilder {
			return s.OwnerActivity(gqlclient.OwnerActivityArgs{OwnerId: "owner-1"}, func(o *gqlclient.OwnerSelector) *gqlclient.OwnerSelector {
				return o.Id().Name().Email()
			})
		})
		if err != nil {
			t.Fatal(err)
		}
		if event.OwnerActivity == nil || event.OwnerActivity.Name != "Alice" {
			t.Fatalf("expected Alice, got %#v", event.OwnerActivity)
		}
		if event.OwnerActivity.Email != "alice@example.com" {
			t.Fatalf("expected alice@example.com, got %s", event.OwnerActivity.Email)
		}
	})

	t.Run("subscribe — unsubscribe stops receiving events", func(t *testing.T) {
		var eventCount int
		unsubscribe, err := gql.Subscribe(func(s *gqlclient.SubscriptionBuilder) *gqlclient.SubscriptionBuilder {
			return s.PetAdopted(nil, func(p *gqlclient.PetSelector) *gqlclient.PetSelector {
				return p.Id().Name()
			})
		}, func(_ *gqlclient.SubscriptionResult) {
			eventCount++
		})
		if err != nil {
			t.Fatal(err)
		}
		time.Sleep(500 * time.Millisecond)
		unsubscribe()
		countAfterUnsub := eventCount
		time.Sleep(500 * time.Millisecond)
		if eventCount != countAfterUnsub {
			t.Fatalf("received events after unsubscribe: before=%d after=%d", countAfterUnsub, eventCount)
		}
	})
}

func TestWebSocketGeneratedClient(t *testing.T) {
	client := sdk.NewWebsocketApi(wsURL(), sdk.WithWsReconnectInterval(50*time.Millisecond))
	received := make(chan sdk.ChatPresenceMessage, 1)
	client.OnChatPresence(func(message sdk.ChatPresenceMessage) {
		received <- message
	})

	if err := client.Connect(); err != nil {
		t.Fatal(err)
	}
	defer client.Disconnect()

	select {
	case message := <-received:
		if message.UserId != "server" || message.Status != "online" {
			t.Fatalf("unexpected presence message: %#v", message)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for presence message")
	}

	if err := client.SendChatMessages(sdk.ChatMessagesPayload{Text: "hello from go"}); err != nil {
		t.Fatal(err)
	}
}

func TestGRPCGeneratedClient(t *testing.T) {
	ctx := context.Background()
	petsClient, err := grpcclient.NewGrpc(
		grpcclient.WithTarget(grpcAddr()),
		grpcclient.WithBaseURL(baseURL()),
	)
	if err != nil {
		t.Fatal(err)
	}
	defer petsClient.Close()

	pets, err := petsClient.ListPets(ctx, &grpcclient.ListPetsRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if len(pets.Data) < 2 || pets.Data[0].Name == "" {
		t.Fatalf("expected typed gRPC pet list, got %#v", pets)
	}

	pet, err := petsClient.GetPet(ctx, &grpcclient.GetPetRequest{Id: "pet-1"})
	if err != nil {
		t.Fatal(err)
	}
	if pet.Name != "Rex" {
		t.Fatalf("expected Rex, got %s", pet.Name)
	}

	created, err := petsClient.CreatePet(ctx, &grpcclient.CreatePetRequest{
		Name:    "GoGrpcPet",
		Species: "SPECIES_DOG",
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.Name != "GoGrpcPet" {
		t.Fatalf("expected GoGrpcPet, got %s", created.Name)
	}

	stream, err := petsClient.WatchPets(ctx, &grpcclient.WatchPetsRequest{})
	if err != nil {
		t.Fatal(err)
	}
	streamed, err := stream.Recv()
	if err != nil && err != io.EOF {
		t.Fatal(err)
	}
	if streamed == nil || streamed.Name == "" {
		t.Fatalf("expected streamed pet, got %#v", streamed)
	}

	owners, err := petsClient.ListOwners(ctx, &grpcclient.ListOwnersRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if len(owners.Data) == 0 || owners.Data[0].Email == "" {
		t.Fatalf("expected typed gRPC owners, got %#v", owners)
	}
}

func ptr[T any](value T) *T {
	return &value
}

func baseURL() string {
	return getenv("MOCK_URL", "http://localhost:4010")
}

func wsURL() string {
	return getenv("MOCK_WS_URL", "ws://localhost:4010/ws")
}

func gqlURL() string {
	return getenv("MOCK_GQL_URL", "http://localhost:4010/graphql")
}

func gqlWsURL() string {
	return strings.Replace(gqlURL(), "http", "ws", 1)
}

func grpcAddr() string {
	return getenv("GRPC_ADDR", "localhost:50051")
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
