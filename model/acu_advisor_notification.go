package model

import "time"

type ACUAdvisorNotification struct {
	ID               uint       `json:"id" gorm:"primaryKey"`
	AdvisorID        string     `json:"advisor_id" gorm:"type:varchar(128);uniqueIndex;not null"`
	UserID           int        `json:"user_id" gorm:"index;not null"`
	SessionID        string     `json:"session_id" gorm:"type:varchar(128);index;not null"`
	LogicalRequestID string     `json:"logical_request_id" gorm:"type:varchar(128);index;not null"`
	Status           string     `json:"status" gorm:"type:varchar(32);not null"`
	ProblemSummary   string     `json:"problem_summary" gorm:"type:text;not null"`
	AdviceSummary    string     `json:"advice_summary" gorm:"type:text;not null"`
	ReferenceStatus  string     `json:"reference_status" gorm:"type:varchar(32);not null"`
	TargetPath       string     `json:"target_path" gorm:"type:varchar(255);not null"`
	SourceCreatedAt  time.Time  `json:"source_created_at" gorm:"index;not null"`
	ReadAt           *time.Time `json:"read_at"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type ACUAdvisorNotificationDelivery struct {
	ID             uint       `json:"id" gorm:"primaryKey"`
	NotificationID uint       `json:"notification_id" gorm:"uniqueIndex:idx_acu_advisor_delivery_channel;not null"`
	Channel        string     `json:"channel" gorm:"uniqueIndex:idx_acu_advisor_delivery_channel;type:varchar(32);not null"`
	Status         string     `json:"status" gorm:"type:varchar(32);not null"`
	AttemptCount   int        `json:"attempt_count" gorm:"not null;default:0"`
	LastError      string     `json:"last_error" gorm:"type:text"`
	NextAttemptAt  *time.Time `json:"next_attempt_at"`
	SentAt         *time.Time `json:"sent_at"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}
