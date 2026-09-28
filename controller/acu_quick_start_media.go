package controller

import (
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"

	"github.com/gin-gonic/gin"
)

const (
	acuQuickStartImageMaxBytes int64 = 20 << 20
	acuQuickStartVideoMaxBytes int64 = 120 << 20
)

var acuQuickStartMediaTypes = map[string]struct {
	extension string
	mediaType string
	maxBytes  int64
}{
	"image/gif":       {extension: ".gif", mediaType: "image", maxBytes: acuQuickStartImageMaxBytes},
	"image/jpeg":      {extension: ".jpg", mediaType: "image", maxBytes: acuQuickStartImageMaxBytes},
	"image/png":       {extension: ".png", mediaType: "image", maxBytes: acuQuickStartImageMaxBytes},
	"image/webp":      {extension: ".webp", mediaType: "image", maxBytes: acuQuickStartImageMaxBytes},
	"video/mp4":       {extension: ".mp4", mediaType: "video", maxBytes: acuQuickStartVideoMaxBytes},
	"video/quicktime": {extension: ".mov", mediaType: "video", maxBytes: acuQuickStartVideoMaxBytes},
	"video/webm":      {extension: ".webm", mediaType: "video", maxBytes: acuQuickStartVideoMaxBytes},
}

func acuQuickStartMediaDir() string {
	if configured := strings.TrimSpace(os.Getenv("ACU_QUICK_START_MEDIA_DIR")); configured != "" {
		return configured
	}
	return "/var/lib/acu/quick-start-media"
}

func detectAcuQuickStartMedia(file multipart.File) (string, string, int64, error) {
	header := make([]byte, 512)
	readBytes, err := file.Read(header)
	if err != nil && !errors.Is(err, io.EOF) {
		return "", "", 0, err
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return "", "", 0, err
	}

	contentType := http.DetectContentType(header[:readBytes])
	media, ok := acuQuickStartMediaTypes[contentType]
	if !ok {
		return "", "", 0, fmt.Errorf("unsupported media type: %s", contentType)
	}
	return media.extension, media.mediaType, media.maxBytes, nil
}

func validAcuQuickStartMediaFilename(filename string) bool {
	if filepath.Base(filename) != filename {
		return false
	}
	extension := strings.ToLower(filepath.Ext(filename))
	id := strings.TrimSuffix(filename, extension)
	if len(id) != 32 {
		return false
	}
	if _, err := hex.DecodeString(id); err != nil {
		return false
	}
	for _, media := range acuQuickStartMediaTypes {
		if extension == media.extension {
			return true
		}
	}
	return false
}

func UploadAcuQuickStartMedia(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(
		c.Writer,
		c.Request.Body,
		acuQuickStartVideoMaxBytes+(1<<20),
	)
	fileHeader, err := c.FormFile("file")
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(strings.ToLower(err.Error()), "request body too large") {
			status = http.StatusRequestEntityTooLarge
		}
		c.JSON(status, gin.H{"success": false, "message": i18n.T(c, i18n.MsgMediaReadFailed)})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": i18n.T(c, i18n.MsgMediaOpenFailed)})
		return
	}
	defer file.Close()

	extension, mediaType, maxBytes, err := detectAcuQuickStartMedia(file)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": i18n.T(c, i18n.MsgMediaTypeUnsupported),
		})
		return
	}
	if fileHeader.Size <= 0 || fileHeader.Size > maxBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{
			"success": false,
			"message": i18n.T(c, i18n.MsgMediaTooLarge, map[string]any{"Limit": maxBytes >> 20}),
		})
		return
	}

	directory := acuQuickStartMediaDir()
	if err := os.MkdirAll(directory, 0750); err != nil {
		common.SysError("failed to create ACU quick-start media directory: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": i18n.T(c, i18n.MsgMediaStoreFailed)})
		return
	}

	filename := common.GetUUID() + extension
	targetPath := filepath.Join(directory, filename)
	target, err := os.OpenFile(targetPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0640)
	if err != nil {
		common.SysError("failed to create ACU quick-start media file: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": i18n.T(c, i18n.MsgMediaStoreFailed)})
		return
	}

	written, copyErr := io.Copy(target, io.LimitReader(file, maxBytes+1))
	closeErr := target.Close()
	if copyErr != nil || closeErr != nil || written > maxBytes {
		_ = os.Remove(targetPath)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": i18n.T(c, i18n.MsgMediaStoreFailed)})
		return
	}

	publicPath := "/api/acu-quick-start/media/" + filename
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"filename": filename,
			"size":     written,
			"type":     mediaType,
			"url":      strings.TrimRight(publicServerAddress(c), "/") + publicPath,
		},
	})
}

func GetAcuQuickStartMedia(c *gin.Context) {
	filename := c.Param("filename")
	if !validAcuQuickStartMediaFilename(filename) {
		c.Status(http.StatusNotFound)
		return
	}

	filePath := filepath.Join(acuQuickStartMediaDir(), filename)
	if info, err := os.Stat(filePath); err != nil || !info.Mode().IsRegular() {
		c.Status(http.StatusNotFound)
		return
	}

	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.Header("X-Content-Type-Options", "nosniff")
	c.File(filePath)
}

func pruneAcuQuickStartMediaFiles(mediaJSON string) error {
	var items []struct {
		URL    string `json:"url"`
		Poster string `json:"poster"`
	}
	if strings.TrimSpace(mediaJSON) != "" {
		if err := common.UnmarshalJsonStr(mediaJSON, &items); err != nil {
			return err
		}
	}

	referenced := make(map[string]struct{}, len(items)*2)
	for _, item := range items {
		for _, rawURL := range []string{item.URL, item.Poster} {
			parsed, err := url.Parse(rawURL)
			if err != nil || !strings.HasPrefix(parsed.Path, "/api/acu-quick-start/media/") {
				continue
			}
			filename := path.Base(parsed.Path)
			if validAcuQuickStartMediaFilename(filename) {
				referenced[filename] = struct{}{}
			}
		}
	}

	entries, err := os.ReadDir(acuQuickStartMediaDir())
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !validAcuQuickStartMediaFilename(entry.Name()) {
			continue
		}
		if _, keep := referenced[entry.Name()]; keep {
			continue
		}
		if err := os.Remove(filepath.Join(acuQuickStartMediaDir(), entry.Name())); err != nil {
			return err
		}
	}
	return nil
}
