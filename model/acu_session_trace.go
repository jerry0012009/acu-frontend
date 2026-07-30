package model

import (
	"errors"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

func ResolveOwnedACULogicalRequest(userID int, identifier string) (string, error) {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return "", errors.New("ACU trace identifier is required")
	}
	var record ACUUsageFinalize
	query := DB.Where("user_id = ?", userID)
	if strings.HasPrefix(identifier, "req_") {
		query = query.Where("logical_request_id = ?", identifier)
	} else {
		logID := identifier
		if numericID, err := strconv.Atoi(identifier); err == nil {
			var log Log
			if err := LOG_DB.Where("id = ? AND user_id = ?", numericID, userID).First(&log).Error; err != nil {
				return "", err
			}
			logID = log.RequestId
		}
		query = query.Where("log_id = ?", logID)
	}
	if err := query.First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", errors.New("ACU session trace was not found")
		}
		return "", err
	}
	return record.LogicalRequestId, nil
}
