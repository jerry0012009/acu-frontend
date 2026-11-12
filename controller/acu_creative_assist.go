package controller

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func CreativeAssist(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 400000)
	var input service.CreativeAssistRequest
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		c.JSON(400, gin.H{"error": "invalid creative request"})
		return
	}
	result, err := service.AssistCreativeRequest(c.Request.Context(), common.GetContextKeyInt(c, constant.ContextKeyUserId), common.GetContextKeyInt(c, constant.ContextKeyTokenId), c.GetString(common.RequestIdKey), input)
	if err != nil {
		c.JSON(503, gin.H{"error": "creative assistance unavailable"})
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(200, result)
}

// Rewrite only the prompt in the reusable body. Ordered multipart parts, file
// bytes, masks, unknown JSON fields and explicit zero-valued settings survive.
func replaceImagePrompt(c *gin.Context, prompt string) error {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return err
	}
	var data []byte
	contentType := c.Request.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil || params["boundary"] == "" {
			return fmt.Errorf("invalid image multipart boundary")
		}
		reader := multipart.NewReader(storage, params["boundary"])
		var output bytes.Buffer
		writer := multipart.NewWriter(&output)
		count := 0
		for {
			part, err := reader.NextRawPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				return err
			}
			out, err := writer.CreatePart(part.Header)
			if err != nil {
				part.Close()
				return err
			}
			if part.FormName() == "prompt" && part.FileName() == "" {
				count++
				_, err = io.WriteString(out, prompt)
			} else {
				_, err = io.Copy(out, part)
			}
			part.Close()
			if err != nil {
				return err
			}
		}
		if count != 1 {
			return fmt.Errorf("ambiguous prompt fields")
		}
		if err = writer.Close(); err != nil {
			return err
		}
		data = output.Bytes()
		contentType = writer.FormDataContentType()
	} else {
		var body map[string]json.RawMessage
		if err = common.DecodeJson(storage, &body); err != nil {
			return err
		}
		body["prompt"], err = common.Marshal(prompt)
		if err != nil {
			return err
		}
		data, err = common.Marshal(body)
		if err != nil {
			return err
		}
	}
	replacement, err := common.CreateBodyStorage(data)
	if err != nil {
		return err
	}
	c.Set(common.KeyBodyStorage, replacement)
	c.Set(common.KeyRequestBody, nil)
	_ = storage.Close()
	c.Request.Body = io.NopCloser(replacement)
	c.Request.ContentLength = int64(len(data))
	c.Request.Header.Set("Content-Type", contentType)
	c.Request.Header.Del("Content-Length")
	if c.Request.MultipartForm != nil {
		c.Request.MultipartForm.Value["prompt"] = []string{prompt}
	}
	if c.Request.PostForm != nil {
		c.Request.PostForm.Set("prompt", prompt)
	}
	if strings.HasPrefix(contentType, "multipart/form-data") {
		c.Set("_original_multipart_ct", contentType)
	}
	return nil
}

func preparePrivateImagePrompt(c *gin.Context, request *dto.ImageRequest, userID, tokenID int) {
	if c.Request.Context().Err() != nil {
		return
	}
	result, err := service.AssistCreativeRequest(c.Request.Context(), userID, tokenID, c.GetString(common.RequestIdKey), service.CreativeAssistRequest{
		Prompt: request.Prompt, Mode: "generate", Context: fmt.Sprintf("Image API request. Model=%s. Size=%s. Quality=%s. Reference image and mask bytes are not inspected by this text stage; never invent their contents or reorder their indices.", request.Model, request.Size, request.Quality),
	})
	if err != nil {
		c.Header("X-ACU-Creative-Status", "unavailable")
		return
	}
	c.Header("X-ACU-Creative-Status", result.Status)
	if result.Status != "ready" || result.Prompt == request.Prompt {
		return
	}
	if err = replaceImagePrompt(c, result.Prompt); err != nil {
		c.Header("X-ACU-Creative-Status", "unavailable")
		return
	}
	request.Prompt = result.Prompt
	c.Set("acu_creative_fingerprint", result.Fingerprint)
}
