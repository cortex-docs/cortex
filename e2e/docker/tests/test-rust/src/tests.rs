#[cfg(test)]
mod tests {
    use futures_util::StreamExt;
    use std::env;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    use test_project::client::RestApiV1;
    use test_project::gql_client::Graphql;
    use test_project::gql_types;
    use test_project::grpc;
    use test_project::types;
    use test_project::ws_client::WebsocketApi;
    use test_project::ws_types;

    #[derive(serde::Deserialize)]
    struct PetsAndOwnersQuery {
        pets: gql_types::PetConnection,
        owners: gql_types::OwnerConnection,
    }

    #[derive(serde::Deserialize)]
    struct CreatePetAndOwnerMutation {
        #[serde(rename = "createPet")]
        create_pet: gql_types::Pet,
        #[serde(rename = "createOwner")]
        create_owner: gql_types::Owner,
    }

    fn base_url() -> String {
        env::var("MOCK_URL").unwrap_or_else(|_| "http://localhost:4010".into())
    }

    fn gql_url() -> String {
        env::var("MOCK_GQL_URL").unwrap_or_else(|_| format!("{}/graphql", base_url()))
    }

    fn gql_ws_url() -> String {
        gql_url().replacen("http", "ws", 1)
    }

    fn ws_url() -> String {
        env::var("MOCK_WS_URL").unwrap_or_else(|_| "ws://localhost:4010/ws".into())
    }

    fn grpc_addr() -> String {
        let addr = env::var("GRPC_ADDR").unwrap_or_else(|_| "http://localhost:4010".into());
        if addr.starts_with("http") {
            addr
        } else {
            format!("http://{}", addr)
        }
    }

    // ─── REST ─────────────────────────────────────────────────────────

    #[tokio::test]
    async fn rest_list_pets() {
        let client = RestApiV1::new(&base_url());
        let r: types::ListPetsResponse =
            client.pets.list(&client, None, None).await.unwrap();
        assert!(r.data.len() >= 2);
        assert!(!r.data[0].name.is_empty());
    }

    #[tokio::test]
    async fn rest_get_pet() {
        let client = RestApiV1::new(&base_url());
        let pet: types::Pet = client.pets.get(&client, "pet-1").await.unwrap();
        assert_eq!(pet.name, "Rex");
    }

    #[tokio::test]
    async fn rest_create_pet() {
        let client = RestApiV1::new(&base_url());
        let pet: types::Pet = client
            .pets
            .create(
                &client,
                &types::CreatePetRequest {
                    name: "RustPet".into(),
                    species: "bird".into(),
                    breed: None,
                    age: None,
                    profile_pic: Some(types::FileUpload {
                        filename: "profile.png".into(),
                        data: b"pet-avatar".to_vec(),
                        content_type: "image/png".into(),
                    }),
                    attachments: Some(vec![
                        types::FileUpload {
                            filename: "record.pdf".into(),
                            data: b"pdf-file".to_vec(),
                            content_type: "application/pdf".into(),
                        },
                        types::FileUpload {
                            filename: "notes.txt".into(),
                            data: b"notes".to_vec(),
                            content_type: "text/plain".into(),
                        },
                    ]),
                },
            )
            .await
            .unwrap();
        assert_eq!(pet.name, "RustPet");
        assert_eq!(pet.profile_pic_filename.as_deref(), Some("profile.png"));
        assert_eq!(pet.profile_pic_size, Some(10));
        assert_eq!(pet.profile_pic_content_type.as_deref(), Some("image/png"));
        assert_eq!(pet.attachment_count, Some(2));
        assert_eq!(pet.attachment_content_types, Some(vec!["application/pdf".into(), "text/plain".into()]));

        let raw: types::UploadResult = client.uploads.upload_file(
            &client,
            &types::FileUpload {
                filename: "raw.pdf".into(),
                data: b"raw-pdf".to_vec(),
                content_type: "application/pdf".into(),
            },
        ).await.unwrap();
        assert_eq!(raw.size, 7);
        assert_eq!(raw.content_type, "application/pdf");
    }

    #[tokio::test]
    async fn rest_delete_pet() {
        let client = RestApiV1::new(&base_url());
        client.pets._delete(&client, "pet-1").await.unwrap();
    }

