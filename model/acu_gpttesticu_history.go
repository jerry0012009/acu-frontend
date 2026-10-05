package model

import "time"

type ACUGpttesticuHistory struct {
	ID                 uint      `json:"id" gorm:"primaryKey"`
	ExecutionProfileID string    `json:"executionProfileId" gorm:"type:varchar(255);index;not null"`
	RequestedModel     string    `json:"requestedModel" gorm:"type:varchar(128)"`
	ActualModel        string    `json:"actualModel" gorm:"type:varchar(128)"`
	Verdict            string    `json:"verdict" gorm:"type:varchar(32);index"`
	Score              int       `json:"score"`
	DurationMs         int64     `json:"durationMs"`
	ResultJSON         string    `json:"-" gorm:"type:text;not null"`
	CreatedAt          time.Time `json:"createdAt" gorm:"index;not null"`
}
