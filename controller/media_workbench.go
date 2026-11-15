package controller

import (
	"fmt"
	"net/http"
	"slices"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// Media capabilities describe the public adapter contract, not every upstream feature.
type mediaCapability struct {
	ID          string   `json:"id"`
	Kind        string   `json:"kind"`
	Sizes       []string `json:"sizes"`
	Resolutions []string `json:"resolutions,omitempty"`
	MinSeconds  int      `json:"minSeconds,omitempty"`
	MaxSeconds  int      `json:"maxSeconds,omitempty"`
	MaxImages   int      `json:"maxImages"`
	MaxVideos   int      `json:"maxVideos"`
	Audio       bool     `json:"audio"`
	FrameModes  bool     `json:"frameModes"`
	Price       *float64 `json:"priceCny,omitempty"`
}

func mediaModelCapability(id, kind string) mediaCapability {
	c := mediaCapability{ID: id, Kind: kind, Sizes: []string{"1024x1024", "1536x1024", "1024x1536"}, MaxImages: 1}
	if kind == "image" {
		if strings.Contains(id, "gemini") || strings.Contains(id, "banana") {
			c.Sizes = []string{"1:1", "16:9", "9:16", "3:2", "2:3"}
			c.MaxImages = 8
		}
		if strings.HasPrefix(id, "gpt-image") {
			c.MaxImages = 8
		}
		return c
	}
	c.Sizes = []string{"16:9", "9:16", "1:1"}
	c.Resolutions = []string{"480p", "720p"}
	c.MinSeconds = 1
	c.MaxSeconds = 15
	if strings.HasPrefix(id, "doubao-seedance-") {
		c.MinSeconds = 4
		c.MaxImages = 9
		c.MaxVideos = 3
		c.Audio = true
		c.FrameModes = true
		c.Sizes = []string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"}
		if id == "doubao-seedance-2.0" {
			c.Resolutions = []string{"480p", "720p", "1080p", "4k"}
		}
		if id == "doubao-seedance-2.5" {
			c.Resolutions = []string{"720p", "1080p"}
			c.MaxSeconds = 30
			c.MaxImages = 30
			c.MaxVideos = 10
		}
	} else if id == "grok-imagine-video-1.5" {
		c.Resolutions = append(c.Resolutions, "1080p")
	}
	return c
}

func GetMediaWorkbenchModels(c *gin.Context) {
	group := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	groups := []string{group}
	if group == "auto" {
		groups = service.GetUserAutoGroup(common.GetContextKeyString(c, constant.ContextKeyUserGroup))
	}
	seen := map[string]bool{}
	out := []mediaCapability{}
	for _, g := range groups {
		for _, id := range model.GetGroupEnabledModels(g) {
			if seen[id] {
				continue
			}
			seen[id] = true
			if c.GetBool("token_model_limit_enabled") {
				limits, _ := c.Get("token_model_limit")
				if m, ok := limits.(map[string]bool); ok && !m[id] {
					continue
				}
			}
			endpoints := model.GetModelSupportEndpointTypes(id)
			kind := ""
			if slices.Contains(endpoints, constant.EndpointTypeImageGeneration) {
				kind = "image"
			}
			if slices.Contains(endpoints, constant.EndpointTypeOpenAIVideo) && (strings.HasPrefix(id, "grok-imagine-video") || strings.HasPrefix(id, "doubao-seedance-")) {
				kind = "video"
			}
			if kind == "" {
				continue
			}
			capability := mediaModelCapability(id, kind)
			if price, ok := ratio_setting.GetModelPrice(id, false); ok {
				value := price * ratio_setting.GetGroupRatio(g) * operation_setting.USDExchangeRate
				capability.Price = &value
			}
			out = append(out, capability)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	c.JSON(http.StatusOK, gin.H{"success": true, "data": out})
}

// Rewrite only the internal path so the existing video distributor and task adapters are reused.
func MediaWorkbenchVideoPath(c *gin.Context) {
	c.Request.URL.Path = strings.Replace(c.Request.URL.Path, "/pg/videos", "/v1/videos", 1)
	c.Next()
}

func EstimateMediaWorkbenchVideo(c *gin.Context) {
	info, err := relaycommon.GenRelayInfo(c, types.RelayFormatTask, nil, nil)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	info.InitChannelMeta(c)
	info.UpstreamModelName = info.OriginModelName
	adaptor := relay.GetTaskAdaptor(relay.GetTaskPlatform(c))
	if adaptor == nil {
		common.ApiError(c, fmt.Errorf("unsupported video model"))
		return
	}
	adaptor.Init(info)
	if taskErr := adaptor.ValidateRequestAndSetAction(c, info); taskErr != nil {
		c.JSON(400, gin.H{"success": false, "message": taskErr.Message})
		return
	}
	price, err := helper.ModelPriceHelperPerCall(c, info)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	for key, value := range adaptor.EstimateBilling(c, info) {
		price.AddOtherRatio(key, value)
	}
	quota := common.QuotaFromFloat(price.ApplyOtherRatiosToFloat(float64(price.Quota)))
	c.JSON(200, gin.H{"success": true, "data": gin.H{"priceCny": float64(quota) / common.QuotaPerUnit * operation_setting.USDExchangeRate}})
}

func GetMediaWorkbenchHistory(c *gin.Context) {
	items := readMediaImageHistory(c.GetInt("id"))
	for i := range items {
		items[i].URL = mediaAssetURL(c, c.GetInt("id"), items[i].URL)
	}
	for _, task := range model.TaskGetAllUserTask(c.GetInt("id"), 0, 50, model.SyncTaskQueryParams{}) {
		id := task.Properties.OriginModelName
		if !strings.HasPrefix(id, "doubao-seedance-") && !strings.HasPrefix(id, "grok-imagine-video") {
			continue
		}
		items = append(items, mediaHistoryItem{ID: task.TaskID, Kind: "video", Model: id, Created: task.SubmitTime, Status: task.Status.ToVideoStatus(), URL: "/v1/videos/" + task.TaskID + "/content", Error: task.FailReason})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Created > items[j].Created })
	if len(items) > 60 {
		items = items[:60]
	}
	c.JSON(200, gin.H{"success": true, "data": items})
}
