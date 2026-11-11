// Creates a bounded acceptance session using normal session limits; never changes user security settings.
package main

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	common.SessionSecret = os.Getenv("SESSION_SECRET")
	if common.SessionSecret == "" {
		panic("missing session secret")
	}
	db, err := gorm.Open(postgres.Open(os.Getenv("ACCEPTANCE_DATABASE_URL")), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		panic("acceptance database connection failed")
	}
	model.DB = db
	common.RedisEnabled = false
	id, err := strconv.Atoi(os.Getenv("ACCEPTANCE_USER_ID"))
	if err != nil || id <= 0 {
		panic("invalid acceptance user ID")
	}
	bundle, err := service.CreateLoginSession(id, "production_acceptance", "127.0.0.1", "ACU blue-green release acceptance")
	if err != nil {
		panic("acceptance session creation failed")
	}
	if err := db.Model(&model.UserSession{}).Where("sid = ?", bundle.Session.SID).
		Update("expires_at", time.Now().Add(time.Hour).Unix()).Error; err != nil {
		panic("acceptance session expiry failed")
	}
	encoded, err := common.Marshal(map[string]any{
		"access_token": bundle.AccessToken, "session": bundle.Session,
		"user": map[string]int{"id": id},
	})
	if err != nil {
		panic("acceptance result encoding failed")
	}
	fmt.Print(string(encoded))
}
