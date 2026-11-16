package service

import (
	"context"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/samber/hot"
	"golang.org/x/sync/singleflight"
)

var accountOverviewCache = hot.NewHotCache[string, model.ACUAccountOverview](hot.LRU, 1024).WithTTL(30 * time.Second).Build()
var accountOverviewFlights singleflight.Group

func GetAccountOverview(ctx context.Context, userID, days int) (model.ACUAccountOverview, error) {
	if userID <= 0 || (days != 1 && days != 7 && days != 30) {
		return model.ACUAccountOverview{}, fmt.Errorf("invalid account scope")
	}
	key := fmt.Sprintf("%d:%d", userID, days)
	if value, found, err := accountOverviewCache.Get(key); err == nil && found {
		return value, nil
	}
	flight := accountOverviewFlights.DoChan(key, func() (interface{}, error) {
		if value, found, err := accountOverviewCache.Get(key); err == nil && found {
			return value, nil
		}
		now := time.Now().Unix()
		value, err := model.GetACUAccountOverview(context.WithoutCancel(ctx), userID, now-int64(days)*86400, now)
		if err == nil {
			accountOverviewCache.Set(key, value)
		}
		return value, err
	})
	select {
	case <-ctx.Done():
		return model.ACUAccountOverview{}, ctx.Err()
	case result := <-flight:
		if result.Err != nil {
			return model.ACUAccountOverview{}, result.Err
		}
		return result.Val.(model.ACUAccountOverview), nil
	}
}