    #[tokio::test]
    async fn rest_list_owners() {
        let client = RestApiV1::new(&base_url());
        let r: types::ListOwnersResponse =
            client.owners.list(&client, None).await.unwrap();
        assert!(!r.data.is_empty());
        assert!(!r.data[0].email.is_empty());
    }

    #[tokio::test]
    async fn rest_chunked_response_stream() {
        let client = RestApiV1::new_with_timeout(&base_url(), Duration::from_secs(2));
        let response = client
            .request_stream("GET", "/pets/stream", None, None)
            .await
            .unwrap();
        let mut stream = response.bytes_stream();
        let mut chunks = 0;
        let mut body = Vec::new();
        while let Some(chunk) = stream.next().await {
            chunks += 1;
            body.extend_from_slice(&chunk.unwrap());
        }
        let body = String::from_utf8(body).unwrap();
        assert!(chunks >= 2);
        assert!(body.contains("Rex"));
        assert!(body.contains("Whiskers"));
    }

    #[tokio::test]
    async fn rest_timeout_override() {
        let short = RestApiV1::new_with_timeout(&base_url(), Duration::from_millis(40));
        let timed_out = short
            .request::<serde_json::Value>("GET", "/transport/slow?delay=250", None, None)
            .await;
        assert!(timed_out.is_err());

        let longer = RestApiV1::new_with_timeout(&base_url(), Duration::from_millis(500));
        let result: serde_json::Value = longer
            .request("GET", "/transport/slow?delay=100", None, None)
            .await
            .unwrap();
        assert_eq!(result["delayed"], 100);
    }

    // ─── GraphQL — Query Builder ──────────────────────────────────────

    // ─── Query ────────────────────────────────────────────

    #[tokio::test]
    async fn gql_query_single_root_field_with_partial_selection() {
        let gql = Graphql::new(&gql_url()).with_ws_endpoint(&gql_ws_url());
        let r: gql_types::PetsQuery = gql
            .query(|q| {
                q.pets(
                    gql_types::PetsQueryVariables {
                        limit: Some(10),
                        cursor: None,
                    },
                    |p| {
                        p.data(|d| {
                            d.id()
                                .name()
                                .species()
                                .status()
                                .created_at()
                                .updated_at()
                        })
                        .next_cursor()
                    },
                )
            })
            .await
            .unwrap();
        assert!(!r.pets.data.is_empty());
        assert!(!r.pets.data[0].id.is_empty());
        assert!(!r.pets.data[0].name.is_empty());
    }

    #[tokio::test]
    async fn gql_query_multi_entity() {
        let gql = Graphql::new(&gql_url());
        let r: PetsAndOwnersQuery = gql
            .query(|q| {
                q.pets(
                    gql_types::PetsQueryVariables {
                        limit: Some(5),
                        cursor: None,
                    },
                    |p| {
                        p.data(|d| {
                            d.id()
                                .name()
                                .species()
                                .status()
                                .created_at()
                                .updated_at()
                        })
                    },
                )
                .owners(
                    gql_types::OwnersQueryVariables { limit: Some(5) },
                    |o| {
                        o.data(|d| {
                            d.id().name().email().created_at().pets(|p| {
                                p.id()
                                    .name()
                                    .species()
                                    .status()
                                    .created_at()
                                    .updated_at()
                            })
                        })
                    },
                )
            })
            .await
            .unwrap();
        assert!(!r.pets.data[0].id.is_empty());
        assert!(!r.pets.data[0].name.is_empty());
        assert!(!r.owners.data[0].id.is_empty());
        assert!(!r.owners.data[0].email.is_empty());
    }

    #[tokio::test]
    async fn gql_query_single_entity_with_required_args() {
        let gql = Graphql::new(&gql_url());
        let r: gql_types::PetQuery = gql
            .query(|q| {
                q.pet(
                    gql_types::PetQueryVariables {
                        id: "pet-1".into(),
                    },
                    |p| {
                        p.id()
                            .name()
                            .species()
                            .status()
                            .created_at()
                            .updated_at()
                    },
                )
            })
            .await
            .unwrap();
        assert!(r.pet.is_some());
        let pet = r.pet.unwrap();
        assert!(!pet.id.is_empty());
        assert!(!pet.name.is_empty());
    }

