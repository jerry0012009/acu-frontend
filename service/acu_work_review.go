package service

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"sync"
	"unicode"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
)

type creativeHistoryItem struct {
	RequestID   string `json:"requestId"`
	OccurredAt  string `json:"occurredAt"`
	Fingerprint string `json:"fingerprint"`
	Supplement  string `json:"supplement"`
	References  []struct {
		Scope string `json:"scope"`
		Quote string `json:"quote"`
	} `json:"references"`
}

func creativeWorkRecords(ctx context.Context, userID int) ([]dto.ACUWorkRecord, bool, error) {
	r, err := acuRouterAdminRequest(ctx, http.MethodGet, "/internal/admin/private-acu/creative-history?newapiUserId="+strconv.Itoa(userID), nil)
	if err != nil {
		return nil, false, err
	}
	defer r.Body.Close()
	if r.StatusCode != http.StatusOK {
		return nil, false, fmt.Errorf("creative history HTTP %d", r.StatusCode)
	}
	var history struct {
		Items         []creativeHistoryItem `json:"items"`
		MoreAvailable bool                  `json:"moreAvailable"`
	}
	if err = common.DecodeJson(r.Body, &history); err != nil {
		return nil, false, err
	}
	access, err := GetPrivateACUPOCAccess()
	if err != nil {
		return nil, false, err
	}
	filmAllowed := false
	for _, s := range access.Spaces {
		if s.Key == "GYZ" && s.Enabled && containsUserID(s.MemberUserIDs, userID) {
			filmAllowed = true
		}
	}
	ids := []string{}
	for _, item := range history.Items {
		ids = append(ids, item.RequestID)
	}
	var logs []model.Log
	if len(ids) > 0 {
		if err = model.LOG_DB.WithContext(ctx).Select("request_id, other").Where("user_id = ? AND type = ? AND request_id IN ?", userID, model.LogTypeConsume, ids).Find(&logs).Error; err != nil {
			return nil, false, err
		}
	}
	applied := map[string]string{}
	for _, log := range logs {
		var other map[string]interface{}
		if common.UnmarshalJsonStr(log.Other, &other) == nil {
			if f, ok := other["acu_creative_applied"].(string); ok {
				applied[log.RequestId] = f
			}
		}
	}
	items := []dto.ACUWorkRecord{}
	for _, item := range history.Items {
		items = append(items, projectCreativeWorkRecord(item, filmAllowed, applied[item.RequestID]))
	}
	return items, history.MoreAvailable, nil
}

func projectCreativeWorkRecord(item creativeHistoryItem, filmAllowed bool, receipt string) dto.ACUWorkRecord {
	record := dto.ACUWorkRecord{ID: "image:" + item.RequestID, Kind: "image_assistance", OccurredAt: item.OccurredAt, Title: "图片视觉建议", State: "guidance_prepared", Summary: "整理了适用于本次画面的视觉建议", Basis: "历史经验参考", RequestID: item.RequestID}
	if receipt != "" && receipt == item.Fingerprint {
		record.State = "guidance_applied"
		record.Summary = "已将视觉建议加入生图提示词"
	}
	visible, team := true, false
	for _, ref := range item.References {
		if ref.Scope == "team" {
			team = true
		}
		if ref.Scope == "unknown" || ref.Scope == "" || (ref.Scope == "team" && !filmAllowed) {
			visible = false
		}
	}
	if team && filmAllowed {
		record.Basis = "GYZ 团队经验"
	}
	if visible {
		record.Detail = advisorPrivateText.ReplaceAllString(item.Supplement, "[redacted]")
		runes := []rune(record.Detail)
		if len(runes) > 0 && unicode.Is(unicode.Han, runes[0]) {
			end := len(runes)
			for i, r := range runes {
				if r == '。' || r == '；' {
					end = i + 1
					break
				}
			}
			if end <= 110 {
				record.Summary = string(runes[:end])
			}
		}
		for _, ref := range item.References {
			record.Sources = append(record.Sources, dto.ACUWorkSource{Scope: ref.Scope, Quote: advisorPrivateText.ReplaceAllString(ref.Quote, "[redacted]")})
		}
	} else {
		record.Basis = "历史参考 · 详情暂不可用"
	}
	return record
}

func GetACUWorkReview(ctx context.Context, userID int) (dto.ACUWorkReview, error) {
	if userID <= 0 {
		return dto.ACUWorkReview{}, fmt.Errorf("authenticated account required")
	}
	result := dto.ACUWorkReview{Version: 1, Items: []dto.ACUWorkRecord{}, Unavailable: []string{}}
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, kind := range []string{"private_advice", "preference_learning", "image_assistance"} {
		wg.Add(1)
		go func(kind string) {
			defer wg.Done()
			items := []dto.ACUWorkRecord{}
			var err error
			more := false
			switch kind {
			case "private_advice":
				var data dto.ACUAdvisorNotificationList
				data, err = ListPrivateACUAdvisorNotifications(ctx, userID, 50)
				more = len(data.Notifications) == 50
				for _, a := range data.Notifications {
					state := "advice_prepared"
					if a.ReferenceStatus == "injected" {
						state = "advice_delivered"
					}
					if a.ReferenceStatus == "failed" {
						state = "advice_failed"
					}
					items = append(items, dto.ACUWorkRecord{ID: "advice:" + a.AdvisorID, Kind: kind, OccurredAt: a.SourceCreatedAt, Title: a.Title, Summary: a.Summary, Basis: a.Preference, Detail: a.Correction, State: state, AdvisorID: a.AdvisorID})
				}
			case "preference_learning":
				var data dto.ACUPreferenceActivity
				data, err = GetPrivateACUPreferenceActivity(ctx, userID)
				more = data.MoreAvailable
				if data.Partial && err == nil {
					err = fmt.Errorf("partial learning history")
				}
				for _, e := range data.Events {
					summary := fmt.Sprintf("更新了 %d 项偏好记录", len(e.Changes))
					if len(e.Changes) == 1 && e.Changes[0].After != "" {
						summary = e.Changes[0].After
					}
					items = append(items, dto.ACUWorkRecord{ID: "learning:" + e.RunID, Kind: kind, OccurredAt: e.RecordedAt, Title: "偏好记录有更新", Summary: summary, Basis: "你的反馈与选择", State: "preferences_changed", Changes: e.Changes})
				}
			case "image_assistance":
				items, more, err = creativeWorkRecords(ctx, userID)
			}
			mu.Lock()
			defer mu.Unlock()
			result.Items = append(result.Items, items...)
			result.MoreAvailable = result.MoreAvailable || more
			if err != nil {
				result.Unavailable = append(result.Unavailable, kind)
			}
		}(kind)
	}
	wg.Wait()
	sort.Slice(result.Items, func(i, j int) bool {
		if result.Items[i].OccurredAt == result.Items[j].OccurredAt {
			return result.Items[i].ID < result.Items[j].ID
		}
		return result.Items[i].OccurredAt > result.Items[j].OccurredAt
	})
	return result, nil
}
