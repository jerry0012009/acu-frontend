package service

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

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
		summary := preferenceRecordText(source.Description)
		if source.ID != "" && summary != "" {
			result.Records = append(result.Records, dto.ACUPreferenceRecord{ID: source.ID, Summary: summary})
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
