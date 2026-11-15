package controller

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

type mediaHistoryItem struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Model   string `json:"model"`
	Prompt  string `json:"prompt,omitempty"`
	Created int64  `json:"created"`
	Status  string `json:"status"`
	URL     string `json:"url"`
	Error   string `json:"error,omitempty"`
}

func mediaAssetDir(user int) string {
	return filepath.Join(acuQuickStartMediaDir(), "workbench", strconv.Itoa(user))
}

func mediaAssetSignature(user int, name, expires string) string {
	m := hmac.New(sha256.New, []byte(common.SessionSecret))
	fmt.Fprintf(m, "%d/%s/%s", user, name, expires)
	return hex.EncodeToString(m.Sum(nil))
}

func mediaAssetURL(c *gin.Context, user int, name string) string {
	expires := strconv.FormatInt(time.Now().Add(24*time.Hour).Unix(), 10)
	return fmt.Sprintf("%s/pg/assets/%d/%s?expires=%s&signature=%s", strings.TrimRight(publicServerAddress(c), "/"), user, name, expires, mediaAssetSignature(user, name, expires))
}

func UploadMediaWorkbenchAsset(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 121<<20)
	header, err := c.FormFile("file")
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	if err != nil {
		common.ApiError(c, fmt.Errorf("cannot read media file"))
		return
	}
	f, err := header.Open()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	defer f.Close()
	ext, kind, limit, err := detectAcuQuickStartMedia(f)
	if err != nil || header.Size <= 0 || header.Size > limit {
		c.JSON(400, gin.H{"success": false, "message": "Unsupported media file or file too large"})
		return
	}
	user := c.GetInt("id")
	dir := mediaAssetDir(user)
	if err = os.MkdirAll(dir, 0750); err != nil {
		common.ApiError(c, err)
		return
	}
	// Uploads are temporary; generated result files use a separate name and retention period.
	entries, _ := os.ReadDir(dir)
	var used int64
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), "upload-") {
			continue
		}
		info, e := entry.Info()
		if e != nil {
			continue
		}
		if time.Since(info.ModTime()) > 24*time.Hour {
			_ = os.Remove(filepath.Join(dir, entry.Name()))
		} else {
			used += info.Size()
		}
	}
	if used+header.Size > 512<<20 {
		c.JSON(400, gin.H{"success": false, "message": "Temporary media quota exceeded"})
		return
	}
	name := "upload-" + common.GetUUID() + ext
	target, err := os.OpenFile(filepath.Join(dir, name), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0640)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	n, err := io.Copy(target, io.LimitReader(f, limit+1))
	closeErr := target.Close()
	if err != nil || closeErr != nil || n > limit {
		_ = os.Remove(filepath.Join(dir, name))
		common.ApiError(c, fmt.Errorf("cannot store media file"))
		return
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"url": mediaAssetURL(c, user, name), "type": kind, "name": header.Filename, "bytes": n}})
}

func GetMediaWorkbenchAsset(c *gin.Context) {
	user, err := strconv.Atoi(c.Param("user"))
	name := c.Param("name")
	if err != nil || user <= 0 || filepath.Base(name) != name || strings.ContainsAny(name, "/\\") {
		c.Status(404)
		return
	}
	expires := c.Query("expires")
	expiry, err := strconv.ParseInt(expires, 10, 64)
	if err != nil || expiry < time.Now().Unix() || !hmac.Equal([]byte(c.Query("signature")), []byte(mediaAssetSignature(user, name, expires))) {
		c.Status(403)
		return
	}
	if !strings.HasPrefix(name, "upload-") && !strings.HasPrefix(name, "result-") {
		c.Status(404)
		return
	}
	if strings.HasSuffix(name, ".json") {
		c.Status(404)
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.File(filepath.Join(mediaAssetDir(user), name))
}

func readMediaImageHistory(user int) []mediaHistoryItem {
	items := []mediaHistoryItem{}
	dir := mediaAssetDir(user)
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), "result-") || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if time.Since(info.ModTime()) > 30*24*time.Hour {
			_ = os.Remove(filepath.Join(dir, entry.Name()))
			_ = os.Remove(filepath.Join(dir, strings.TrimSuffix(entry.Name(), ".json")))
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		var item mediaHistoryItem
		if common.Unmarshal(data, &item) == nil {
			items = append(items, item)
		}
	}
	return items
}

type mediaCaptureWriter struct {
	gin.ResponseWriter
	body []byte
}

func (w *mediaCaptureWriter) WriteHeaderNow() {}
func (w *mediaCaptureWriter) Flush()          {}

func (w *mediaCaptureWriter) Write(b []byte) (int, error) {
	w.body = append(w.body, b...)
	return len(b), nil
}
func (w *mediaCaptureWriter) WriteString(s string) (int, error) { return w.Write([]byte(s)) }

func GenerateMediaWorkbenchImage(c *gin.Context) {
	var request struct {
		Model  string `json:"model"`
		Prompt string `json:"prompt"`
	}
	if strings.HasPrefix(c.ContentType(), "multipart/") {
		form, err := common.ParseMultipartFormReusable(c)
		if err == nil {
			request.Model = strings.Join(form.Value["model"], "")
			request.Prompt = strings.Join(form.Value["prompt"], "")
		}
	} else {
		_ = common.UnmarshalBodyReusable(c, &request)
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	original := c.Writer
	capture := &mediaCaptureWriter{ResponseWriter: original}
	c.Writer = capture
	PlaygroundImage(c)
	c.Writer = original
	var response struct {
		Data []struct {
			Base64 string `json:"b64_json"`
			URL    string `json:"url"`
		} `json:"data"`
	}
	if capture.Status() >= 400 || common.Unmarshal(capture.body, &response) != nil || len(response.Data) == 0 {
		_, _ = original.Write(capture.body)
		return
	}
	var envelope map[string]any
	if common.Unmarshal(capture.body, &envelope) != nil {
		_, _ = original.Write(capture.body)
		return
	}
	user := c.GetInt("id")
	dir := mediaAssetDir(user)
	if os.MkdirAll(dir, 0750) != nil {
		_, _ = original.Write(capture.body)
		return
	}
	data, _ := envelope["data"].([]any)
	for i, image := range response.Data {
		if image.Base64 == "" {
			continue
		}
		bytes, err := base64.StdEncoding.DecodeString(image.Base64)
		if err != nil {
			continue
		}
		ext := ".png"
		switch http.DetectContentType(bytes) {
		case "image/jpeg":
			ext = ".jpg"
		case "image/webp":
			ext = ".webp"
		case "image/png":
		default:
			continue
		}
		name := "result-" + common.GetUUID() + ext
		if os.WriteFile(filepath.Join(dir, name), bytes, 0640) != nil {
			continue
		}
		item := mediaHistoryItem{ID: name, Kind: "image", Model: request.Model, Prompt: request.Prompt, Created: time.Now().Unix(), Status: "completed", URL: name}
		meta, _ := common.Marshal(item)
		_ = os.WriteFile(filepath.Join(dir, name+".json"), meta, 0640)
		if i < len(data) {
			if entry, ok := data[i].(map[string]any); ok {
				delete(entry, "b64_json")
				entry["url"] = mediaAssetURL(c, user, name)
			}
		}
	}
	encoded, err := common.Marshal(envelope)
	if err != nil {
		encoded = capture.body
	}
	original.Header().Del("Content-Length")
	_, _ = original.Write(encoded)
}