    #[tokio::test]
    async fn gql_query_no_args_overload() {
        let gql = Graphql::new(&gql_url());
        let r: gql_types::PetsQuery = gql
            .query(|q| {
                q.pets(
                    gql_types::PetsQueryVariables {
                        limit: None,
                        cursor: None,
                    },
                    |p| {
                        p.data(|d| {
                            d.id()
                                .name()
                                .species()
                                .status()
                                .created_at()
                                .updated_at()
                        })
                    },
                )
            })
            .await
            .unwrap();
        assert!(!r.pets.data.is_empty());
    }

    #[tokio::test]
    async fn gql_query_nested_selection() {
        let gql = Graphql::new(&gql_url());
        let r: gql_types::OwnersQuery = gql
            .query(|q| {
                q.owners(
                    gql_types::OwnersQueryVariables { limit: Some(5) },
                    |o| {
                        o.data(|d| {
                            d.id().name().email().created_at().pets(|p| {
                                p.id()
                                    .name()
                                    .species()
                                    .status()
                                    .created_at()
                                    .updated_at()
                            })
                        })
                    },
                )
            })
            .await
            .unwrap();
        assert!(!r.owners.data[0].id.is_empty());
    }

    // ─── Mutation ─────────────────────────────────────────

    #[tokio::test]
    async fn gql_mutate_create_with_input_and_field_selection() {
        let gql = Graphql::new(&gql_url());
        let r: gql_types::CreatePetMutation = gql
            .mutate(|m| {
                m.create_pet(
                    gql_types::CreatePetMutationVariables {
                        input: gql_types::CreatePetInput {
                            name: "BuilderPet".into(),
                            species: gql_types::Species::DOG,
                            breed: None,
                            age: None,
                        },
                    },
                    |p| {
                        p.id()
                            .name()
                            .species()
                            .status()
                            .created_at()
                            .updated_at()
                    },
                )
            })
            .await
            .unwrap();
        assert!(!r.create_pet.name.is_empty());
    }

    #[tokio::test]
    async fn gql_mutate_scalar_return() {
        let gql = Graphql::new(&gql_url());
        let r: gql_types::DeletePetMutation = gql
            .mutate(|m| {
                m.delete_pet(gql_types::DeletePetMutationVariables {
                    id: "pet-1".into(),
                })
            })
            .await
            .unwrap();
        assert!(r.delete_pet);
    }

    #[tokio::test]
    async fn gql_mutate_multiple_mutations() {
        let gql = Graphql::new(&gql_url());
        let r: CreatePetAndOwnerMutation = gql
            .mutate(|m| {
                m.create_pet(
                    gql_types::CreatePetMutationVariables {
                        input: gql_types::CreatePetInput {
                            name: "Multi1".into(),
                            species: gql_types::Species::CAT,
                            breed: None,
                            age: None,
                        },
                    },
                    |p| {
                        p.id()
                            .name()
                            .species()
                            .status()
                            .created_at()
                            .updated_at()
                    },
                )
                .create_owner(
                    gql_types::CreateOwnerMutationVariables {
                        input: gql_types::CreateOwnerInput {
                            name: "OwnerX".into(),
                            email: "ox@test.com".into(),
                            phone: None,
                        },
                    },
                    |o| {
                        o.id().name().email().created_at().pets(|p| {
                            p.id()
                                .name()
                                .species()
                                .status()
                                .created_at()
                                .updated_at()
                        })
                    },
                )
            })
            .await
            .unwrap();
        assert!(!r.create_pet.name.is_empty());
        assert!(!r.create_owner.email.is_empty());
    }

    // ─── Subscription (real WebSocket via graphql-ws) ──────

