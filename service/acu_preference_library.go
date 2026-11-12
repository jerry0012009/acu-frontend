package service

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
)

// Keep complete, short source descriptions. Never turn a truncated audit or a
// model-generated distillation into an apparent quotation from the user.
func preferenceRecordText(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || utf8.RuneCountInString(value) > 400 {
		return ""
	}
	for _, r := range value {
		if unicode.IsControl(r) || unicode.In(r, unicode.Cf) {
			return ""
		}
	}
	return advisorPrivateText.ReplaceAllString(value, "[redacted]")
}

func GetPrivateACUPreferenceLibrary(ctx context.Context, userID int) (dto.ACUPreferenceLibrary, error) {
	if userID <= 0 {
		return dto.ACUPreferenceLibrary{}, fmt.Errorf("authenticated user is required")
	}
	memory, err := GetPrivateACUMemoryForUser(ctx, userID)
	if err != nil {
		return dto.ACUPreferenceLibrary{}, err
	}
	if memory.UserID != "" && memory.UserID != fmt.Sprint(userID) {
		return dto.ACUPreferenceLibrary{}, fmt.Errorf("preference records unavailable")
	}
	result := dto.ACUPreferenceLibrary{Version: 1, Records: []dto.ACUPreferenceRecord{}}
	for _, source := range memory.Skills {
		if strings.HasPrefix(source.Description, "[ACU_PREFERENCE_") || source.Name == "daily-logs" || source.Name == "user-general-facts" {
			continue
		}
		summary := preferenceRecordText(source.Description)
		if source.ID != "" && summary != "" {
			result.Records = append(result.Records, dto.ACUPreferenceRecord{ID: source.ID, Summary: summary})
		}
	}
	return result, nil
}

func PrivateACUPreferenceControls(ctx context.Context, userID int, skillID string, change map[string]interface{}) (map[string]interface{}, error) {
	if userID <= 0 {
		return nil, fmt.Errorf("authenticated user is required")
	}
	query := url.Values{"newapiUserId": {fmt.Sprint(userID)}}
	method := http.MethodGet
	var body []byte
	if change != nil {
		if skillID == "" {
			return nil, fmt.Errorf("preference record is required")
		}
		query.Set("skillId", skillID)
		method = http.MethodPut
		var err error
		body, err = common.Marshal(change)
		if err != nil {
			return nil, err
		}
	}
	response, err := acuRouterAdminRequest(ctx, method, "/internal/admin/private-acu/preference-controls?"+query.Encode(), body)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("preference unavailable or changed; refresh and retry")
	}
	var result map[string]interface{}
	if err := common.DecodeJson(response.Body, &result); err != nil {
		return nil, err
	}
	if records, ok := result["records"].([]interface{}); ok {
		for _, raw := range records {
			if record, ok := raw.(map[string]interface{}); ok {
				for _, key := range []string{"summary", "scope"} {
					if text, ok := record[key].(string); ok {
						record[key] = advisorPrivateText.ReplaceAllString(text, "[redacted]")
					}
				}
			}
		}
	}
	return result, nil
}

func preferenceChangeEvent(detail dto.ACUPrivateLearningRunSelfDetail) dto.ACUPreferenceChangeEvent {
	event := dto.ACUPreferenceChangeEvent{
		RunID: detail.RunID, Trigger: detail.LearningKind,
		RecordedAt: detail.CompletedAt, Changes: []dto.ACUPreferenceChange{},
	}
	if detail.Status != "completed" || detail.CompletedAt == "" {
		return event
	}
	for _, change := range detail.SkillChanges {
		id, _ := change["skillId"].(string)
		kind, _ := change["changeType"].(string)
		before, _ := change["descriptionBefore"].(string)
		after, _ := change["descriptionAfter"].(string)
		before, after = preferenceRecordText(before), preferenceRecordText(after)
		ruleSummary, _ := change["ruleChangeSummary"].(string)
		ruleSummary = preferenceRecordText(ruleSummary)
		if id == "" {
			continue
		}
		switch kind {
		case "created":
			if after == "" {
				continue
			}
			before = ""
		case "updated":
			if ruleSummary != "" {
				event.Changes = append(event.Changes, dto.ACUPreferenceChange{PreferenceID: id, Kind: "rule_updated", After: ruleSummary})
				continue
			}
			if before == "" || after == "" || before == after {
				continue
			}
		case "deleted":
			if before == "" {
				continue
			}
			after = ""
		default:
			continue
		}
		event.Changes = append(event.Changes, dto.ACUPreferenceChange{
			PreferenceID: id, Kind: kind, Before: before, After: after,
		})
	}
	return event
}

func GetPrivateACUPreferenceActivity(ctx context.Context, userID int) (dto.ACUPreferenceActivity, error) {
	if userID <= 0 {
		return dto.ACUPreferenceActivity{}, fmt.Errorf("authenticated user is required")
	}
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	runs, err := GetPrivateACULearningRunsForUser(ctx, userID)
	if err != nil {
		return dto.ACUPreferenceActivity{}, err
	}
	result := dto.ACUPreferenceActivity{Version: 1, Events: []dto.ACUPreferenceChangeEvent{}, MoreAvailable: runs.WindowLimited}
	for _, run := range runs.Runs {
		if run.Status != "completed" || run.SkillChangeCount <= 0 {
			continue
		}
		if result.InspectedRuns >= 6 {
			result.MoreAvailable = true
			break
		}
		result.InspectedRuns++
		detail, err := GetPrivateACULearningRunDetailForUser(ctx, userID, run.RunID)
		if err != nil {
			result.Partial = true
			if ctx.Err() != nil {
				break
			}
			continue
		}
		event := preferenceChangeEvent(detail)
		if len(event.Changes) > 0 {
			result.Events = append(result.Events, event)
		}
	}
	return result, nil
}
