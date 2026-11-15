package sora

import (
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSeedanceRequest(t *testing.T) {
	p, err := seedanceVideoRequest(relaycommon.TaskSubmitReq{Prompt: "red sphere", Seconds: "4", Size: "864x480"}, "doubao-seedance-2.0-mini")
	if err != nil {
		t.Fatal(err)
	}
	if p["resolution"] != "480p" || p["duration"] != 4 || p["ratio"] != "16:9" {
		t.Fatalf("unexpected payload: %#v", p)
	}
	for _, req := range []relaycommon.TaskSubmitReq{{Seconds: "2"}, {Size: "1920x1080"}, {Metadata: map[string]any{"model": "other"}}, {Images: []string{"http://localhost/test.png"}}} {
		if _, err := seedanceVideoRequest(req, "doubao-seedance-2.0-mini"); err == nil {
			t.Fatalf("accepted invalid request: %#v", req)
		}
	}
	w, h := seedanceGeometry("480p", "16:9")
	if w != 864 || h != 480 {
		t.Fatalf("geometry %dx%d", w, h)
	}
}

func TestSeedanceTaskLifecycle(t *testing.T) {
	a := &TaskAdaptor{}
	a.baseURL = "https://example.com"
	u, err := a.BuildRequestURL(&relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "doubao-seedance-2.0-mini"}})
	if err != nil || u != "https://example.com/v1/video/generations" {
		t.Fatalf("submit URL %s, %v", u, err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/video/generations/task_upstream" || r.Header.Get("Authorization") != "Bearer secret" {
			t.Errorf("unexpected polling request")
		}
		io.WriteString(w, `{"status":"completed","progress":100}`)
	}))
	defer server.Close()
	r, err := a.FetchTask(server.URL, "secret", map[string]any{"task_id": "task_upstream", "model": "doubao-seedance-2.0-mini"}, "")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	b, _ := io.ReadAll(r.Body)
	result, err := a.ParseTaskResult(b)
	if err != nil || result.Status != model.TaskStatusSuccess {
		t.Fatalf("result %#v, %v", result, err)
	}
	task := &model.Task{TaskID: "task_public", Data: []byte(`{"id":"task_upstream","task_id":"task_upstream","status":"completed","metadata":{"url":"private"},"billing_evidence":{"private":true}}`)}
	task.Properties.UpstreamModelName = "doubao-seedance-2.0-mini"
	b, err = a.ConvertToOpenAIVideo(task)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "private") || strings.Contains(string(b), "task_upstream") {
		t.Fatalf("leaked upstream data: %s", b)
	}
}