    #[tokio::test]
    async fn gql_subscribe_pet_adopted_receives_event() {
        let gql = Graphql::new_with_options(
            &gql_url(),
            Duration::from_secs(15),
            true,
            Duration::from_millis(50),
            5,
            Duration::from_secs(30),
            Duration::from_secs(10),
        ).with_ws_endpoint(&gql_ws_url());
        let (tx, rx) = tokio::sync::oneshot::channel::<gql_types::PetAdoptedSubscription>();
        let tx = std::sync::Mutex::new(Some(tx));
        let handle = gql.subscribe(
            |s| {
                s.pet_adopted(
                    gql_types::PetAdoptedSubscriptionVariables {
                        species: Some(gql_types::Species::DOG),
                    },
                    |p| {
                        p.id()
                            .name()
                            .species()
                            .status()
                            .created_at()
                            .updated_at()
                    },
                )
            },
            move |data| {
                if let Ok(event) = serde_json::from_value::<gql_types::PetAdoptedSubscription>(data)
                {
                    if let Some(tx) = tx.lock().unwrap().take() {
                        let _ = tx.send(event);
                    }
                }
            },
        );
        let event = tokio::time::timeout(Duration::from_secs(5), rx)
            .await
            .expect("timeout waiting for subscription event")
            .unwrap();
        assert!(!event.pet_adopted.id.is_empty());
        assert_eq!(event.pet_adopted.name, "Rex");
        handle.unsubscribe();
    }

    #[tokio::test]
    async fn gql_subscribe_owner_activity_receives_event() {
        let gql = Graphql::new(&gql_url()).with_ws_endpoint(&gql_ws_url());
        let (tx, rx) = tokio::sync::oneshot::channel::<gql_types::OwnerActivitySubscription>();
        let tx = std::sync::Mutex::new(Some(tx));
        let handle = gql.subscribe(
            |s| {
                s.owner_activity(
                    gql_types::OwnerActivitySubscriptionVariables {
                        owner_id: "owner-1".into(),
                    },
                    |o| {
                        o.id()
                            .name()
                            .email()
                            .created_at()
                            .pets(|p| {
                                p.id()
                                    .name()
                                    .species()
                                    .status()
                                    .created_at()
                                    .updated_at()
                            })
                    },
                )
            },
            move |data| {
                if let Ok(event) =
                    serde_json::from_value::<gql_types::OwnerActivitySubscription>(data)
                {
                    if let Some(tx) = tx.lock().unwrap().take() {
                        let _ = tx.send(event);
                    }
                }
            },
        );
        let event = tokio::time::timeout(Duration::from_secs(5), rx)
            .await
            .expect("timeout waiting for subscription event")
            .unwrap();
        assert_eq!(event.owner_activity.name, "Alice");
        assert_eq!(event.owner_activity.email, "alice@example.com");
        handle.unsubscribe();
    }

    #[tokio::test]
    async fn gql_subscribe_unsubscribe_stops_receiving() {
        let gql = Graphql::new(&gql_url()).with_ws_endpoint(&gql_ws_url());
        let event_count = Arc::new(AtomicUsize::new(0));
        let count_clone = event_count.clone();
        let handle = gql.subscribe(
            |s| {
                s.pet_adopted(
                    gql_types::PetAdoptedSubscriptionVariables { species: None },
                    |p| p.id().name(),
                )
            },
            move |_| {
                count_clone.fetch_add(1, Ordering::SeqCst);
            },
        );
        tokio::time::sleep(Duration::from_millis(500)).await;
        handle.unsubscribe();
        let count_after_unsub = event_count.load(Ordering::SeqCst);
        tokio::time::sleep(Duration::from_millis(500)).await;
        assert_eq!(event_count.load(Ordering::SeqCst), count_after_unsub);
    }

    // ─── WebSocket ────────────────────────────────────────────────────

    #[tokio::test]
    async fn ws_connect_receive_presence() {
        let ws = WebsocketApi::new_with_options(
            &ws_url(),
            true,
            Duration::from_millis(50),
            5,
            Duration::from_millis(100),
            Duration::from_millis(300),
        );
        let (tx, rx) = tokio::sync::oneshot::channel::<ws_types::ChatPresenceMessage>();
        let tx = std::sync::Mutex::new(Some(tx));
        ws.on_chat_presence(move |msg| {
            if let Some(tx) = tx.lock().unwrap().take() {
                let _ = tx.send(msg);
            }
        })
        .await;
        ws.connect().await.unwrap();
        let msg = tokio::time::timeout(Duration::from_secs(5), rx)
            .await
            .expect("timeout waiting for presence")
            .unwrap();
        assert_eq!(msg.user_id, "server");
        assert_eq!(msg.status, "online");
        ws.send_chat_messages(&ws_types::ChatMessagesPayload {
            text: "hello from generated SDK".into(),
            reply_to: None,
        })
        .await
        .unwrap();
        ws.disconnect().await;
    }

