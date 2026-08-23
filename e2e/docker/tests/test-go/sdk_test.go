package sdk_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

var baseURL = getenv("MOCK_URL", "http://localhost:4010")
var wsURL = getenv("MOCK_WS_URL", "ws://localhost:4010/ws")
var gqlURL = getenv("MOCK_GQL_URL", "http://localhost:4010/graphql")
var grpcAddr = getenv("GRPC_ADDR", "localhost:50051")
var genDir = func() string {
	if _, err := os.Stat(filepath.Join("generated", "go", "client.go")); err == nil {
		return "generated"
	}
	return getenv("GEN_DIR", "/tmp/cortex-e2e-sdks/generated")
}()

func TestGeneratedGoSDK(t *testing.T) {
	tmpDir := t.TempDir()
	prepareRunnerModule(t, tmpDir)

	cmd := exec.Command("go", "test", "./...", "-count=1", "-v")
	cmd.Dir = tmpDir
	cmd.Env = append(
		os.Environ(),
		"CGO_ENABLED=0",
		"GOFLAGS=-mod=mod",
		"MOCK_URL="+baseURL,
		"MOCK_WS_URL="+wsURL,
		"MOCK_GQL_URL="+gqlURL,
		"GRPC_ADDR="+grpcAddr,
	)
	out, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))
	if err != nil {
		t.Fatalf("generated SDK runner failed: %v\n%s", err, output)
	}
	t.Logf("\n%s", output)
}

func prepareRunnerModule(t *testing.T, tmpDir string) {
	t.Helper()

	goSrc := filepath.Join(genDir, "go")
	if _, err := os.Stat(goSrc); err != nil {
		t.Fatalf("generated Go SDK not found: %s", goSrc)
	}

	copyFile(t, filepath.Join("testdata", "runner", "go.mod"), filepath.Join(tmpDir, "go.mod"))
	copyFile(t, filepath.Join("testdata", "runner", "sdk_usage_test.go"), filepath.Join(tmpDir, "sdk_usage_test.go"))

	copyGeneratedResources(t, goSrc, filepath.Join(tmpDir, "generated", "sdk"))
	copyGeneratedPackage(t, filepath.Join(goSrc, "src", "websocket"), filepath.Join(tmpDir, "generated", "sdk"), []string{
		"ws-client.go",
		"ws-types.go",
	})
	copyGeneratedPackage(t, filepath.Join(goSrc, "src", "graphql"), filepath.Join(tmpDir, "generated", "gqlclient"), []string{
		"gql-client.go",
		"gql-types.go",
		"gql-query-builder.go",
	})
	copyGeneratedPackage(t, filepath.Join(goSrc, "src", "grpc"), filepath.Join(tmpDir, "generated", "grpcclient"), []string{
		"grpc-client.go",
		"grpc-types.go",
	})
}

func copyGeneratedPackage(t *testing.T, srcDir, destDir string, files []string) {
	t.Helper()
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range files {
		copyFile(t, filepath.Join(srcDir, name), filepath.Join(destDir, name))
	}
}

func copyGeneratedResources(t *testing.T, srcDir, destDir string) {
	t.Helper()
	entries, err := os.ReadDir(srcDir)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") {
			continue
		}
		copyFile(t, filepath.Join(srcDir, entry.Name()), filepath.Join(destDir, entry.Name()))
	}
}

func copyFile(t *testing.T, src, dest string) {
	t.Helper()
	data, err := os.ReadFile(src)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dest, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