    #[tokio::test]
    async fn ws_client_has_channel_methods() {
        let ws = WebsocketApi::new(&ws_url());
        ws.on_chat_messages(|_: ws_types::ChatMessagesMessage| {}).await;
        ws.on_chat_typing(|_: ws_types::ChatTypingMessage| {}).await;
        ws.on_chat_presence(|_: ws_types::ChatPresenceMessage| {}).await;
    }

    // ─── gRPC (real calls through generated SDK) ─────────────────────

    // ─── PetService RPCs ──────────────────────────────────

    #[tokio::test]
    async fn grpc_pet_service_list_pets() {
        let mut client = grpc::Grpc::connect(grpc_addr())
            .await
            .unwrap();
        let resp = client
            .list_pets(grpc::ListPetsRequest::default())
            .await
            .unwrap()
            .into_inner();
        assert!(resp.data.len() >= 2);
        assert!(!resp.data[0].name.is_empty());
    }

    #[tokio::test]
    async fn grpc_pet_service_get_pet() {
        let mut client = grpc::Grpc::connect(grpc_addr())
            .await
            .unwrap();
        let pet = client
            .get_pet(grpc::GetPetRequest {
                id: "pet-1".into(),
            })
            .await
            .unwrap()
            .into_inner();
        assert_eq!(pet.name, "Rex");
        assert_eq!(pet.id, "pet-1");
    }

    #[tokio::test]
    async fn grpc_pet_service_create_pet() {
        let mut client = grpc::Grpc::connect(grpc_addr())
            .await
            .unwrap();
        let pet = client
            .create_pet(grpc::CreatePetRequest {
                name: "GrpcRustPet".into(),
                species: Default::default(),
                breed: None,
                age: None,
            })
            .await
            .unwrap()
            .into_inner();
        assert_eq!(pet.name, "GrpcRustPet");
        assert!(!pet.id.is_empty());
    }

    #[tokio::test]
    async fn grpc_pet_service_delete_pet() {
        let mut client = grpc::Grpc::connect(grpc_addr())
            .await
            .unwrap();
        client
            .delete_pet(grpc::DeletePetRequest {
                id: "pet-1".into(),
            })
            .await
            .unwrap();
    }

    // ─── PetService server-streaming RPC ──────────────────

    #[tokio::test]
    async fn grpc_pet_service_watch_pets() {
        let mut client = grpc::Grpc::connect(grpc_addr())
            .await
            .unwrap();
        let resp = client
            .watch_pets(grpc::WatchPetsRequest::default())
            .await
            .unwrap()
            .into_inner();
        let pets: Vec<grpc::Pet> = resp
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .map(|r| r.unwrap())
            .collect();
        assert!(pets.len() >= 2);
        assert!(!pets[0].name.is_empty());
    }

    // ─── OwnerService RPCs ────────────────────────────────

    #[tokio::test]
    async fn grpc_owner_service_list_owners() {
        let mut client = grpc::Grpc::connect(grpc_addr())
            .await
            .unwrap();
        let resp = client
            .list_owners(grpc::ListOwnersRequest::default())
            .await
            .unwrap()
            .into_inner();
        assert!(!resp.data.is_empty());
    }

    #[tokio::test]
    async fn grpc_owner_service_get_owner() {
        let mut client = grpc::Grpc::connect(grpc_addr())
            .await
            .unwrap();
        let owner = client
            .get_owner(grpc::GetOwnerRequest {
                id: "owner-1".into(),
            })
            .await
            .unwrap()
            .into_inner();
        assert_eq!(owner.name, "Alice");
        assert_eq!(owner.email, "alice@example.com");
    }

    #[tokio::test]
    async fn grpc_owner_service_create_owner() {
        let mut client = grpc::Grpc::connect(grpc_addr())
            .await
            .unwrap();
        let owner = client
            .create_owner(grpc::CreateOwnerRequest {
                name: "GrpcOwner".into(),
                email: "grpc@test.com".into(),
                phone: None,
            })
            .await
            .unwrap()
            .into_inner();
        assert_eq!(owner.name, "GrpcOwner");
        assert_eq!(owner.email, "grpc@test.com");
        assert!(!owner.id.is_empty());
    }
}
